"use client";

import { useEffect, useState } from "react";
import { Card, FeeSelector, type FeeTier, type FeeTierOption } from "@delegolabs/ui";
import { useNetwork } from "../../hooks/useNetwork";
import { fallbackFeeTierOptions, fetchFeeTierQuote } from "../../lib/feeTiers";

/**
 * Priority-fee control. Starts on Fast (p95) and replaces the minimum-fee
 * placeholder once Horizon fee stats load.
 */
export function FeeTierField() {
  const { network } = useNetwork();
  const [selectedTier, setSelectedTier] = useState<FeeTier>("fast");
  const [options, setOptions] = useState<FeeTierOption[]>(fallbackFeeTierOptions);
  const [source, setSource] = useState<"loading" | "horizon" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;
    setSource("loading");
    void fetchFeeTierQuote(network.horizonUrl).then((quote) => {
      if (cancelled) return;
      setOptions(quote.options);
      setSource(quote.source);
    });
    return () => {
      cancelled = true;
    };
  }, [network.horizonUrl]);

  const note =
    source === "horizon"
      ? "Live percentile fees from the network fee stats."
      : source === "fallback"
        ? "Live fees are unavailable. Showing the minimum network fee."
        : "Loading live percentile fees.";

  return (
    <Card title="Priority fee" ariaLabel="Priority fee tier">
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
        Fast (p95) is recommended. Standard uses the median fee and Urgent uses the p99 fee.
      </p>
      <FeeSelector selectedTier={selectedTier} onChange={setSelectedTier} options={options} />
      <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "var(--color-text-muted, #6b7280)" }}>
        {note}
      </p>
    </Card>
  );
}
