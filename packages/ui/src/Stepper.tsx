export type StepStatus = "completed" | "current" | "upcoming";

export interface StepperStep {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  /** Index of the current step (0-based). */
  currentIndex: number;
  /** Called when a completed step's label is activated, to jump back to it. */
  onStepSelect?: (index: number) => void;
}

function statusOf(index: number, currentIndex: number): StepStatus {
  if (index < currentIndex) return "completed";
  if (index === currentIndex) return "current";
  return "upcoming";
}

interface StatusStyle {
  background: string;
  color: string;
  borderColor: string;
  badgeBackground: string;
  badgeColor: string;
}

const statusStyles: Record<StepStatus, StatusStyle> = {
  completed: {
    background: "#eff6ff",
    color: "#1d4ed8",
    borderColor: "#2563eb",
    badgeBackground: "#2563eb",
    badgeColor: "#fff",
  },
  current: {
    background: "#fff",
    color: "#2563eb",
    borderColor: "#2563eb",
    badgeBackground: "#fff",
    badgeColor: "#2563eb",
  },
  upcoming: {
    background: "#fff",
    color: "#9ca3af",
    borderColor: "#e5e7eb",
    badgeBackground: "#fff",
    badgeColor: "#9ca3af",
  },
};

/** Horizontal step indicator with completed/current/upcoming states, for multi-step flows. */
export function Stepper({ steps, currentIndex, onStepSelect }: StepperProps) {
  return (
    <ol
      aria-label="Progress"
      style={{
        display: "flex",
        listStyle: "none",
        margin: 0,
        padding: 0,
        gap: "0.5rem",
      }}
    >
      {steps.map((step, index) => {
        const status = statusOf(index, currentIndex);
        const style = statusStyles[status];
        const canSelect = status === "completed" && onStepSelect;

        return (
          <li key={step.id} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <button
              type="button"
              disabled={!canSelect}
              onClick={() => canSelect && onStepSelect(index)}
              aria-current={status === "current" ? "step" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                width: "100%",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.375rem",
                border: `1px solid ${style.borderColor}`,
                background: style.background,
                cursor: canSelect ? "pointer" : "default",
                font: "inherit",
                textAlign: "left",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "1.5rem",
                  height: "1.5rem",
                  borderRadius: "9999px",
                  border: `1px solid ${style.color}`,
                  background: style.badgeBackground,
                  color: style.badgeColor,
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {status === "completed" ? "✓" : index + 1}
              </span>
              <span style={{ color: style.color, fontSize: "0.875rem", fontWeight: 500 }}>
                {step.label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
