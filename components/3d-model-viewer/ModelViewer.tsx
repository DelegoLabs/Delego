"use client";

import { useEffect, useRef } from "react";

export interface ModelViewerProps {
  src: string;
  alt?: string;
  className?: string;
  autoRotate?: boolean;
  cameraControls?: boolean;
}

export default function ModelViewer({
  src,
  alt = "3D model",
  className,
  autoRotate = true,
  cameraControls = true,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el: HTMLElement | null = containerRef.current;
    if (!el) return;
    el.setAttribute("data-model-src", src);
    el.setAttribute("aria-label", alt);
  }, [src, alt]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={alt}
      data-auto-rotate={autoRotate ? "true" : "false"}
      data-camera-controls={cameraControls ? "true" : "false"}
    />
  );
}
