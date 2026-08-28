import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class OrderIssue extends Model {
  public id!: string;
  public orderId!: string;
  public reporterUserId!: string;
  public category!: string;
  public message!: string | null;
  public photoUrl!: string | null;
  public status!: string;
  public resolvedAt!: Date | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

OrderIssue.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "orders",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    reporterUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    category: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    photoUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(32),
      defaultValue: "open",
      allowNull: false,
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "OrderIssue",
    tableName: "order_issues",
    timestamps: true,
    underscored: true,
  }
);
