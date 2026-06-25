import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export type DelegationStatusFilter = 'pending' | 'active' | 'paused' | 'revoked' | 'expired';
export const DELEGATION_STATUS_FILTERS: readonly DelegationStatusFilter[] = ['pending', 'active', 'paused', 'revoked', 'expired'];

export class Delegation extends Model {
  public id!: string;
  public userId!: string;
  public agentId!: string;
  public status!: string;
  public policy!: Record<string, any>;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Delegation.init(
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
    agentId: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(32),
      defaultValue: "pending",
      allowNull: false,
    },
    policy: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "Delegation",
    tableName: "delegations",
    timestamps: true,
    underscored: true,
  }
);
