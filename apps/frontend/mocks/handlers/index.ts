import { delegationHandlers } from "./delegations";
import { orderHandlers } from "./orders";
import { escrowHandlers } from "./escrows";
import { healthHandlers } from "./health";
import { capabilitiesHandlers } from "./approvals";

/**
 * Default handler set for tests, Storybook, and dev-mode mocking (FE-045).
 *
 * Individual test files can override a single resource with a scenario
 * variant (see mocks/handlers/{delegations,orders,escrows,approvals}.ts) via
 * `server.use(delegationHandlersEmpty)` / `worker.use(...)`.
 */
export const handlers = [
  ...delegationHandlers,
  ...orderHandlers,
  ...escrowHandlers,
  ...healthHandlers,
  ...capabilitiesHandlers,
];

export {
  delegationHandlers,
  delegationHandlersEmpty,
  delegationHandlersError,
  delegationHandlersPaginated,
  resetDelegations,
} from "./delegations";
export {
  orderHandlers,
  orderHandlersEmpty,
  orderHandlersError,
  orderHandlersPaginated,
  resetOrders,
  seedOrder,
  DUAL_CONTROL_THRESHOLD_STROOPS,
  DELEGATION_OWNERS,
} from "./orders";
export {
  capabilitiesHandlers,
  capabilitiesHandlersDisabled,
  capabilitiesHandlersUnavailable,
  buildDualControlOrder,
} from "./approvals";
export {
  escrowHandlers,
  escrowHandlersEmpty,
  escrowHandlersError,
  escrowHandlersPaginated,
} from "./escrows";
export { healthHandlers } from "./health";
