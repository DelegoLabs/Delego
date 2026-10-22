import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { feeStatsHandlers } from "./handlers/fees";

/**
 * Node MSW server for vitest (jsdom environment, no real network).
 *
 * The Horizon fee-stats handlers are registered here rather than in the
 * shared `handlers` barrel: they stand in for a public network endpoint, not
 * for the Delego gateway, and the browser worker must keep reaching the real
 * endpoint in mock-mode dev builds.
 */
export const server = setupServer(...handlers, ...feeStatsHandlers);
