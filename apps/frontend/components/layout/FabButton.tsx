"use client";

import { useEffect, useRef , useState } from "react";
import { useTranslations } from "next-intl";

/** Props for the responsive Floating Action Button. */
export interface FabButtonProps {
  /** Number of unread proposals to badge on the FAB. */
  unreadProposalsCount: number;
  /** Launches the AI assistant when the FAB is activated. */
  onClick(): void;
}

const SCROLL_THRESHOLD = 24;

/**
 * Mobile-only floating action button that launches the AI assistant from
 * any page. It fades/slides in once the user scrolls past the top of the
 * document and surfaces a badge with the unread proposal count.
 */
export function FabButton({ unreadProposalsCount, onClick }: FabButtonProps) {
  const t = useTranslations("fab");
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current !== null) {
        return;
      }
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        setVisible(window.scrollY > SCROLL_THRESHOLD);
      });
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  const hasBadge = unreadProposalsCount > 0;
  const badgeLabel = unreadProposalsCount > 99 ? "99+" : String(unreadProposalsCount);

  return (
    <button
      type="button"
      className={`fab-button${visible ? " fab-button--visible" : ""}`}
      onClick={onClick}
      aria-label={t("label")}
      data-testid="fab-button"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <span className="fab-button__icon" aria-hidden="true">
        🤖
      </span>
      {hasBadge ? (
        <span
          className="fab-button__badge"
          data-testid="fab-badge"
          aria-label={t("badge", { count: unreadProposalsCount })}
        >
          {badgeLabel}
        </span>
      ) : null}
    </button>
  );
}

export default FabButton;
