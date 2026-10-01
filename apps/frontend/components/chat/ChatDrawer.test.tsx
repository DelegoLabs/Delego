import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatDrawer, type ChatDrawerProps, type ChatMessage } from "./ChatDrawer";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "message-1",
    role: "assistant",
    content: "Hello, how can I help you shop today?",
    createdAt: new Date("2026-09-30T12:00:00Z").toISOString(),
    status: "complete",
    ...overrides,
  };
}

function renderDrawer(props: Partial<ChatDrawerProps> = {}) {
  const onClose = vi.fn();
  const onSendMessage = vi.fn();
  const onOpenProposal = vi.fn();
  const result = render(
    <ChatDrawer
      isOpen
      onClose={onClose}
      agentId="agent-42"
      onSendMessage={onSendMessage}
      onOpenProposal={onOpenProposal}
      {...props}
    />
  );
  return { ...result, onClose, onSendMessage, onOpenProposal };
}

// ── Visibility ────────────────────────────────────────────────────────────────

describe("ChatDrawer — visibility", () => {
  it("renders nothing when closed", () => {
    render(<ChatDrawer isOpen={false} onClose={vi.fn()} agentId="agent-42" />);
    expect(screen.queryByTestId("chat-drawer")).not.toBeInTheDocument();
  });

  it("renders a modal dialog when open", () => {
    renderDrawer();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute(
      "aria-label",
      expect.stringContaining("agent-42")
    );
    expect(screen.getByTestId("chat-drawer-agent-id")).toHaveTextContent(
      "agent-42"
    );
  });

  it("closes when the close button is clicked", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByTestId("chat-drawer-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const { onClose } = renderDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is clicked but not the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDrawer();
    await user.click(screen.getByTestId("chat-drawer"));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("chat-drawer-overlay"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Message history ───────────────────────────────────────────────────────────

describe("ChatDrawer — message history", () => {
  it("shows an empty state when there are no messages", () => {
    renderDrawer();
    expect(screen.getByTestId("chat-empty-state")).toBeInTheDocument();
  });

  it("renders each message with its role exposed for styling", () => {
    renderDrawer({
      messages: [
        makeMessage({ id: "u1", role: "user", content: "Find laptops" }),
        makeMessage({ id: "a1", role: "assistant", content: "Sure thing" }),
        makeMessage({ id: "s1", role: "system", content: "Session restored" }),
      ],
    });

    const messages = screen.getAllByTestId("chat-message");
    expect(messages).toHaveLength(3);
    expect(messages[0]).toHaveAttribute("data-role", "user");
    expect(messages[1]).toHaveAttribute("data-role", "assistant");
    expect(messages[2]).toHaveAttribute("data-role", "system");
    expect(screen.getByText("Find laptops")).toBeInTheDocument();
    expect(screen.getByText("Sure thing")).toBeInTheDocument();
  });

  it("flags streaming and error message statuses", () => {
    renderDrawer({
      messages: [
        makeMessage({ id: "a1", status: "streaming", content: "Think" }),
        makeMessage({ id: "a2", status: "error", content: "..." }),
      ],
    });

    const statuses = screen.getAllByTestId("chat-message-status");
    expect(statuses[0]).toHaveTextContent("Generating…");
    expect(statuses[1]).toHaveTextContent("Failed to send");
  });

  it("auto-scrolls to the newest content when messages change", () => {
    const first = makeMessage({ id: "a1" });
    const { rerender } = render(
      <ChatDrawer isOpen onClose={vi.fn()} agentId="agent-42" messages={[first]} />
    );

    const list = screen.getByTestId("chat-message-list");
    Object.defineProperty(list, "scrollHeight", {
      configurable: true,
      value: 480,
    });
    expect(list.scrollTop).toBe(0);

    rerender(
      <ChatDrawer
        isOpen
        onClose={vi.fn()}
        agentId="agent-42"
        messages={[first, makeMessage({ id: "a2", role: "user", content: "next" })]}
      />
    );

    expect(list.scrollTop).toBe(480);
  });
});

// ── Loading skeleton ──────────────────────────────────────────────────────────

describe("ChatDrawer — loading skeleton", () => {
  it("shows the skeleton while the agent is generating", () => {
    renderDrawer({ isGenerating: true });
    expect(screen.getByTestId("chat-loading-skeleton")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-empty-state")).not.toBeInTheDocument();
  });

  it("hides the skeleton when generation finishes", () => {
    renderDrawer({ isGenerating: false, messages: [makeMessage()] });
    expect(
      screen.queryByTestId("chat-loading-skeleton")
    ).not.toBeInTheDocument();
  });
});

// ── Tool-call indicators ──────────────────────────────────────────────────────

describe("ChatDrawer — tool calls", () => {
  const toolMessage = makeMessage({
    id: "a1",
    role: "assistant",
    content: "Looking for keyboards",
    toolCalls: [
      {
        toolName: "search_catalog",
        arguments: { query: "mechanical keyboards" },
        result: { count: 3 },
      },
    ],
  });

  it("collapses tool-call details by default", () => {
    renderDrawer({ messages: [toolMessage] });
    expect(screen.getByTestId("tool-call")).toHaveAttribute(
      "data-tool",
      "search_catalog"
    );
    expect(
      screen.queryByTestId("tool-call-details")
    ).not.toBeInTheDocument();
  });

  it("expands to reveal arguments and result, then collapses again", async () => {
    const user = userEvent.setup();
    renderDrawer({ messages: [toolMessage] });

    const toggle = screen.getByTestId("tool-call-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("tool-call-arguments")).toHaveTextContent(
      "mechanical keyboards"
    );
    expect(screen.getByTestId("tool-call-result")).toHaveTextContent("3");

    await user.click(toggle);
    expect(
      screen.queryByTestId("tool-call-details")
    ).not.toBeInTheDocument();
  });
});

// ── Proposal references ───────────────────────────────────────────────────────

describe("ChatDrawer — proposal references", () => {
  it("calls onOpenProposal with the referenced id", async () => {
    const user = userEvent.setup();
    const { onOpenProposal } = renderDrawer({
      messages: [makeMessage({ id: "a1", proposalId: "prop-99" })],
    });

    await user.click(screen.getByTestId("chat-proposal-link"));
    expect(onOpenProposal).toHaveBeenCalledWith("prop-99");
  });
});

// ── Composer ──────────────────────────────────────────────────────────────────

describe("ChatDrawer — composer", () => {
  it("sends the trimmed message and clears the input", async () => {
    const user = userEvent.setup();
    const { onSendMessage } = renderDrawer();

    const input = screen.getByLabelText("Message your agent");
    await user.type(input, "  find me a keyboard  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSendMessage).toHaveBeenCalledWith("find me a keyboard");
    expect(input).toHaveValue("");
  });

  it("sends on Enter (without Shift) and newlines on Shift+Enter", async () => {
    const user = userEvent.setup();
    const { onSendMessage } = renderDrawer();

    const input = screen.getByLabelText("Message your agent");
    await user.type(input, "hello{Shift>}{Enter}{/Shift}");
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(input).toHaveValue("hello\n");

    await user.type(input, "{Enter}");
    expect(onSendMessage).toHaveBeenCalledWith("hello");
  });

  it("does not send an empty message", async () => {
    const user = userEvent.setup();
    const { onSendMessage } = renderDrawer();

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSendMessage).not.toHaveBeenCalled();
  });
});
