import { Sequelize } from "sequelize";
import { createLogger } from "@delego/utils";

const log = createLogger("payments:db", process.env.LOG_LEVEL ?? "info");

const databaseUrl = process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: (msg) => log.debug(msg),
  pool: {
    min: Number(process.env.DATABASE_POOL_MIN ?? 2),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    acquire: 30000,
    idle: 10000,
  },
  define: {
    underscored: true,
    timestamps: true,
  },
});

export async function connectDb(): Promise<void> {
  try {
    await sequelize.authenticate();
    log.info("Database connection established successfully in payments service.");
  } catch (err) {
    log.error("Unable to connect to the database in payments service", err instanceof Error ? { error: err.message } : { error: String(err) });
    throw err;
  }
}
