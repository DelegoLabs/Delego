import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  vapidPublicKeyToUint8Array,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestNotification,
  type PushSubscriptionPayload,
} from "./webPush";
import { resetPushSubscriptions, getPushSubscriptions } from "../mocks/handlers/push";
import { server } from "../mocks/server";
import { pushHandlersError } from "../mocks/handlers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal fake PushSubscription compatible with the browser API. */
function makeFakePushSubscription(endpoint = "https://fcm.example.com/send/abc123") {
  const p256dhBytes = new Uint8Array(65);
  const authBytes = new Uint8Array(16);
  // Fill with deterministic values so base64url output is stable.
  for (let i = 0; i < p256dhBytes.length; i++) p256dhBytes[i] = i;
  for (let i = 0; i < authBytes.length; i++) authBytes[i] = i * 2;

  return {
    endpoint,
    expirationTime: null,
    getKey: (name: string) => {
      if (name === "p256dh") return p256dhBytes.buffer;
      if (name === "auth") return authBytes.buffer;
      return null;
    },
    unsubscribe: vi.fn().mockResolvedValue(true),
    toJSON: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

/** Build a minimal fake ServiceWorkerRegistration. */
function makeFakeRegistration(subscription: ReturnType<typeof makeFakePushSubscription> | null = null) {
  return {
    pushManager: {
      subscribe: vi.fn().mockResolvedValue(makeFakePushSubscription()),
      getSubscription: vi.fn().mockResolvedValue(subscription),
    },
    showNotification: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// vapidPublicKeyToUint8Array
// ---------------------------------------------------------------------------

describe("vapidPublicKeyToUint8Array", () => {
  it("converts a base64url string to a Uint8Array of the right length", () => {
    // A real 65-byte VAPID public key encoded as base64url (no padding).
    const key =
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm6vuSnknJ3Kg5UlQ0tVNrUfZbaAto";
    const result = vapidPublicKeyToUint8Array(key);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(65);
  });

  it("handles base64url keys with or without padding correctly", () => {
    // Two keys of slightly different lengths to exercise padding paths.
    const key1 =
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm6vuSnknJ3Kg5UlQ0tVNrUfZbaAto";
    const key2 =
      "BNoVCpFqVpNXnMqJVKHxKnDqGBSfCfH5D8yNp7N_VkbJXZFVlP3UkBMmEd9VaNKtS2uI2o3ClQLs7A9D0bC2OLc";
    expect(() => vapidPublicKeyToUint8Array(key1)).not.toThrow();
    expect(() => vapidPublicKeyToUint8Array(key2)).not.toThrow();
  });

  it("is invertible — re-encoding the output yields the original key", () => {
    const key =
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm6vuSnknJ3Kg5UlQ0tVNrUfZbaAto";
    const bytes = vapidPublicKeyToUint8Array(key);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    const reEncoded = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(reEncoded).toBe(key);
  });
});

// ---------------------------------------------------------------------------
// isPushSupported
// ---------------------------------------------------------------------------

describe("isPushSupported", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when running in a non-browser environment", () => {
    // Simulate server-side (no window).
    vi.stubGlobal("window", undefined);
    expect(isPushSupported()).toBe(false);
  });

  it("returns false when serviceWorker is absent from navigator", () => {
    vi.stubGlobal("navigator", {} as Navigator);
    expect(isPushSupported()).toBe(false);
  });

  it("returns false when PushManager is absent from window", () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    // PushManager not on window in jsdom by default.
    expect(isPushSupported()).toBe(false);
  });

  it("returns true when both serviceWorker and PushManager are present", () => {
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("PushManager", class PushManager {});
    expect(isPushSupported()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// subscribeToPush
// ---------------------------------------------------------------------------

describe("subscribeToPush", () => {
  const VAPID_KEY =
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm6vuSnknJ3Kg5UlQ0tVNrUfZbaAto";

  beforeEach(() => {
    resetPushSubscriptions();

    const fakeRegistration = makeFakeRegistration();
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve(fakeRegistration),
      },
    });
    vi.stubGlobal("PushManager", class PushManager {});
    // Set the VAPID key via process.env so lib/env.ts can pick it up.
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  });

  it("returns a PushSubscriptionPayload with the expected shape", async () => {
    const payload = await subscribeToPush(["order-1", "order-2"]);
    expect(payload).not.toBeNull();
    expect(payload).toMatchObject<PushSubscriptionPayload>({
      endpoint: expect.any(String),
      keys: {
        p256dh: expect.any(String),
        auth: expect.any(String),
      },
      orderIds: ["order-1", "order-2"],
    });
  });

  it("registers the subscription with the MSW push handler", async () => {
    await subscribeToPush(["order-99"]);
    const stored = getPushSubscriptions();
    expect(stored).toHaveLength(1);
    expect(stored[0].orderIds).toEqual(["order-99"]);
  });

  it("defaults to an empty orderIds array when none are provided", async () => {
    const payload = await subscribeToPush();
    expect(payload?.orderIds).toEqual([]);
  });

  it("unsubscribes and throws when the server responds with an error", async () => {
    server.use(...pushHandlersError);
    const fakeSubscription = makeFakePushSubscription();
    const fakeRegistration = {
      pushManager: {
        subscribe: vi.fn().mockResolvedValue(fakeSubscription),
        getSubscription: vi.fn().mockResolvedValue(null),
      },
      showNotification: vi.fn(),
    };
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(fakeRegistration) },
    });

    await expect(subscribeToPush([])).rejects.toThrow();
    expect(fakeSubscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("returns null in demo mode without touching the push API", async () => {
    // Activate demo mode.
    sessionStorage.setItem("delego_demo_mode", "true");
    try {
      const result = await subscribeToPush([]);
      expect(result).toBeNull();
    } finally {
      sessionStorage.removeItem("delego_demo_mode");
    }
  });
});

// ---------------------------------------------------------------------------
// unsubscribeFromPush
// ---------------------------------------------------------------------------

describe("unsubscribeFromPush", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetPushSubscriptions();
  });

  it("returns false when there is no active subscription", async () => {
    const fakeRegistration = makeFakeRegistration(null);
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(fakeRegistration) },
    });
    vi.stubGlobal("PushManager", class PushManager {});

    const result = await unsubscribeFromPush();
    expect(result).toBe(false);
  });

  it("returns true and calls subscription.unsubscribe() when subscribed", async () => {
    const fakeSubscription = makeFakePushSubscription();
    const fakeRegistration = makeFakeRegistration(fakeSubscription as unknown as ReturnType<typeof makeFakePushSubscription>);
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(fakeRegistration) },
    });
    vi.stubGlobal("PushManager", class PushManager {});

    const result = await unsubscribeFromPush();
    expect(result).toBe(true);
    expect(fakeSubscription.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("still unsubscribes locally even if the server DELETE fails", async () => {
    server.use(...pushHandlersError);
    const fakeSubscription = makeFakePushSubscription();
    const fakeRegistration = makeFakeRegistration(fakeSubscription as unknown as ReturnType<typeof makeFakePushSubscription>);
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(fakeRegistration) },
    });
    vi.stubGlobal("PushManager", class PushManager {});

    const result = await unsubscribeFromPush();
    expect(result).toBe(true);
    expect(fakeSubscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// sendTestNotification
// ---------------------------------------------------------------------------

describe("sendTestNotification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when PushManager is unavailable", async () => {
    vi.stubGlobal("PushManager", undefined);
    const result = await sendTestNotification();
    expect(result).toBe(false);
  });

  it("returns false when Notification permission is not granted", async () => {
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("navigator", { serviceWorker: {} });
    vi.stubGlobal("Notification", { permission: "default" });
    const result = await sendTestNotification();
    expect(result).toBe(false);
  });

  it("returns false when there is no active subscription", async () => {
    const fakeRegistration = makeFakeRegistration(null);
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(fakeRegistration) },
    });
    vi.stubGlobal("Notification", { permission: "granted" });

    const result = await sendTestNotification();
    expect(result).toBe(false);
  });

  it("shows a notification and returns true when subscribed and permission is granted", async () => {
    const fakeSubscription = makeFakePushSubscription();
    const fakeRegistration = makeFakeRegistration(fakeSubscription as unknown as ReturnType<typeof makeFakePushSubscription>);
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(fakeRegistration) },
    });
    vi.stubGlobal("Notification", { permission: "granted" });

    const result = await sendTestNotification();
    expect(result).toBe(true);
    expect(fakeRegistration.showNotification).toHaveBeenCalledOnce();
    expect(fakeRegistration.showNotification).toHaveBeenCalledWith(
      expect.stringContaining("Delego"),
      expect.objectContaining({ tag: "delego-push-test" })
    );
  });
});
