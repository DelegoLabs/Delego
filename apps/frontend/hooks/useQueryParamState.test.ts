import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useQueryParamState, stringParamCodec } from "./useQueryParamState";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/orders",
  useSearchParams: () => mockSearchParams,
}));

describe("useQueryParamState", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockSearchParams = new URLSearchParams();
  });

  it("starts at the default value and reports hydrated after the initial URL read", async () => {
    const { result } = renderHook(() =>
      useQueryParamState<string>({ key: "q", defaultValue: "" })
    );

    await waitFor(() => expect(result.current[2].hydrated).toBe(true));
    expect(result.current[0]).toBe("");
  });

  it("hydrates from an existing query param", async () => {
    mockSearchParams = new URLSearchParams("q=%22hello%22");

    const { result } = renderHook(() =>
      useQueryParamState<string>({ key: "q", defaultValue: "" })
    );

    await waitFor(() => expect(result.current[2].hydrated).toBe(true));
    expect(result.current[0]).toBe("hello");
  });

  it("falls back to the default when the param is invalid JSON", async () => {
    mockSearchParams = new URLSearchParams("q=not-json");

    const { result } = renderHook(() =>
      useQueryParamState<string>({ key: "q", defaultValue: "fallback" })
    );

    await waitFor(() => expect(result.current[2].hydrated).toBe(true));
    expect(result.current[0]).toBe("fallback");
  });

  it("pushes an updated URL when the setter is called", async () => {
    const { result } = renderHook(() =>
      useQueryParamState<string[]>({ key: "statuses", defaultValue: [] })
    );
    await waitFor(() => expect(result.current[2].hydrated).toBe(true));

    act(() => {
      result.current[1](["approved", "settled"]);
    });

    expect(result.current[0]).toEqual(["approved", "settled"]);
    expect(mockPush).toHaveBeenCalledWith(
      `/orders?statuses=${encodeURIComponent(JSON.stringify(["approved", "settled"]))}`,
      { scroll: false }
    );
  });

  it("removes the param from the URL when set back to a value that encodes to null", async () => {
    mockSearchParams = new URLSearchParams("q=%22hello%22");
    const { result } = renderHook(() =>
      useQueryParamState<string | null>({
        key: "q",
        defaultValue: null,
        codec: {
          encode: (v) => (v === null ? null : JSON.stringify(v)),
          decode: (raw) => JSON.parse(raw),
        },
      })
    );
    await waitFor(() => expect(result.current[2].hydrated).toBe(true));

    act(() => {
      result.current[1](null);
    });

    expect(mockPush).toHaveBeenCalledWith("/orders", { scroll: false });
  });

  describe("stringParamCodec", () => {
    it("hydrates a plain (unquoted) string param", async () => {
      mockSearchParams = new URLSearchParams("decision=approved");
      const { result } = renderHook(() =>
        useQueryParamState<string>({
          key: "decision",
          defaultValue: "",
          codec: stringParamCodec(),
        })
      );
      await waitFor(() => expect(result.current[2].hydrated).toBe(true));
      expect(result.current[0]).toBe("approved");
    });

    it("writes the raw value and drops the param when set back to empty", async () => {
      const { result } = renderHook(() =>
        useQueryParamState<string>({
          key: "decision",
          defaultValue: "",
          codec: stringParamCodec(),
        })
      );
      await waitFor(() => expect(result.current[2].hydrated).toBe(true));

      act(() => result.current[1]("rejected"));
      expect(mockPush).toHaveBeenLastCalledWith("/orders?decision=rejected", {
        scroll: false,
      });

      act(() => result.current[1](""));
      expect(mockPush).toHaveBeenLastCalledWith("/orders", { scroll: false });
    });
  });
});
