import { delegationHandlers } from "./delegations";
import { orderHandlers } from "./orders";
import { escrowHandlers } from "./escrows";
import { disputeHandlers } from "./disputes";
import { contractHandlers } from "./contracts";
import { healthHandlers } from "./health";
import { capabilitiesHandlers } from "./approvals";
import { erasureHandlers } from "./erasure";

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
  ...disputeHandlers,
  ...contractHandlers,
  ...healthHandlers,
  ...capabilitiesHandlers,
  ...erasureHandlers,
];

export {
  delegationHandlers,
  delegationHandlersEmpty,
  delegationHandlersError,
  delegationHandlersPaginated,
  resetDelegations,
  seedDelegations,
} from "./delegations";
export {
  orderHandlers,
  orderHandlersEmpty,
  orderHandlersError,
  orderHandlersPaginated,
  resetOrders,
  seedOrder,
  seedOrders,
  DUAL_CONTROL_THRESHOLD_STROOPS,
  DELEGATION_OWNERS,
} from "./orders";
export {
  capabilitiesHandlers,
  capabilitiesHandlersDisabled,
  capabilitiesHandlersUnavailable,
  capabilitiesHandlersApprovalNoteUnsupported,
  capabilitiesHandlersErasureUnsupported,
  buildDualControlOrder,
} from "./approvals";
export {
  erasureHandlers,
  resetErasureRequest,
  ERASURE_COOLDOWN_DAYS,
} from "./erasure";
export {
  escrowHandlers,
  escrowHandlersEmpty,
  escrowHandlersError,
  escrowHandlersPaginated,
  seedEscrows,
  resetEscrows,
} from "./escrows";
export {
  disputeHandlers,
  disputeHandlersUnauthorized,
  resetDisputes,
  seedDisputes,
} from "./disputes";
export { contractHandlers } from "./contracts";
export { healthHandlers } from "./health";
export { applyDemoWorld } from "./applyDemoWorld";
