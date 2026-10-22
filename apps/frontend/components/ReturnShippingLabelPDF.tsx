"use client";

/**
 * Printable return shipping label (#1009).
 *
 * On-screen / print rendition of the 4×6in label that
 * `generateReturnLabelPdf` produces: the same layout and the same Code 128
 * bar pattern, so what the merchant previews is what the buyer prints.
 */

import {
  CODE128_QUIET_ZONE,
  code128Bars,
  encodeCode128,
  isCode128Encodable,
} from "../lib/code128";
import { returnAddressLines } from "../lib/returnLabel";
import {
  CARRIERS,
  normalizeTrackingNumber,
  type ReturnLabelConfig,
} from "../lib/returnShippingLabel";

export interface Code128BarcodeProps {
  value: string;
  /** Rendered height in px. */
  height?: number;
}

/** Scannable Code 128 barcode as crisp SVG rectangles. */
export function Code128Barcode({ value, height = 80 }: Code128BarcodeProps) {
  if (!isCode128Encodable(value)) return null;
  const encoding = encodeCode128(value);
  const width = encoding.totalModules + CODE128_QUIET_ZONE * 2;
  return (
    <svg
      role="img"
      aria-label={`Code 128 barcode for ${value}`}
      data-testid="code128-barcode"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width="100%"
      height={height}
      shapeRendering="crispEdges"
      style={{ display: "block", background: "#fff" }}
    >
      {code128Bars(encoding).map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={height} fill="#000" />
      ))}
    </svg>
  );
}

export interface ReturnShippingLabelPDFProps {
  config: ReturnLabelConfig;
}

export function ReturnShippingLabelPDF({ config }: ReturnShippingLabelPDFProps) {
  const carrier = CARRIERS[config.carrier];
  const tracking = normalizeTrackingNumber(config.trackingNumber);

  return (
    <article
      className="print-sheet return-shipping-label"
      aria-label={`${carrier.name} return label for order ${config.orderId}`}
      data-testid="return-shipping-label"
      style={{
        width: "100%",
        maxWidth: "4in",
        aspectRatio: "4 / 6",
        margin: "0 auto",
        padding: "0.15in",
        boxSizing: "border-box",
        border: "1px solid #111",
        background: "#fff",
        color: "#000",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        fontFamily: "Helvetica, Arial, sans-serif",
      }}
    >
      <header
        data-testid="carrier-mark"
        data-carrier={config.carrier}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.4rem 0.6rem",
          background: carrier.color,
          color: carrier.textColor,
        }}
      >
        <strong style={{ fontSize: "1.5rem", letterSpacing: "-0.02em" }}>
          {carrier.name}
        </strong>
        <span style={{ fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase" }}>
          {carrier.service}
        </span>
      </header>

      <section aria-label="Ship from">
        <div style={{ fontSize: "0.55rem", fontWeight: 700 }}>FROM (BUYER)</div>
        <address style={{ fontStyle: "normal", fontSize: "0.7rem", lineHeight: 1.3 }}>
          {returnAddressLines(config.buyerAddress).map((line, i) => (
            <div key={`${i}-${line}`}>{line}</div>
          ))}
        </address>
      </section>

      <hr style={{ border: 0, borderTop: "1px solid #000", margin: 0, width: "100%" }} />

      <section aria-label="Ship to">
        <div style={{ fontSize: "0.6rem", fontWeight: 700 }}>
          SHIP TO — MERCHANT RETURN HUB
        </div>
        <address
          data-testid="hub-address"
          style={{ fontStyle: "normal", fontSize: "1rem", fontWeight: 700, lineHeight: 1.3 }}
        >
          {returnAddressLines(config.merchantHubAddress).map((line, i) => (
            <div key={`${i}-${line}`}>{line}</div>
          ))}
        </address>
      </section>

      <hr style={{ border: 0, borderTop: "2px solid #000", margin: 0, width: "100%" }} />

      <section aria-label="Tracking barcode" style={{ textAlign: "center" }}>
        <div style={{ fontSize: "0.6rem" }}>TRACKING # ({carrier.name})</div>
        <Code128Barcode value={tracking} />
        <div
          data-testid="tracking-text"
          style={{ fontFamily: "Courier, monospace", fontWeight: 700, fontSize: "0.9rem" }}
        >
          {tracking}
        </div>
      </section>

      <footer
        style={{
          marginTop: "auto",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.6rem",
        }}
      >
        <span>Order {config.orderId}</span>
        <span>RETURN — Delego</span>
      </footer>
    </article>
  );
}

export default ReturnShippingLabelPDF;
