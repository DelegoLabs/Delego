import type { TextareaHTMLAttributes } from "react";

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function TextArea({
  label,
  error,
  hint,
  style,
  id,
  rows = 3,
  ...props
}: TextAreaProps) {
  const textareaId =
    id ?? (label ? `textarea-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {label && (
        <label
          htmlFor={textareaId}
          style={{ fontSize: "0.875rem", fontWeight: 500, color: "#374151" }}
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        rows={rows}
        aria-invalid={!!error}
        aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        style={{
          padding: "0.5rem 0.75rem",
          borderRadius: "0.375rem",
          border: `1px solid ${error ? "#ef4444" : "#d1d5db"}`,
          background: "#fff",
          fontSize: "0.875rem",
          lineHeight: "1.375rem",
          color: "#111827",
          resize: "vertical",
          fontFamily: "inherit",
          ...style,
        }}
        {...props}
      />
      {hint && !error && (
        <span
          id={`${textareaId}-hint`}
          style={{ fontSize: "0.75rem", color: "#6b7280" }}
        >
          {hint}
        </span>
      )}
      {error && (
        <span
          id={`${textareaId}-error`}
          role="alert"
          style={{ fontSize: "0.75rem", color: "#dc2626" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
