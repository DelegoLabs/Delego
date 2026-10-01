"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { VoiceInputButton } from "./VoiceInputButton";

export interface AgentChatDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Called with the trimmed prompt when the buyer submits a message. */
  onSubmit?: (prompt: string) => void;
}

/**
 * Chat drawer for the conversational buyer agent (#800). The prompt input is
 * backed by the voice mic button, so a buyer can dictate a request instead of
 * typing and see the transcript populate the field live.
 */
export function AgentChatDrawer({
  open,
  onClose,
  onSubmit,
}: AgentChatDrawerProps) {
  const [prompt, setPrompt] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: panelRef, isActive: open });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit?.(trimmed);
    setPrompt("");
  }

  return (
    <div className="agent-chat-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Ask the buying agent"
        tabIndex={-1}
        className="agent-chat-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 style={{ margin: 0 }}>Ask the agent</h2>
        <p className="agent-chat-hint">
          Describe what you want to buy and the agent will handle it.
        </p>

        <label htmlFor="agent-prompt-input">Message</label>
        <textarea
          id="agent-prompt-input"
          className="agent-chat-input"
          rows={3}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Find me a laptop under $1,000…"
        />

        <div className="agent-chat-actions">
          <VoiceInputButton
            onTranscript={setPrompt}
            label="Dictate a message"
          />
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={handleSubmit}
            disabled={prompt.trim().length === 0}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
