"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@delegolabs/ui";
import {
  DEFAULT_MERCHANT_WEBHOOK_CONFIG,
  WEBHOOK_EVENT_TYPES,
  generateWebhookSecret,
  isValidWebhookUrl,
  loadMerchantWebhookConfig,
  saveMerchantWebhookConfig,
  type MerchantWebhookConfig,
} from "../../lib/merchantWebhooks";

const EVENT_LABELS: Record<MerchantWebhookConfig["subscribedEvents"][number], string> = {
  "order.created": "New order created",
  "escrow.funded": "Escrow funded",
  "escrow.released": "Escrow released",
  "dispute.opened": "Dispute opened",
};

type TestStatus = "idle" | "sending" | "success" | "error";

/** Settings card letting a merchant register a webhook endpoint for order/escrow events. */
export function MerchantWebhookCard() {
  const [config, setConfig] = useState<MerchantWebhookConfig>(DEFAULT_MERCHANT_WEBHOOK_CONFIG);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(loadMerchantWebhookConfig());
  }, []);

  function toggleEvent(event: MerchantWebhookConfig["subscribedEvents"][number]) {
    setConfig((prev) => ({
      ...prev,
      subscribedEvents: prev.subscribedEvents.includes(event)
        ? prev.subscribedEvents.filter((e) => e !== event)
        : [...prev.subscribedEvents, event],
    }));
    setSaved(false);
  }

  function handleSave() {
    if (config.webhookUrl && !isValidWebhookUrl(config.webhookUrl)) {
      setUrlError("Webhook URL must use HTTPS.");
      return;
    }
    setUrlError(null);
    const next: MerchantWebhookConfig = {
      ...config,
      secretKey: config.secretKey || generateWebhookSecret(),
      isActive: Boolean(config.webhookUrl),
    };
    setConfig(next);
    saveMerchantWebhookConfig(next);
    setSaved(true);
  }

  async function handleSendTest() {
    if (!config.webhookUrl || !isValidWebhookUrl(config.webhookUrl)) {
      setUrlError("Enter a valid HTTPS webhook URL before sending a test.");
      return;
    }
    setTestStatus("sending");
    try {
      const res = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "webhook.test",
          timestamp: new Date().toISOString(),
          data: { message: "This is a test webhook from Delego." },
        }),
      });
      setTestStatus(res.ok ? "success" : "error");
    } catch {
      setTestStatus("error");
    }
  }

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Webhooks</h3>
        {config.isActive && <Badge tone="success">Active</Badge>}
      </div>
      <p style={{ fontSize: "0.8125rem", color: "#6b7280", marginTop: "0.25rem" }}>
        Receive HTTP POST notifications for new orders and escrow activity.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.75rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Webhook URL</span>
          <input
            type="url"
            value={config.webhookUrl}
            placeholder="https://your-server.example.com/webhooks/delego"
            onChange={(e) => {
              setConfig((prev) => ({ ...prev, webhookUrl: e.target.value }));
              setUrlError(null);
              setSaved(false);
            }}
            style={{
              padding: "0.5rem 0.625rem",
              borderRadius: "0.5rem",
              border: `1px solid ${urlError ? "#dc2626" : "#d1d5db"}`,
              fontSize: "0.8125rem",
            }}
          />
          {urlError && (
            <span role="alert" style={{ fontSize: "0.75rem", color: "#dc2626" }}>
              {urlError}
            </span>
          )}
        </label>

        {config.secretKey && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 600 }}>Signing secret</span>
            <code
              style={{
                padding: "0.5rem 0.625rem",
                borderRadius: "0.5rem",
                background: "#f3f4f6",
                fontSize: "0.75rem",
                wordBreak: "break-all",
              }}
            >
              {config.secretKey}
            </code>
          </div>
        )}

        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontSize: "0.8125rem", fontWeight: 600, marginBottom: "0.375rem" }}>
            Subscribed events
          </legend>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            {WEBHOOK_EVENT_TYPES.map((event) => (
              <label
                key={event}
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.8125rem" }}
              >
                <input
                  type="checkbox"
                  checked={config.subscribedEvents.includes(event)}
                  onChange={() => toggleEvent(event)}
                />
                {EVENT_LABELS[event]}
              </label>
            ))}
          </div>
        </fieldset>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleSave}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            Save
          </button>
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testStatus === "sending"}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid #d1d5db",
              background: "#fff",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: testStatus === "sending" ? "wait" : "pointer",
            }}
          >
            {testStatus === "sending" ? "Sending…" : "Send Test Webhook"}
          </button>
          {saved && <Badge tone="success">Saved</Badge>}
          {testStatus === "success" && <Badge tone="success">Test delivered</Badge>}
          {testStatus === "error" && <Badge tone="error">Test failed</Badge>}
        </div>
      </div>
    </Card>
  );
}
