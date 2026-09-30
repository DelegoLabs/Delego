"use client";

import { useState, type ReactNode } from "react";
import { motion, type PanInfo } from "framer-motion";

export interface SwipeableCardProps {
  orderId: string;
  onTrack: () => void;
  onContact: () => void;
  /** Card content to render inside the swipeable surface. */
  children?: ReactNode;
}

/** Drag distance (px) past which the reveal snaps open instead of springing back. */
export const SWIPE_OPEN_THRESHOLD = 80;

/** Width (px) of the two revealed action buttons combined. */
export const ACTION_PANEL_WIDTH = 160;

/**
 * Pure decision logic for whether a drag ends "open" or "closed", pulled out
 * of the Framer Motion handler so it's unit-testable without simulating
 * real pointer gestures in jsdom (framer-motion's own PanSession isn't a
 * good fit for fireEvent-based touch/mouse simulation).
 */
export function resolveSwipeOpen(
  wasOpen: boolean,
  offsetX: number,
  threshold: number = SWIPE_OPEN_THRESHOLD
): boolean {
  if (wasOpen) {
    // Once open, a small rightward drag (less negative than -threshold/2)
    // closes it again; otherwise it stays open.
    return offsetX > -threshold / 2 ? false : true;
  }
  return offsetX < -threshold;
}

function triggerHapticFeedback() {
  if (typeof window !== "undefined" && "navigator" in window && "vibrate" in navigator) {
    try {
      navigator.vibrate(30);
    } catch {
      // Ignore if unsupported
    }
  }
}

/**
 * Wraps order card content with a left-swipe reveal for two quick actions
 * ('Track Shipment', 'Contact Merchant'), plus a haptic pulse when the
 * reveal state changes. A toggle button provides the same reveal/close
 * behavior for keyboard and screen-reader users, since a drag gesture alone
 * isn't reachable without a pointer.
 */
export function SwipeableCard({ orderId, onTrack, onContact, children }: SwipeableCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const setOpen = (next: boolean) => {
    setIsOpen((current) => {
      if (current !== next) triggerHapticFeedback();
      return next;
    });
  };

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    setOpen(resolveSwipeOpen(isOpen, info.offset.x));
  };

  const handleTrack = () => {
    setOpen(false);
    onTrack();
  };

  const handleContact = () => {
    setOpen(false);
    onContact();
  };

  return (
    <div
      style={{ position: "relative", overflow: "hidden", borderRadius: "12px" }}
      data-testid={`swipeable-card-${orderId}`}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          onClick={handleTrack}
          disabled={!isOpen}
          tabIndex={isOpen ? 0 : -1}
          aria-label="Track Shipment"
          data-testid={`swipeable-card-track-${orderId}`}
          style={{
            width: 80,
            border: "none",
            background: "var(--color-primary, #2563eb)",
            color: "#ffffff",
          }}
        >
          Track Shipment
        </button>
        <button
          type="button"
          onClick={handleContact}
          disabled={!isOpen}
          tabIndex={isOpen ? 0 : -1}
          aria-label="Contact Merchant"
          data-testid={`swipeable-card-contact-${orderId}`}
          style={{
            width: 80,
            border: "none",
            background: "var(--color-bg-secondary, #6b7280)",
            color: "#ffffff",
          }}
        >
          Contact Merchant
        </button>
      </div>

      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -ACTION_PANEL_WIDTH, right: 0 }}
        dragElastic={0.15}
        animate={{ x: isOpen ? -ACTION_PANEL_WIDTH : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
        onDragEnd={handleDragEnd}
        style={{
          position: "relative",
          background: "var(--color-bg-primary, #ffffff)",
          touchAction: "pan-y",
        }}
        data-testid={`swipeable-card-surface-${orderId}`}
      >
        {children ?? <div style={{ padding: "12px 16px" }}>Order {orderId}</div>}
        <button
          type="button"
          onClick={() => setOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label={isOpen ? "Hide order actions" : "Show order actions"}
          data-testid={`swipeable-card-toggle-${orderId}`}
          style={{
            position: "absolute",
            top: "50%",
            right: 8,
            transform: "translateY(-50%)",
            border: "none",
            background: "transparent",
          }}
        >
          {isOpen ? "\u2039" : "\u22EE"}
        </button>
      </motion.div>
    </div>
  );
}
