import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SwipeableCard,
  resolveSwipeOpen,
  SWIPE_OPEN_THRESHOLD,
} from "./SwipeableCard";

describe("resolveSwipeOpen (#809)", () => {
  it("opens once the drag passes the threshold", () => {
    expect(resolveSwipeOpen(false, -SWIPE_OPEN_THRESHOLD - 1)).toBe(true);
  });

  it("stays closed for a drag short of the threshold", () => {
    expect(resolveSwipeOpen(false, -SWIPE_OPEN_THRESHOLD + 1)).toBe(false);
  });

  it("closes on a small rightward drag once already open", () => {
    expect(resolveSwipeOpen(true, -10)).toBe(false);
  });

  it("stays open on a small leftward adjustment while already open", () => {
    expect(resolveSwipeOpen(true, -SWIPE_OPEN_THRESHOLD - 5)).toBe(true);
  });
});

describe("SwipeableCard (#809)", () => {
  const vibrateMock = vi.fn();

  beforeEach(() => {
    vibrateMock.mockClear();
    Object.defineProperty(window.navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders closed by default with actions present but inert", () => {
    render(
      <SwipeableCard orderId="order-1" onTrack={vi.fn()} onContact={vi.fn()} />
    );

    const track = screen.getByTestId("swipeable-card-track-order-1");
    const contact = screen.getByTestId("swipeable-card-contact-order-1");
    expect(track).toBeDisabled();
    expect(contact).toBeDisabled();
  });

  it("the toggle reveals the two actions and triggers haptic feedback", () => {
    render(
      <SwipeableCard orderId="order-2" onTrack={vi.fn()} onContact={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId("swipeable-card-toggle-order-2"));

    expect(screen.getByTestId("swipeable-card-track-order-2")).toBeEnabled();
    expect(screen.getByTestId("swipeable-card-contact-order-2")).toBeEnabled();
    expect(vibrateMock).toHaveBeenCalledWith(30);
  });

  it("clicking Track Shipment calls onTrack and closes the reveal", () => {
    const onTrack = vi.fn();
    render(
      <SwipeableCard orderId="order-3" onTrack={onTrack} onContact={vi.fn()} />
    );

    fireEvent.click(screen.getByTestId("swipeable-card-toggle-order-3"));
    fireEvent.click(screen.getByTestId("swipeable-card-track-order-3"));

    expect(onTrack).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("swipeable-card-track-order-3")).toBeDisabled();
  });

  it("clicking Contact Merchant calls onContact and closes the reveal", () => {
    const onContact = vi.fn();
    render(
      <SwipeableCard orderId="order-4" onTrack={vi.fn()} onContact={onContact} />
    );

    fireEvent.click(screen.getByTestId("swipeable-card-toggle-order-4"));
    fireEvent.click(screen.getByTestId("swipeable-card-contact-order-4"));

    expect(onContact).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("swipeable-card-contact-order-4")).toBeDisabled();
  });

  it("does not throw when navigator.vibrate is unavailable", () => {
    Object.defineProperty(window.navigator, "vibrate", {
      value: undefined,
      configurable: true,
    });

    render(
      <SwipeableCard orderId="order-5" onTrack={vi.fn()} onContact={vi.fn()} />
    );

    expect(() =>
      fireEvent.click(screen.getByTestId("swipeable-card-toggle-order-5"))
    ).not.toThrow();
  });

  it("renders custom children inside the swipeable surface", () => {
    render(
      <SwipeableCard orderId="order-6" onTrack={vi.fn()} onContact={vi.fn()}>
        <span data-testid="custom-content">Order #order-6 summary</span>
      </SwipeableCard>
    );

    expect(screen.getByTestId("custom-content")).toBeInTheDocument();
  });
});