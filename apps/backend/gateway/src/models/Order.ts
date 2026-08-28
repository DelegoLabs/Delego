import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class Order extends Model {
  public id!: string;
  public userId!: string;
  public delegationId!: string | null;
  public merchantId!: string;
  public status!: string;
  public lineItems!: Array<Record<string, unknown>>;
  public totalStroops!: string; // using string for BIGINT in JS
  public escrowContractId!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Order.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    delegationId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "delegations",
        key: "id",
      },
      onDelete: "SET NULL",
    },
    merchantId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      defaultValue: "draft",
      allowNull: false,
    },
    lineItems: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false,
    },
    totalStroops: {
      type: DataTypes.BIGINT,
      defaultValue: 0,
      allowNull: false,
    },
    escrowContractId: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "Order",
    tableName: "orders",
    timestamps: true,
    underscored: true,
  }
);
