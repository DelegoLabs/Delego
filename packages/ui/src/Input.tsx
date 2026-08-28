import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({
  label,
  error,
  hint,
  style,
  id,
  ...props
}: InputProps) {
  const inputId =
    id ?? (label ? `input-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {label && (
        <label
          htmlFor={inputId}
          style={{ fontSize: "0.875rem", fontWeight: 500, color: "#374151" }}
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        style={{
          padding: "0.5rem 0.75rem",
          borderRadius: "0.375rem",
          border: `1px solid ${error ? "#ef4444" : "#d1d5db"}`,
          background: "#fff",
          fontSize: "0.875rem",
          lineHeight: "1.25rem",
          color: "#111827",
          fontFamily: "inherit",
          ...style,
        }}
        {...props}
      />
      {hint && !error && (
        <span
          id={`${inputId}-hint`}
          style={{ fontSize: "0.75rem", color: "#6b7280" }}
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          id={`${inputId}-error`}
          role="alert"
          style={{ fontSize: "0.75rem", color: "#dc2626" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
