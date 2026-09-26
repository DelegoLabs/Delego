import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AgentTraceViewer, type AgentExecutionStep } from "./AgentTraceViewer.js";

const steps: AgentExecutionStep[] = [
  {
    stepIndex: 0,
    title: "Parse request",
    status: "completed",
    details: "Parsed 2 line items",
    durationMs: 480,
    timestamp: "2026-01-01T00:00:00.000Z",
  },
  {
    stepIndex: 1,
    title: "Check policy",
    status: "running",
    details: "Evaluating delegation limits",
    durationMs: 1500,
    timestamp: "2026-01-01T00:00:01.000Z",
  },
  {
    stepIndex: 2,
    title: "Authorise payment",
    status: "pending",
    timestamp: "2026-01-01T00:00:02.000Z",
  },
];

describe("AgentTraceViewer", () => {
  it("renders one list item per step with a status label", () => {
    render(<AgentTraceViewer steps={steps} isLive={false} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("1. Parse request")).toBeDefined();
    expect(screen.getByText("2. Check policy")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
    expect(screen.getByText("Running")).toBeDefined();
    expect(screen.getByText("Pending")).toBeDefined();
  });

  it("expands the running step by default and shows its details", () => {
    render(<AgentTraceViewer steps={steps} isLive={false} />);
    const running = screen.getByRole("button", { name: /Check policy/ });
    expect(running).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Evaluating delegation limits")).toBeDefined();
  });

  it("falls back to the failed step when nothing is running", () => {
    const failed: AgentExecutionStep[] = [
      {
        stepIndex: 0,
        title: "Approve payment",
        status: "failed",
        details: "Delegation budget exceeded",
        timestamp: "2026-01-01T00:00:00.000Z",
      },
      {
        stepIndex: 1,
        title: "Notify merchant",
        status: "pending",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
    ];
    render(<AgentTraceViewer steps={failed} isLive={false} />);
    expect(screen.getByRole("button", { name: /Approve payment/ })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByText("Delegation budget exceeded")).toBeDefined();
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("toggles a step open and closed on click", async () => {
    const user = userEvent.setup();
    render(<AgentTraceViewer steps={steps} isLive={false} />);

    const completed = screen.getByRole("button", { name: /Parse request/ });
    expect(completed).toHaveAttribute("aria-expanded", "false");

    await user.click(completed);
    expect(completed).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Parsed 2 line items")).toBeDefined();

    await user.click(completed);
    expect(completed).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Parsed 2 line items")).toBeNull();
  });

  it("formats sub-second durations in ms and longer ones in seconds", () => {
    render(<AgentTraceViewer steps={steps} isLive={false} />);
    expect(screen.getByText("480ms")).toBeDefined();
    expect(screen.getByText("1.5s")).toBeDefined();
  });

  it("renders a whole second without a fractional part", () => {
    const exact: AgentExecutionStep[] = [
      {
        stepIndex: 0,
        title: "Upload receipt",
        status: "completed",
        durationMs: 2000,
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ];
    render(<AgentTraceViewer steps={exact} isLive />);
    expect(screen.getByText("2s")).toBeDefined();
  });

  it("renders an empty trace without crashing", () => {
    render(<AgentTraceViewer steps={[]} isLive />);
    expect(screen.getByRole("list")).toBeDefined();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
