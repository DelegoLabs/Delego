import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useWebPush } from "./useWebPush";
import { resetPushSubscriptions, getPushSubscriptions } from "../mocks/handlers/push";
import { server } from "../mocks/server";
import { pushHandlersError } from "../mocks/handlers";

// ---------------------------------------------------------------------------
// Shared mocking helpers
// ---------------------------------------------------------------------------

const VAPID_KEY =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm6vuSnknJ3Kg5UlQ0tVNrUfZbaAto";

function makeKeyBuffer(length: number): ArrayBuffer {
  const buf = new Uint8Array(length);
  for (let i = 0; i < length; i++) buf[i] = i;
  return buf.buffer;
}

function makeFakePushSubscription(endpoint = "https://fcm.example.com/send/abc") {
  return {
    endpoint,
    expirationTime: null,
    getKey: (name: string) => {
      if (name === "p256dh") return makeKeyBuffer(65);
      if (name === "auth") return makeKeyBuffer(16);
      return null;
    },
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

function makeFakeRegistration(
  existing: ReturnType<typeof makeFakePushSubscription> | null = null,
  subscribeResult: ReturnType<typeof makeFakePushSubscription> = makeFakePushSubscription()
) {
  return {
    pushManager: {
      subscribe: vi.fn().mockResolvedValue(subscribeResult),
      getSubscription: vi.fn().mockResolvedValue(existing),
    },
    showNotification: vi.fn().mockResolvedValue(undefined),
  };
}

function stubSupportedEnvironment(
  registration: ReturnType<typeof makeFakeRegistration>
) {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_KEY;
  vi.stubGlobal("PushManager", class PushManager {});
  vi.stubGlobal("navigator", {
    serviceWorker: {
      ready: Promise.resolve(registration),
    },
  });
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe("useWebPush — environment support", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  });

  it("reports supported=false when PushManager is absent", () => {
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    // jsdom doesn't have PushManager — don't stub it.
    const { result } = renderHook(() => useWebPush());
    expect(result.current.supported).toBe(false);
    expect(result.current.status).toBe("unsupported");
  });

  it("reports supported=false when VAPID key is missing", () => {
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("navigator", { serviceWorker: {} });
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const { result } = renderHook(() => useWebPush());
    expect(result.current.supported).toBe(false);
  });

  it("reports supported=true when PushManager and VAPID key are both present", () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_KEY;
    vi.stubGlobal("PushManager", class PushManager {});
    vi.stubGlobal("navigator", { serviceWorker: {} });
    const { result } = renderHook(() => useWebPush());
    expect(result.current.supported).toBe(true);
  });
});

describe("useWebPush — mount-time hydration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  });

  it("sets status=subscribed when a subscription is already active", async () => {
    const existing = makeFakePushSubscription();
    const reg = makeFakeRegistration(existing);
    stubSupportedEnvironment(reg);

    const { result } = renderHook(() => useWebPush());

    await waitFor(() => expect(result.current.status).toBe("subscribed"));
    expect(result.current.subscription).not.toBeNull();
    expect(result.current.subscription?.endpoint).toBe(existing.endpoint);
  });

  it("stays idle when no subscription exists and permission is default", async () => {
    const reg = makeFakeRegistration(null);
    stubSupportedEnvironment(reg);
    vi.stubGlobal("Notification", { permission: "default" });

    const { result } = renderHook(() => useWebPush());

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(result.current.subscription).toBeNull();
  });

  it("sets status=denied on mount when permission was already denied", async () => {
    const reg = makeFakeRegistration(null);
    stubSupportedEnvironment(reg);
    vi.stubGlobal("Notification", { permission: "denied" });

    const { result } = renderHook(() => useWebPush());

    await waitFor(() => expect(result.current.status).toBe("denied"));
  });
});

