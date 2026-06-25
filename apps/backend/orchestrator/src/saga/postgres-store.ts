import { DataTypes, Model, Op, Sequelize } from "sequelize";
import { createLogger } from "@delego/utils";
import { SagaConcurrencyError, type SagaRecord, type SagaStatus, type SagaStore } from "./types.js";

const log = createLogger("orchestrator:saga:store", process.env.LOG_LEVEL ?? "info");

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";

const NON_NEGATIVE_INTEGER_PATTERN = /^(0|[1-9]\d*)$/;

function parsePoolSize(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;

  if (!NON_NEGATIVE_INTEGER_PATTERN.test(raw)) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return Number(raw);
}

const poolMin = parsePoolSize("DATABASE_POOL_MIN", 2);
const poolMax = parsePoolSize("DATABASE_POOL_MAX", 10);
if (poolMin > poolMax) {
  throw new Error("DATABASE_POOL_MIN must be less than or equal to DATABASE_POOL_MAX");
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: (msg) => log.debug(msg),
  pool: {
    min: poolMin,
    max: poolMax,
    acquire: 30000,
    idle: 10000,
  },
  define: {
    underscored: true,
    timestamps: true,
  },
});

interface SagaExecutionAttributes {
  sagaId: string;
  orderId: string;
  status: SagaStatus;
  completedSteps: string[];
  context: Record<string, unknown>;
  currentStep: string | null;
  error: string | null;
  version: number;
  claimExpiresAt: Date | null;
}

class SagaExecutionModel extends Model<SagaExecutionAttributes> implements SagaExecutionAttributes {
  declare sagaId: string;
  declare orderId: string;
  declare status: SagaStatus;
  declare completedSteps: string[];
  declare context: Record<string, unknown>;
  declare currentStep: string | null;
  declare error: string | null;
  declare version: number;
  declare claimExpiresAt: Date | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;
}

SagaExecutionModel.init(
  {
    sagaId: { type: DataTypes.STRING(128), primaryKey: true, field: "saga_id" },
    orderId: { type: DataTypes.STRING(128), allowNull: false, field: "order_id" },
    status: { type: DataTypes.STRING(32), allowNull: false },
    completedSteps: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: "completed_steps",
    },
    context: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    currentStep: { type: DataTypes.STRING(128), allowNull: true, field: "current_step" },
    error: { type: DataTypes.TEXT, allowNull: true },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    claimExpiresAt: { type: DataTypes.DATE, allowNull: true, field: "claim_expires_at" },
  },
  {
    sequelize,
    modelName: "SagaExecution",
    tableName: "saga_executions",
  }
);

function toRecord(row: SagaExecutionModel): SagaRecord {
  return {
    sagaId: row.sagaId,
    orderId: row.orderId,
    status: row.status,
    completedSteps: [...row.completedSteps],
    context: row.context,
    currentStep: row.currentStep,
    error: row.error,
    version: row.version,
    claimExpiresAt: row.claimExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function connectSagaDb(): Promise<void> {
  try {
    await sequelize.authenticate();
    log.info("Saga store database connection established");
  } catch (err) {
    log.error("Unable to connect to saga store database", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/** Durable SagaStore backed by PostgreSQL — required so compensation can resume after a crash. */
export class PostgresSagaStore implements SagaStore {
  async createIfNotExists(record: SagaRecord): Promise<SagaRecord> {
    const [row] = await SagaExecutionModel.findOrCreate({
      where: { sagaId: record.sagaId },
      defaults: {
        sagaId: record.sagaId,
        orderId: record.orderId,
        status: record.status,
        completedSteps: record.completedSteps,
        context: record.context,
        currentStep: record.currentStep,
        error: record.error,
        version: 0,
        claimExpiresAt: null,
      },
    });
    return toRecord(row);
  }

  async get(sagaId: string): Promise<SagaRecord | null> {
    const row = await SagaExecutionModel.findByPk(sagaId);
    return row ? toRecord(row) : null;
  }

  /**
   * Conditional update keyed on `version` (optimistic locking) instead of a blind upsert, so
   * two runners racing on the same sagaId (e.g. startup recovery overlapping a manual resume())
   * can never both win the same step claim and execute it twice. Returns the row straight from
   * the guarded UPDATE (via `returning: true`) rather than re-reading it, since a re-read could
   * race with — and silently return — a newer version written by another runner.
   */
  async save(record: SagaRecord): Promise<SagaRecord> {
    const [affectedCount, updatedRows] = await SagaExecutionModel.update(
      {
        status: record.status,
        completedSteps: record.completedSteps,
        context: record.context,
        currentStep: record.currentStep,
        error: record.error,
        claimExpiresAt: record.claimExpiresAt,
        version: record.version + 1,
      },
      { where: { sagaId: record.sagaId, version: record.version }, returning: true }
    );
    if (affectedCount === 0 || !updatedRows[0]) {
      throw new SagaConcurrencyError(record.sagaId);
    }
    return toRecord(updatedRows[0]);
  }

  async listIncomplete(): Promise<SagaRecord[]> {
    const rows = await SagaExecutionModel.findAll({
      where: { status: { [Op.in]: ["running", "compensating"] } },
    });
    return rows.map(toRecord);
  }
}
