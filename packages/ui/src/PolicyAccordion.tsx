import { useState, useRef, useId, type KeyboardEvent, type HTMLAttributes, type ReactElement } from "react";
import { formatAmount } from "./formatAmount.js";

/**
 * Merchant policy and buyer protection info (#PolicyAccordion).
 */
export interface MerchantPolicyInfo {
  returnWindowDays: number;
  restockingFeePercent: number;
  freeShippingThresholdStroops?: string;
  escrowProtectionNotice: string;
}

export type AccordionSectionId = "escrow" | "returns" | "warranty" | "fulfillment";

export interface PolicyAccordionProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Merchant policy information */
  policy: MerchantPolicyInfo;
  /** Merchant store name or identifier */
  merchantName?: string;
  /** Custom warranty description */
  warrantyInfo?: string;
  /** Custom fulfillment terms */
  fulfillmentTerms?: string;
  /** Section ID to open by default (defaults to "escrow") */
  defaultOpenSectionId?: AccordionSectionId | null;
  /** Allow multiple sections to be open simultaneously (defaults to true) */
  allowMultiple?: boolean;
  /** Heading level for accessibility hierarchy (defaults to 3) */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Custom accessible label for the accordion */
  ariaLabel?: string;
}

interface SectionConfig {
  id: AccordionSectionId;
  title: string;
  badge?: string;
  isHighlighted?: boolean;
}

/**
 * Accessible PolicyAccordion component.
 *
 * Displays merchant fulfillment terms, return windows, warranty information,
 * and highlights Delego escrow buyer protection guarantee before purchase.
 *
 * Complies with WAI-ARIA Accordion Pattern:
 * - Proper heading level wrapper for each section button.
 * - aria-expanded and aria-controls attributes on header buttons.
 * - aria-labelledby and role="region" on disclosure panels.
 * - Full keyboard navigation (Enter, Space, ArrowDown, ArrowUp, Home, End).
 */
