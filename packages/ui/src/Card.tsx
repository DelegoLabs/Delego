import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: ReactNode;
}

/** Simple card container — TODO: add variants and theming */
export function Card({ title, children, style, ...props }: CardProps) {
  return (
    <div
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "0.5rem",
        padding: "1rem",
        background: "var(--color-surface)",
        color: "var(--color-text)",
        ...style,
      }}
      {...props}
    >
      {title && <h3 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>{title}</h3>}
      {children}
    </div>
  );
}
