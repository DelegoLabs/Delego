/**
 * Responsive Floating Action Button (FAB) for instant agent access.
 *
 * Renders only on mobile viewports (< 768px), animates in on scroll,
 * and surfaces an unread proposal badge count.
 */
"use client";

import { useEffect, useState } from "react";

export interface FabButtonProps {
  unreadProposalsCount: number;
  onClick(): void;
  /** Extra classes appended to the button, used for reveal/hide states. */
  className?: string;
}

export function FabButton({ unreadProposalsCount, onClick, className }: FabButtonProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !typeof window.matchMedia) {
      return;
    }

    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const onScroll = () => {
      if (window.scrollY > 0 || window.pageYOffset > 0) {
        setHasScrolled(true);
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!isMobile) {
    return null;
  }

  const showBadge = unreadProposalsCount > 0;
  const badgeLabel = unreadProposalsCount > 99 ? "99+" : String(unreadProposalsCount);

  return (
    <button
      type="button"
      className={`fab-button${hasScrolled ? " fab-button--visible" : ""}${className ? ` ${className}` : ""}`}
      onClick={onClick}
      aria-label={
        showBadge
          ? `Open AI assistant, ${unreadProposalsCount} unread proposal${unreadProposalsCount === 1 ? "" : "s"}`
          : "Open AI assistant"
      }
      data-testid="agent-fab-button"
    >
      <span aria-hidden="true" className="fab-button__icon">
        🤖
      </span>
      {showBadge ? (
        <span
          className="fab-button__badge"
          data-testid="agent-fab-badge"
        >
          {badgeLabel}
        </span>
      ) : null}
    </button>
  );
}

export default FabButton;
