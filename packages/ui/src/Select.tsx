import type { SelectHTMLAttributes, ReactNode } from "react";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string>
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  options: SelectOption<T>[];
  onChange?: (value: T) => void;
  placeholder?: string;
  error?: string;
}

export function Select<T extends string = string>({
  label,
  options,
  onChange,
  placeholder,
  error,
  style,
  id,
  ...props
}: SelectProps<T>) {
  const selectId = id ?? (label ? `select-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {label && (
        <label
          htmlFor={selectId}
          style={{ fontSize: "0.875rem", fontWeight: 500, color: "#374151" }}
        >
          {label}
        </label>
      )}
      <select
        id={selectId}
        aria-invalid={!!error}
        aria-describedby={error ? `${selectId}-error` : undefined}
        style={{
          padding: "0.5rem 0.75rem",
          borderRadius: "0.375rem",
          border: `1px solid ${error ? "#ef4444" : "#d1d5db"}`,
          background: "#fff",
          fontSize: "0.875rem",
          lineHeight: "1.25rem",
          color: "#111827",
          minWidth: "180px",
          cursor: "pointer",
          ...style,
        }}
        onChange={(e) => onChange?.(e.target.value as T)}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && (
        <span
          id={`${selectId}-error`}
          role="alert"
          style={{ fontSize: "0.75rem", color: "#dc2626" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
