"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChatDrawer, type ChatMessage } from "./ChatDrawer";

interface ChatDrawerContextValue {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
}

const ChatDrawerContext = createContext<ChatDrawerContextValue | null>(null);

/** Access the global Buyer Agent chat drawer (e.g. from a navbar trigger). */
export function useChatDrawer(): ChatDrawerContextValue {
  const context = useContext(ChatDrawerContext);
  if (!context) {
    throw new Error("useChatDrawer must be used within a ChatDrawerProvider");
  }
  return context;
}

const DEFAULT_AGENT_ID = "buyer-agent";

/** Time the scripted agent "thinks" before its reply settles. */
const GENERATION_DELAY_MS = 800;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Canned reply used until the drawer is wired to the agent streaming API. */
function scriptedReply(input: string): string {
  return `On it — searching verified merchants for “${input}”. I’ll check your spending limits and come back with a purchase proposal.`;
}

/**
 * Owns the Buyer Agent chat drawer's open state and transcript, registers the
 * global ⌘J / Ctrl+J shortcut, and mounts a single `ChatDrawer` instance for
 * the whole app. The transcript logic here is intentionally scripted until the
 * agent streaming endpoint lands; the `ChatDrawer` presenter is already
 * streaming-ready.
 */
export function ChatDrawerProvider({
  children,
  agentId = DEFAULT_AGENT_ID,
}: {
  children: ReactNode;
  agentId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const toggleChat = useCallback(() => setIsOpen((open) => !open), []);

  // Global ⌘J / Ctrl+J shortcut — mirrors the ⌘K binding for the command palette.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isModifierJ =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j";
      if (!isModifierJ) return;
      event.preventDefault();
      setIsOpen((open) => !open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Clear any in-flight scripted reply when the provider unmounts.
  useEffect(
    () => () => {
      if (replyTimer.current) clearTimeout(replyTimer.current);
    },
    []
  );

  const handleSend = useCallback((content: string) => {
    setMessages((previous) => [
      ...previous,
      {
        id: makeId("user"),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
        status: "complete",
      },
    ]);
    setIsGenerating(true);

    if (replyTimer.current) clearTimeout(replyTimer.current);
    replyTimer.current = setTimeout(() => {
      setMessages((previous) => [
        ...previous,
        {
          id: makeId("assistant"),
          role: "assistant",
          content: scriptedReply(content),
          createdAt: new Date().toISOString(),
          status: "complete",
        },
      ]);
      setIsGenerating(false);
    }, GENERATION_DELAY_MS);
  }, []);

  const value = useMemo(
    () => ({ isOpen, openChat, closeChat, toggleChat }),
    [isOpen, openChat, closeChat, toggleChat]
  );

  return (
    <ChatDrawerContext.Provider value={value}>
      {children}
      <ChatDrawer
        isOpen={isOpen}
        onClose={closeChat}
        agentId={agentId}
        messages={messages}
        isGenerating={isGenerating}
        onSendMessage={handleSend}
      />
    </ChatDrawerContext.Provider>
  );
}
