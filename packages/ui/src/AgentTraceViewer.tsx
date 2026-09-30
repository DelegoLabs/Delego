import { useState } from "react";

export interface AgentThoughtStep {
  stepId: string;
  description: string;
  status: "running" | "completed" | "failed";
  timestamp: number;
  logs?: string[];
}

export interface AgentTraceViewerProps {
  steps: AgentThoughtStep[];
  /** When true, a running step's pulsing indicator animates. */
  isLive?: boolean;
}

const STATUS_STYLE: Record<AgentThoughtStep["status"], { color: string; label: string }> = {
  running: { color: "#2563eb", label: "Thinking..." },
  completed: { color: "#16a34a", label: "Completed" },
  failed: { color: "#dc2626", label: "Failed" },
};

/** Accordion-style visualizer for an agent's step-by-step execution trace. */
export function AgentTraceViewer({ steps, isLive = true }: AgentTraceViewerProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(
    steps.findIndex((s) => s.status === "running" || s.status === "failed")
  );

  return (
    <div role="list" aria-label="Agent thought trace" style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {steps.map((step, index) => {
        const { color, label } = STATUS_STYLE[step.status];
        const expanded = expandedIndex === index;
        const isFailed = step.status === "failed";

        return (
          <div
            key={step.stepId}
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
              onClick={() => setExpandedIndex(expanded ? null : index)}
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
                {index + 1}. {step.description}
              </span>
              <span style={{ fontSize: "0.6875rem", color, fontWeight: 600 }}>{label}</span>
            </button>

            {expanded && step.logs && step.logs.length > 0 && (
              <div
                style={{
                  padding: "0 0.75rem 0.75rem 1.625rem",
                  fontSize: "0.75rem",
                  color: isFailed ? "#991b1b" : "#374151",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                }}
                role="region"
                aria-label="Tool invocation logs"
              >
                {step.logs.map((log, i) => (
                  <div key={i} style={{ fontFamily: "monospace", whiteSpace: "pre-wrap", background: "#f3f4f6", padding: "0.5rem", borderRadius: "0.25rem", color: "#111827" }}>
                    {log}
                  </div>
                ))}
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
