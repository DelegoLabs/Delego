import type { HTMLAttributes, ReactNode } from "react";

/** Semantic tone for a badge — maps to a themeable background/text color pair. */
export type BadgeTone = "info" | "success" | "warning" | "error" | "neutral";

/** Props accepted by the shared badge component. */
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const toneStyles: Record<BadgeTone, string> = {
  info: "background:var(--ui-badge-info-bg, #dbeafe);color:var(--ui-badge-info-fg, #1e40af)",
  success: "background:var(--ui-badge-success-bg, #dcfce7);color:var(--ui-badge-success-fg, #166534)",
  warning: "background:var(--ui-badge-warning-bg, #fef3c7);color:var(--ui-badge-warning-fg, #92400e)",
  error: "background:var(--ui-badge-error-bg, #fee2e2);color:var(--ui-badge-error-fg, #dc2626)",
  neutral: "background:var(--ui-badge-neutral-bg, #e5e7eb);color:var(--ui-badge-neutral-fg, #374151)",
};

/** Small coloured pill for status/severity labelling — themed via CSS custom properties */
export function Badge({ tone = "neutral", children, style, ...props }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "0.125rem 0.625rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 500,
        lineHeight: 1.4,
        ...Object.fromEntries(
          toneStyles[tone].split(";").map((s) => {
            const [k, v] = s.split(":");
            return [
              k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
              v?.trim(),
            ];
          }),
        ),
        ...style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
