/**
 * Settlement Reconciliation for Escrow Payments
 * Periodically compares database settlement records against on-chain escrow state.
 * Detects and resolves discrepancies from network failures or missed events.
 */
import { createLogger } from "@delego/utils";
import { Pool } from "pg";

const log = createLogger("payments:settlement-reconciler", process.env.LOG_LEVEL ?? "info");

export interface SettlementDiscrepancy {
    paymentId: string;
    orderId: string;
    escrowId: string;
    dbStatus: string;
    onChainStatus: string;
    discrepancyType: "status_mismatch" | "missing_settlement" | "orphaned_record";
    resolvedAt?: string;
}

interface SettlementReconciliationResult {
    totalPayments: number;
    discrepancies: SettlementDiscrepancy[];
    resolved: number;
    failed: number;
    duration: number;
}

/**
 * Raw row shape returned by `SELECT id, order_id, escrow_id, status ...`
 * — column names match the Postgres `payment_records` schema
 * (snake_case).  Kept separate from `PaymentRecord` so consumers of the
 * higher-level model continue to see the camelCase API surface.
 */
interface RawPaymentRow {
    id: string;
    order_id: string;
    escrow_id: string | null;
    status: string;
}

function getPool(): Pool {
    const databaseUrl =
        process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";
    return new Pool({ connectionString: databaseUrl });
}

/**
 * Fetches on-chain escrow status from the wallet service.
 * Returns the canonical status from Soroban contract state.
 */
