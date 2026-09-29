"use client";

import { useEffect, useRef , useState } from "react";

export interface FabButtonProps {
  unreadProposalsCount: number;
  onClick(): void;
}

export function FabButton({ unreadProposalsCount, onClick }: FabButtonProps) {
  const [revealed, setRevealed] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (y > 24) {
        setRevealed(true);
      } else if (y < 8) {
        setRevealed(false);
      }
      lastScrollY.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const badge = unreadProposalsCount > 9 ? "9+" : String(unreadProposalsCount);

  return (
    <button
      type="button"
      className={`fab-button fab-button--${revealed ? "revealed" : "hidden"}`}
      aria-label={
unreadProposalsCount > 0
          ? `Open AI assistant (${unreadProposalsCount} unread proposal${unreadProposalsCount === 1 ? "" : "s”)})`
          : "Open AI assistant"
}
      onClick={onClick}
      data-testid="fab-button"
    >
      <span className="fab-button__icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9Zm0 4.5a2.25 2.25 0 1 1 0 4.5 2.25 2.25 0 0 1 0-4.5Zm0 10.5a6.7 6.7 0 0 1-4.5-1.7c.03-1.5 3-2.3 4.5-2.3s4.47.8 4.5 2.3A6.7 6.7 0 0 1 12 18Z"
            fill="currentColor"
          />
        </svg>
      </span>
      {unreadProposalsCount > 0 ? (
        <span className="fab-button__badge" data-testid="fab-badge">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export default FabButton;
