"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export interface LightboxImageProps {
  images: string[];
  initialIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
type Point = { x: number; y: number };
type Transform = { x: number; y: number; scale: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
function normaliseIndex(index: number, length: number) {
  return length
    ? clamp(Number.isFinite(index) ? Math.trunc(index) : 0, 0, length - 1)
    : 0;
}
function distance([a, b]: Point[]) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
function midpoint([a, b]: Point[]): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Controlled product-gallery dialog supporting keyboard, pointer, and pinch gestures. */
export function ImageLightboxModal({
  images,
  initialIndex,
  isOpen,
  onClose,
}: LightboxImageProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const panStart = useRef<Point | null>(null);
  const transformStart = useRef<Transform>({ x: 0, y: 0, scale: 1 });
  const pinchStart = useRef<{
    distance: number;
    midpoint: Point;
    transform: Transform;
  } | null>(null);
  const dragged = useRef(false);
  const [index, setIndex] = useState(() =>
    normaliseIndex(initialIndex, images.length)
  );
  const [transform, setTransform] = useState<Transform>({
    x: 0,
    y: 0,
    scale: 1,
  });
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  const reset = () => {
    pointers.current.clear();
    panStart.current = null;
    pinchStart.current = null;
    dragged.current = false;
    setTransform({ x: 0, y: 0, scale: 1 });
  };
  const moveTo = (next: number) => {
    setIndex(normaliseIndex(next, images.length));
    setImageState("loading");
    reset();
  };

  useFocusTrap({
    containerRef: dialogRef,
    isActive: isOpen,
    initialFocusRef: closeButtonRef,
    onEscape: onClose,
  });

  useEffect(() => {
    if (!isOpen) {
      reset();
      return;
    }
    setIndex(normaliseIndex(initialIndex, images.length));
    setImageState("loading");
    reset();
    // Reset only when this controlled dialog opens or receives a new image set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialIndex, images.length]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.matches("input, textarea, select, [contenteditable='true']")
      )
        return;
      if (event.key === "ArrowLeft" && index > 0) {
        event.preventDefault();
        moveTo(index - 1);
      }
      if (event.key === "ArrowRight" && index < images.length - 1) {
        event.preventDefault();
        moveTo(index + 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [images.length, index, isOpen]);

  if (!isOpen) return null;
  const currentImage = images[index];
  const clampTransform = (next: Transform): Transform => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const maxX = bounds ? (bounds.width * (scale - 1)) / 2 : 0;
    const maxY = bounds ? (bounds.height * (scale - 1)) / 2 : 0;
    return {
      scale,
      x: clamp(next.x, -maxX, maxX),
      y: clamp(next.y, -maxY, maxY),
    };
  };
  const startPinch = () => {
    const points = Array.from(pointers.current.values());
    if (points.length === 2) {
      pinchStart.current = {
        distance: distance(points),
        midpoint: midpoint(points),
        transform,
      };
      panStart.current = null;
    }
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size === 2) {
      startPinch();
      return;
    }
    if (transform.scale > MIN_SCALE) {
      panStart.current = { x: event.clientX, y: event.clientY };
      transformStart.current = transform;
      dragged.current = false;
    }
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = Array.from(pointers.current.values());
    if (points.length === 2 && pinchStart.current) {
      const start = pinchStart.current;
      const center = midpoint(points);
      setTransform(
        clampTransform({
          scale:
            (start.transform.scale * distance(points)) /
            Math.max(start.distance, 1),
          x: start.transform.x + center.x - start.midpoint.x,
          y: start.transform.y + center.y - start.midpoint.y,
        })
      );
      dragged.current = true;
    } else if (
      points.length === 1 &&
      panStart.current &&
      transformStart.current.scale > MIN_SCALE
    ) {
      const dx = event.clientX - panStart.current.x;
      const dy = event.clientY - panStart.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged.current = true;
      setTransform(
        clampTransform({
          ...transformStart.current,
          x: transformStart.current.x + dx,
          y: transformStart.current.y + dy,
        })
      );
    }
  };
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 1 && transform.scale > MIN_SCALE) {
      panStart.current = Array.from(pointers.current.values())[0];
      transformStart.current = transform;
    }
    if (pointers.current.size === 0) panStart.current = null;
  };

  return (
    <div
      className="product-lightbox-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="product-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="Product image viewer"
        tabIndex={-1}
      >
        <header>
          <span aria-live="polite">
            {currentImage ? `${index + 1} / ${images.length}` : "No images"}
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close image viewer"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div
          ref={viewportRef}
          className="viewport"
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            setTransform((value) =>
              value.scale > MIN_SCALE
                ? { x: 0, y: 0, scale: 1 }
                : { x: 0, y: 0, scale: 2 }
            );
          }}
        >
          {!currentImage ? (
            <p role="status">No product images are available.</p>
          ) : imageState === "error" ? (
            <p role="alert">This image could not be loaded.</p>
          ) : (
            <>
              {imageState === "loading" && (
                <p className="status" role="status">
                  Loading image…
                </p>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentImage}
                alt={`Product image ${index + 1}`}
                draggable={false}
                onLoad={() => setImageState("ready")}
                onError={() => setImageState("error")}
                style={{
                  transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                }}
              />
            </>
          )}
        </div>
        <footer>
          <button
            type="button"
            aria-label="Previous image"
            disabled={index === 0}
            onClick={() => moveTo(index - 1)}
          >
            Previous
          </button>
          <span>Click or pinch to zoom. Drag while zoomed to pan.</span>
          <button
            type="button"
            aria-label="Next image"
            disabled={index >= images.length - 1}
            onClick={() => moveTo(index + 1)}
          >
            Next
          </button>
        </footer>
      </div>
      <style>{`
      .product-lightbox-overlay { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; padding:1rem; background:rgb(0 0 0 / 88%); }
      .product-lightbox { width:min(100%, 76rem); height:min(100%, 52rem); display:grid; grid-template-rows:auto minmax(0, 1fr) auto; color:#fff; background:#111827; border-radius:.75rem; box-shadow:0 1rem 3rem rgb(0 0 0 / 45%); }
      .product-lightbox header, .product-lightbox footer { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.75rem 1rem; } .product-lightbox header button, .product-lightbox footer button { border:1px solid #94a3b8; border-radius:.375rem; padding:.45rem .7rem; color:inherit; background:transparent; cursor:pointer; font:inherit; } .product-lightbox header button { font-size:1.5rem; line-height:1; } .product-lightbox button:hover:not(:disabled) { background:rgb(255 255 255 / 14%); } .product-lightbox button:focus-visible { outline:3px solid #93c5fd; outline-offset:2px; } .product-lightbox button:disabled { cursor:not-allowed; opacity:.45; } .product-lightbox footer span { text-align:center; color:#cbd5e1; font-size:.8125rem; }
      .viewport { position:relative; display:grid; place-items:center; min-height:0; overflow:hidden; touch-action:none; user-select:none; cursor:zoom-in; } .viewport img { max-width:100%; max-height:100%; object-fit:contain; transition:transform .15s ease-out; will-change:transform; } .status { position:absolute; }
      @media (prefers-reduced-motion: reduce) { .viewport img { transition:none; } } @media (max-width:640px) { .product-lightbox-overlay { padding:0; } .product-lightbox { width:100%; height:100%; border-radius:0; } .product-lightbox footer span { display:none; } }
    `}</style>
    </div>
  );
}
