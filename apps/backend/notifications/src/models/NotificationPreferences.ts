import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

export interface NotificationPreferencesAttributes {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationPreferences extends Model<NotificationPreferencesAttributes> implements NotificationPreferencesAttributes {
  public userId!: string;
  public emailEnabled!: boolean;
  public pushEnabled!: boolean;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

NotificationPreferences.init(
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true,
      field: "user_id",
    },
    emailEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "email_enabled",
    },
    pushEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "push_enabled",
    },
  },
  {
    sequelize,
    modelName: "NotificationPreferences",
    tableName: "notification_preferences",
    timestamps: true,
    underscored: true,
  }
);
