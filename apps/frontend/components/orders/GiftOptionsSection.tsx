"use client";

import { useState, useId } from "react";
import type { GiftOptions } from "@delegolabs/types";
import { FormField } from "@delegolabs/ui";

export const GIFT_MESSAGE_MAX_LENGTH = 250;

export interface GiftOptionsSectionProps {
  /** Controlled gift options state */
  value?: GiftOptions;
  /** Callback fired whenever any gift option changes */
  onChange?: (options: GiftOptions) => void;
  /** Disables all fields in the section */
  disabled?: boolean;
}

const DEFAULT_GIFT_OPTIONS: GiftOptions = {
  isGift: false,
  recipientName: "",
  giftMessage: "",
  hidePackingSlipPrice: true,
};

/**
 * Gift options input section for the checkout review step.
 * Allows buyers to flag orders as gifts, attach a personalized message (max 250 chars)
 * with a live character counter, and request hiding item prices on physical packing slips.
 */
export function GiftOptionsSection({
  value,
  onChange,
  disabled = false,
}: GiftOptionsSectionProps) {
  const [internalState, setInternalState] = useState<GiftOptions>(
    value ?? DEFAULT_GIFT_OPTIONS
  );

  const isControlled = value !== undefined;
  const current = isControlled ? value : internalState;

  const checkboxId = useId();
  const recipientId = useId();
  const messageId = useId();
  const hidePriceId = useId();

  const update = (patch: Partial<GiftOptions>) => {
    const next: GiftOptions = {
      ...current,
      ...patch,
    };
    if (!isControlled) {
      setInternalState(next);
    }
    onChange?.(next);
  };

  const handleGiftToggle = (checked: boolean) => {
    update({
      isGift: checked,
      // If toggled off, keep existing values or reset
      hidePackingSlipPrice: checked ? (current.hidePackingSlipPrice ?? true) : false,
    });
  };

  const currentMessage = current.giftMessage ?? "";
  const remainingChars = GIFT_MESSAGE_MAX_LENGTH - currentMessage.length;

  return (
    <div
      data-testid="gift-options-section"
      className="gift-options-section"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.875rem",
        marginTop: "1rem",
        padding: "1rem",
        borderRadius: "0.5rem",
        border: "1px solid #e5e7eb",
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        <input
          id={checkboxId}
          type="checkbox"
          data-testid="gift-options-checkbox"
          checked={current.isGift}
          disabled={disabled}
          onChange={(e) => handleGiftToggle(e.target.checked)}
          style={{ width: "1.125rem", height: "1.125rem", cursor: disabled ? "not-allowed" : "pointer" }}
        />
        <label
          htmlFor={checkboxId}
          style={{
            fontWeight: 600,
            fontSize: "0.9375rem",
            cursor: disabled ? "not-allowed" : "pointer",
            userSelect: "none",
          }}
        >
          This is a gift
        </label>
      </div>

      {current.isGift && (
        <div
          data-testid="gift-options-expanded"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.875rem",
            paddingLeft: "1.75rem",
          }}
        >
          <FormField label="Recipient name (optional)" inputProps={{ id: recipientId }}>
            <input
              id={recipientId}
              type="text"
              data-testid="gift-recipient-name-input"
              value={current.recipientName ?? ""}
              disabled={disabled}
              placeholder="e.g. Alice"
              onChange={(e) => update({ recipientName: e.target.value })}
              style={{
                width: "100%",
                maxWidth: "360px",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                fontSize: "0.875rem",
              }}
            />
          </FormField>

          <FormField label="Gift message" inputProps={{ id: messageId }}>
            <textarea
              id={messageId}
              data-testid="gift-message-textarea"
              value={currentMessage}
              disabled={disabled}
              maxLength={GIFT_MESSAGE_MAX_LENGTH}
              rows={3}
              placeholder="Add a personalized message for the recipient…"
              onChange={(e) => {
                const text = e.target.value.slice(0, GIFT_MESSAGE_MAX_LENGTH);
                update({ giftMessage: text });
              }}
              style={{
                width: "100%",
                maxWidth: "480px",
                padding: "0.5rem 0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                fontSize: "0.875rem",
                resize: "vertical",
              }}
            />
            <div
              data-testid="gift-message-counter"
              aria-live="polite"
              style={{
                fontSize: "0.75rem",
                color: remainingChars < 20 ? "#b91c1c" : "#6b7280",
                marginTop: "0.25rem",
              }}
            >
              {currentMessage.length}/{GIFT_MESSAGE_MAX_LENGTH} characters ({remainingChars} remaining)
            </div>
          </FormField>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <input
              id={hidePriceId}
              type="checkbox"
              data-testid="gift-hide-price-checkbox"
              checked={current.hidePackingSlipPrice}
              disabled={disabled}
              onChange={(e) => update({ hidePackingSlipPrice: e.target.checked })}
              style={{ width: "1rem", height: "1rem", cursor: disabled ? "not-allowed" : "pointer" }}
            />
            <label
              htmlFor={hidePriceId}
              style={{
                fontSize: "0.8125rem",
                color: "#374151",
                cursor: disabled ? "not-allowed" : "pointer",
                userSelect: "none",
              }}
            >
              Hide prices on packing slip
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
