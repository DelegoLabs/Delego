import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export interface TreasurySplitRow {
  name: string;
  address: string;
  splitBasisPoints: number;
}

export class EscrowFeeConfig extends Model {
  public id!: string;
  public token!: string;
  public feeBasisPoints!: number | null;
  public isDynamic!: boolean;
  public treasuries!: TreasurySplitRow[];
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

EscrowFeeConfig.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    token: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    feeBasisPoints: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isDynamic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    treasuries: {
      type: DataTypes.JSONB,
      defaultValue: [],
      allowNull: false,
    },
  },
  {
    sequelize,
    modelName: "EscrowFeeConfig",
    tableName: "escrow_fee_configs",
    timestamps: true,
    underscored: true,
  }
);
