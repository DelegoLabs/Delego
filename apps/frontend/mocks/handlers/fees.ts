import { http, HttpResponse } from "msw";

/**
 * Horizon fee-stats fixture (#1002).
 *
 * The fee-stats feed is a public network endpoint, not part of the Delego
 * gateway, so it is mocked separately from the API handlers. These handlers
 * are registered on the Node test server only (see `mocks/server.ts`) — the
 * browser worker leaves Horizon alone so mock-mode dev builds still show
 * live network fees.
 *
 * The default payload describes a quiet network: the base fee sits at the
 * protocol minimum (100 stroops) and the recommended p95 fee is double that.
 */
const QUIET_NETWORK_FEE_STATS = {
  last_ledger_base_fee: "100",
  max_fee: { p50: "100", p90: "150", p95: "200", p99: "500" },
  fee_charged: { p50: "100", p90: "150", p95: "200", p99: "500" },
};

export const feeStatsHandlers = [
  http.get("https://horizon.stellar.org/fee_stats", () =>
    HttpResponse.json(QUIET_NETWORK_FEE_STATS)
  ),
  http.get("https://horizon-testnet.stellar.org/fee_stats", () =>
    HttpResponse.json(QUIET_NETWORK_FEE_STATS)
  ),
];

/** A congested network: the base fee has spiked well above the minimum. */
export const CONGESTED_NETWORK_FEE_STATS = {
  last_ledger_base_fee: "250000",
  max_fee: { p50: "250000", p90: "400000", p95: "500000", p99: "1000000" },
  fee_charged: { p50: "250000", p90: "400000", p95: "500000", p99: "1000000" },
};