async function fetchOnChainEscrowStatus(
    escrowId: string
): Promise<"funded" | "released" | "refunded" | "not_found"> {
    const walletUrl = process.env.WALLET_SERVICE_URL ?? "http://localhost:3012";
    try {
        const res = await fetch(`${walletUrl}/escrow/${encodeURIComponent(escrowId)}/status`, {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) {
            log.warn("Failed to fetch on-chain escrow status", { escrowId, status: res.status });
            return "not_found";
        }

        const body = (await res.json()) as { data?: { status?: string } };
        const status = body.data?.status;

        if (status === "released" || status === "refunded" || status === "funded") {
            return status;
        }
        return "not_found";
    } catch (err) {
        log.error("Error fetching on-chain escrow status", {
            escrowId,
            error: (err as Error).message,
        });
        return "not_found";
    }
}

/**
 * Determines if a database status and on-chain status indicate a discrepancy.
 */
function detectDiscrepancy(
    dbStatus: string,
    onChainStatus: string
): SettlementDiscrepancy["discrepancyType"] | null {
    // Funded on-chain with no release recorded
    if (onChainStatus === "released" && dbStatus !== "released") {
        return "status_mismatch";
    }

    // Refunded on-chain but not recorded in DB
    if (onChainStatus === "refunded" && dbStatus !== "refunded") {
        return "status_mismatch";
    }

    // DB shows released but on-chain is still funded (should not happen)
    if (dbStatus === "released" && onChainStatus === "funded") {
        return "status_mismatch";
    }

    return null;
}

/**
 * Resolves a settlement discrepancy by updating the payment record.
 * Uses optimistic concurrency control to handle concurrent updates safely.
 */
async function resolveDiscrepancy(
    pool: Pool,
    discrepancy: SettlementDiscrepancy,
    lockKey: string
): Promise<boolean> {
    try {
        // Acquire distributed lock to prevent concurrent resolution
        const lockAcquired = await acquireDistributedLock(pool, lockKey);
        if (!lockAcquired) {
            log.warn("Could not acquire lock for discrepancy resolution", {
                paymentId: discrepancy.paymentId,
            });
            return false;
        }

        // Re-fetch current state under lock
        const { rows } = await pool.query<{ status: string; updated_at: Date }>(
            `SELECT status, updated_at FROM payment_records WHERE id = $1`,
            [discrepancy.paymentId]
        );

        if (!rows[0]) {
            log.warn("Payment record not found for resolution", { paymentId: discrepancy.paymentId });
            releaseDistributedLock(pool, lockKey).catch(() => { });
            return false;
        }

        const currentDbStatus = rows[0].status;

        // If status already matches on-chain, no action needed
        if (currentDbStatus === discrepancy.onChainStatus) {
            log.info("Discrepancy already resolved", { paymentId: discrepancy.paymentId });
            releaseDistributedLock(pool, lockKey).catch(() => { });
            return true;
        }

        // Update payment record with on-chain status
        const updateResult = await pool.query(
            `UPDATE payment_records
       SET status = $1, updated_at = NOW()
       WHERE id = $2 AND status = $3
       RETURNING id`,
            [discrepancy.onChainStatus, discrepancy.paymentId, currentDbStatus]
        );

        if (updateResult.rowCount === 0) {
            log.warn("Concurrent update prevented; record was modified", {
                paymentId: discrepancy.paymentId,
            });
            releaseDistributedLock(pool, lockKey).catch(() => { });
            return false;
        }

        discrepancy.resolvedAt = new Date().toISOString();
        log.info("Settlement discrepancy resolved", {
            paymentId: discrepancy.paymentId,
            newStatus: discrepancy.onChainStatus,
        });

        releaseDistributedLock(pool, lockKey).catch(() => { });
        return true;
    } catch (err) {
        log.error("Error resolving discrepancy", {
            paymentId: discrepancy.paymentId,
            error: (err as Error).message,
        });
        releaseDistributedLock(pool, lockKey).catch(() => { });
        return false;
    }
}

/**
 * Simple distributed lock using a lock table.
 * In production, use Redis or a proper distributed locking service.
 */
async function acquireDistributedLock(pool: Pool, lockKey: string): Promise<boolean> {
    try {
        // Try to insert a lock record (fails if already exists)
        const result = await pool.query(
            `INSERT INTO settlement_locks (lock_key, acquired_at)
       VALUES ($1, NOW())
       ON CONFLICT DO NOTHING`,
            [lockKey]
        );
        return result.rowCount === 1;
    } catch {
        return false;
    }
}

async function releaseDistributedLock(pool: Pool, lockKey: string): Promise<void> {
    try {
        await pool.query(`DELETE FROM settlement_locks WHERE lock_key = $1`, [lockKey]);
    } catch (err) {
        log.warn("Error releasing lock", { lockKey, error: (err as Error).message });
    }
}

/**
 * Performs a full settlement reconciliation cycle.
 * Compares all non-terminal payment records against on-chain escrow state.
 */
export async function reconcileSettlements(): Promise<SettlementReconciliationResult> {
    const startTime = Date.now();
    const pool = getPool();
    const discrepancies: SettlementDiscrepancy[] = [];
    let resolvedCount = 0;
    let failedCount = 0;

    try {
        log.info("Starting settlement reconciliation cycle");

        // Fetch all non-terminal payments
        const { rows: paymentRows } = await pool.query<RawPaymentRow>(
            `SELECT id, order_id, escrow_id, status
       FROM payment_records
       WHERE status NOT IN ('released', 'refunded')
       AND escrow_id IS NOT NULL
       ORDER BY updated_at ASC`
        );

        const totalPayments = paymentRows.length;
        log.info("Reconciliation: fetched pending payments", { count: totalPayments });

        for (const payment of paymentRows) {
            if (!payment.escrow_id) continue;

            try {
                const onChainStatus = await fetchOnChainEscrowStatus(payment.escrow_id);

                // Skip if escrow not found on-chain
                if (onChainStatus === "not_found") {
                    continue;
                }

                const discrepancyType = detectDiscrepancy(payment.status, onChainStatus);

                if (discrepancyType) {
                    const discrepancy: SettlementDiscrepancy = {
                        paymentId: payment.id,
                        orderId: payment.order_id,
                        escrowId: payment.escrow_id,
                        dbStatus: payment.status,
                        onChainStatus,
                        discrepancyType,
                    };

                    discrepancies.push(discrepancy);

                    // Attempt resolution
                    const lockKey = `payment:${payment.id}`;
                    const resolved = await resolveDiscrepancy(pool, discrepancy, lockKey);

                    if (resolved) {
                        resolvedCount++;
                    } else {
                        failedCount++;
                    }
                }
            } catch (err) {
                log.error("Error reconciling payment", {
                    paymentId: payment.id,
                    error: (err as Error).message,
                });
                failedCount++;
            }
        }

        const duration = Date.now() - startTime;
        const result: SettlementReconciliationResult = {
            totalPayments,
            discrepancies,
            resolved: resolvedCount,
            failed: failedCount,
            duration,
        };

        log.info("Settlement reconciliation cycle completed", { ...result });
        return result;
    } catch (err) {
        log.error("Reconciliation cycle failed", { error: (err as Error).message });
        throw err;
    }
}

/**
 * Starts a periodic reconciliation scheduler.
 * Runs every N seconds (configurable via RECONCILIATION_INTERVAL_SECONDS).
 */
export function startReconciliationScheduler(): () => void {
    const intervalSeconds = Number(process.env.RECONCILIATION_INTERVAL_SECONDS ?? 300); // 5 minutes default
    const intervalMs = intervalSeconds * 1000;

    const intervalId = setInterval(() => {
        reconcileSettlements().catch((err) => {
            log.error("Unhandled error in reconciliation scheduler", { error: (err as Error).message });
        });
    }, intervalMs);

    log.info("Settlement reconciliation scheduler started", { intervalSeconds });

    return () => {
        clearInterval(intervalId);
        log.info("Settlement reconciliation scheduler stopped");
    };
}
