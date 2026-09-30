"use client";

import React, { useState, useRef, useCallback } from "react";
import { Button } from "@delegolabs/ui";

export interface SwipeToConfirmProps {
  onConfirm: () => void;
  isLoading?: boolean;
  label?: string;
}

export function SwipeToConfirm({
  onConfirm,
  isLoading = false,
  label = "Slide to Confirm",
}: SwipeToConfirmProps) {
  const [dragX, setDragX] = useState(0);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);

  const getMaxDrag = useCallback(() => {
    if (!trackRef.current) return 200;
    // Handle width is 48px, padding is 4px
    return Math.max(50, trackRef.current.clientWidth - 56);
  }, []);

  const triggerHapticFeedback = () => {
    if (typeof window !== "undefined" && "navigator" in window && "vibrate" in navigator) {
      try {
        navigator.vibrate(50);
      } catch {
        // Ignore if unsupported
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isLoading || isConfirmed) return;
    isDragging.current = true;
    startX.current = e.touches[0].clientX - dragX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || isLoading || isConfirmed) return;
    const currentX = e.touches[0].clientX;
    const maxDrag = getMaxDrag();
    let newX = currentX - startX.current;
    if (newX < 0) newX = 0;
    if (newX > maxDrag) newX = maxDrag;
    setDragX(newX);

    if (newX >= maxDrag && !isConfirmed) {
      isDragging.current = false;
      setIsConfirmed(true);
      setDragX(maxDrag);
      triggerHapticFeedback();
      onConfirm();
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    const maxDrag = getMaxDrag();
    if (dragX < maxDrag) {
      setDragX(0);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isLoading || isConfirmed) return;
    isDragging.current = true;
    startX.current = e.clientX - dragX;

    const handleMouseMove = (moveEvt: MouseEvent) => {
      if (!isDragging.current) return;
      const maxDrag = getMaxDrag();
      let newX = moveEvt.clientX - startX.current;
      if (newX < 0) newX = 0;
      if (newX > maxDrag) newX = maxDrag;
      setDragX(newX);

      if (newX >= maxDrag && !isConfirmed) {
        isDragging.current = false;
        setIsConfirmed(true);
        setDragX(maxDrag);
        triggerHapticFeedback();
        onConfirm();
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        const maxDrag = getMaxDrag();
        if (dragX < maxDrag) {
          setDragX(0);
        }
      }
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      ref={trackRef}
      style={{
        position: "relative",
        width: "100%",
        height: "56px",
        backgroundColor: "var(--color-bg-secondary, #e5e7eb)",
        borderRadius: "28px",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        touchAction: "none",
        boxSizing: "border-box",
        padding: "4px",
      }}
      data-testid="swipe-track"
    >
      <span
        style={{
          color: "var(--color-text-muted, #6b7280)",
          fontSize: "0.875rem",
          fontWeight: 600,
          pointerEvents: "none",
        }}
      >
        {isLoading ? "Processing..." : isConfirmed ? "Confirmed" : label}
      </span>

      <div
        style={{
          position: "absolute",
          left: "4px",
          top: "4px",
          width: "48px",
          height: "48px",
          borderRadius: "24px",
          backgroundColor: isConfirmed ? "#16a34a" : "var(--color-primary, #2563eb)",
          transform: `translateX(${dragX}px)`,
          transition: isDragging.current ? "none" : "transform 0.2s ease-out",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "grab",
          color: "#ffffff",
          fontWeight: "bold",
          boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        data-testid="swipe-handle"
      >
        ➔
      </div>
    </div>
  );
}
