"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

/** Hover/focus tooltip, e.g. for explaining why a disabled CTA is disabled */
export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      {visible && (
        <span
          role="tooltip"
          id={id}
          style={{
            position: "absolute",
            bottom: "calc(100% + 0.375rem)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--color-tooltip-bg)",
            color: "var(--color-tooltip-fg)",
            padding: "0.375rem 0.625rem",
            borderRadius: "0.375rem",
            fontSize: "0.75rem",
            lineHeight: 1.4,
            whiteSpace: "pre-line",
            maxWidth: "16rem",
            zIndex: 10,
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
