"use client";

import type { SelectHTMLAttributes } from "react";
import { useId } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  options: SelectOption[];
}

export function Select({ label, options, id, style, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <label
        htmlFor={selectId}
        style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }}
      >
        {label}
      </label>
      <select
        id={selectId}
        style={{
          padding: "0.5rem 0.75rem",
          borderRadius: "0.375rem",
          border: "1px solid var(--color-border)",
          background: "var(--color-surface)",
          color: "var(--color-text)",
          fontSize: "0.875rem",
          ...style,
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
