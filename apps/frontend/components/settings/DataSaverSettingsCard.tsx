"use client";

import { Card } from "@delegolabs/ui";
import { useDataSaver, type DataSaverMode } from "../../hooks/useDataSaver";

/**
 * Settings page section for the network-aware data saver mode (#623):
 * automatic detection via navigator.connection (save-data header /
 * effective-type), with a manual override that always wins over the
 * heuristic and persists across reloads.
 */
export function DataSaverSettingsCard() {
  const { mode, reducedModeActive, setMode } = useDataSaver();

  return (
    <Card title="Data saver" ariaLabel="Data saver">
      <div className="settings-section">
        <div className="settings-toggle-row">
          <span>
            <span className="settings-toggle-label" id="data-saver-mode-label">
              Reduced data mode
            </span>
            <p className="settings-toggle-hint">
              {mode === "auto"
                ? reducedModeActive
                  ? "Automatically enabled — your connection looks slow or metered."
                  : "Automatic — will enable itself on a slow or metered connection."
                : mode === "on"
                  ? "Always on — images load on tap, charts show summary numbers."
                  : "Always off — full images and charts load regardless of connection."}
            </p>
          </span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as DataSaverMode)}
            aria-labelledby="data-saver-mode-label"
            style={{
              padding: "0.375rem 0.625rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-surface)",
              color: "var(--color-text-primary)",
              fontSize: "0.875rem",
            }}
          >
            <option value="auto">Automatic</option>
            <option value="on">Always on</option>
            <option value="off">Always off</option>
          </select>
        </div>
      </div>
    </Card>
  );
}
