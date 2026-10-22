"use client";

import { InventoryThresholdField } from "./InventoryAlerts";
import { AutoReorderConfigForm } from "./AutoReorderConfigForm";
import type { AutoReorderConfig } from "../../lib/autoReorder";

export interface InventorySettingsProps {
  initialConfig?: AutoReorderConfig;
  onSave?: (config: AutoReorderConfig) => void;
  className?: string;
}

/**
 * Merchant Inventory Settings component combining alert threshold controls
 * and automated external supplier/ERP reorder triggers.
 */
export function InventorySettings({
  initialConfig,
  onSave,
  className,
}: InventorySettingsProps) {
  return (
    <div
      className={className}
      data-testid="merchant-inventory-settings"
      style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
    >
      <div
        style={{
          padding: "1rem",
          borderRadius: "0.75rem",
          border: "1px solid #e5e7eb",
          backgroundColor: "#fafafa",
        }}
      >
        <h4 style={{ margin: "0 0 0.5rem", fontSize: "0.9375rem", fontWeight: 600 }}>
          Catalog Stock Alert Threshold
        </h4>
        <InventoryThresholdField />
      </div>

      <AutoReorderConfigForm initialConfig={initialConfig} onSave={onSave} />
    </div>
  );
}

export { AutoReorderConfigForm } from "./AutoReorderConfigForm";
export type { AutoReorderConfigFormProps } from "./AutoReorderConfigForm";
