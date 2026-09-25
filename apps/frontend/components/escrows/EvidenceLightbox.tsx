"use client";

import { useEffect } from "react";

export interface EvidenceLightboxProps {
  imageUrl: string;
  title: string;
  onClose: () => void;
}

/**
 * Fullscreen lightbox modal for high-resolution photo inspection.
 * Supports keyboard navigation (Escape to close) and click-outside to dismiss.
 */
export function EvidenceLightbox({ imageUrl, title, onClose }: EvidenceLightboxProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleBodyScroll = () => {
      document.body.style.overflow = "hidden";
    };

    handleBodyScroll();
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      className="evidence-lightbox-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="evidence-lightbox-container">
        <div className="evidence-lightbox-header">
          <h3 className="evidence-lightbox-title">{title}</h3>
          <button
            type="button"
            className="evidence-lightbox-close"
            onClick={onClose}
            aria-label="Close lightbox"
          >
            ✕
          </button>
        </div>

        <div
          className="evidence-lightbox-content"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={imageUrl}
            alt={title}
            className="evidence-lightbox-image"
          />
        </div>

        <div className="evidence-lightbox-instructions">
          <p>Click outside or press ESC to close</p>
        </div>
      </div>

      <style jsx>{`
        .evidence-lightbox-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          cursor: zoom-out;
          animation: fadeIn 0.2s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .evidence-lightbox-container {
          display: flex;
          flex-direction: column;
          max-width: 95vw;
          max-height: 95vh;
          width: 100%;
          height: 100%;
        }

        .evidence-lightbox-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.8);
          border-radius: 0.5rem 0.5rem 0 0;
        }

        .evidence-lightbox-title {
          margin: 0;
          color: #fff;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .evidence-lightbox-close {
          background: transparent;
          border: none;
          color: #fff;
          font-size: 2rem;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          width: 2.5rem;
          height: 2.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 0.25rem;
          transition: background 0.2s;
        }

        .evidence-lightbox-close:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .evidence-lightbox-close:focus {
          outline: 2px solid #fff;
          outline-offset: 2px;
        }

        .evidence-lightbox-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: default;
          background: rgba(0, 0, 0, 0.5);
        }

        .evidence-lightbox-image {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          border-radius: 0.5rem;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .evidence-lightbox-instructions {
          padding: 1rem;
          text-align: center;
          background: rgba(0, 0, 0, 0.8);
          border-radius: 0 0 0.5rem 0.5rem;
        }

        .evidence-lightbox-instructions p {
          margin: 0;
          color: #9ca3af;
          font-size: 0.875rem;
        }

        @media (max-width: 768px) {
          .evidence-lightbox-overlay {
            padding: 0;
          }

          .evidence-lightbox-container {
            max-width: 100vw;
            max-height: 100vh;
          }

          .evidence-lightbox-header {
            border-radius: 0;
          }

          .evidence-lightbox-instructions {
            border-radius: 0;
          }
        }
      `}</style>
    </div>
  );
}
