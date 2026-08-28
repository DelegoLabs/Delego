"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

export interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

/** Expandable section — used for the escrow fee breakdown and similar "show details" affordances */
export function Disclosure({ summary, children, defaultOpen = false }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <div style={{ border: "1px solid var(--color-border)", borderRadius: "0.375rem" }}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          font: "inherit",
          color: "var(--color-text)",
        }}
      >
        <span>{summary}</span>
        <span
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        >
          &#9662;
        </span>
      </button>
      {open && (
        <div id={contentId} style={{ padding: "0 0.75rem 0.75rem" }}>
          {children}
        </div>
      )}
    </div>
  );
}
