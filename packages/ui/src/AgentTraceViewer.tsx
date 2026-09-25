import { useState } from "react";

export interface AgentExecutionStep {
  stepIndex: number;
  title: string;
  status: "pending" | "running" | "completed" | "failed";
  details?: string;
  durationMs?: number;
  timestamp: string;
}

export interface AgentTraceViewerProps {
  steps: AgentExecutionStep[];
  /** When true, a running step's pulsing indicator animates. */
  isLive: boolean;
}

const STATUS_STYLE: Record<AgentExecutionStep["status"], { color: string; label: string }> = {
  pending: { color: "#9ca3af", label: "Pending" },
  running: { color: "#2563eb", label: "Running" },
  completed: { color: "#16a34a", label: "Completed" },
  failed: { color: "#dc2626", label: "Failed" },
};

function formatDuration(durationMs?: number): string | null {
  if (durationMs == null) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(durationMs % 1000 === 0 ? 0 : 1)}s`;
}

/** Accordion-style visualizer for an agent's step-by-step execution trace. */
export function AgentTraceViewer({ steps, isLive }: AgentTraceViewerProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    steps.findIndex((s) => s.status === "running" || s.status === "failed")
  );

  return (
    <div role="list" aria-label="Agent execution trace" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {steps.map((step) => {
        const { color, label } = STATUS_STYLE[step.status];
        const expanded = expandedIndex === step.stepIndex;
        const isFailed = step.status === "failed";
        const duration = formatDuration(step.durationMs);

        return (
          <div
            key={step.stepIndex}
            role="listitem"
            style={{
              border: `1px solid ${isFailed ? "#fecaca" : "#e5e7eb"}`,
              borderRadius: "0.5rem",
              background: isFailed ? "#fef2f2" : "#fff",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => setExpandedIndex(expanded ? null : step.stepIndex)}
              aria-expanded={expanded}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.625rem 0.75rem",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "9999px",
                  background: color,
                  animation:
                    isLive && step.status === "running"
                      ? "delego-trace-pulse 1.2s ease-in-out infinite"
                      : undefined,
                }}
              />
              <span style={{ flex: 1, fontSize: "0.8125rem", fontWeight: 600, color: isFailed ? "#991b1b" : "#111827" }}>
                {step.stepIndex + 1}. {step.title}
              </span>
              <span style={{ fontSize: "0.6875rem", color, fontWeight: 600 }}>{label}</span>
              {duration && (
                <span style={{ fontSize: "0.6875rem", color: "#6b7280", fontVariantNumeric: "tabular-nums" }}>
                  {duration}
                </span>
              )}
            </button>

            {expanded && step.details && (
              <div
                style={{
                  padding: "0 0.75rem 0.75rem 1.625rem",
                  fontSize: "0.75rem",
                  color: isFailed ? "#991b1b" : "#374151",
                }}
              >
                {step.details}
              </div>
            )}
          </div>
        );
      })}
      <style>{`
        @keyframes delego-trace-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
      `}</style>
    </div>
  );
}
