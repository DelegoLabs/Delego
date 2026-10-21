import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentChatDrawer } from "./AgentChatDrawer";

describe("AgentChatDrawer", () => {
  it("renders nothing when closed", () => {
    render(
      <AgentChatDrawer open={false} onClose={vi.fn()} onSubmit={vi.fn()} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("submits the typed prompt and clears the input", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <AgentChatDrawer open onClose={vi.fn()} onSubmit={onSubmit} />
    );

    const input = screen.getByLabelText("Message");
    await user.type(input, "reorder my usual groceries");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(onSubmit).toHaveBeenCalledWith("reorder my usual groceries", undefined, expect.any(Object));
    expect(input).toHaveValue("");
  });

  it("does not submit an empty prompt", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<AgentChatDrawer open onClose={vi.fn()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("fills the input from a suggestion chip and focuses Send", async () => {
    const user = userEvent.setup();
    render(<AgentChatDrawer open onClose={vi.fn()} onSubmit={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /Keyboards under 50 USDC/ })
    );

    expect(screen.getByLabelText("Message")).toHaveValue(
      "Find mechanical keyboards under 50 USDC"
    );
    expect(screen.getByRole("button", { name: "Send" })).toHaveFocus();
  });

  it("hides the suggestion chips after the first message", async () => {
    const user = userEvent.setup();
    render(<AgentChatDrawer open onClose={vi.fn()} onSubmit={vi.fn()} />);

    const chips = screen.getByRole("list", { name: "Suggested prompts" });
    await user.type(screen.getByLabelText("Message"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(chips).toHaveAttribute("aria-hidden", "true");
    expect(chips).toHaveClass("prompt-chips--hidden");
  });

  it("closes on Escape and on backdrop click", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <AgentChatDrawer open onClose={onClose} onSubmit={vi.fn()} />
    );

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    const overlay = container.querySelector(".agent-chat-overlay");
    if (overlay) await user.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
