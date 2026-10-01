import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  TxAnimationPipeline,
  confettiParticles,
  isTerminalTxState,
  stepIndexFor,
} from "./TxAnimationPipeline";

describe("TxAnimationPipeline helpers", () => {
  it("maps states to step indexes", () => {
    expect(stepIndexFor("idle")).toBe(-1);
    expect(stepIndexFor("awaiting_signature")).toBe(0);
    expect(stepIndexFor("broadcasting")).toBe(1);
    expect(stepIndexFor("confirmed")).toBe(2);
    expect(stepIndexFor("failed")).toBe(1);
  });

  it("treats confirmed/failed as terminal", () => {
    expect(isTerminalTxState("confirmed")).toBe(true);
    expect(isTerminalTxState("failed")).toBe(true);
    expect(isTerminalTxState("broadcasting")).toBe(false);
  });

  it("builds a stable confetti particle list", () => {
    const a = confettiParticles(10, 3);
    const b = confettiParticles(10, 3);
    expect(a).toHaveLength(10);
    expect(a).toEqual(b);
  });
});

describe("TxAnimationPipeline", () => {
  it("renders nothing when idle", () => {
    render(<TxAnimationPipeline state="idle" />);
    expect(screen.queryByTestId("tx-animation-pipeline")).not.toBeInTheDocument();
  });

  it("walks signing -> submitting -> confirmed with celebration", async () => {
    const { rerender } = render(
      <TxAnimationPipeline state="awaiting_signature" label="Pay invoice #42" />
    );
    expect(screen.getByTestId("tx-animation-pipeline")).toHaveAttribute("data-state", "awaiting_signature");
    expect(screen.getByTestId("tx-pipeline-label")).toHaveTextContent("Pay invoice #42");
    expect(screen.getByTestId("tx-step-awaiting_signature")).toHaveAttribute("data-state", "active");

    rerender(<TxAnimationPipeline state="broadcasting" label="Pay invoice #42" />);
    expect(screen.getByTestId("tx-step-broadcasting")).toHaveAttribute("data-state", "active");

    rerender(<TxAnimationPipeline state="confirmed" label="Pay invoice #42" />);
    expect(screen.getByTestId("tx-pipeline-confirmed")).toBeInTheDocument();
    await act(async () => {
      expect(screen.getByTestId("tx-confetti")).toBeInTheDocument();
    });
  });

  it("surfaces a failure state and allows dismiss after success", async () => {
    const onDismiss = vi.fn();
    const { rerender } = render(<TxAnimationPipeline state="broadcasting" />);
    rerender(<TxAnimationPipeline state="failed" />);
    expect(screen.getByTestId("tx-pipeline-failed")).toBeInTheDocument();

    rerender(<TxAnimationPipeline state="confirmed" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByTestId("tx-pipeline-dismiss"));
    expect(onDismiss).toHaveBeenCalled();
  });
});
