"use client";

import { useEffect, useState } from "react";
import { detectDualControlCapability } from "../services/payments";

/**
 * Whether the API currently advertises dual-control approval support
 * (#574). Defaults to `false` (the safe, already-shipped single-approval
 * path) until the probe resolves, and stays `false` on any failure —
 * network error, non-2xx, or a capabilities payload that doesn't say yes —
 * so an outage or an older gateway degrades gracefully instead of stranding
 * approvers behind a UI waiting on a countersignature the API can't honor.
 */
export function useDualControlCapability(): boolean {
  const [capable, setCapable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    detectDualControlCapability().then((result) => {
      if (!cancelled) setCapable(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return capable;
}
