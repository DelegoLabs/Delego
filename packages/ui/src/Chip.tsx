import type { HTMLAttributes, ReactNode } from "react";

export type ChipVariant =
  | "default"
  | "issue_open"
  | "issue_resolved"
  | "issue_escalated"
  | "dispute_open"
  | "dispute_resolved"
  | "approval_pending"
  | "approval_approved"
  | "approval_rejected"
  | "success"
  | "warning"
  | "error"
  | "info";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  children: ReactNode;
}

const chipStyles: Record<ChipVariant, { bg: string; color: string; border: string }> = {
  default: { bg: "#e5e7eb", color: "#111827", border: "1px solid #d1d5db" },
  issue_open: { bg: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b" },
  issue_resolved: { bg: "#d1fae5", color: "#065f46", border: "1px solid #10b981" },
  issue_escalated: { bg: "#fee2e2", color: "#991b1b", border: "1px solid #ef4444" },
  dispute_open: { bg: "#fecaca", color: "#7f1d1d", border: "1px solid #dc2626" },
  dispute_resolved: { bg: "#dbeafe", color: "#1e3a8a", border: "1px solid #2563eb" },
  approval_pending: { bg: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b" },
  approval_approved: { bg: "#d1fae5", color: "#065f46", border: "1px solid #10b981" },
  approval_rejected: { bg: "#fee2e2", color: "#991b1b", border: "1px solid #ef4444" },
  success: { bg: "#d1fae5", color: "#065f46", border: "1px solid #10b981" },
  warning: { bg: "#fef3c7", color: "#92400e", border: "1px solid #f59e0b" },
  error: { bg: "#fee2e2", color: "#991b1b", border: "1px solid #ef4444" },
  info: { bg: "#dbeafe", color: "#1e3a8a", border: "1px solid #2563eb" },
};

export function Chip({ variant = "default", children, style, ...props }: ChipProps) {
  const s = chipStyles[variant];
  return (
    <span
      role="status"
      aria-label={typeof children === "string" ? children : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.125rem 0.625rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        lineHeight: "1.25rem",
        fontWeight: 500,
        background: s.bg,
        color: s.color,
        border: s.border,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
