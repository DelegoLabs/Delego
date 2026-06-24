import { Model, DataTypes } from "sequelize";
import { sequelize } from "../db.js";

/**
 * OAuthAccount links a local User to a social-login provider identity.
 * One user may have multiple OAuthAccount rows (e.g. Google + GitHub).
 */
export class OAuthAccount extends Model {
  public id!: string;
  public userId!: string;
  public provider!: string;
  public providerUserId!: string;
  public email!: string | null;
  public displayName!: string | null;
  public avatarUrl!: string | null;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

OAuthAccount.init(
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
      field: "user_id",
    },
    provider: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    providerUserId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "provider_user_id",
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "display_name",
    },
    avatarUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "avatar_url",
    },
  },
  {
    sequelize,
    modelName: "OAuthAccount",
    tableName: "oauth_accounts",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["provider", "provider_user_id"],
        name: "oauth_accounts_provider_uid",
      },
    ],
  }
);
