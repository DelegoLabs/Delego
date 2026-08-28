import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { HoverPrefetchLink } from "./HoverPrefetchLink";

const prefetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch }),
}));

describe("HoverPrefetchLink", () => {
  beforeEach(() => {
    prefetch.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders as a link to the given href", () => {
    render(<HoverPrefetchLink href="/orders/1">View</HoverPrefetchLink>);
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute(
      "href",
      "/orders/1"
    );
  });

  it("does not prefetch on render", () => {
    render(<HoverPrefetchLink href="/orders/1">View</HoverPrefetchLink>);
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("prefetches after a hover delay", () => {
    render(<HoverPrefetchLink href="/orders/1">View</HoverPrefetchLink>);
    fireEvent.mouseEnter(screen.getByRole("link"));
    expect(prefetch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(prefetch).toHaveBeenCalledWith("/orders/1");
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it("cancels the pending prefetch if the pointer leaves before the delay elapses", () => {
    render(<HoverPrefetchLink href="/orders/1">View</HoverPrefetchLink>);
    const link = screen.getByRole("link");
    fireEvent.mouseEnter(link);
    fireEvent.mouseLeave(link);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("does not schedule a second prefetch for repeated mouseEnter events before the delay elapses", () => {
    render(<HoverPrefetchLink href="/orders/1">View</HoverPrefetchLink>);
    const link = screen.getByRole("link");
    fireEvent.mouseEnter(link);
    fireEvent.mouseEnter(link);
    fireEvent.mouseEnter(link);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(prefetch).toHaveBeenCalledTimes(1);
  });

  it("prefetches immediately on focus, without waiting for the hover delay", () => {
    render(<HoverPrefetchLink href="/orders/1">View</HoverPrefetchLink>);
    fireEvent.focus(screen.getByRole("link"));
    expect(prefetch).toHaveBeenCalledWith("/orders/1");
  });

  it("forwards onMouseEnter, onMouseLeave, and onFocus to the caller", () => {
    const onMouseEnter = vi.fn();
    const onMouseLeave = vi.fn();
    const onFocus = vi.fn();
    render(
      <HoverPrefetchLink
        href="/orders/1"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
      >
        View
      </HoverPrefetchLink>
    );
    const link = screen.getByRole("link");
    fireEvent.mouseEnter(link);
    fireEvent.mouseLeave(link);
    fireEvent.focus(link);

    expect(onMouseEnter).toHaveBeenCalledTimes(1);
    expect(onMouseLeave).toHaveBeenCalledTimes(1);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it("forwards other anchor props such as className and title", () => {
    render(
      <HoverPrefetchLink href="/orders/1" className="order-id" title="View receipt">
        ORD-1
      </HoverPrefetchLink>
    );
    const link = screen.getByRole("link");
    expect(link).toHaveClass("order-id");
    expect(link).toHaveAttribute("title", "View receipt");
  });
});
