import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { AgentTraceViewer, type AgentThoughtStep } from "./AgentTraceViewer.js";

const mockSteps: AgentThoughtStep[] = [
  {
    stepId: "step-1",
    description: "Searching catalog...",
    status: "completed",
    timestamp: 1000,
    logs: ["Found 5 items", "Filtered to 2 items"],
  },
  {
    stepId: "step-2",
    description: "Validating budget...",
    status: "running",
    timestamp: 2000,
    logs: ["Checking available funds..."],
  },
];

describe("AgentTraceViewer", () => {
  it("has no accessibility violations", async () => {
    const { container } = render(<AgentTraceViewer steps={mockSteps} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders steps in order", () => {
    render(<AgentTraceViewer steps={mockSteps} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1. Searching catalog...");
    expect(items[1]).toHaveTextContent("2. Validating budget...");
  });

  it("shows appropriate status labels", () => {
    render(<AgentTraceViewer steps={mockSteps} />);
    expect(screen.getByText("Completed")).toBeDefined();
    expect(screen.getByText("Thinking...")).toBeDefined();
  });

  it("expands to show tool invocation logs", () => {
    render(<AgentTraceViewer steps={mockSteps} />);
    // The running step should be expanded by default based on the component logic
    expect(screen.getByText("Checking available funds...")).toBeDefined();

    // The completed step's logs should not be visible initially
    expect(screen.queryByText("Found 5 items")).toBeNull();

    // Click to expand the first step
    const firstStepButton = screen.getByText("1. Searching catalog...");
    fireEvent.click(firstStepButton);

    // Now the logs should be visible
    expect(screen.getByText("Found 5 items")).toBeDefined();
    expect(screen.getByText("Filtered to 2 items")).toBeDefined();
  });

  it("collapses an expanded step on click", () => {
    render(<AgentTraceViewer steps={mockSteps} />);
    
    // The running step should be expanded by default
    expect(screen.getByText("Checking available funds...")).toBeDefined();

    // Click to collapse
    const secondStepButton = screen.getByText("2. Validating budget...");
    fireEvent.click(secondStepButton);

    // Now it should be hidden
    expect(screen.queryByText("Checking available funds...")).toBeNull();
  });
});
