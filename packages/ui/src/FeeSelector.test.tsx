import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { FeeSelector, type FeeTierOption } from "./FeeSelector.js";

const options: FeeTierOption[] = [
  { tier: "standard", label: "Standard (p50)", feeStroops: "100", estimatedSeconds: 15 },
  { tier: "fast", label: "Fast (p95)", feeStroops: "240", estimatedSeconds: 5 },
  { tier: "urgent", label: "Urgent (p99)", feeStroops: "800", estimatedSeconds: 5 },
];

describe("FeeSelector", () => {
  it("has no accessibility violations", async () => {
    const { container } = render(
      <FeeSelector selectedTier="fast" onChange={() => {}} options={options} />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("defaults the recommended tier to Fast (p95) when that tier is selected", () => {
    render(<FeeSelector selectedTier="fast" onChange={() => {}} options={options} />);
    const fast = screen.getByRole("radio", { name: /Fast \(p95\)/ });
    expect(fast).toBeChecked();
    expect(screen.getByText("Recommended")).toBeDefined();
    expect(screen.getByText("240 stroops · ~5s")).toBeDefined();
  });

  it("renders tier names when live quotes are not loaded yet", () => {
    render(<FeeSelector selectedTier="fast" onChange={() => {}} />);
    expect(screen.getByText("Standard (p50)")).toBeDefined();
    expect(screen.getByText("Fast (p95)")).toBeDefined();
    expect(screen.getByText("Urgent (p99)")).toBeDefined();
  });

  it("reports the tier the user picks", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FeeSelector selectedTier="fast" onChange={onChange} options={options} />);
    await user.tab();
    expect(screen.getByRole("radio", { name: /Fast \(p95\)/ })).toHaveFocus();
    await user.click(screen.getByRole("radio", { name: /Urgent \(p99\)/ }));
    expect(onChange).toHaveBeenCalledWith("urgent");
  });

  it("checks the controlled selection", () => {
    render(<FeeSelector selectedTier="standard" onChange={() => {}} options={options} />);
    expect(screen.getByRole("radio", { name: /Standard \(p50\)/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Fast \(p95\)/ })).not.toBeChecked();
  });
});
