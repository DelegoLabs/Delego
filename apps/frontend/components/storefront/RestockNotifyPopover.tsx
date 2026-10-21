"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@delegolabs/ui";

export interface RestockSubscriptionPayload {
  productId: string;
  emailOrAddress: string;
  notificationType: "email" | "stellar_memo";
}

export interface RestockNotifyPopoverProps {
  productId: string;
  productTitle?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Stellar account public key (G…, 56 chars). */
const STELLAR_PUBKEY_RE = /^G[A-Z2-7]{55}$/;

export function classifyContact(value: string): RestockSubscriptionPayload["notificationType"] | null {
  const trimmed = value.trim();
  if (EMAIL_RE.test(trimmed)) return "email";
  if (STELLAR_PUBKEY_RE.test(trimmed)) return "stellar_memo";
  return null;
}

export function RestockNotifyPopover({ productId, productTitle }: RestockNotifyPopoverProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const notificationType = classifyContact(value);
    if (!notificationType) {
      setError("Enter a valid email or Stellar public key (G…).");
      return;
    }

    const payload: RestockSubscriptionPayload = {
      productId,
      emailOrAddress: value.trim(),
      notificationType,
    };

    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/products/${encodeURIComponent(productId)}/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? `Could not subscribe (${res.status})`);
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-expanded={open}
        aria-controls={panelId}
        data-testid="restock-notify-trigger"
        onClick={() => {
          setOpen((o) => !o);
          setError(null);
        }}
      >
        {success ? "✓ Subscribed" : "Notify Me"}
      </Button>

      {open && !success && (
        <div
          id={panelId}
          role="dialog"
          aria-label={
            productTitle
              ? `Notify me when ${productTitle} is back in stock`
              : "Back-in-stock notification"
          }
          data-testid="restock-notify-popover"
          style={{
            position: "absolute",
            right: 0,
            zIndex: 20,
            marginTop: "0.5rem",
            width: "min(20rem, 90vw)",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #e5e7eb",
            background: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}
        >
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "#374151" }}>
            Get notified when this item is restocked. Use email or a Stellar public key.
          </p>
          <form onSubmit={handleSubmit}>
            <label
              htmlFor={`${panelId}-input`}
              style={{ display: "block", fontSize: "0.75rem", color: "#6b7280", marginBottom: 4 }}
            >
              Email or Stellar address
            </label>
            <input
              id={`${panelId}-input`}
              data-testid="restock-notify-input"
              type="text"
              autoComplete="email"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={submitting}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "0.5rem",
                borderRadius: "0.375rem",
                border: "1px solid #d1d5db",
                marginBottom: "0.5rem",
              }}
            />
            {error && (
              <p role="alert" data-testid="restock-notify-error" style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#dc2626" }}>
                {error}
              </p>
            )}
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={submitting} data-testid="restock-notify-submit">
                {submitting ? "Saving…" : "Notify me"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {success && (
        <span
          role="status"
          data-testid="restock-notify-success"
          style={{ marginLeft: "0.5rem", color: "#16a34a", fontSize: "0.875rem" }}
        >
          ✓ You will be notified
        </span>
      )}
    </div>
  );
}