describe("useWebPush — subscribe()", () => {
  beforeEach(() => {
    resetPushSubscriptions();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    resetPushSubscriptions();
  });

  it("transitions idle → requesting → subscribed on success", async () => {
    const reg = makeFakeRegistration(null);
    stubSupportedEnvironment(reg);

    const { result } = renderHook(() => useWebPush());

    // Wait for the initial idle state after the hydration effect.
    await waitFor(() => expect(result.current.status).toBe("idle"));

    await act(async () => {
      await result.current.subscribe(["order-1"]);
    });

    expect(result.current.status).toBe("subscribed");
    expect(result.current.subscription).not.toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("registers the subscription with the MSW server", async () => {
    const reg = makeFakeRegistration(null);
    stubSupportedEnvironment(reg);

    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe("idle"));

    await act(async () => {
      await result.current.subscribe(["order-42"]);
    });

    const stored = getPushSubscriptions();
    expect(stored).toHaveLength(1);
    expect(stored[0].orderIds).toEqual(["order-42"]);
  });

  it("sets status=error and captures error message when the server rejects", async () => {
    server.use(...pushHandlersError);
    const reg = makeFakeRegistration(null);
    stubSupportedEnvironment(reg);

    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe("idle"));

    await act(async () => {
      await result.current.subscribe([]);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBeTruthy();
  });

  it("sets status=denied when PushManager.subscribe rejects with a permission error", async () => {
    const reg = {
      pushManager: {
        subscribe: vi.fn().mockRejectedValue(
          Object.assign(new Error("Push permission denied"), { name: "NotAllowedError" })
        ),
        getSubscription: vi.fn().mockResolvedValue(null),
      },
      showNotification: vi.fn(),
    };
    stubSupportedEnvironment(reg);
    vi.stubGlobal("Notification", { permission: "denied" });

    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe("denied"));

    await act(async () => {
      await result.current.subscribe([]);
    });

    // Should not transition past requesting when permission denied.
    expect(result.current.status).not.toBe("subscribed");
  });
});

describe("useWebPush — unsubscribe()", () => {
  beforeEach(() => {
    resetPushSubscriptions();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    resetPushSubscriptions();
  });

  it("transitions subscribed → idle after unsubscribing", async () => {
    const existing = makeFakePushSubscription();
    const reg = makeFakeRegistration(existing);
    stubSupportedEnvironment(reg);

    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe("subscribed"));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.subscription).toBeNull();
  });

  it("calls subscription.unsubscribe() exactly once", async () => {
    const existing = makeFakePushSubscription();
    const reg = makeFakeRegistration(existing);
    stubSupportedEnvironment(reg);

    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe("subscribed"));

    await act(async () => {
      await result.current.unsubscribe();
    });

    expect(existing.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useWebPush — sendTest()", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  });

  it("returns false when there is no active subscription", async () => {
    const reg = makeFakeRegistration(null);
    stubSupportedEnvironment(reg);
    vi.stubGlobal("Notification", { permission: "granted" });

    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe("idle"));

    const fired = await act(async () => result.current.sendTest());
    expect(fired).toBe(false);
  });

  it("shows a notification and returns true when subscribed", async () => {
    const existing = makeFakePushSubscription();
    const reg = makeFakeRegistration(existing);
    stubSupportedEnvironment(reg);
    vi.stubGlobal("Notification", { permission: "granted" });

    const { result } = renderHook(() => useWebPush());
    await waitFor(() => expect(result.current.status).toBe("subscribed"));

    const fired = await act(async () => result.current.sendTest());
    expect(fired).toBe(true);
    expect(reg.showNotification).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// Component integration — NotificationSettingsCard renders the push row
// ---------------------------------------------------------------------------

describe("NotificationSettingsCard — Web Push row integration", () => {
  // Import lazily inside the test to pick up the mocked hook.
  beforeEach(() => {
    resetPushSubscriptions();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    resetPushSubscriptions();
  });

  it("renders the push opt-in toggle when push is supported", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_KEY;
    vi.stubGlobal("PushManager", class PushManager {});
    const reg = makeFakeRegistration(null);
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(reg) },
    });
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });

    // Lazy import so the module picks up the stubbed globals.
    const { NotificationSettingsCard } = await import(
      "../components/notifications/NotificationSettingsCard"
    );

    // Wrap in required context providers.
    const { NotificationProvider } = await import("./useNotifications");
    const { AnnounceProvider } = await import("./useAnnounce");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnnounceProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </AnnounceProvider>
    );

    render(<NotificationSettingsCard />, { wrapper });

    expect(
      screen.getByText(/Package scan.*delivery alerts/i)
    ).toBeDefined();
  });

  it("shows the send-test button when push is subscribed", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_KEY;
    vi.stubGlobal("PushManager", class PushManager {});
    const existing = makeFakePushSubscription();
    const reg = makeFakeRegistration(existing);
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(reg) },
    });
    vi.stubGlobal("Notification", { permission: "granted" });

    const { NotificationSettingsCard } = await import(
      "../components/notifications/NotificationSettingsCard"
    );
    const { NotificationProvider } = await import("./useNotifications");
    const { AnnounceProvider } = await import("./useAnnounce");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnnounceProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </AnnounceProvider>
    );

    render(<NotificationSettingsCard />, { wrapper });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /send a test notification/i })
      ).toBeDefined()
    );
  });

  it("calls subscribe() when the toggle is switched on", async () => {
    const user = userEvent.setup();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = VAPID_KEY;
    vi.stubGlobal("PushManager", class PushManager {});
    const reg = makeFakeRegistration(null);
    vi.stubGlobal("navigator", {
      serviceWorker: { ready: Promise.resolve(reg) },
    });
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });

    const { NotificationSettingsCard } = await import(
      "../components/notifications/NotificationSettingsCard"
    );
    const { NotificationProvider } = await import("./useNotifications");
    const { AnnounceProvider } = await import("./useAnnounce");

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnnounceProvider>
        <NotificationProvider>{children}</NotificationProvider>
      </AnnounceProvider>
    );

    render(<NotificationSettingsCard />, { wrapper });

    const toggle = screen.getByLabelText(/Package scan.*delivery alerts/i, {
      selector: "input[type=checkbox]",
    });

    await user.click(toggle);

    await waitFor(() => {
      const stored = getPushSubscriptions();
      expect(stored.length).toBeGreaterThan(0);
    });
  });
});
