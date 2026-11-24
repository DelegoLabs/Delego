import React, { useEffect, useRef } from "react";

export interface ModelViewerProps {
  /** URL of the 3D model to display (e.g. a .glb or .gltf file). */
  src: string;
  /** Optional alt text for accessibility. */
  alt?: string;
  /** Optional CSS class name applied to the wrapping element. */
  className?: string;
  /** Optional inline styles applied to the wrapping element. */
  style?: React.CSSProperties;
  /** Whether the model should auto-rotate. Defaults to false. */
  autoRotate?: boolean;
  /** Whether camera controls (orbit, zoom, pan) are enabled. Defaults to true. */
  cameraControls?: boolean;
}

/**
 * Renders a 3D model using the <model-viewer> web component.
 * The element is created on the client so it is safe to render during SSR.
 */
export function ModelViewer({
  src,
  alt = "3D model",
  className,
  style,
  autoRotate = false,
  cameraControls = true,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement("model-viewer") as HTMLElement & {
      src?: string;
      alt?: string;
    };
    el.setAttribute("src", src);
    el.setAttribute("alt", alt);
    if (autoRotate) el.setAttribute("auto-rotate", "");
    if (cameraControls) el.setAttribute("camera-controls", "");
    el.style.width = "100%";
    el.style.height = "100%";

    container.appendChild(el);

    return () => {
      container.removeChild(el);
    };
  }, [src, alt, autoRotate, cameraControls]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%", ...style }}
      role="img"
      aria-label={alt}
    />
  );
}

export default ModelViewer;
