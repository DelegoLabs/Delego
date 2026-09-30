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
    eventId: "evt_1",
    endpointUrl: "https://merchant.example.com/hooks",
    httpStatus: 200,
    deliveredAt: new Date("2026-02-10T12:00:00.000Z"),
    requestPayload: '{"orderId":"order-1"}',
    ...overrides,
  };
}

const LOGS: WebhookDeliveryLog[] = [
  log(),
  log({
    eventId: "evt_500",
    httpStatus: 500,
  }),
  log({
    eventId: "evt_404",
    httpStatus: 404,
  }),
];

beforeEach(() => {
  window.localStorage.clear();
});

function renderViewer(props: Partial<React.ComponentProps<typeof WebhookDeliveryLogViewer>> = {}) {
  return render(<WebhookDeliveryLogViewer logs={LOGS} {...props} />);
}

describe("WebhookDeliveryLogViewer", () => {
  // ─── Table rendering ─────────────────────────────────────────────────────────

  it("renders the table headers", () => {
    renderViewer();
    const headers = screen.getAllByRole("columnheader");
    expect(headers).toHaveLength(5);
    expect(headers[0]).toHaveTextContent("Event");
    expect(headers[1]).toHaveTextContent("Target URL");
    expect(headers[2]).toHaveTextContent("Status");
    expect(headers[3]).toHaveTextContent("Delivered");
    expect(headers[4]).toHaveTextContent("Actions");
  });

  it("renders a row for each delivery", () => {
    renderViewer();
    const rows = within(screen.getByTestId("webhook-log-table")).getAllByRole("row");
    expect(rows).toHaveLength(4); // 1 header + 3 body rows
  });

  it("summarises totals, successes, and failures", () => {
    renderViewer();
    expect(screen.getByTestId("log-summary-total")).toHaveTextContent("3 deliveries");
    expect(screen.getByTestId("log-summary-succeeded")).toHaveTextContent("1 delivered");
    expect(screen.getByTestId("log-summary-failed")).toHaveTextContent("2 failed");
  });

  // ─── Red badge + retry for non-2xx (#725 acceptance criterion) ───────────────

  it("badges a 2xx delivery as a success", () => {
    renderViewer();
    const badge = screen.getByTestId("webhook-status-evt_1");
    expect(badge).toHaveTextContent("200 OK");
  });

  it("badges every non-2xx delivery in red", () => {
    renderViewer();
    for (const id of ["evt_500", "evt_404"]) {
      const badge = screen.getByTestId(`webhook-status-${id}`);
      // tone="error" renders the badge with error classes, specifics depend on ui package
      expect(badge).toBeInTheDocument();
    }
  });

  it("offers a retry button only on failed rows", () => {
    renderViewer({ onRetry: vi.fn() });
    expect(screen.queryByTestId("webhook-retry-evt_1")).not.toBeInTheDocument();
    expect(screen.getByTestId("webhook-retry-evt_500")).toBeInTheDocument();
    expect(screen.getByTestId("webhook-retry-evt_404")).toBeInTheDocument();
  });

  it("hides the retry button when no retry handler is supplied", () => {
    renderViewer({ onRetry: undefined });
    expect(screen.queryByTestId("webhook-retry-evt_500")).not.toBeInTheDocument();
  });

  it("retries a failed delivery with one click", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    renderViewer({ onRetry });

    await user.click(screen.getByTestId("webhook-retry-evt_500"));

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0]).toMatchObject({
      eventId: "evt_500",
      httpStatus: 500,
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

    await user.click(screen.getByTestId("webhook-retry-evt_500"));
    expect(screen.queryByTestId("webhook-log-request")).not.toBeInTheDocument();
  });

  it("surfaces a retry failure", async () => {
    const onRetry = vi.fn(async () => {
      throw new Error("unreachable");
    });
    const user = userEvent.setup();
    renderViewer({ onRetry });

    await user.click(screen.getByTestId("webhook-retry-evt_500"));

    await waitFor(() =>
      expect(screen.getByTestId("webhook-retry-notice")).toHaveTextContent(
        /Retry of evt_500 failed/
      )
    );
  });

  // ─── Row detail ──────────────────────────────────────────────────────────────

  it("reveals the payload and response in a modal when a row is clicked", async () => {
    const user = userEvent.setup();
    renderViewer();

    expect(screen.queryByTestId("webhook-log-request")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("webhook-log-row-evt_1"));

    expect(screen.getByTestId("webhook-log-request")).toHaveTextContent(
      '"orderId": "order-1"'
    );
  });

  it("describes a rejected delivery in the response view", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.click(screen.getByTestId("webhook-log-row-evt_500"));

    const response = screen.getByTestId("webhook-log-response");
    expect(response).toHaveTextContent("Endpoint rejected event");
  });

  it("collapses the modal when the close button is clicked", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.click(screen.getByTestId("webhook-log-row-evt_1"));
    expect(screen.getByTestId("webhook-log-request")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByTestId("webhook-log-request")).not.toBeInTheDocument();
  });

  it("falls back to raw text when the snippet is truncated mid-JSON", async () => {
    const user = userEvent.setup();
    render(
      <WebhookDeliveryLogViewer
        logs={[log({ eventId: "evt_trunc", requestPayload: '{"orderId":"ord' })]}
      />
    );

    await user.click(screen.getByTestId("webhook-log-row-evt_trunc"));
    expect(screen.getByTestId("webhook-log-request")).toHaveTextContent('{"orderId":"ord');
  });

  it("shows a placeholder for an empty request body", async () => {
    const user = userEvent.setup();
    render(
      <WebhookDeliveryLogViewer logs={[log({ eventId: "evt_empty", requestPayload: "" })]} />
    );

    await user.click(screen.getByTestId("webhook-log-row-evt_empty"));
    expect(screen.getByTestId("webhook-log-request")).toHaveTextContent("(empty body)");
  });

  // ─── Filtering ───────────────────────────────────────────────────────────────

  it("filters to failures only", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.selectOptions(screen.getByLabelText("Outcome"), "error");

    const rows = within(screen.getByTestId("webhook-log-table")).getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 failures
    expect(screen.queryByTestId("webhook-log-row-evt_1")).not.toBeInTheDocument();
  });

  it("filters by the search box", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.type(screen.getByLabelText("Search"), "evt_500");

    expect(screen.getByTestId("webhook-log-row-evt_500")).toBeInTheDocument();
    expect(screen.queryByTestId("webhook-log-row-evt_1")).not.toBeInTheDocument();
  });

  // ─── Empty and stored states ─────────────────────────────────────────────────

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
    window.localStorage.setItem(WEBHOOK_LOG_STORAGE_KEY, JSON.stringify([log({ eventId: "evt_stored" })]));
    render(<WebhookDeliveryLogViewer />);
    expect(screen.getByTestId("webhook-log-row-evt_stored")).toBeInTheDocument();
  });
});
