import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "background:#2563eb;color:#fff;border:none",
  secondary: "background:#e5e7eb;color:#111;border:none",
  ghost: "background:transparent;color:#2563eb;border:1px solid #2563eb",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, { padding: string; fontSize: string }> = {
  sm: { padding: "0.25rem 0.625rem", fontSize: "0.75rem" },
  md: { padding: "0.5rem 1rem", fontSize: "0.875rem" },
  lg: { padding: "0.625rem 1.25rem", fontSize: "1rem" },
};

/** Base button component — TODO: migrate to design system tokens */
export function Button({
  variant = "primary",
  size = "md",
  children,
  style,
  ...props
}: ButtonProps) {
  const sz = sizeStyles[size];
  return (
    <button
      type="button"
      style={{
        padding: sz.padding,
        fontSize: sz.fontSize,
        borderRadius: "0.375rem",
        cursor: "pointer",
        fontWeight: 500,
        lineHeight: 1.5,
        ...Object.fromEntries(
          variantStyles[variant].split(";").map((s) => {
            const [k, v] = s.split(":");
            return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v?.trim()];
          })
        ),
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}
