"use client";

import { useState, useEffect, useRef } from "react";

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
  const [isRotating, setIsRotating] = useState(autoRotate);
  const modelViewerRef = useRef<Element | null>(null);

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

  useEffect(() => {
    if (!webglError && !posterImageUrl) {
      // Wait for model-viewer to be defined
      const timer = setTimeout(() => {
        const viewer = document.querySelector("model-viewer");
        if (viewer) {
          modelViewerRef.current = viewer;
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [webglError, posterImageUrl]);

  const toggleRotation = () => {
    const newState = !isRotating;
    setIsRotating(newState);
    if (modelViewerRef.current) {
      modelViewerRef.current.setAttribute("auto-rotate", newState ? "" : "false");
    }
  };

  return (
    <div
      style={{
        borderRadius: "0.5rem",
        overflow: "hidden",
        background: "#f0f0f0",
        position: "relative",
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
          ref={(el) => {
            if (el) modelViewerRef.current = el;
          }}
          src={modelUrl}
          alt={altText}
          aria-label={altText}
          auto-rotate={isRotating ? "" : "false"}
          camera-controls
          style={{
            width: "100%",
            height: "calc(400px - 4rem)",
            touchAction: "pan-y",
          }}
        />
      )}

      {/* Rotation toggle button */}
      {!webglError && !posterImageUrl && (
        <button
          onClick={toggleRotation}
          aria-pressed={isRotating}
          style={{
            position: "absolute",
            bottom: "0.5rem",
            right: "0.5rem",
            padding: "0.5rem",
            background: "#fff",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
          title={isRotating ? "Pause rotation" : "Resume rotation"}
        >
          {isRotating ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}