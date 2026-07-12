import { QueryInterface, DataTypes } from "sequelize";

export const up = async (queryInterface: QueryInterface): Promise<void> => {
  // Check if table already exists (idempotent)
  const tables = await queryInterface.showAllTables();
  if (tables.includes("failed_notifications")) {
    return;
  }

  // Create the failed_notifications table
  await queryInterface.createTable("failed_notifications", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    notification_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    recipient: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    template_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  });

  // Create indices
  await queryInterface.addIndex(
    "failed_notifications",
    ["recipient", "created_at"],
    { name: "idx_failed_notifications_recipient_created_at" }
  );

  await queryInterface.addIndex(
    "failed_notifications",
    ["notification_id"],
    { name: "idx_failed_notifications_notification_id" }
  );
};

export const down = async (queryInterface: QueryInterface): Promise<void> => {
  // Check if table exists before dropping (idempotent)
  const tables = await queryInterface.showAllTables();
  if (tables.includes("failed_notifications")) {
    await queryInterface.dropTable("failed_notifications");
  }
};
