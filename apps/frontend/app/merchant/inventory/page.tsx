"use client";

import { InventorySettings } from "../../../components/merchant/InventorySettings";

export default function MerchantInventoryPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "48rem" }}>
      <header>
        <h1 style={{ margin: 0 }}>Inventory Settings</h1>
        <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
          Configure low stock alerts and automated external supplier restock hooks.
        </p>
      </header>

      <InventorySettings />
    </div>
  );
}
