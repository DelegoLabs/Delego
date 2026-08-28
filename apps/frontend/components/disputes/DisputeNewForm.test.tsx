import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithQueryClient } from "../../test/queryClient";
import { DisputeNewForm } from "./DisputeNewForm";
import { api } from "../../lib/api";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../../lib/api", () => ({
  api: {
    createDispute: vi.fn(),
  },
}));

const createDisputeMock = vi.mocked(api.createDispute);

describe("DisputeNewForm", () => {
  beforeEach(() => {
    createDisputeMock.mockReset();
    mockPush.mockReset();
  });

  it("pre-fills from the escalated issue's category/message and links the dispute via issueId", async () => {
    createDisputeMock.mockResolvedValue({
      data: {
        id: "dispute-1",
        orderId: "order-1",
        issueId: "issue-1",
        category: "damaged",
        message: "Box was crushed",
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      error: null,
    });

    renderWithQueryClient(
      <DisputeNewForm
        orderId="order-1"
        issueId="issue-1"
        initialCategory="damaged"
        initialMessage="Box was crushed"
      />
    );

    expect(screen.getByLabelText(/message/i)).toHaveValue("Box was crushed");

    fireEvent.click(screen.getByRole("button", { name: /submit dispute/i }));

    await waitFor(() => expect(createDisputeMock).toHaveBeenCalledTimes(1));
    const [orderId, payload] = createDisputeMock.mock.calls[0];
    expect(orderId).toBe("order-1");
    // Only Dispute-shaped fields are sent — no IssueStatus value ever leaks into the payload.
    expect(payload).toEqual({ category: "damaged", message: "Box was crushed", issueId: "issue-1" });
    expect(Object.values(payload)).not.toContain("open");
    expect(Object.values(payload)).not.toContain("acknowledged");
    expect(Object.values(payload)).not.toContain("escalated");

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/orders/order-1"));
  });

  it("falls back to 'other' when no valid category is pre-filled", () => {
    renderWithQueryClient(<DisputeNewForm orderId="order-1" initialCategory="not-a-real-category" />);
    expect(screen.getByLabelText(/category/i)).toHaveValue("other");
  });
});
