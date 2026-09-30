"use client";

import { useState } from "react";
import { Card, Button, FormField } from "@delegolabs/ui";
import { 
  TaxBreakdownDisplay, 
  TaxSummaryRow, 
  TaxAwareTotal 
} from "./TaxBreakdownDisplay";

/**
 * Example component showing how to integrate tax breakdown
 * into existing checkout and receipt flows.
 * 
 * This demonstrates the three main use cases:
 * 1. Detailed tax breakdown (checkout preview)
 * 2. Summary row integration (receipt totals)
 * 3. Tax-aware total display (order summary)
 */
export function TaxBreakdownExample() {
  const [subtotal, setSubtotal] = useState("100"); // In XLM for demo
  const [postalCode, setPostalCode] = useState("90210");
  const [showDetails, setShowDetails] = useState(true);

  // Convert XLM to stroops for calculations (1 XLM = 10^7 stroops)
  const subtotalStroops = BigInt(parseFloat(subtotal || "0") * 10_000_000);

  return (
    <div className="tax-breakdown-demo">
      <Card title="Tax Breakdown Integration Demo">
        <div className="demo-controls" style={{ marginBottom: "2rem" }}>
          <FormField label="Subtotal (XLM)">
            <input
              type="number"
              value={subtotal}
              onChange={(e) => setSubtotal(e.target.value)}
              min="0"
              step="0.01"
              style={{ width: "150px", padding: "0.5rem" }}
            />
          </FormField>
          
          <FormField label="Postal Code">
            <input
              type="text"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="Enter postal code"
              style={{ width: "200px", padding: "0.5rem" }}
            />
          </FormField>
          
          <FormField label="Show Details">
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={showDetails}
                onChange={(e) => setShowDetails(e.target.checked)}
              />
              Detailed breakdown
            </label>
          </FormField>
        </div>

        <div className="demo-sections">
          <section style={{ marginBottom: "2rem" }}>
            <h3>1. Detailed Tax Breakdown (Checkout Preview)</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
              Use this in checkout flows to show customers the full tax calculation
              before they complete their purchase.
            </p>
            <TaxBreakdownDisplay
              subtotalStroops={subtotalStroops}
              postalCode={postalCode}
              showDetails={showDetails}
            />
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h3>2. Receipt Integration Example</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
              Integration pattern for existing receipt components like ReceiptPanel.
            </p>
            <div className="receipt-totals" style={{ 
              border: "1px solid var(--color-border)", 
              padding: "1rem", 
              borderRadius: "0.5rem" 
            }}>
              <div className="receipt-totals-row">
                <span>Subtotal</span>
                <span>{subtotal} XLM</span>
              </div>
              
              <TaxSummaryRow
                subtotalStroops={subtotalStroops}
                postalCode={postalCode}
              />
              
              <TaxAwareTotal
                subtotalStroops={subtotalStroops}
                postalCode={postalCode}
              />
            </div>
          </section>

          <section>
            <h3>3. Test Different Jurisdictions</h3>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
              Try these postal codes to see different tax scenarios:
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem" }}>
              {[
                { code: "90210", desc: "California, USA (8.25% Sales Tax)" },
                { code: "10115", desc: "Berlin, Germany (19% VAT)" },
                { code: "M5V 3A8", desc: "Ontario, Canada (13% HST)" },
                { code: "SW1A 1AA", desc: "London, UK (20% VAT)" },
                { code: "33101", desc: "Florida, USA (0% Sales Tax)" },
                { code: "UNKNOWN", desc: "Unknown Location (No Tax)" },
              ].map((example) => (
                <Button
                  key={example.code}
                  variant="ghost"
                  size="sm"
                  onClick={() => setPostalCode(example.code)}
                  style={{ 
                    textAlign: "left", 
                    padding: "0.5rem",
                    height: "auto",
                    whiteSpace: "normal" 
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "600" }}>{example.code}</div>
                    <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>{example.desc}</div>
                  </div>
                </Button>
              ))}
            </div>
          </section>
        </div>
      </Card>
    </div>
  );
}