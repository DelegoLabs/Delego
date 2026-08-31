"use client";

import { useEffect, useState } from "react";
import { detectApprovalNoteCapability } from "../services/payments";

/**
 * Whether the API currently accepts an `approvalNote` field on the approve
 * payload (#573). Defaults to `false` until the probe resolves, and stays
 * `false` on any failure — network error, non-2xx, or a capabilities payload
 * that doesn't say yes — so an outage or an older gateway degrades to a
 * local-only note (recorded client-side, never sent) instead of sending a
 * field the API might reject.
 */
export function useApprovalNoteCapability(): boolean {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    detectApprovalNoteCapability().then((result) => {
      if (!cancelled) setSupported(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return supported;
}
