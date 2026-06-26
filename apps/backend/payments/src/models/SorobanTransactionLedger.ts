import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class SorobanTransactionLedger extends Model {
  public hash!: string;
  public orderId!: string | null;
  public contractId!: string | null;
  public method!: string;
  public status!: "PENDING" | "CONFIRMED" | "FAILED";
  public errorDetails!: string | null;
  public submittedAt!: Date;
  public confirmedAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SorobanTransactionLedger.init(
  {
    hash: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "order_id",
    },
    contractId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "contract_id",
    },
    method: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        isIn: [["PENDING", "CONFIRMED", "FAILED"]],
      },
    },
    errorDetails: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "error_details",
    },
    submittedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: "submitted_at",
    },
    confirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "confirmed_at",
    },
  },
  {
    sequelize,
    modelName: "SorobanTransactionLedger",
    tableName: "soroban_transaction_ledger",
    timestamps: true,
    underscored: true,
  }
);
