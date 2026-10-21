"use client";

import { useState, useEffect } from "react";

/** Props for the 3D model viewer component. */
export interface ModelViewerProps {
  /** URL to the GLTF/GLB model file. */
  modelUrl: string;
  /** URL to the poster image shown before the model loads. */
  posterImageUrl?: string;
  /** Whether the model should auto-rotate. */
  autoRotate?: boolean;
  /** Alternative text for accessibility. */
  altText?: string;
}

/** Renders a 3D GLTF model viewer with orbit controls and poster fallback. */
export function ModelViewer({
  modelUrl,
  posterImageUrl,
  autoRotate = true,
  altText = "3D model",
}: ModelViewerProps) {
  const [webglError, setWebglError] = useState<boolean | null>(null);

  useEffect(() => {
    const checkWebglSupport = () => {
      try {
        const canvas = document.createElement("canvas");
        if (!canvas.getContext("webgl")) {
          setWebglError(true);
        }
      } catch {
        setWebglError(true);
      }
    };

    checkWebglSupport();
  }, []);

  return (
    <div
      style={{
        borderRadius: "0.5rem",
        overflow: "hidden",
        background: "#f0f0f0",
      }}
    >
      {/* Poster image fallback */}
      {posterImageUrl && (
        <img
          src={posterImageUrl}
          alt={altText}
          style={{
            width: "100%",
            height: "calc(400px - 4rem)",
            objectFit: "cover",
          }}
        />
      )}

      {/* WebGL error fallback */}
      {webglError && (
        <p
          style={{
            padding: "1rem",
            color: "#dc2626",
            fontSize: "0.875rem",
            textAlign: "center",
          }}
        >
          WebGL is unavailable. Please use a modern browser with WebGL support.
        </p>
      )}

      {/* 3D model viewer */}
      {!posterImageUrl && !webglError && (
        // @ts-ignore - model-viewer web component type not recognized
        <model-viewer
          src={modelUrl}
          alt={altText}
          aria-label={altText}
          auto-rotate
          camera-controls
          style={{
            width: "100%",
            height: "calc(400px - 4rem)",
            touchAction: "pan-y",
          }}
        />
      )}
    </div>
  );
}