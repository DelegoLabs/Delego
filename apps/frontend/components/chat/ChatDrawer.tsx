"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";

/**
 * Role of a message author in the Buyer Agent conversation (#676).
 *
 * - `user` — the buyer.
 * - `assistant` — the agent's natural-language reply.
 * - `system` — a non-conversational status/notice line.
 * - `tool` — the agent narrating a tool invocation.
 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/** A single tool invocation the agent surfaced while reasoning. */
export interface AgentToolCall {
  toolName: "search_catalog" | "check_limits" | "estimate_escrow";
  arguments: Record<string, unknown>;
  result?: Record<string, unknown>;
}

/** One entry in the chat transcript. */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status: "sending" | "streaming" | "complete" | "error";
  toolCalls?: AgentToolCall[];
  proposalId?: string;
}

export interface ChatDrawerProps {
  /** Whether the slide-out panel is visible. */
  isOpen: boolean;
  /** Dismiss the drawer. */
  onClose: () => void;
  /** Identifier of the Buyer Agent being conversed with. */
  agentId: string;
  /**
   * Conversation so far. When omitted the drawer shows the empty state — the
   * parent owns the transcript so streaming chunks dropped into this array
   * re-render (and re-scroll) the history.
   */
  messages?: ChatMessage[];
  /** True while the agent is generating — swaps the tail for a skeleton. */
  isGenerating?: boolean;
  /** Called with the trimmed input when the buyer submits a message. */
  onSendMessage?: (content: string) => void;
  /** Called when the buyer taps the proposal reference attached to a message. */
  onOpenProposal?: (proposalId: string) => void;
}

/** Human-readable heading shown on each tool-call indicator. */
const TOOL_LABELS: Record<AgentToolCall["toolName"], string> = {
  search_catalog: "Searching the catalog",
  check_limits: "Checking spending limits",
  estimate_escrow: "Estimating escrow",
};

