"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  changelogFromAnnouncements,
  clearDeferredAt,
  isBlockingOverlayOpen,
  isDeferralExpired,
  readDeferredAt,
  shouldApplyUpdate,
  updatePromptCopy,
  writeDeferredAt,
  type SwUpdateCopy,
} from "../lib/swUpdate";
import type { Announcement } from "./useAnnouncements";

const ANNOUNCEMENTS_URL =
  process.env.NEXT_PUBLIC_ANNOUNCEMENTS_URL || "/announcements.json";

export interface UseServiceWorkerUpdateResult {
  waiting: boolean;
  copy: SwUpdateCopy;
  reload: () => Promise<void>;
  dismiss: () => void;
}

interface UseServiceWorkerUpdateOptions {
  /** Injected for tests — production reads `navigator.serviceWorker`. */
  registration?: ServiceWorkerRegistration | null;
  getRegistration?: () => Promise<ServiceWorkerRegistration | null | undefined>;
  now?: () => number;
  documentRoot?: ParentNode | null;
}

/**
 * Detects a waiting service worker (same registration APIs `usePwaInstall`
 * sits next to) and exposes reload / dismiss. Dismiss defers until the next
 * idle navigation, or 7 days — whichever comes first.
 */
export function useServiceWorkerUpdate(
  options: UseServiceWorkerUpdateOptions = {}
): UseServiceWorkerUpdateResult {
  const pathname = usePathname();
  const now = options.now ?? Date.now;
  const [waiting, setWaiting] = useState(false);
  const [changelog, setChangelog] = useState<string | null>(null);
  const [deferredAt, setDeferredAt] = useState<number | null>(null);
  const [navigating, setNavigating] = useState(false);
  const previousPath = useRef(pathname);
  const waitingWorker = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    try {
      setDeferredAt(readDeferredAt(window.localStorage));
    } catch {
      setDeferredAt(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(ANNOUNCEMENTS_URL, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: unknown) => {
        if (cancelled || !Array.isArray(data)) return;
        setChangelog(
          changelogFromAnnouncements(data as Announcement[], "v1")
        );
      })
      .catch(() => {
        // Feed unavailable — toast still works with generic copy.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const attach = useCallback((reg: ServiceWorkerRegistration) => {
    const track = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (worker.state === "installed" && navigator.serviceWorker.controller) {
        waitingWorker.current = worker;
        setWaiting(true);
      }
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          waitingWorker.current = worker;
          setWaiting(true);
        }
        if (worker.state === "activated") {
          waitingWorker.current = null;
          setWaiting(false);
        }
      });
    };

    if (reg.waiting) {
      waitingWorker.current = reg.waiting;
      setWaiting(true);
    }
    track(reg.installing);
    track(reg.waiting);
    reg.addEventListener("updatefound", () => track(reg.installing));
  }, []);

  const registration = options.registration;
  const getRegistration = options.getRegistration;
  const documentRoot = options.documentRoot;

  useEffect(() => {
    if (!("serviceWorker" in navigator) && !getRegistration && registration === undefined) {
      return;
    }

    let cancelled = false;
    const resolveReg = async () => {
      if (registration !== undefined) return registration;
      if (getRegistration) return getRegistration();
      if (!("serviceWorker" in navigator)) return null;
      return navigator.serviceWorker.getRegistration();
    };

    void resolveReg().then((reg) => {
      if (cancelled || !reg) return;
      attach(reg);
    });

    return () => {
      cancelled = true;
    };
  }, [attach, getRegistration, registration]);

  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setNavigating(true);
    const timer = window.setTimeout(() => setNavigating(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  const apply = useCallback(async () => {
    const worker = waitingWorker.current;
    if (!worker) return;
    worker.postMessage("SKIP_WAITING");
    clearDeferredAt(window.localStorage);
    const reload = () => window.location.reload();
    navigator.serviceWorker?.addEventListener("controllerchange", reload, {
      once: true,
    });
    // Fallback if controllerchange never fires (already controlling).
    window.setTimeout(reload, 400);
  }, []);

  const tryApply = useCallback(() => {
    const overlayOpen = isBlockingOverlayOpen(
      documentRoot ?? (typeof document !== "undefined" ? document : null)
    );
    const expired = isDeferralExpired(deferredAt, now());
    if (
      shouldApplyUpdate({
        hasWaitingWorker: waiting,
        overlayOpen,
        deferred: deferredAt !== null,
        expired,
        navigating,
      })
    ) {
      void apply();
    }
  }, [apply, deferredAt, documentRoot, navigating, now, waiting]);

  useEffect(() => {
    tryApply();
  }, [tryApply]);

  useEffect(() => {
    function onWake() {
      tryApply();
    }
    window.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      window.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [tryApply]);

  const dismiss = useCallback(() => {
    const at = now();
    writeDeferredAt(window.localStorage, at);
    setDeferredAt(at);
  }, [now]);

  const expired = isDeferralExpired(deferredAt, now());
  const copy = updatePromptCopy(expired, changelog);

  return {
    waiting,
    copy,
    reload: apply,
    dismiss,
  };
}
