/**
 * Stellar Account Recovery with Social Recovery (Guardian-based)
 * Allows account recovery through guardian signatures (M-of-N threshold).
 * Time-locked with cancellation window for security.
 */
import { createLogger } from "@delego/utils";
import { Pool } from "pg";

const log = createLogger("wallet:social-recovery", process.env.LOG_LEVEL ?? "info");

export interface GuardianSignature {
    guardianAddress: string;
    signature: string;
    signedAt: string;
}

export interface RecoveryRequest {
    id: string;
    accountAddress: string;
    newPublicKey: string;
    guardians: string[];
    threshold: number;
    signatures: GuardianSignature[];
    status: "initiated" | "pending_confirmations" | "threshold_met" | "executed" | "cancelled";
    initiatedAt: string;
    expiresAt: string;
    cancelledAt?: string;
    executedAt?: string;
}

interface RecoveryRow {
    id: string;
    account_address: string;
    new_public_key: string;
    guardians: string[];
    threshold: number;
    signatures: GuardianSignature[];
    status: string;
    initiated_at: Date;
    expires_at: Date;
    cancelled_at: Date | null;
    executed_at: Date | null;
}

function getPool(): Pool {
    const databaseUrl =
        process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";
    return new Pool({ connectionString: databaseUrl });
}

function mapRow(row: RecoveryRow): RecoveryRequest {
    return {
        id: row.id,
        accountAddress: row.account_address,
        newPublicKey: row.new_public_key,
        guardians: row.guardians,
        threshold: row.threshold,
        signatures: row.signatures,
        status: row.status as RecoveryRequest["status"],
        initiatedAt: row.initiated_at.toISOString(),
        expiresAt: row.expires_at.toISOString(),
        cancelledAt: row.cancelled_at?.toISOString(),
        executedAt: row.executed_at?.toISOString(),
    };
}

/**
 * Initiates a social recovery request.
 * User specifies guardians and the M-of-N threshold required for recovery.
 */
export async function initiateRecovery(
    accountAddress: string,
    newPublicKey: string,
    guardians: string[],
    threshold: number
): Promise<RecoveryRequest> {
    if (!accountAddress || !newPublicKey) {
        throw new Error("accountAddress and newPublicKey are required");
    }

    if (!guardians || guardians.length === 0) {
        throw new Error("At least one guardian is required");
    }

    if (threshold <= 0 || threshold > guardians.length) {
        throw new Error(`Threshold must be between 1 and ${guardians.length}`);
    }

    const pool = getPool();
    const recoveryId = generateRecoveryId();
    const initiatedAt = new Date();
    const recoveryWindow = Number(process.env.RECOVERY_WINDOW_HOURS ?? 48);
    const expiresAt = new Date(initiatedAt.getTime() + recoveryWindow * 60 * 60 * 1000);

    try {
        const { rows } = await pool.query<RecoveryRow>(
            `INSERT INTO recovery_requests (
         id,
         account_address,
         new_public_key,
         guardians,
         threshold,
         signatures,
         status,
         initiated_at,
         expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'initiated', $7, $8)
       RETURNING *`,
            [recoveryId, accountAddress, newPublicKey, guardians, threshold, JSON.stringify([]), initiatedAt, expiresAt]
        );

        const request = mapRow(rows[0]);
        log.info("Recovery request initiated", {
            recoveryId,
            accountAddress,
            guardianCount: guardians.length,
            threshold,
        });

        return request;
    } catch (err) {
        log.error("Failed to initiate recovery", { accountAddress, error: (err as Error).message });
        throw err;
    }
}

/**
 * Adds a guardian signature to a recovery request.
 * Once threshold signatures are collected, automatically transitions to threshold_met.
 */
