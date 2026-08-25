import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Tooltip } from "./Tooltip.js";

describe("Tooltip", () => {
  afterEach(cleanup);

  it("does not show the tooltip content by default", () => {
    render(
      <Tooltip content="Not eligible yet">
        <button disabled>Request refund</button>
      </Tooltip>
    );
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows the tooltip content on hover", () => {
    render(
      <Tooltip content="Not eligible yet">
        <button disabled>Request refund</button>
      </Tooltip>
    );
    const wrapper = screen.getByText("Request refund").closest("span")!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole("tooltip").textContent).toBe("Not eligible yet");
  });

  it("shows the tooltip content on focus, so it is reachable when the wrapped control is disabled", () => {
    render(
      <Tooltip content="Not eligible yet">
        <button disabled>Request refund</button>
      </Tooltip>
    );
    const wrapper = screen.getByText("Request refund").closest("span")!;
    fireEvent.focus(wrapper);
    expect(screen.getByRole("tooltip").textContent).toBe("Not eligible yet");
  });

  it("hides the tooltip content on blur", () => {
    render(
      <Tooltip content="Not eligible yet">
        <button disabled>Request refund</button>
      </Tooltip>
    );
    const wrapper = screen.getByText("Request refund").closest("span")!;
    fireEvent.focus(wrapper);
    fireEvent.blur(wrapper);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
