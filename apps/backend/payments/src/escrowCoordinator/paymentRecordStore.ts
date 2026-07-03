import { Pool, type QueryResultRow } from "pg";
import { createLogger } from "@delego/utils";
import type {
  CreatePaymentRecordInput,
  PaymentRecord,
  PaymentRecordStatus,
} from "./types.js";

const log = createLogger("payments:escrow-coordinator:store", process.env.LOG_LEVEL ?? "info");

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const databaseUrl =
      process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";
    pool = new Pool({ connectionString: databaseUrl });
  }
  return pool;
}

export function _setPoolForTesting(testPool: Pool): void {
  pool = testPool;
}

export function _resetPoolForTesting(): void {
  pool = null;
}

interface PaymentRecordRow extends QueryResultRow {
  id: string;
  order_id: string;
  escrow_id: string | null;
  escrow_contract_id: string;
  buyer_address: string;
  seller_address: string;
  token_contract_id: string;
  amount_stroops: string;
  status: string;
  fund_tx_hash: string | null;
  release_tx_hash: string | null;
  refund_tx_hash: string | null;
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRow(row: PaymentRecordRow): PaymentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    escrowId: row.escrow_id,
    escrowContractId: row.escrow_contract_id,
    buyerAddress: row.buyer_address,
    sellerAddress: row.seller_address,
    tokenContractId: row.token_contract_id,
    amountStroops: row.amount_stroops,
    status: row.status as PaymentRecordStatus,
    fundTxHash: row.fund_tx_hash,
    releaseTxHash: row.release_tx_hash,
    refundTxHash: row.refund_tx_hash,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findPaymentRecordByOrderId(
  orderId: string
): Promise<PaymentRecord | null> {
  const { rows } = await getPool().query<PaymentRecordRow>(
    `SELECT *
     FROM payment_records
     WHERE order_id = $1
     LIMIT 1`,
    [orderId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function findPaymentRecordByEscrowId(
  escrowId: string
): Promise<PaymentRecord | null> {
  const { rows } = await getPool().query<PaymentRecordRow>(
    `SELECT *
     FROM payment_records
     WHERE escrow_id = $1
     LIMIT 1`,
    [escrowId]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function createPaymentRecord(
  input: CreatePaymentRecordInput
): Promise<PaymentRecord> {
  const { rows } = await getPool().query<PaymentRecordRow>(
    `INSERT INTO payment_records (
       order_id,
       escrow_contract_id,
       buyer_address,
       seller_address,
       token_contract_id,
       amount_stroops,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [
      input.orderId,
      input.escrowContractId,
      input.buyerAddress,
      input.sellerAddress,
      input.tokenContractId,
      input.amountStroops,
    ]
  );

  const record = mapRow(rows[0]);
  log.info("Payment record created", { orderId: record.orderId, id: record.id });
  return record;
}

export interface PaymentRecordUpdate {
  escrowId?: string;
  status?: PaymentRecordStatus;
  fundTxHash?: string | null;
  releaseTxHash?: string | null;
  refundTxHash?: string | null;
  failureReason?: string | null;
}

export async function updatePaymentRecord(
  id: string,
  update: PaymentRecordUpdate
): Promise<PaymentRecord> {
  const fields: string[] = [];
  const values: unknown[] = [id];

  const addField = (column: string, value: unknown) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if (update.escrowId !== undefined) addField("escrow_id", update.escrowId);
  if (update.status !== undefined) addField("status", update.status);
  if (update.fundTxHash !== undefined) addField("fund_tx_hash", update.fundTxHash);
  if (update.releaseTxHash !== undefined) addField("release_tx_hash", update.releaseTxHash);
  if (update.refundTxHash !== undefined) addField("refund_tx_hash", update.refundTxHash);
  if (update.failureReason !== undefined) addField("failure_reason", update.failureReason);

  if (fields.length === 0) {
    const { rows } = await getPool().query<PaymentRecordRow>(
      `SELECT * FROM payment_records WHERE id = $1`,
      [id]
    );
    if (!rows[0]) throw new Error(`Payment record not found: ${id}`);
    return mapRow(rows[0]);
  }

  fields.push("updated_at = NOW()");

  const { rows } = await getPool().query<PaymentRecordRow>(
    `UPDATE payment_records
     SET ${fields.join(", ")}
     WHERE id = $1
     RETURNING *`,
    values
  );

  if (!rows[0]) throw new Error(`Payment record not found: ${id}`);
  return mapRow(rows[0]);
}
