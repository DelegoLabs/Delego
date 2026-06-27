"use client";

import { useState, useEffect } from "react";
import type { ApiResponse, Delegation } from "@delego/types";
import { api } from "../lib/api";

/** Fetch user delegations — TODO: Add SWR or React Query */
export function useDelegations() {
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDelegations().then((res: ApiResponse<Delegation[]>) => {
      if (res.data) setDelegations(res.data);
      setLoading(false);
    });
  }, []);

  return { delegations, loading };
}
