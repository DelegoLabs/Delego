import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { SwipeToConfirm } from "./SwipeToConfirm";

describe("SwipeToConfirm Component", () => {
  it("renders with label", () => {
    render(<SwipeToConfirm onConfirm={() => {}} label="Slide to Confirm Release" />);
    expect(screen.getByText("Slide to Confirm Release")).toBeInTheDocument();
  });

  it("triggers onConfirm when dragged/swiped to the end", () => {
    const onConfirm = vi.fn();
    render(<SwipeToConfirm onConfirm={onConfirm} label="Slide to Confirm" />);
    
    const handle = screen.getByTestId("swipe-handle");

    fireEvent.touchStart(handle, { touches: [{ clientX: 0 }] });
    fireEvent.touchMove(handle, { touches: [{ clientX: 300 }] });
    fireEvent.touchEnd(handle);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
