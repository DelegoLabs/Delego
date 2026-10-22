"use client";

import { InventorySettings } from "../../../components/merchant/InventorySettings";

export default function MerchantSettingsPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "48rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>Merchant Settings</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
          Manage your inventory thresholds and automated supplier ERP hooks.
        </p>
      </header>

      <InventorySettings />
    </div>
  );
}
