"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useCart } from "../../hooks/useCart";
import type { CartItem } from "../../lib/cart";
import { useChatDrawer } from "./ChatDrawerProvider";

export interface CopilotBubblePrompt {
  type: "reputation_check" | "better_deal_found" | "escrow_safety";
  message: string;
  actionLabel: string;
  targetProductId: string;
}

interface CopilotBubbleContextValue {
  prompt: CopilotBubblePrompt | null;
  openPrompt: () => void;
  dismissPrompt: () => void;
}

const CopilotBubbleContext = createContext<CopilotBubbleContextValue | null>(null);
const SESSION_MUTE_KEY = "delego_copilot_alerts_muted";
const USDC_HIGH_VALUE_THRESHOLD_STROOPS = 100n * 10_000_000n;

function readSessionMute(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_MUTE_KEY) === "true";
  } catch {
    return false;
  }
}

function isHighValueUsdcItem(item: CartItem): boolean {
  if (item.assetCode !== "USDC") return false;
  try {
    return BigInt(item.priceStroops) > USDC_HIGH_VALUE_THRESHOLD_STROOPS;
  } catch {
    return false;
  }
}

export function useCopilotBubble(): CopilotBubbleContextValue {
  const context = useContext(CopilotBubbleContext);
  if (!context) {
    throw new Error("useCopilotBubble must be used within CopilotBubbleProvider");
  }
  return context;
}

export function CopilotBubbleProvider({ children }: { children: ReactNode }) {
  const { summary, hydrated } = useCart();
  const { openChat } = useChatDrawer();
  const t = useTranslations("copilot");
  const [prompt, setPrompt] = useState<CopilotBubblePrompt | null>(null);
  const [muted, setMuted] = useState(readSessionMute);
  const previousQuantities = useRef<Map<string, number> | null>(null);

  useEffect(() => {
    if (!hydrated) return;

    const currentQuantities = new Map(
      summary.items.map((item) => [item.productId, item.quantity])
    );
    const previous = previousQuantities.current;
    previousQuantities.current = currentQuantities;
    if (!previous || muted || prompt) return;

    const addedItem = summary.items.find(
      (item) =>
        item.quantity > (previous.get(item.productId) ?? 0) &&
        isHighValueUsdcItem(item)
    );
    if (!addedItem) return;

    setPrompt({
      type: "reputation_check",
      message: t("highValueInquiry", { productName: addedItem.title }),
      actionLabel: t("action"),
      targetProductId: addedItem.productId,
    });
  }, [hydrated, muted, prompt, summary.items, t]);

  const openPrompt = useCallback(() => {
    if (!prompt) return;
    openChat(prompt.message);
    setPrompt(null);
  }, [openChat, prompt]);

  const dismissPrompt = useCallback(() => {
    setPrompt(null);
    setMuted(true);
    try {
      window.sessionStorage.setItem(SESSION_MUTE_KEY, "true");
    } catch {
      // Keep the alert muted in memory if session storage is unavailable.
    }
  }, []);

  return (
    <CopilotBubbleContext.Provider value={{ prompt, openPrompt, dismissPrompt }}>
      {children}
    </CopilotBubbleContext.Provider>
  );
}