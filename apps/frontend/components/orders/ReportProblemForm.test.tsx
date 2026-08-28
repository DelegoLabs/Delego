import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithQueryClient } from "../../test/queryClient";
import { ReportProblemForm } from "./ReportProblemForm";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    createOrderIssue: vi.fn(),
  },
}));

const createOrderIssueMock = vi.mocked(api.createOrderIssue);

describe("ReportProblemForm", () => {
  beforeEach(() => {
    createOrderIssueMock.mockReset();
  });

  it("submits only OrderIssue fields (category, message, photoUrl) — never a status or dispute field", async () => {
    createOrderIssueMock.mockResolvedValue({
      data: {
        id: "issue-1",
        orderId: "order-1",
        reporterUserId: "user-1",
        category: "damaged",
        message: "It arrived broken",
        photoUrl: null,
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: null,
      },
      error: null,
    });

    const onSuccess = vi.fn();
    renderWithQueryClient(<ReportProblemForm orderId="order-1" onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/what went wrong/i), { target: { value: "damaged" } });
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "It arrived broken" } });
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(createOrderIssueMock).toHaveBeenCalledTimes(1));

    const [orderId, payload] = createOrderIssueMock.mock.calls[0];
    expect(orderId).toBe("order-1");
    expect(payload).toEqual({ category: "damaged", message: "It arrived broken", photoUrl: undefined });
    expect(payload).not.toHaveProperty("status");

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("omits empty optional fields rather than sending empty strings", async () => {
    createOrderIssueMock.mockResolvedValue({
      data: {
        id: "issue-2",
        orderId: "order-1",
        reporterUserId: "user-1",
        category: "late",
        message: null,
        photoUrl: null,
        status: "open",
        createdAt: new Date(),
        updatedAt: new Date(),
        resolvedAt: null,
      },
      error: null,
    });

    renderWithQueryClient(<ReportProblemForm orderId="order-1" />);
    fireEvent.click(screen.getByRole("button", { name: /submit report/i }));

    await waitFor(() => expect(createOrderIssueMock).toHaveBeenCalledTimes(1));
    const [, payload] = createOrderIssueMock.mock.calls[0];
    expect(payload.message).toBeUndefined();
    expect(payload.photoUrl).toBeUndefined();
  });
});
