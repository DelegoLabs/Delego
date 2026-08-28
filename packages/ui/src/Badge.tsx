import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant = "default" | "estimated" | "info" | "success" | "warning" | "error";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: ReactNode;
}

const badgeStyles: Record<BadgeVariant, { bg: string; color: string }> = {
  default: { bg: "#6b7280", color: "#fff" },
  estimated: { bg: "#f59e0b", color: "#fff" },
  info: { bg: "#3b82f6", color: "#fff" },
  success: { bg: "#10b981", color: "#fff" },
  warning: { bg: "#f59e0b", color: "#fff" },
  error: { bg: "#ef4444", color: "#fff" },
};

export function Badge({ variant = "default", children, style, ...props }: BadgeProps) {
  const s = badgeStyles[variant];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.0625rem 0.4375rem",
        borderRadius: "0.25rem",
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.025em",
        textTransform: "uppercase",
        background: s.bg,
        color: s.color,
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
