import { describe, expect, it, vi } from "vitest";
import { SESSION_PURGED_EVENT, purgeSensitiveSessionState } from "./sessionPurge";
import { clearSessionKey } from "./session/sessionKeyClient";

vi.mock("./session/sessionKeyClient", () => ({
  clearSessionKey: vi.fn().mockResolvedValue(undefined),
}));

describe("purgeSensitiveSessionState", () => {
  it("wipes signing keys, the session grant, sessionStorage and local journals", async () => {
    window.localStorage.setItem("delego_session_key_grant", "{}");
    window.localStorage.setItem("delego_tracked_txs", "[]");
    window.sessionStorage.setItem("delego:anything", "secret");
    const onPurged = vi.fn();
    window.addEventListener(SESSION_PURGED_EVENT, onPurged);

    await purgeSensitiveSessionState();

    expect(clearSessionKey).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("delego_session_key_grant")).toBeNull();
    expect(window.localStorage.getItem("delego_tracked_txs")).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
    expect(onPurged).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_PURGED_EVENT, onPurged);
  });

  it("still completes when one step fails", async () => {
    vi.mocked(clearSessionKey).mockRejectedValueOnce(new Error("worker gone"));
    window.sessionStorage.setItem("k", "v");
    await expect(purgeSensitiveSessionState()).resolves.toBeUndefined();
    expect(window.sessionStorage.length).toBe(0);
  });
});
