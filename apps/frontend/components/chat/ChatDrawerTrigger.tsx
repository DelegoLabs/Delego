"use client";

import { useChatDrawer } from "./ChatDrawerProvider";

/**
 * Navbar button that opens the Buyer Agent chat drawer (#676). Sits next to the
 * command-palette trigger; the same drawer is also reachable via ⌘J / Ctrl+J.
 */
export function ChatDrawerTrigger() {
  const { openChat } = useChatDrawer();

  return (
    <button
      type="button"
      className="chat-drawer-trigger focus-visible-ring"
      onClick={openChat}
      aria-label="Open agent chat"
      title="Chat with your agent (⌘J)"
      data-testid="chat-drawer-trigger"
      style={{
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontSize: "1.125rem",
        lineHeight: 1,
        padding: "0.25rem",
      }}
    >
      <span aria-hidden="true">💬</span>
    </button>
  );
}
