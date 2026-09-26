import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebhookDeliveryLogViewer } from "./WebhookDeliveryLogViewer";
import {
  WEBHOOK_LOG_STORAGE_KEY,
  type WebhookDeliveryLog,
} from "../../lib/webhookDeliveryLog";

function log(overrides: Partial<WebhookDeliveryLog> = {}): WebhookDeliveryLog {
  return {
    id: "whd_1",
    eventId: "evt_ok",
    eventType: "order.created",
    targetUrl: "https://merchant.example.com/hooks",
    statusCode: 200,
    durationMs: 120,
    deliveredAt: "2026-02-10T12:00:00.000Z",
    requestBodySnippet: '{"orderId":"order-1"}',
    ...overrides,
  };
}

const LOGS: WebhookDeliveryLog[] = [
  log(),
  log({
    id: "whd_2",
    eventId: "evt_500",
    eventType: "escrow.funded",
    statusCode: 500,
    durationMs: 1420,
    deliveredAt: "2026-02-11T12:00:00.000Z",
    requestBodySnippet: '{"escrowId":"escrow-9"}',
  }),
  log({
    id: "whd_3",
    eventId: "evt_404",
    eventType: "dispute.opened",
    statusCode: 404,
    durationMs: 55,
    deliveredAt: "2026-02-12T12:00:00.000Z",
    requestBodySnippet: '{"disputeId":"dispute-3"}',
  }),
];

