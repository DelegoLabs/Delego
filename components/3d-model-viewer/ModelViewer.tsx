"use client";

import { useEffect, useRef, useState } from "react";

export interface ModelViewerProps {
  src: string;
  alt?: string;
  className?: string;
  autoRotate?: boolean;
  cameraControls?: boolean;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

type ModelViewerElement = HTMLElement & {
  loaded?: boolean;
};

export function ModelViewer({
  src,
  alt = "3D model",
  className,
  autoRotate = true,
  cameraControls = true,
  onLoad,
  onError,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement("model-viewer") as ModelViewerElement;
    el.setAttribute("src", src);
    el.setAttribute("alt", alt);
    if (autoRotate) el.setAttribute("auto-rotate", "");
    if (cameraControls) el.setAttribute("camera-controls", "");
    el.style.width = "100%";
    el.style.height = "100%";

    const handleLoad = () => {
      setReady(true);
      onLoad?.();
    };
    const handleError = () => {
      onError?.(new Error(`Failed to load model: ${src}`));
    };

    el.addEventListener("load", handleLoad);
    el.addEventListener("error", handleError);
    container.appendChild(el);

    return () => {
      el.removeEventListener("load", handleLoad);
      el.removeEventListener("error", handleError);
      container.removeChild(el);
    };
  }, [src, alt, autoRotate, cameraControls, onLoad, onError]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-ready={ready ? "true" : "false"}
      style={{ width: "100%", height: "100%", minHeight: 240 }}
    />
  );
}

export default ModelViewer;
