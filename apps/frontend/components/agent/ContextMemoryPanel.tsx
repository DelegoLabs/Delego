"use client";

import { useRef } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  contextToChips,
  type AgentConversationContext,
} from "../../lib/agentConversationContext";

export interface ContextMemoryPanelProps {
  /** Whether the slide-out panel is visible. */
  isOpen: boolean;
  /** Dismiss the panel. */
  onClose: () => void;
  /** The current inferred conversation context to display. */
  context: AgentConversationContext;
  /**
   * Called when the buyer clicks "Reset Memory". The parent is responsible for
   * calling `resetContext()` from `useAgentConversationContext` — this prop
   * just fires the user intent.
   */
  onReset: () => void;
  /**
   * When true a "Memory cleared" notice is shown so buyers have immediate
   * feedback after hitting Reset.
   */
  wasRecentlyReset?: boolean;
}

const CHIP_TONE_MAP: Record<string, { bg: string; text: string; border: string }> = {
  budget: {
    bg: "#eff6ff",
    text: "#1d4ed8",
    border: "#bfdbfe",
  },
  category: {
    bg: "#f0fdf4",
    text: "#15803d",
    border: "#bbf7d0",
  },
  condition: {
    bg: "#faf5ff",
    text: "#7e22ce",
    border: "#e9d5ff",
  },
  turns: {
    bg: "#f9fafb",
    text: "#374151",
    border: "#e5e7eb",
  },
};

function getChipStyle(key: string) {
  if (key.startsWith("excluded-")) {
    return {
      bg: "#fff7ed",
      text: "#c2410c",
      border: "#fed7aa",
    };
  }
  return CHIP_TONE_MAP[key] ?? CHIP_TONE_MAP["turns"];
}

/**
 * Slide-out "Context / Memory" panel accessible from the chat header (#MEMORY).
 *
 * - Displays key-value chips for every preference the agent has inferred from
 *   the current conversation (budget, category, excluded merchants, condition).
 * - Provides a "Reset Memory" button to wipe active filters without losing the
 *   chat transcript.
 * - Follows the same overlay + right-anchored panel pattern as `ChatDrawer`
 *   and `QuoteComparisonDrawer`.
 */
export function ContextMemoryPanel({
  isOpen,
  onClose,
  context,
  onReset,
  wasRecentlyReset = false,
}: ContextMemoryPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: panelRef, isActive: isOpen, onEscape: onClose });

  if (!isOpen) return null;

  const chips = contextToChips(context);
  const hasActiveFilters =
    context.activeBudgetStroops !== undefined ||
    context.targetCategory !== undefined ||
    context.excludedMerchants.length > 0 ||
    context.preferredCondition !== "any";

  return (
    <div
      role="presentation"
      data-testid="context-panel-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1200,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-panel-title"
        data-testid="context-memory-panel"
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            <h2
              id="context-panel-title"
              style={{ margin: 0, fontSize: "1.0625rem" }}
            >
              Context / Memory
            </h2>
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>
              What the agent is currently applying
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close context panel"
            data-testid="context-panel-close"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "1rem",
              lineHeight: 1,
              padding: "0.25rem",
            }}
          >
            ✕
          </button>
        </header>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Reset confirmation notice */}
          {wasRecentlyReset && (
            <div
              role="status"
              aria-live="polite"
              data-testid="context-reset-notice"
              style={{
                padding: "0.625rem 0.875rem",
                borderRadius: "0.5rem",
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                color: "#15803d",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span aria-hidden="true">✓</span>
              Memory cleared — filters have been reset.
            </div>
          )}

          {/* Active filters section */}
          <section aria-labelledby="context-filters-heading">
            <h3
              id="context-filters-heading"
              style={{
                margin: "0 0 0.625rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Active constraints
            </h3>

            {!hasActiveFilters && !wasRecentlyReset ? (
              <p
                data-testid="context-empty-state"
                style={{ color: "#9ca3af", fontSize: "0.875rem", margin: 0 }}
              >
                No constraints inferred yet. Start chatting to let the agent
                learn your preferences.
              </p>
            ) : (
              <ul
                aria-label="Inferred preferences"
                data-testid="context-chips-list"
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                {chips
                  .filter((chip) => chip.key !== "turns")
                  .map((chip) => {
                    const { bg, text, border } = getChipStyle(chip.key);
                    return (
                      <li key={chip.key}>
                        <span
                          data-testid="context-chip"
                          data-chip-key={chip.key}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.375rem",
                            padding: "0.3125rem 0.625rem",
                            borderRadius: "9999px",
                            border: `1px solid ${border}`,
                            background: bg,
                            color: text,
                            fontSize: "0.8125rem",
                            fontWeight: 500,
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.6875rem",
                              opacity: 0.75,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            {chip.label}:
                          </span>
                          {chip.value}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>

          {/* Session info */}
          <section aria-labelledby="context-session-heading">
            <h3
              id="context-session-heading"
              style={{
                margin: "0 0 0.5rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Session
            </h3>
            <dl
              style={{
                margin: 0,
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "0.25rem 0.75rem",
                fontSize: "0.875rem",
                color: "#374151",
              }}
            >
              <dt style={{ color: "#9ca3af", fontWeight: 500 }}>Turns</dt>
              <dd
                data-testid="context-turns-count"
                style={{ margin: 0, fontWeight: 600 }}
              >
                {context.turnsCount}
              </dd>

              <dt style={{ color: "#9ca3af", fontWeight: 500 }}>Condition</dt>
              <dd style={{ margin: 0, textTransform: "capitalize" }}>
                {context.preferredCondition}
              </dd>
            </dl>
          </section>

          {/* What this means */}
          <section aria-labelledby="context-about-heading">
            <h3
              id="context-about-heading"
              style={{
                margin: "0 0 0.5rem",
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              About memory
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.8125rem",
                color: "#6b7280",
                lineHeight: 1.6,
              }}
            >
              The agent infers these constraints from your messages in this
              session. They are not stored permanently — closing or resetting
              the chat clears them. Your long-term preferences are managed
              separately in{" "}
              <strong style={{ color: "#374151" }}>Settings → Agent Memory</strong>.
            </p>
          </section>
        </div>

        {/* ── Footer: Reset button ──────────────────────────────────────── */}
        <footer
          style={{
            padding: "0.875rem 1.25rem",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <Button
            variant="destructive"
            onClick={onReset}
            disabled={!hasActiveFilters}
            data-testid="context-reset-button"
          >
            Reset Memory
          </Button>
        </footer>
      </div>
    </div>
  );
}
