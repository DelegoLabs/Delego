"use client";

import { useState } from "react";
import { Card } from "@delegolabs/ui";
import {
  STRATEGY_OPTIONS,
  saveAgentConfig,
  type AgentPersonaConfig,
  type OptimizationStrategy,
} from "../../lib/agentConfig";

export interface AgentSettingsCardProps {
  config: AgentPersonaConfig;
}

const MAX_BUDGET_STROOPS = 1_000_000_0000; // 100,000 XLM ceiling for the slider

/** Settings card for an agent's optimization strategy and autonomous spending budget. */
export function AgentSettingsCard({ config: initialConfig }: AgentSettingsCardProps) {
  const [config, setConfig] = useState<AgentPersonaConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function updateStrategy(strategy: OptimizationStrategy) {
    setConfig((prev) => ({ ...prev, strategy }));
  }

  function updateBudget(stroops: number) {
    setConfig((prev) => ({ ...prev, maxAutonomousBudgetStroops: String(stroops) }));
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      await saveAgentConfig(config);
      setStatus({ type: "success", message: `Saved — ${config.name}'s settings updated.` });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save agent settings.",
      });
    } finally {
      setSaving(false);
    }
  }

  const budgetXlm = Number(config.maxAutonomousBudgetStroops) / 10_000_000;

  return (
    <Card title={`${config.name} — autonomy settings`}>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Optimization strategy
        </legend>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {STRATEGY_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.125rem",
                padding: "0.625rem 0.75rem",
                borderRadius: "0.5rem",
                border: config.strategy === opt.value ? "2px solid #2563eb" : "1px solid #d1d5db",
                background: config.strategy === opt.value ? "#eff6ff" : "#fff",
                cursor: "pointer",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input
                  type="radio"
                  name="agent-strategy"
                  checked={config.strategy === opt.value}
                  onChange={() => updateStrategy(opt.value)}
                />
                <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{opt.label}</span>
              </span>
              <span style={{ fontSize: "0.75rem", color: "#6b7280", marginLeft: "1.375rem" }}>
                {opt.description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginTop: "1rem" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
          Max autonomous spending: {budgetXlm.toLocaleString(undefined, { maximumFractionDigits: 2 })} XLM
        </span>
        <input
          type="range"
          min={0}
          max={MAX_BUDGET_STROOPS}
          step={10_000_000}
          value={Number(config.maxAutonomousBudgetStroops)}
          onChange={(e) => updateBudget(Number(e.target.value))}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", fontSize: "0.8125rem" }}>
        <input
          type="checkbox"
          checked={config.negotiationAllowed}
          onChange={(e) => setConfig((prev) => ({ ...prev, negotiationAllowed: e.target.checked }))}
        />
        Allow the agent to negotiate prices
      </label>

      {status && (
        <div className={`settings-status ${status.type}`} role="status" style={{ marginTop: "0.75rem" }}>
          {status.message}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: "0.875rem",
          padding: "0.5rem 1rem",
          borderRadius: "0.5rem",
          border: "none",
          background: "#2563eb",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.8125rem",
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </Card>
  );
}
