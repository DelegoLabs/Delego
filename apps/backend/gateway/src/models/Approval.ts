import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class Approval extends Model {
  public id!: string;
  public userId!: string;
  public title!: string;
  public description!: string | null;
  public amountStroops!: string | null; // using string for BIGINT in JS
  public requestedBy!: string;
  public status!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Approval.init(
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
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    amountStroops: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    requestedBy: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      defaultValue: "pending",
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Approval",
    tableName: "approvals",
    timestamps: true,
    underscored: true,
  }
);
