"use client";

import { useEffect, useRef, useState } from "react";
import {
  HELP_LINKS,
  getHelpUrl,
  type HelpConceptKey,
} from "../../lib/helpLinks";

export interface HelpLinkProps {
  /** The concept this help affordance explains */
  concept: HelpConceptKey;
  /** Visual size of the trigger button (default: "sm") */
  size?: "sm" | "md";
}

/**
 * Inline contextual help affordance (#638).
 *
 * Renders a "?" button that shows a tooltip on hover or focus, linking to the
 * canonical documentation section for the given concept. Fully keyboard-
 * accessible: Esc dismisses, Enter/Space open, focus-managed per WCAG 2.1
 * SC 4.1.3 / ARIA tooltip pattern.
 *
 * Place at: limit editors, escrow detail header, dispute intro, network
 * switcher, privacy center.
 */
export function HelpLink({ concept, size = "sm" }: HelpLinkProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const link = HELP_LINKS[concept];
  const href = getHelpUrl(concept);

  // Close on outside click
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  // Clear any pending hide timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const tooltipId = `help-tooltip-${concept}`;

  const buttonSize = size === "md" ? 20 : 16;
  const fontSize = size === "md" ? "0.75rem" : "0.625rem";

  return (
    <span
      className="help-link-wrapper"
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Help: ${link.label}`}
        aria-expanded={open}
        aria-controls={tooltipId}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => {
          if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          setOpen(true);
        }}
        onMouseLeave={() => {
          hideTimeoutRef.current = setTimeout(() => setOpen(false), 200);
        }}
        onFocus={() => {
          if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          setOpen(true);
        }}
        onBlur={() => {
          hideTimeoutRef.current = setTimeout(() => setOpen(false), 200);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: buttonSize,
          height: buttonSize,
          borderRadius: "50%",
          border: "1.5px solid currentColor",
          background: "transparent",
          color: "var(--color-text-tertiary, #9ca3af)",
          cursor: "pointer",
          fontSize,
          fontWeight: 700,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
          transition: "color 0.15s ease, border-color 0.15s ease",
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            "var(--color-text-primary, #111827)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--color-text-primary, #111827)";
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color =
            "var(--color-text-tertiary, #9ca3af)";
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--color-text-tertiary, #9ca3af)";
        }}
      >
        ?
      </button>

      {open && (
        <div
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
          onMouseEnter={() => {
            if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
          }}
          onMouseLeave={() => {
            hideTimeoutRef.current = setTimeout(() => setOpen(false), 200);
          }}
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            width: 240,
            padding: "0.625rem 0.75rem",
            borderRadius: "0.5rem",
            background: "var(--color-bg-elevated, #1f2937)",
            color: "var(--color-text-inverse, #f9fafb)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
            fontSize: "0.8125rem",
            lineHeight: 1.5,
            // Prevent tooltip from being clipped at viewport edge
            maxWidth: "min(240px, calc(100vw - 2rem))",
          }}
        >
          {/* Arrow */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              bottom: -6,
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: "6px solid var(--color-bg-elevated, #1f2937)",
            }}
          />

          <p
            style={{
              margin: "0 0 0.25rem",
              fontWeight: 600,
              fontSize: "0.8125rem",
            }}
          >
            {link.label}
          </p>
          <p
            style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", opacity: 0.85 }}
          >
            {link.description}
          </p>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: "0.75rem",
              color: "var(--color-accent, #60a5fa)",
              textDecoration: "underline",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
            // Move focus back to trigger when user tabs away from the link
            onBlur={() => {
              hideTimeoutRef.current = setTimeout(() => setOpen(false), 200);
            }}
          >
            Learn more
            {/* External link icon */}
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ aspectRatio: "1/1" }}
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      )}
    </span>
  );
}
