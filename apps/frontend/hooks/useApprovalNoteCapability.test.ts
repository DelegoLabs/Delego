import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useApprovalNoteCapability } from "./useApprovalNoteCapability";

const mockDetect = vi.fn();
vi.mock("../services/payments", () => ({
  detectApprovalNoteCapability: () => mockDetect(),
}));

describe("useApprovalNoteCapability", () => {
  beforeEach(() => {
    mockDetect.mockReset();
  });

  it("defaults to false while the probe is in flight (the safe fallback)", () => {
    mockDetect.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useApprovalNoteCapability());
    expect(result.current).toBe(false);
  });

  it("becomes true once the API confirms approvalNote support", async () => {
    mockDetect.mockResolvedValue(true);
    const { result } = renderHook(() => useApprovalNoteCapability());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("stays false when the capability probe resolves false", async () => {
    mockDetect.mockResolvedValue(false);
    const { result } = renderHook(() => useApprovalNoteCapability());
    await waitFor(() => expect(mockDetect).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });
});
