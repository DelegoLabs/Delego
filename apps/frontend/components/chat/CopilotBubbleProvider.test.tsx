import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentFab } from "../layout/AgentFab";
import { CartProvider, useCart } from "../../hooks/useCart";
import { CART_STORAGE_KEY, type CartItem } from "../../lib/cart";
import { ChatDrawerProvider } from "./ChatDrawerProvider";
import { CopilotBubbleProvider } from "./CopilotBubbleProvider";

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    const messages: Record<string, Record<string, string>> = {
      agent: {
        "roster.fabAria": "Open agent roster",
        "roster.fabUnread": "Unread proposals: {count}",
      },
      copilot: {
        highValueTitle: "Review this high-value item",
        highValueInquiry:
          "Can you verify the merchant reputation and escrow terms for {productName}? It is priced over 100 USDC.",
        action: "Ask the agent",
        dismiss: "Dismiss copilot alert",
      },
    };
    let message = messages[namespace]?.[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) {
      message = message.replace(`{${name}}`, value);
    }
    return message;
  },
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/store/test" }));

function makeItem(
  productId: string,
  priceStroops: string,
  assetCode: CartItem["assetCode"] = "USDC"
): CartItem {
  return {
    productId,
    merchantId: "merchant-1",
    merchantName: "Merchant",
    payoutAddress: "GABC",
    title: `Product ${productId}`,
    priceStroops,
    assetCode,
    quantity: 1,
    maxStock: 10,
  };
}

function CartActions() {
  const { addItem, hydrated } = useCart();
  return (
    <>
      <span data-testid="cart-hydrated">{String(hydrated)}</span>
      <button onClick={() => addItem(makeItem("below", "1000000000"))}>
        Add at threshold
      </button>
      <button onClick={() => addItem(makeItem("xlm", "2000000000", "XLM"))}>
        Add high XLM
      </button>
      <button onClick={() => addItem(makeItem("high-1", "1000000001"))}>
        Add high USDC
      </button>
      <button onClick={() => addItem(makeItem("high-2", "1200000000"))}>
        Add another high USDC
      </button>
      <button onClick={() => addItem(makeItem("legacy-high", "2000000000"))}>
        Re-add legacy high USDC
      </button>
    </>
  );
}

function renderCopilotApp() {
  return render(
    <ChatDrawerProvider>
      <CartProvider>
        <CopilotBubbleProvider>
          <CartActions />
          <AgentFab />
        </CopilotBubbleProvider>
      </CartProvider>
    </ChatDrawerProvider>
  );
}

describe("Copilot cart prompt", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("pulses for a newly added high-value USDC item and prefills chat", async () => {
    const user = userEvent.setup();
    renderCopilotApp();

    await user.click(screen.getByRole("button", { name: "Add high USDC" }));

    expect(await screen.findByTestId("copilot-bubble-prompt")).toHaveTextContent(
      "Product high-1"
    );
    expect(screen.getByTestId("agent-fab")).toHaveClass("agent-fab--pulsing");
    expect(screen.getByTestId("agent-fab")).toHaveAttribute("data-visible", "true");

    await user.click(screen.getByRole("button", { name: "Ask the agent" }));

    expect(screen.getByTestId("chat-drawer")).toBeInTheDocument();
    expect(screen.getByTestId("chat-input")).toHaveValue(
      "Can you verify the merchant reputation and escrow terms for Product high-1? It is priced over 100 USDC."
    );
  });

  it("does not prompt at 100 USDC or for another asset", async () => {
    const user = userEvent.setup();
    renderCopilotApp();

    await user.click(screen.getByRole("button", { name: "Add at threshold" }));
    await user.click(screen.getByRole("button", { name: "Add high XLM" }));

    expect(screen.queryByTestId("copilot-bubble-prompt")).not.toBeInTheDocument();
    expect(screen.getByTestId("agent-fab")).not.toHaveClass("agent-fab--pulsing");
  });

  it("does not prompt for a high-value cart item loaded during hydration", async () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([makeItem("saved-high", "2000000000")])
    );
    renderCopilotApp();

    await waitFor(() =>
      expect(screen.getByTestId("cart-hydrated")).toHaveTextContent("true")
    );
    expect(screen.queryByTestId("copilot-bubble-prompt")).not.toBeInTheDocument();
  });

  it("recognizes a high-value legacy item when it is re-added with its asset code", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify([makeItem("legacy-high", "2000000000")])
    );
    renderCopilotApp();

    await waitFor(() =>
      expect(screen.getByTestId("cart-hydrated")).toHaveTextContent("true")
    );
    await user.click(screen.getByRole("button", { name: "Re-add legacy high USDC" }));

    expect(await screen.findByTestId("copilot-bubble-prompt")).toHaveTextContent(
      "Product legacy-high"
    );
  });

  it("mutes later alerts after dismissal for the current session", async () => {
    const user = userEvent.setup();
    renderCopilotApp();

    await user.click(screen.getByRole("button", { name: "Add high USDC" }));
    expect(await screen.findByTestId("copilot-bubble-prompt")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss copilot alert" }));
    await user.click(screen.getByRole("button", { name: "Add another high USDC" }));

    expect(screen.queryByTestId("copilot-bubble-prompt")).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem("delego_copilot_alerts_muted")).toBe("true");
  });
});