export function PolicyAccordion({
  policy,
  merchantName,
  warrantyInfo,
  fulfillmentTerms,
  defaultOpenSectionId = "escrow",
  allowMultiple = true,
  headingLevel = 3,
  ariaLabel = "Merchant fulfillment, returns, warranty, and escrow guarantee policies",
  style,
  id,
  ...props
}: PolicyAccordionProps) {
  const generatedId = useId();
  const accordionId = id || `policy-accordion-${generatedId.replace(/:/g, "")}`;

  // State: Set of open section IDs
  const [openSections, setOpenSections] = useState<Set<AccordionSectionId>>(() => {
    const initial = new Set<AccordionSectionId>();
    if (defaultOpenSectionId) {
      initial.add(defaultOpenSectionId);
    }
    return initial;
  });

  const buttonRefs = useRef<Map<AccordionSectionId, HTMLButtonElement>>(new Map());

  // Format free shipping threshold if present
  let formattedFreeShipping: string | null = null;
  if (policy.freeShippingThresholdStroops && /^\d+$/.test(policy.freeShippingThresholdStroops)) {
    try {
      const stroopsBigInt = BigInt(policy.freeShippingThresholdStroops);
      const { value, symbol } = formatAmount(stroopsBigInt, { currency: "XLM" });
      formattedFreeShipping = `${value} ${symbol}`;
    } catch {
      formattedFreeShipping = `${policy.freeShippingThresholdStroops} stroops`;
    }
  }

  const sections: SectionConfig[] = [
    {
      id: "escrow",
      title: "Delego Escrow Buyer Protection",
      badge: "Guaranteed",
      isHighlighted: true,
    },
    {
      id: "returns",
      title: "Returns & Refund Policy",
      badge: `${policy.returnWindowDays}-day window`,
    },
    {
      id: "warranty",
      title: "Warranty Information",
    },
    {
      id: "fulfillment",
      title: "Fulfillment & Shipping Terms",
      badge: formattedFreeShipping ? `Free shipping over ${formattedFreeShipping}` : undefined,
    },
  ];

  const toggleSection = (sectionId: AccordionSectionId) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        if (!allowMultiple) {
          next.clear();
        }
        next.add(sectionId);
      }
      return next;
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const total = sections.length;
    let targetIndex = -1;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        targetIndex = (currentIndex + 1) % total;
        break;
      case "ArrowUp":
        e.preventDefault();
        targetIndex = (currentIndex - 1 + total) % total;
        break;
      case "Home":
        e.preventDefault();
        targetIndex = 0;
        break;
      case "End":
        e.preventDefault();
        targetIndex = total - 1;
        break;
      default:
        return;
    }

    if (targetIndex >= 0) {
      const targetSection = sections[targetIndex];
      const btn = buttonRefs.current.get(targetSection.id);
      btn?.focus();
    }
  };

  const renderHeading = (children: ReactElement) => {
    const headingStyle = { margin: 0, padding: 0 };
    switch (headingLevel) {
      case 2:
        return <h2 style={headingStyle}>{children}</h2>;
      case 4:
        return <h4 style={headingStyle}>{children}</h4>;
      case 5:
        return <h5 style={headingStyle}>{children}</h5>;
      case 6:
        return <h6 style={headingStyle}>{children}</h6>;
      case 3:
      default:
        return <h3 style={headingStyle}>{children}</h3>;
    }
  };

  return (
    <div
      id={accordionId}
      data-testid="policy-accordion"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        width: "100%",
        fontFamily: "inherit",
        ...style,
      }}
      {...props}
    >
      {sections.map((section, index) => {
        const isOpen = openSections.has(section.id);
        const headerId = `${accordionId}-header-${section.id}`;
        const panelId = `${accordionId}-panel-${section.id}`;
        const isHighlight = section.isHighlighted;

        return (
          <div
            key={section.id}
            data-testid={`accordion-item-${section.id}`}
            style={{
              border: isHighlight ? "1px solid #10b981" : "1px solid #e5e7eb",
              borderRadius: "0.5rem",
              background: isHighlight ? "#f0fdf4" : "#ffffff",
              overflow: "hidden",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease",
              boxShadow: isHighlight ? "0 1px 2px rgba(16, 185, 129, 0.1)" : "0 1px 2px rgba(0, 0, 0, 0.05)",
            }}
          >
            {renderHeading(
              <button
                ref={(el) => {
                  if (el) buttonRefs.current.set(section.id, el);
                  else buttonRefs.current.delete(section.id);
                }}
                id={headerId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                data-testid={`accordion-btn-${section.id}`}
                onClick={() => toggleSection(section.id)}
                onKeyDown={(e) => handleKeyDown(e, index)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  background: isHighlight ? "#f0fdf4" : "#ffffff",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  color: isHighlight ? "#065f46" : "#1f2937",
                  outline: "none",
                  gap: "0.5rem",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {isHighlight && (
                    <span
                      aria-hidden="true"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "1.25rem",
                        height: "1.25rem",
                        borderRadius: "50%",
                        background: "#10b981",
                        color: "#ffffff",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </span>
                  )}
                  <span>{section.title}</span>
                  {section.badge && (
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        padding: "0.125rem 0.5rem",
                        borderRadius: "9999px",
                        background: isHighlight ? "#d1fae5" : "#f3f4f6",
                        color: isHighlight ? "#047857" : "#4b5563",
                      }}
                    >
                      {section.badge}
                    </span>
                  )}
                </div>

                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                    fontSize: "0.75rem",
                    color: isHighlight ? "#059669" : "#9ca3af",
                  }}
                >
                  ▼
                </span>
              </button>
            )}

            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              hidden={!isOpen}
              data-testid={`accordion-panel-${section.id}`}
              style={{
                display: isOpen ? "block" : "none",
                padding: "0.875rem 1rem 1rem 1rem",
                borderTop: isHighlight ? "1px solid #d1fae5" : "1px solid #f3f4f6",
                fontSize: "0.875rem",
                lineHeight: "1.4",
                color: "#374151",
                background: isHighlight ? "#f0fdf4" : "#ffffff",
              }}
            >
              {section.id === "escrow" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  <div
                    style={{
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.375rem",
                      background: "#ecfdf5",
                      border: "1px solid #a7f3d0",
                      color: "#065f46",
                      fontWeight: 500,
                      fontSize: "0.8125rem",
                    }}
                  >
                    🛡️ <strong>Delego Escrow Protection:</strong> Funds are locked on-chain in a Soroban smart contract until you inspect and confirm delivery.
                  </div>

                  <p style={{ margin: 0 }}>
                    {policy.escrowProtectionNotice}
                  </p>

                  <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.25rem", fontSize: "0.8125rem", color: "#4b5563" }}>
                    <li>Smart contract custody ensures merchant cannot access funds prematurely.</li>
                    <li>Automatic release timers with configurable grace periods.</li>
                    <li>Full dispute support with cryptographic evidence submission.</li>
                  </ul>
                </div>
              )}

              {section.id === "returns" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div>
                    <strong>Return Window:</strong>{" "}
                    <span>
                      {policy.returnWindowDays} calendar days from product delivery.
                    </span>
                  </div>
                  <div>
                    <strong>Restocking Fee:</strong>{" "}
                    <span>
                      {policy.restockingFeePercent > 0
                        ? `${policy.restockingFeePercent}% restocking fee applied on returned items.`
                        : "0% — No restocking fee on eligible returns."}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8125rem" }}>
                    Returned items must be unused, in original condition and original packaging. Return shipping instructions will be issued upon dispute or return request initiation.
                  </p>
                </div>
              )}

              {section.id === "warranty" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div>
                    <strong>Warranty Coverage:</strong>
                  </div>
                  <p style={{ margin: 0 }}>
                    {warrantyInfo ||
                      `${merchantName ? `${merchantName}` : "Merchant"} provides warranty against manufacturer defects and item discrepancies during the inspection and return window.`}
                  </p>
                  <p style={{ margin: 0, color: "#6b7280", fontSize: "0.8125rem" }}>
                    Should you receive an item with defects or missing components, you are protected by Delego smart contract escrow to request replacement or refund before funds release.
                  </p>
                </div>
              )}

              {section.id === "fulfillment" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <div>
                    <strong>Shipping & Delivery Terms:</strong>
                  </div>
                  {formattedFreeShipping ? (
                    <div
                      style={{
                        padding: "0.375rem 0.625rem",
                        borderRadius: "0.375rem",
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        color: "#1e40af",
                        fontWeight: 500,
                        fontSize: "0.8125rem",
                      }}
                    >
                      🚚 <strong>Free Shipping:</strong> Available on orders meeting or exceeding {formattedFreeShipping}.
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: "#4b5563" }}>
                      Standard carrier shipping calculated at checkout.
                    </p>
                  )}
                  <p style={{ margin: 0 }}>
                    {fulfillmentTerms ||
                      "Orders are prepared and dispatched within 1-2 business days. On-chain milestone tracking is updated when shipment begins."}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
