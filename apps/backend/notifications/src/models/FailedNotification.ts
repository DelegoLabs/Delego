import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export class FailedNotification extends Model {
  public id!: string;
  public notificationId!: string;
  public recipient!: string;
  public templateName!: string;
  public payload!: Record<string, unknown>;
  public errorMessage!: string | null;
  public attempts!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

FailedNotification.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    notificationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "notification_id",
    },
    recipient: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    templateName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "template_name",
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "error_message",
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    sequelize,
    modelName: "FailedNotification",
    tableName: "failed_notifications",
    timestamps: true,
    underscored: true,
  }
);