function renderViewer(props: Partial<React.ComponentProps<typeof WebhookDeliveryLogViewer>> = {}) {
  return render(<WebhookDeliveryLogViewer logs={LOGS} {...props} />);
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("WebhookDeliveryLogViewer", () => {
  it("renders one row per delivery, newest first", () => {
    renderViewer();

    const rows = within(screen.getByTestId("webhook-log-table")).getAllByRole("row");
    // header + 3 deliveries
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent("evt_404");
    expect(rows[3]).toHaveTextContent("evt_ok");
  });

  it("shows the event, type, URL, status, and duration for each delivery", () => {
    renderViewer();

    const row = screen.getByTestId("webhook-log-row-whd_2");
    expect(row).toHaveTextContent("evt_500");
    expect(row).toHaveTextContent("escrow.funded");
    expect(row).toHaveTextContent("https://merchant.example.com/hooks");
    expect(row).toHaveTextContent("500 Internal Server Error");
    expect(row).toHaveTextContent("1.42 s");
  });

  it("summarises totals, successes, and failures", () => {
    renderViewer();

    expect(screen.getByTestId("log-summary-total")).toHaveTextContent("3 deliveries");
    expect(screen.getByTestId("log-summary-succeeded")).toHaveTextContent("1 delivered");
    expect(screen.getByTestId("log-summary-failed")).toHaveTextContent("2 failed");
  });

  // ─── Red badge + retry for non-2xx (#725 acceptance criterion) ────────────

  it("badges a 2xx delivery as a success", () => {
    renderViewer();
    const badge = screen.getByTestId("webhook-status-whd_1");
    expect(badge).toHaveTextContent("200 OK");
    expect(badge.style.color).toBe("rgb(22, 101, 52)");
  });

  it("badges every non-2xx delivery in red", () => {
    renderViewer();

    for (const id of ["whd_2", "whd_3"]) {
      const badge = screen.getByTestId(`webhook-status-${id}`);
      // toneStyles.error → color:#dc2626
      expect(badge.style.color).toBe("rgb(220, 38, 38)");
    }
  });

  it("offers a retry button only on failed rows", () => {
    renderViewer({ onRetry: vi.fn() });

    expect(screen.queryByTestId("webhook-retry-whd_1")).not.toBeInTheDocument();
    expect(screen.getByTestId("webhook-retry-whd_2")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-retry-whd_3")).toBeInTheDocument();
  });

  it("hides the retry button when no retry handler is supplied", () => {
    renderViewer({ onRetry: undefined });
    expect(screen.queryByTestId("webhook-retry-whd_2")).not.toBeInTheDocument();
  });

  it("retries a failed delivery with one click", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderViewer({ onRetry });

    await user.click(screen.getByTestId("webhook-retry-whd_2"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({
      id: "whd_2",
      eventId: "evt_500",
      statusCode: 500,
    });
    await waitFor(() =>
      expect(screen.getByTestId("webhook-retry-notice")).toHaveTextContent(
        "Retried evt_500."
      )
    );
  });

  it("does not open the detail panel when retry is clicked", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderViewer({ onRetry });

    await user.click(screen.getByTestId("webhook-retry-whd_2"));

    expect(screen.queryByTestId("webhook-log-request")).not.toBeInTheDocument();
  });

  it("surfaces a retry failure", async () => {
    const onRetry = vi.fn(async () => {
      throw new Error("unreachable");
    });
    const user = userEvent.setup();
    renderViewer({ onRetry });

    await user.click(screen.getByTestId("webhook-retry-whd_2"));

    await waitFor(() =>
      expect(screen.getByTestId("webhook-retry-notice")).toHaveTextContent(
        /Retry of evt_500 failed/
      )
    );
  });

  // ─── Row detail ───────────────────────────────────────────────────────────

  it("reveals the payload and response when a row is clicked", async () => {
    const user = userEvent.setup();
    renderViewer();

    expect(screen.queryByTestId("webhook-log-request")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("webhook-log-row-whd_1"));

    expect(screen.getByTestId("webhook-log-request")).toHaveTextContent(
      '"orderId": "order-1"'
    );
    const response = screen.getByTestId("webhook-log-response");
    expect(response).toHaveTextContent('"statusCode": 200');
    expect(response).toHaveTextContent('"status": "200 OK"');
  });

  it("describes a rejected delivery in the response view", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.click(screen.getByTestId("webhook-log-row-whd_2"));

    const response = screen.getByTestId("webhook-log-response");
    expect(response).toHaveTextContent('"statusCode": 500');
    expect(response).toHaveTextContent("Endpoint rejected escrow.funded");
  });

  it("collapses the detail panel when the same row is clicked again", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.click(screen.getByTestId("webhook-log-row-whd_1"));
    expect(screen.getByTestId("webhook-log-request")).toBeInTheDocument();

    await user.click(screen.getByTestId("webhook-log-row-whd_1"));
    expect(screen.queryByTestId("webhook-log-request")).not.toBeInTheDocument();
  });

  it("falls back to raw text when the snippet is truncated mid-JSON", async () => {
    const user = userEvent.setup();
    render(
      <WebhookDeliveryLogViewer
        logs={[log({ id: "whd_trunc", requestBodySnippet: '{"orderId":"ord' })]}
      />
    );

    await user.click(screen.getByTestId("webhook-log-row-whd_trunc"));
    expect(screen.getByTestId("webhook-log-request")).toHaveTextContent('{"orderId":"ord');
  });

  it("shows a placeholder for an empty request body", async () => {
    const user = userEvent.setup();
    render(
      <WebhookDeliveryLogViewer logs={[log({ id: "whd_empty", requestBodySnippet: "" })]} />
    );

    await user.click(screen.getByTestId("webhook-log-row-whd_empty"));
    expect(screen.getByTestId("webhook-log-request")).toHaveTextContent("(empty body)");
  });

  // ─── Filtering ────────────────────────────────────────────────────────────

  it("filters to failures only", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.selectOptions(screen.getByLabelText("Outcome"), "error");

    const rows = within(screen.getByTestId("webhook-log-table")).getAllByRole("row");
    expect(rows).toHaveLength(3);
    expect(screen.queryByTestId("webhook-log-row-whd_1")).not.toBeInTheDocument();
  });

  it("filters by the search box", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.type(screen.getByLabelText("Search"), "escrow.funded");

    expect(screen.getByTestId("webhook-log-row-whd_2")).toBeInTheDocument();
    expect(screen.queryByTestId("webhook-log-row-whd_1")).not.toBeInTheDocument();
  });

  // ─── Empty and stored states ─────────────────────────────────────────────

  it("explains an empty log", () => {
    render(<WebhookDeliveryLogViewer logs={[]} />);
    expect(screen.getByText(/Webhook deliveries will appear here/)).toBeInTheDocument();
    expect(screen.queryByTestId("webhook-log-table")).not.toBeInTheDocument();
  });

  it("explains that filters matched nothing", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.type(screen.getByLabelText("Search"), "zzz-no-match");
    expect(screen.getByText(/No deliveries match the current filters/)).toBeInTheDocument();
  });

  it("falls back to the persisted log when no logs prop is given", () => {
    window.localStorage.setItem(WEBHOOK_LOG_STORAGE_KEY, JSON.stringify([log({ id: "whd_stored" })]));
    render(<WebhookDeliveryLogViewer />);
    expect(screen.getByTestId("webhook-log-row-whd_stored")).toBeInTheDocument();
  });
});
