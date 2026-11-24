import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/** Props accepted by the shared button component. */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive";
  size?: string;
  loading?: boolean;
  children: ReactNode;
  /** Optional ARIA label for accessibility */
  ariaLabel?: string;
}

/*
 * Theme tokens are exposed as CSS custom properties. Consumers (or a theme
 * stylesheet toggled for `prefers-color-scheme: dark`, `[data-theme="dark"]`,
 * or `prefers-contrast: more`) override the variables; the fallbacks below are
 * the light-theme defaults so the component renders correctly with no theme.
 */
const variantStyles: Record<NonNullable<ButtonProps["variant"]>, CSSProperties> = {
  primary: {
    background: "var(--ui-button-primary-bg, #2563eb)",
    color: "var(--ui-button-primary-fg, #fff)",
    border: "none",
  },
  secondary: {
    background: "var(--ui-button-secondary-bg, #e5e7eb)",
    color: "var(--ui-button-secondary-fg, #111)",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: "var(--ui-button-ghost-fg, #2563eb)",
    border: "1px solid var(--ui-button-ghost-border, #2563eb)",
  },
  destructive: {
    background: "var(--ui-button-destructive-bg, #dc2626)",
    color: "var(--ui-button-destructive-fg, #fff)",
    border: "none",
  },
};

/** Base button component with accessibility support — themed via CSS custom properties */
export function Button({
  variant = "primary",
  children,
  style,
  ariaLabel,
  // Consumed by callers to reflect an in-flight request; it is not a valid
  // DOM attribute, so it must not be spread onto the <button>.
  loading: _loading,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      style={{
        padding: "0.5rem 1rem",
        borderRadius: "0.375rem",
        cursor: "pointer",
        fontWeight: 500,
        transition: "all 0.2s ease-in-out",
        ...variantStyles[variant],
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
