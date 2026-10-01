"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  barcodeSvgToDataUrl,
  isEmbeddableLabelUrl,
  returnAddressLines,
  type ReturnLabelData,
} from "../../lib/returnLabel";

export interface ReturnLabelModalProps {
  isOpen: boolean;
  label: ReturnLabelData | null;
  onClose: () => void;
}

/**
 * Printable return shipping label for an approved return dispute (#796).
 * Renders the carrier barcode and RMA number, prints through the print
 * stylesheet so only the label sheet reaches the printer, and optionally
 * previews the carrier-hosted PDF label from the original #712 flow.
 */
export function ReturnLabelModal({
  isOpen,
  label,
  onClose,
}: ReturnLabelModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useFocusTrap({ containerRef: panelRef, isActive: isOpen, onEscape: onClose });

  useEffect(() => {
    if (!isOpen) return;
    setCopied(false);
    setCopyError(false);
  }, [isOpen]);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);

  if (!isOpen || !label) return null;

  const barcodeSrc = barcodeSvgToDataUrl(label.carrierBarcodeSvg);
  const canEmbedPdf = label.labelPdfUrl
    ? isEmbeddableLabelUrl(label.labelPdfUrl)
    : false;

  async function handleCopy() {
    if (!label?.trackingNumber) return;
    try {
      await navigator.clipboard.writeText(label.trackingNumber);
      setCopied(true);
    } catch {
      // Clipboard unavailable — the tracking number is still visible to copy manually.
    }
  }

  function handlePrint() {
    // Printing the PDF frame directly gives the carrier's exact label; that
    // only works same-origin, so fall back to the page print stylesheet.
    try {
      const frameWindow = frameRef.current?.contentWindow;
      if (frameWindow) {
        frameWindow.focus();
        frameWindow.print();
        return;
      }
    } catch {
      // Cross-origin PDF — fall through.
    }
    window.print();
  }

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Return label for ${label.rmaNumber}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="print-sheet return-label"
        style={{
          background: "var(--color-bg-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "36rem",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          margin: "5vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ margin: 0 }}>Return shipping label</h2>

        <dl className="wallet-detail-list">
          <div className="wallet-detail-row">
            <dt>RMA number</dt>
            <dd>
              <code className="return-label-rma">{label.rmaNumber}</code>
            </dd>
          </div>
          {label.orderId && (
            <div className="wallet-detail-row">
              <dt>Order</dt>
              <dd>{label.orderId}</dd>
            </div>
          )}
          {label.carrier && (
            <div className="wallet-detail-row">
              <dt>Carrier</dt>
              <dd>{label.carrier}</dd>
            </div>
          )}
          {label.trackingNumber && (
            <div className="wallet-detail-row">
              <dt>Tracking number</dt>
              <dd className="return-label-tracking">
                <code>{label.trackingNumber}</code>
                <button
                  type="button"
                  className="copy-button no-print"
                  onClick={() => void handleCopy()}
                  aria-label="Copy return tracking number"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </dd>
            </div>
          )}
          <div className="wallet-detail-row">
            <dt>Ship to</dt>
            <dd>
              <address className="return-label-address">
                {returnAddressLines(label.returnAddress).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </address>
            </dd>
          </div>
        </dl>

        <span role="status" aria-live="polite" className="sr-only">
          {copied ? "Tracking number copied to clipboard." : ""}
        </span>

        {barcodeSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- barcode is a data URL; next/image optimization is unnecessary
          <img
            className="return-label-barcode"
            src={barcodeSrc}
            alt={`Carrier barcode ${label.rmaNumber}`}
          />
        ) : (
          <p role="alert" className="settings-status error" style={{ margin: 0 }}>
            The carrier barcode is unavailable.
          </p>
        )}

        {canEmbedPdf && label.labelPdfUrl && (
          <iframe
            ref={frameRef}
            src={label.labelPdfUrl}
            title={`Return label PDF for ${label.rmaNumber}`}
            className="return-label-preview"
          />
        )}

        <div className="form-actions no-print">
          {canEmbedPdf && label.labelPdfUrl && (
            <a
              href={label.labelPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="return-label-open-link"
            >
              Open PDF
            </a>
          )}
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" type="button" onClick={handlePrint}>
            Print label
          </Button>
        </div>
      </div>
    </div>
  );
}