export async function addGuardianSignature(
    recoveryId: string,
    guardianAddress: string,
    signature: string
): Promise<RecoveryRequest> {
    if (!recoveryId || !guardianAddress || !signature) {
        throw new Error("recoveryId, guardianAddress, and signature are required");
    }

    const pool = getPool();

    try {
        // Fetch current recovery request
        const { rows: fetchRows } = await pool.query<RecoveryRow>(
            `SELECT * FROM recovery_requests WHERE id = $1`,
            [recoveryId]
        );

        if (!fetchRows[0]) {
            throw new Error(`Recovery request not found: ${recoveryId}`);
        }

        const request = fetchRows[0];
        const request_obj = mapRow(request);

        // Validate status
        if (request_obj.status === "cancelled" || request_obj.status === "executed") {
            throw new Error(`Recovery request is already ${request_obj.status}`);
        }

        // Validate guardian
        if (!request_obj.guardians.includes(guardianAddress)) {
            throw new Error(`Guardian ${guardianAddress} is not authorized for this recovery`);
        }

        // Check for duplicate signatures
        if (request_obj.signatures.some((s) => s.guardianAddress === guardianAddress)) {
            throw new Error(`Guardian ${guardianAddress} has already signed this recovery`);
        }

        // Check expiration
        if (new Date() > new Date(request_obj.expiresAt)) {
            await pool.query(
                `UPDATE recovery_requests SET status = 'cancelled' WHERE id = $1`,
                [recoveryId]
            );
            throw new Error("Recovery request has expired");
        }

        const newSignature: GuardianSignature = {
            guardianAddress,
            signature,
            signedAt: new Date().toISOString(),
        };

        const updatedSignatures = [...request_obj.signatures, newSignature];
        const newStatus =
            updatedSignatures.length >= request_obj.threshold ? "threshold_met" : "pending_confirmations";

        const { rows: updateRows } = await pool.query<RecoveryRow>(
            `UPDATE recovery_requests
       SET signatures = $1, status = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
            [JSON.stringify(updatedSignatures), newStatus, recoveryId]
        );

        const updated = mapRow(updateRows[0]);

        log.info("Guardian signature added", {
            recoveryId,
            guardian: guardianAddress,
            signaturesCount: updatedSignatures.length,
            threshold: request_obj.threshold,
            status: newStatus,
        });

        return updated;
    } catch (err) {
        log.error("Failed to add guardian signature", { recoveryId, error: (err as Error).message });
        throw err;
    }
}

/**
 * Executes a recovery request that has reached threshold signatures.
 * Submits the multi-signed recovery transaction to the wallet contract.
 */
export async function executeRecovery(recoveryId: string): Promise<RecoveryRequest> {
    const pool = getPool();

    try {
        const { rows } = await pool.query<RecoveryRow>(
            `SELECT * FROM recovery_requests WHERE id = $1`,
            [recoveryId]
        );

        if (!rows[0]) {
            throw new Error(`Recovery request not found: ${recoveryId}`);
        }

        const request = mapRow(rows[0]);

        if (request.signatures.length < request.threshold) {
            throw new Error(
                `Insufficient signatures: ${request.signatures.length}/${request.threshold}`
            );
        }

        if (request.status === "executed") {
            log.warn("Recovery already executed", { recoveryId });
            return request;
        }

        if (request.status !== "threshold_met") {
            throw new Error(`Cannot execute recovery in ${request.status} state`);
        }

        // Submit recovery transaction to wallet contract
        await submitRecoveryTransaction(request);

        const { rows: updateRows } = await pool.query<RecoveryRow>(
            `UPDATE recovery_requests
       SET status = 'executed', executed_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [recoveryId]
        );

        const executed = mapRow(updateRows[0]);

        log.info("Recovery executed successfully", {
            recoveryId,
            accountAddress: request.accountAddress,
            signatories: request.signatures.length,
        });

        return executed;
    } catch (err) {
        log.error("Failed to execute recovery", { recoveryId, error: (err as Error).message });
        throw err;
    }
}

/**
 * Cancels an ongoing recovery request.
 * Can only be cancelled before threshold is met or within cancellation window after.
 */
export async function cancelRecovery(recoveryId: string): Promise<RecoveryRequest> {
    const pool = getPool();

    try {
        const { rows } = await pool.query<RecoveryRow>(
            `SELECT * FROM recovery_requests WHERE id = $1`,
            [recoveryId]
        );

        if (!rows[0]) {
            throw new Error(`Recovery request not found: ${recoveryId}`);
        }

        const request = mapRow(rows[0]);

        if (request.status === "executed" || request.status === "cancelled") {
            throw new Error(`Recovery request is already ${request.status}`);
        }

        const cancellationWindowHours = Number(process.env.RECOVERY_CANCELLATION_WINDOW_HOURS ?? 24);
        const thresholdMetTime = new Date(request.initiatedAt);
        const cancellationDeadline = new Date(
            thresholdMetTime.getTime() + cancellationWindowHours * 60 * 60 * 1000
        );
        const cancellationExpired = new Date() > cancellationDeadline;

        if (cancellationExpired) {
            throw new Error("Recovery cancellation window has passed");
        }

        const { rows: updateRows } = await pool.query<RecoveryRow>(
            `UPDATE recovery_requests
       SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
            [recoveryId]
        );

        const cancelled = mapRow(updateRows[0]);

        log.info("Recovery cancelled", { recoveryId, accountAddress: request.accountAddress });

        return cancelled;
    } catch (err) {
        log.error("Failed to cancel recovery", { recoveryId, error: (err as Error).message });
        throw err;
    }
}

/**
 * Retrieves the current state of a recovery request.
 */
export async function getRecoveryRequest(recoveryId: string): Promise<RecoveryRequest | null> {
    const pool = getPool();

    try {
        const { rows } = await pool.query<RecoveryRow>(
            `SELECT * FROM recovery_requests WHERE id = $1`,
            [recoveryId]
        );

        return rows[0] ? mapRow(rows[0]) : null;
    } catch (err) {
        log.error("Failed to fetch recovery request", { recoveryId, error: (err as Error).message });
        throw err;
    }
}

/**
 * Submits the multi-signed recovery transaction to the wallet contract.
 */
async function submitRecoveryTransaction(request: RecoveryRequest): Promise<void> {
    try {
        const walletUrl = process.env.WALLET_SERVICE_URL ?? "http://localhost:3012";
        const res = await fetch(`${walletUrl}/account/${encodeURIComponent(request.accountAddress)}/recover`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                newPublicKey: request.newPublicKey,
                guardianSignatures: request.signatures,
            }),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Wallet contract error: ${res.status} ${body}`);
        }

        log.info("Recovery transaction submitted on-chain", { recoveryId: request.id });
    } catch (err) {
        log.error("Recovery transaction submission failed", {
            recoveryId: request.id,
            error: (err as Error).message,
        });
        throw err;
    }
}

function generateRecoveryId(): string {
    return `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
