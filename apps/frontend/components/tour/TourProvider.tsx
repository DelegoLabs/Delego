"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { TOUR_STEPS, type TourStep } from "../../lib/tourSteps";

// ---------------------------------------------------------------------------
// Persistence keys
// ---------------------------------------------------------------------------

const TOUR_DISMISSED_KEY = "delego_tour_dismissed";
const TOUR_COMPLETED_KEY = "delego_tour_completed";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // localStorage may be unavailable in private mode — just skip.
  }
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface TourContextValue {
  /** Is the tour currently visible? */
  active: boolean;
  /** The currently displayed step (null when tour is inactive) */
  currentStep: TourStep | null;
  /** Index of the current step within TOUR_STEPS */
  currentIndex: number;
  /** Total number of steps */
  totalSteps: number;
  /** Advance to the next step (or finish the tour) */
  next: () => void;
  /** Exit the tour and record dismissal */
  dismiss: () => void;
  /** Manually start or re-launch the tour */
  start: () => void;
  /** Whether the user has previously completed or dismissed the tour */
  hasSeen: boolean;
}

const TourContext = createContext<TourContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Tour engine (#637).
 *
 * - Auto-starts for first-session users (neither completed nor dismissed).
 * - Survives route changes mid-flow: the spotlight follows the anchor via
 *   `ResizeObserver`/`IntersectionObserver`; if an anchor is missing the step
 *   is skipped gracefully.
 * - Completion and dismissal are persisted to localStorage so the tour never
 *   nags on replay.
 * - Re-launchable via `tourContext.start()` (wired to the Help menu).
 * - Keyboard: Esc dismisses, focus managed via the overlay itself.
 */
export function TourProvider({ children }: { children: ReactNode }) {
  const hasSeen = readFlag(TOUR_DISMISSED_KEY) || readFlag(TOUR_COMPLETED_KEY);

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Auto-start for first-session users once the DOM has settled.
  useEffect(() => {
    if (hasSeen) return;
    const timer = setTimeout(() => setActive(true), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = useCallback(() => {
    writeFlag(TOUR_DISMISSED_KEY, true);
    setActive(false);
  }, []);

  const complete = useCallback(() => {
    writeFlag(TOUR_COMPLETED_KEY, true);
    setActive(false);
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setActive(true);
  }, []);

  const next = useCallback(() => {
    setStepIndex((prev) => {
      const nextIndex = prev + 1;
      if (nextIndex >= TOUR_STEPS.length) {
        complete();
        return prev;
      }
      return nextIndex;
    });
  }, [complete]);

  const currentStep = active ? (TOUR_STEPS[stepIndex] ?? null) : null;

  const value: TourContextValue = {
    active,
    currentStep,
    currentIndex: stepIndex,
    totalSteps: TOUR_STEPS.length,
    next,
    dismiss,
    start,
    hasSeen,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && currentStep && (
        <TourOverlay
          step={currentStep}
          stepIndex={stepIndex}
          totalSteps={TOUR_STEPS.length}
          onNext={next}
          onDismiss={dismiss}
        />
      )}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

interface TourOverlayProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onDismiss: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const POPOVER_WIDTH = 280;
const POPOVER_PADDING = 12;

function computePopoverPosition(
  anchor: Rect,
  placement: TourStep["placement"] = "auto"
): {
  top: number;
  left: number;
  arrowSide: "top" | "bottom" | "left" | "right";
} {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceTop = anchor.top;
  const spaceBottom = vh - (anchor.top + anchor.height);
  const _spaceLeft = anchor.left;
  const spaceRight = vw - (anchor.left + anchor.width);

  let side: "top" | "bottom" | "left" | "right" = "bottom";

  if (placement === "auto") {
    if (spaceBottom >= 160) side = "bottom";
    else if (spaceTop >= 160) side = "top";
    else if (spaceRight >= POPOVER_WIDTH + 24) side = "right";
    else side = "left";
  } else if (placement !== "auto") {
    side = placement;
  }

  let top = 0;
  let left = 0;

  if (side === "bottom") {
    top = anchor.top + anchor.height + POPOVER_PADDING + window.scrollY;
    left = Math.max(
      8,
      Math.min(
        vw - POPOVER_WIDTH - 8,
        anchor.left + anchor.width / 2 - POPOVER_WIDTH / 2
      )
    );
  } else if (side === "top") {
    top = anchor.top - POPOVER_PADDING + window.scrollY; // adjusted below with translateY(-100%)
    left = Math.max(
      8,
      Math.min(
        vw - POPOVER_WIDTH - 8,
        anchor.left + anchor.width / 2 - POPOVER_WIDTH / 2
      )
    );
  } else if (side === "right") {
    top = anchor.top + anchor.height / 2 + window.scrollY;
    left = anchor.left + anchor.width + POPOVER_PADDING;
  } else {
    top = anchor.top + anchor.height / 2 + window.scrollY;
    left = anchor.left - POPOVER_WIDTH - POPOVER_PADDING;
  }

  return {
    top,
    left: Math.max(8, Math.min(vw - POPOVER_WIDTH - 8, left)),
    arrowSide:
      side === "bottom"
        ? "top"
        : side === "top"
          ? "bottom"
          : side === "right"
            ? "left"
            : "right",
  };
}

/**
 * The spotlight overlay renders:
 *  - A semi-transparent full-screen backdrop with a "hole" cut out around the anchor.
 *  - A popover with the step content anchored near the element.
 *
 * Missing anchor → skips gracefully (via the skipIfMissing effect).
 * Esc → dismiss. Tab stays within the popover (leverages existing useFocusTrap pattern).
 */
function TourOverlay({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onDismiss,
}: TourOverlayProps) {
  const [anchorRect, setAnchorRect] = useState<Rect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const isLastStep = stepIndex === totalSteps - 1;

  // Resolve the anchor element and track its position
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(step.anchorSelector);

    if (!el) {
      // Skip gracefully if the anchor element isn't in the DOM
      const timer = setTimeout(() => onNext(), 0);
      return () => clearTimeout(timer);
    }

    // Scroll into view so the spotlight is always visible
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });

    function updateRect() {
      const r = el!.getBoundingClientRect();
      setAnchorRect({
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    }

    updateRect();

    const resizeObs = new ResizeObserver(updateRect);
    resizeObs.observe(el);
    window.addEventListener("scroll", updateRect, { passive: true });
    window.addEventListener("resize", updateRect);

    return () => {
      resizeObs.disconnect();
      window.removeEventListener("scroll", updateRect);
      window.removeEventListener("resize", updateRect);
    };
  }, [step.anchorSelector, onNext]);

  // Move focus into the popover when it mounts
  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [step.id]);

  // Esc exits the tour
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  // Tab trap within the popover
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !popover) return;
      const focusable = Array.from(
        popover.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (current === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleTab);
    return () => document.removeEventListener("keydown", handleTab);
  }, []);

  const HOLE_PADDING = 8;
  const hasRect = anchorRect !== null;
  const holeTop = hasRect ? anchorRect.top - HOLE_PADDING : 0;
  const holeLeft = hasRect ? anchorRect.left - HOLE_PADDING : 0;
  const holeWidth = hasRect ? anchorRect.width + HOLE_PADDING * 2 : 0;
  const holeHeight = hasRect ? anchorRect.height + HOLE_PADDING * 2 : 0;

  const pos = hasRect
    ? computePopoverPosition(
        {
          top: anchorRect.top,
          left: anchorRect.left,
          width: anchorRect.width,
          height: anchorRect.height,
        },
        step.placement
      )
    : null;

  return (
    <>
      {/* Backdrop with spotlight cutout via clip-path */}
      <div
        aria-hidden="true"
        onClick={onDismiss}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "rgba(0,0,0,0.55)",
          clipPath: hasRect
            ? `polygon(
                0% 0%, 100% 0%, 100% 100%, 0% 100%,
                0% ${holeTop}px,
                ${holeLeft}px ${holeTop}px,
                ${holeLeft}px ${holeTop + holeHeight}px,
                ${holeLeft + holeWidth}px ${holeTop + holeHeight}px,
                ${holeLeft + holeWidth}px ${holeTop}px,
                0% ${holeTop}px
              )`
            : undefined,
        }}
      />

      {/* Popover */}
      {pos && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Tour step ${stepIndex + 1} of ${totalSteps}: ${step.title}`}
          style={{
            position: "absolute",
            top: pos.top,
            left: pos.left,
            zIndex: 9999,
            width: POPOVER_WIDTH,
            padding: "1rem",
            borderRadius: "0.75rem",
            background: "var(--color-bg-card, #fff)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
            color: "var(--color-text-primary, #111827)",
            transform:
              step.placement === "top" ? "translateY(-100%)" : undefined,
          }}
        >
          {/* Step counter */}
          <p
            style={{
              margin: "0 0 0.375rem",
              fontSize: "0.6875rem",
              fontWeight: 600,
              color: "var(--color-text-tertiary, #9ca3af)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {stepIndex + 1} / {totalSteps}
          </p>

          <p
            style={{
              margin: "0 0 0.25rem",
              fontWeight: 700,
              fontSize: "0.9375rem",
            }}
          >
            {step.title}
          </p>
          <p
            style={{
              margin: "0 0 0.875rem",
              fontSize: "0.875rem",
              lineHeight: 1.55,
              color: "var(--color-text-secondary, #4b5563)",
            }}
          >
            {step.body}
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
            }}
          >
            <button
              type="button"
              onClick={onDismiss}
              style={{
                background: "none",
                border: "none",
                padding: "0.375rem 0",
                fontSize: "0.8125rem",
                color: "var(--color-text-tertiary, #9ca3af)",
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Skip tour
            </button>

            <button
              ref={nextButtonRef}
              type="button"
              onClick={onNext}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                background: "var(--color-accent, #6366f1)",
                color: "#fff",
                border: "none",
                fontWeight: 600,
                fontSize: "0.875rem",
                cursor: "pointer",
              }}
            >
              {isLastStep ? "Done" : "Next"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
