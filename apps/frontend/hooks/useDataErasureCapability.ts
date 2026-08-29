"use client";

import { useEffect, useState } from "react";
import { detectDataErasureCapability } from "../services/payments";

/**
 * Whether the API currently exposes the server-side data-erasure request
 * endpoints (#610). Defaults to `false` until the probe resolves, and stays
 * `false` on any failure — network error, non-2xx, or a capabilities
 * payload that doesn't say yes — so the server-erasure tier is hidden
 * entirely on an older/degraded API rather than offering a request the
 * backend can't honor. The local-only "clear local data" tier is always
 * available regardless of this capability.
 */
export function useDataErasureCapability(): boolean {
  const [capable, setCapable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    detectDataErasureCapability().then((result) => {
      if (!cancelled) setCapable(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return capable;
}
