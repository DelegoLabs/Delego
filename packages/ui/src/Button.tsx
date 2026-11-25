import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/** Props accepted by the shared button component. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: ReactNode;
  /** Optional ARIA label for accessibility */
  ariaLabel?: string;
}

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, CSSProperties> = {
  sm: { padding: "0.25rem 0.5rem", fontSize: "0.875rem" },
  md: { padding: "0.5rem 1rem" },
  lg: { padding: "0.75rem 1.5rem", fontSize: "1.125rem" },
};

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "background:#2563eb;color:#fff;border:none",
  secondary: "background:#e5e7eb;color:#111;border:none",
  ghost: "background:transparent;color:#2563eb;border:1px solid #2563eb",
  destructive: "background:#dc2626;color:#fff;border:none",
};

/** Base button component with accessibility support — TODO: migrate to design system tokens */
export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  style,
  ariaLabel,
  ...props
}: ButtonProps) {
  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        {...props}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        style={{
          padding: "0.5rem 1rem",
          borderRadius: "0.375rem",
          cursor: "pointer",
          fontWeight: 500,
          transition: "all 0.2s ease-in-out",
          ...sizeStyles[size],
          ...Object.fromEntries(
            variantStyles[variant].split(";").map((s) => {
              const [k, v] = s.split(":");
              return [
                k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
                v?.trim(),
              ];
            }),
          ),
          ...style,
        }}
      >
        {loading && (
          <svg
            aria-hidden="true"
            focusable="false"
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            fill="none"
            style={{ display: "inline-block", marginRight: "0.5rem", verticalAlign: "middle" }}
          >
            <g>
              <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="rotate"
                from="0 12 12"
                to="360 12 12"
                dur="0.8s"
                repeatCount="indefinite"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="42 57"
                strokeLinecap="round"
              />
            </g>
          </svg>
        )}
        {children}
      </button>
      {loading && (
        <span
          role="status"
          aria-label="Loading"
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0,
          }}
        >
          Loading
        </span>
      )}
    </>
  );
}
