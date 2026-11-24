"use client";

import { useEffect, useRef, useState } from "react";

export interface ModelViewerProps {
  src: string;
  alt?: string;
  className?: string;
  autoRotate?: boolean;
  cameraControls?: boolean;
  onError?: (error: Error) => void;
}

type ModelViewerElement = HTMLElement & {
  src?: string;
  alt?: string;
  autoRotate?: boolean;
  cameraControls?: boolean;
};

export function ModelViewer({
  src,
  alt = "3D model",
  className,
  autoRotate = true,
  cameraControls = true,
  onError,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement("model-viewer") as ModelViewerElement;
    el.src = src;
    el.alt = alt;
    el.autoRotate = autoRotate;
    el.cameraControls = cameraControls;
    el.style.width = "100%";
    el.style.height = "100%";

    const handleError = () => {
      const err = new Error(`Failed to load 3D model: ${src}`);
      setLoadError(err);
      onError?.(err);
    };

    el.addEventListener("error", handleError);
    container.appendChild(el);

    return () => {
      el.removeEventListener("error", handleError);
      el.remove();
    };
  }, [src, alt, autoRotate, cameraControls, onError]);

  if (loadError) {
    return (
      <div className={className} role="alert">
        {loadError.message}
      </div>
    );
  }

  return <div ref={containerRef} className={className} style={{ width: "100%", height: "100%" }} />;
}

export default ModelViewer;