function formatToolValue(value: Record<string, unknown> | undefined): string {
  if (!value || Object.keys(value).length === 0) return "—";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    // `JSON.stringify` throws on circular structures — fall back to a marker
    // rather than crashing the drawer mid-render.
    return "[unserializable]";
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Slide-out conversational interface for the Buyer Agent (#676).
 *
 * - Renders the transcript with distinct user/assistant bubbles and
 *   auto-scrolls to the newest chunk as the agent streams.
 * - Surfaces expandable tool-call indicators so the buyer can inspect the
 *   agent's reasoning (tool arguments and results).
 * - Shows a loading skeleton while the agent is generating a reply.
 * - Opens from the navbar trigger or the global ⌘J / Ctrl+J shortcut via
 *   `ChatDrawerProvider`.
 */
export function ChatDrawer({
  isOpen,
  onClose,
  agentId,
  messages = [],
  isGenerating = false,
  onSendMessage,
  onOpenProposal,
}: ChatDrawerProps) {
  const [draft, setDraft] = useState("");
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>(
    {}
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useFocusTrap({ containerRef: panelRef, isActive: isOpen, onEscape: onClose });

  // Auto-scroll to the newest content whenever a stream chunk arrives (the
  // parent hands us a new `messages` identity) or the skeleton appears.
  useEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [isOpen, messages, isGenerating]);

  if (!isOpen) return null;

  function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessage?.(trimmed);
    setDraft("");
  }

  function toggleTool(key: string) {
    setExpandedTools((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  return (
    <div
      role="presentation"
      data-testid="chat-drawer-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1100,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Chat with buyer agent ${agentId}`}
        data-testid="chat-drawer"
        data-agent-id={agentId}
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 440,
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
            <h2 id="chat-drawer-title" style={{ margin: 0, fontSize: "1.0625rem" }}>
              Chat with Agent
            </h2>
            <p
              style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}
              data-testid="chat-drawer-agent-id"
            >
              {agentId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            data-testid="chat-drawer-close"
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

        {/* ── Message history ────────────────────────────────────────────── */}
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation"
          data-testid="chat-message-list"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "1rem 1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
          }}
        >
          {messages.length === 0 && !isGenerating && (
            <p
              data-testid="chat-empty-state"
              style={{
                margin: "auto 0",
                textAlign: "center",
                color: "#9ca3af",
                fontSize: "0.875rem",
              }}
            >
              Ask your agent to find a product or review a purchase proposal.
            </p>
          )}

          {messages.map((message) => {
            const isUser = message.role === "user";
            const proposalId = message.proposalId;
            return (
              <div
                key={message.id}
                data-testid="chat-message"
                data-role={message.role}
                data-status={message.status}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isUser ? "flex-end" : "flex-start",
                  gap: "0.25rem",
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "0.5rem 0.75rem",
                    borderRadius: isUser
                      ? "0.75rem 0.75rem 0.25rem 0.75rem"
                      : "0.75rem 0.75rem 0.75rem 0.25rem",
                    background: isUser ? "#2563eb" : "#f3f4f6",
                    color: isUser ? "#fff" : "#111827",
                    fontSize: "0.875rem",
                  }}
                >
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {message.content}
                  </p>

                  {/* Expandable tool-call indicators (agent reasoning). */}
                  {message.toolCalls?.map((call, index) => {
                    const key = `${message.id}-${index}`;
                    const expanded = Boolean(expandedTools[key]);
                    return (
                      <div
                        key={key}
                        data-testid="tool-call"
                        data-tool={call.toolName}
                        style={{
                          marginTop: "0.5rem",
                          border: "1px dashed #d1d5db",
                          borderRadius: "0.5rem",
                          background: "#f9fafb",
                          padding: "0.5rem",
                          color: "#374151",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleTool(key)}
                          aria-expanded={expanded}
                          data-testid="tool-call-toggle"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            width: "100%",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            padding: 0,
                            fontSize: "0.8125rem",
                            fontWeight: 600,
                            color: "#374151",
                          }}
                        >
                          <span aria-hidden="true">🧠</span>
                          <span>{TOOL_LABELS[call.toolName]}</span>
                          <span aria-hidden="true" style={{ marginLeft: "auto" }}>
                            {expanded ? "▲" : "▼"}
                          </span>
                        </button>

                        {expanded && (
                          <div data-testid="tool-call-details" style={{ marginTop: "0.5rem" }}>
                            <p style={{ margin: "0 0 0.125rem", fontSize: "0.6875rem", color: "#9ca3af" }}>
                              Arguments
                            </p>
                            <pre
                              data-testid="tool-call-arguments"
                              style={{
                                margin: 0,
                                fontSize: "0.6875rem",
                                background: "#fff",
                                border: "1px solid #e5e7eb",
                                borderRadius: "0.375rem",
                                padding: "0.375rem",
                                overflowX: "auto",
                              }}
                            >
                              {formatToolValue(call.arguments)}
                            </pre>

                            {call.result && (
                              <>
                                <p
                                  style={{
                                    margin: "0.375rem 0 0.125rem",
                                    fontSize: "0.6875rem",
                                    color: "#9ca3af",
                                  }}
                                >
                                  Result
                                </p>
                                <pre
                                  data-testid="tool-call-result"
                                  style={{
                                    margin: 0,
                                    fontSize: "0.6875rem",
                                    background: "#fff",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: "0.375rem",
                                    padding: "0.375rem",
                                    overflowX: "auto",
                                  }}
                                >
                                  {formatToolValue(call.result)}
                                </pre>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Purchase-proposal reference attached to the message. */}
                  {proposalId && (
                    <button
                      type="button"
                      onClick={() => onOpenProposal?.(proposalId)}
                      data-testid="chat-proposal-link"
                      style={{
                        marginTop: "0.5rem",
                        border: "none",
                        background: "transparent",
                        color: isUser ? "#dbeafe" : "#2563eb",
                        cursor: "pointer",
                        padding: 0,
                        fontSize: "0.8125rem",
                        textDecoration: "underline",
                      }}
                    >
                      Review purchase proposal
                    </button>
                  )}
                </div>

                <span
                  data-testid="chat-message-status"
                  style={{ fontSize: "0.6875rem", color: "#9ca3af" }}
                >
                  {message.status === "sending"
                    ? "Sending…"
                    : message.status === "streaming"
                      ? "Generating…"
                      : message.status === "error"
                        ? "Failed to send"
                        : formatTime(message.createdAt)}
                </span>
              </div>
            );
          })}

          {/* ── Loading skeleton while the agent generates ──────────────── */}
          {isGenerating && (
            <div
              role="status"
              aria-label="Agent is thinking"
              data-testid="chat-loading-skeleton"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                maxWidth: "85%",
              }}
            >
              <style>{`
                @keyframes delego-chat-skeleton {
                  0% { opacity: 0.45; }
                  50% { opacity: 1; }
                  100% { opacity: 0.45; }
                }
              `}</style>
              {["60%", "85%", "45%"].map((width, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  style={{
                    display: "block",
                    width,
                    height: "0.75rem",
                    borderRadius: "9999px",
                    background: "#e5e7eb",
                    animation: "delego-chat-skeleton 1.2s ease-in-out infinite",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Composer ───────────────────────────────────────────────────── */}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSend();
          }}
          style={{
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-end",
            padding: "0.75rem 1.25rem",
            borderTop: "1px solid #e5e7eb",
          }}
        >
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder="Type a message…"
            aria-label="Message your agent"
            data-testid="chat-input"
            style={{
              flex: 1,
              resize: "none",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              fontSize: "0.875rem",
              fontFamily: "inherit",
              outline: "none",
            }}
          />
          <Button type="submit" variant="primary" disabled={draft.trim().length === 0}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
