"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCopilotBubble } from "../chat/CopilotBubbleProvider";

/** Props for the mobile floating action button that launches the AI assistant. */
export interface FabButtonProps {
  /** Number of unread proposals to badge on the button. */
  unreadProposalsCount?: number;
  /**
   * Called when the button is activated. Defaults to raising the
   * `open-agent` event the chat drawer listens for, which is what the
   * app shell relies on when it renders the FAB without wiring a handler.
   */
  onClick?(): void;
}

/** Scroll distance (px) after which the FAB appears. */
const REVEAL_THRESHOLD = 80;

/**
 * Responsive Floating Action Button (FAB) that gives mobile buyers instant
 * access to the AI assistant from any page. Hidden on desktop via CSS and
 * animates in once the user scrolls past the reveal threshold.
 */
export function AgentFab({ unreadProposalsCount = 0, onClick }: FabButtonProps) {
  const t = useTranslations("agent");
  const tCopilot = useTranslations("copilot");
  const pathname = usePathname();
  const { prompt, openPrompt, dismissPrompt } = useCopilotBubble();
  const [visible, setVisible] = useState(false);
  const rafNext = useRef(false);

  /** Reveal the FAB once the user scrolls down. */
  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > REVEAL_THRESHOLD;
      if (next !== rafNext.current) {
        rafNext.current = next;
        setVisible(next);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /** Hide the FAB while the assistant drawer is open on the agent route. */
  const onAgentRoute = pathname?.startsWith("/agent") ?? false;
  const showFab = (visible || Boolean(prompt)) && !onAgentRoute;

  const handleClick = useCallback(() => {
    if (prompt) {
      openPrompt();
      return;
    }
    if (onClick) {
      onClick();
      return;
    }
    window.dispatchEvent(new CustomEvent("open-agent"));
  }, [onClick, openPrompt, prompt]);

  const badge = unreadProposalsCount > 0 ? unreadProposalsCount : null;

  return (
    <div className={`agent-fab-shell${showFab ? " agent-fab-shell--visible" : ""}`}>
      {prompt ? (
        <div className="agent-fab-prompt" role="status" data-testid="copilot-bubble-prompt">
          <button
            type="button"
            className="agent-fab-prompt__dismiss"
            aria-label={tCopilot("dismiss")}
            onClick={dismissPrompt}
          >
            ×
          </button>
          <strong>{tCopilot("highValueTitle")}</strong>
          <p>{prompt.message}</p>
          <button type="button" className="agent-fab-prompt__action" onClick={openPrompt}>
            {prompt.actionLabel}
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className={`agent-fab${prompt ? " agent-fab--pulsing" : ""}`}
        aria-label={t("roster.fabAria")}
        data-testid="agent-fab"
        data-visible={showFab}
        onClick={handleClick}
      >
        <span aria-hidden="true" className="agent-fab__icon">
          🤖
        </span>
        {badge !== null ? (
          <span
            className="agent-fab__badge"
            data-testid="agent-fab-badge"
            aria-label={t("roster.fabUnread", { count: badge })}
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </button>
    </div>
  );
}

export default AgentFab;
