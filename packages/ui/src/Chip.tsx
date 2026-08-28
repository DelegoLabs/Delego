import type { HTMLAttributes, ReactNode } from "react";

export type ChipTone = "neutral" | "info" | "warning" | "danger" | "success";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  children: ReactNode;
}

const toneVars: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: "var(--chip-neutral-bg)", fg: "var(--chip-neutral-fg)" },
  info: { bg: "var(--chip-info-bg)", fg: "var(--chip-info-fg)" },
  warning: { bg: "var(--chip-warning-bg)", fg: "var(--chip-warning-fg)" },
  danger: { bg: "var(--chip-danger-bg)", fg: "var(--chip-danger-fg)" },
  success: { bg: "var(--chip-success-bg)", fg: "var(--chip-success-fg)" },
};

/** Status pill. Colors come from CSS custom properties so contrast holds in light and dark themes. */
export function Chip({ tone = "neutral", children, style, ...props }: ChipProps) {
  const { bg, fg } = toneVars[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.125rem 0.625rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: 1.5,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
