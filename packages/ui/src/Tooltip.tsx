import { useId, useState, type ReactNode } from "react";

export interface TooltipProps {
  /** Tooltip copy, shown on hover/focus of the wrapped element. */
  content: string;
  children: ReactNode;
}

/**
 * Wraps a single element (e.g. a disabled button) and shows a text tooltip
 * on hover or focus. The wrapper is always focusable via tabIndex so the
 * tooltip is reachable even when the wrapped element itself is disabled
 * (disabled elements don't receive focus, so they'd never show on
 * keyboard-only navigation otherwise).
 */
export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      tabIndex={0}
      aria-describedby={visible ? tooltipId : undefined}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            marginBottom: "0.375rem",
            padding: "0.375rem 0.625rem",
            borderRadius: "0.375rem",
            background: "var(--color-text-primary, #111827)",
            color: "var(--color-bg-surface, #fff)",
            fontSize: "0.75rem",
            whiteSpace: "nowrap",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
