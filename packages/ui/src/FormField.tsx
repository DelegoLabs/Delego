import type { LabelHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/** Props accepted by the shared form-field wrapper. */
export interface FormFieldProps extends Omit<
  LabelHTMLAttributes<HTMLLabelElement>,
  "children"
> {
  label: string;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  /**
   * Custom control to render instead of the default `<input>`. Use this for
   * selects, textareas or composite controls; plain inputs should keep using
   * `inputProps` so the generated id and aria wiring stay in one place.
   */
  children?: ReactNode;
  /** Error message to display and announce to screen readers */
  error?: string;
  /** Hint text below the label */
  hint?: string;
  /** Whether field is required */
  required?: boolean;
}

/** Form field wrapper with accessibility support */
export function FormField({
  label,
  inputProps = {},
  children,
  error,
  hint,
  required,
  ...props
}: FormFieldProps) {
  const inputId =
    inputProps.id || `field-${Math.random().toString(36).slice(2, 9)}`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  const describedByIds = [hint ? hintId : "", error ? errorId : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={{ marginBottom: "1rem" }}>
      <label
        htmlFor={inputId}
        {...props}
        style={{
          display: "block",
          marginBottom: "0.5rem",
          fontWeight: 500,
          ...props.style,
        }}
      >
        {label}
        {required && (
          <span
            aria-label="required"
            style={{ color: "#dc2626", marginLeft: "0.25rem" }}
          >
            *
          </span>
        )}
      </label>
      {hint && (
        <div
          id={hintId}
          style={{
            fontSize: "0.875rem",
            color: "#666",
            marginBottom: "0.25rem",
          }}
        >
          {hint}
        </div>
      )}
      {children ?? (
        <input
          id={inputId}
          aria-describedby={describedByIds || undefined}
          aria-invalid={!!error}
          {...inputProps}
        />
      )}
      {error && (
        <div
          id={errorId}
          role="alert"
          style={{
            fontSize: "0.875rem",
            color: "#dc2626",
            marginTop: "0.25rem",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
