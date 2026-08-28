import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class Dispute extends Model {
  public id!: string;
  public orderId!: string;
  public issueId!: string | null;
  public category!: string;
  public message!: string;
  public status!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Dispute.init(
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
    issueId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: "order_issues",
        key: "id",
      },
      onDelete: "SET NULL",
    },
    category: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      defaultValue: "open",
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Dispute",
    tableName: "disputes",
    timestamps: true,
    underscored: true,
  }
);
