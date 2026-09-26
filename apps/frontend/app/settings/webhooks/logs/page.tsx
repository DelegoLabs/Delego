"use client";

import { useCallback, useState } from "react";
import { Button } from "@delegolabs/ui";
import { WebhookDeliveryLogViewer } from "../../../../components/settings/WebhookDeliveryLogViewer";
import {
  buildDeliveryLog,
  clearWebhookDeliveryLogs,
  recordWebhookDelivery,
  type WebhookDeliveryLog,
} from "../../../../lib/webhookDeliveryLog";

/**
 * Webhook delivery diagnostics (#725).
 *
 * Re-delivery is a direct POST from the browser, matching the "send test
 * webhook" path in `MerchantWebhookCard`. The gateway does not expose a
 * delivery-list endpoint yet, so entries are appended client-side.
 */
export default function WebhookLogsPage() {
  const [logs, setLogs] = useState<WebhookDeliveryLog[] | undefined>(undefined);

  const handleRetry = useCallback(async (log: WebhookDeliveryLog) => {
    const response = await fetch(log.targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: log.requestBodySnippet,
    });
    const retried = buildDeliveryLog({
      eventId: log.eventId,
      eventType: log.eventType,
      targetUrl: log.targetUrl,
      statusCode: response.status,
      durationMs: 0,
      requestBody: log.requestBodySnippet,
    });
    setLogs(recordWebhookDelivery(retried));
    if (!response.ok) {
      throw new Error(`Endpoint returned ${response.status}.`);
    }
  }, []);

  const handleClear = useCallback(() => {
    clearWebhookDeliveryLogs();
    setLogs([]);
  }, []);

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Webhook activity</h1>
        <p>Recent outgoing deliveries with status codes, timings, and payloads.</p>
      </header>

      <WebhookDeliveryLogViewer logs={logs} onRetry={handleRetry} />

      <div className="form-actions">
        <Button variant="ghost" type="button" onClick={handleClear}>
          Clear log
        </Button>
        <Button
          variant="secondary"
          type="button"
          onClick={() => setLogs(undefined)}
        >
          Reload from storage
        </Button>
      </div>
    </div>
  );
}
