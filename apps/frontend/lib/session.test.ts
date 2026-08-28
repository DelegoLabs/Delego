import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SESSION_PING_PATH,
  consumeSessionInterrupted,
  loginRedirectUrl,
  markSessionInterrupted,
  pingSession,
} from "./session";

describe("loginRedirectUrl", () => {
  it("encodes the current path and query into ?next=", () => {
    expect(loginRedirectUrl("https://app.test/delegations/new?step=2")).toBe(
      "/login?next=%2Fdelegations%2Fnew%3Fstep%3D2"
    );
  });

  it("always produces a /login?next= url", () => {
    expect(loginRedirectUrl("/wallet")).toBe("/login?next=%2Fwallet");
    expect(loginRedirectUrl("")).toMatch(/^\/login\?next=/);
  });
});

describe("session interrupted flag", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("is read once and then cleared", () => {
    markSessionInterrupted();
    expect(consumeSessionInterrupted()).toBe(true);
    expect(consumeSessionInterrupted()).toBe(false);
  });

  it("is false when never marked", () => {
    expect(consumeSessionInterrupted()).toBe(false);
  });
});

describe("pingSession", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hits the keep-alive path and resolves true on a healthy response", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await expect(pingSession()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(SESSION_PING_PATH);
  });

  it("resolves false on 401/403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await expect(pingSession()).resolves.toBe(false);
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    await expect(pingSession()).resolves.toBe(false);
  });

  it("resolves false on any other non-ok status", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(pingSession()).resolves.toBe(false);
  });

  it("resolves false (never rejects) on a network error", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(pingSession()).resolves.toBe(false);
  });
});
