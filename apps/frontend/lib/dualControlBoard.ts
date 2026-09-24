/**
 * Team dual-control approval board (#718). Business-account orders above the
 * dual-control threshold need signatures from distinct team members, and the
 * order's creator can never be its only approver.
 */

export interface DualControlOrder {
  orderId: string;
  requiredApprovals: number;
  currentSigners: { signerAddress: string; signedAt: string; name?: string }[];
  pendingSigners: string[];
  status: "pending_first" | "pending_second" | "fully_approved" | "rejected";
}

export type DualControlStatus = DualControlOrder["status"];

/** A board card: the order plus the context the board needs to enforce the rules. */
export interface DualControlBoardEntry {
  order: DualControlOrder;
  /** Wallet address of the team member who created the order. */
  createdBy: string;
  totalStroops: string;
  merchantName?: string;
}

export const DUAL_CONTROL_COLUMNS: { status: DualControlStatus; title: string }[] = [
  { status: "pending_first", title: "Awaiting first approval" },
  { status: "pending_second", title: "Awaiting second approval" },
  { status: "fully_approved", title: "Approved" },
  { status: "rejected", title: "Rejected" },
];

export interface SignCheck {
  allowed: boolean;
  reason?: string;
}

export function hasSigned(order: DualControlOrder, address: string): boolean {
  return order.currentSigners.some((s) => s.signerAddress === address);
}

/**
 * Whether `userAddress` may sign `entry` right now:
 * - the order must still be pending,
 * - a member can sign only once (so the first approver can't also be the second),
 * - when a pending-signer list exists, the member must be on it,
 * - the creator can't provide the final signature unless someone other than
 *   the creator has already signed — the creator is never the sole approver.
 */
export function canSign(entry: DualControlBoardEntry, userAddress: string | null): SignCheck {
  const { order, createdBy } = entry;
  if (!userAddress) return { allowed: false, reason: "Connect your wallet to sign." };
  if (order.status === "fully_approved") {
    return { allowed: false, reason: "This order is already fully approved." };
  }
  if (order.status === "rejected") {
    return { allowed: false, reason: "This order was rejected." };
  }
  if (hasSigned(order, userAddress)) {
    return {
      allowed: false,
      reason: "You already signed this order — another team member must countersign.",
    };
  }
  if (order.pendingSigners.length > 0 && !order.pendingSigners.includes(userAddress)) {
    return { allowed: false, reason: "You aren't one of the requested approvers for this order." };
  }

  const remaining = order.requiredApprovals - order.currentSigners.length;
  const otherSigners = order.currentSigners.filter((s) => s.signerAddress !== createdBy);
  if (userAddress === createdBy && remaining <= 1 && otherSigners.length === 0) {
    return {
      allowed: false,
      reason: "You created this order, so another team member must approve it too.",
    };
  }
  return { allowed: true };
}

/** Optimistically applies a signature and derives the next status. */
export function applySignature(
  order: DualControlOrder,
  signerAddress: string,
  signedAt: string,
  name?: string
): DualControlOrder {
  const currentSigners = [...order.currentSigners, { signerAddress, signedAt, name }];
  const pendingSigners = order.pendingSigners.filter((a) => a !== signerAddress);
  const status: DualControlStatus =
    currentSigners.length >= order.requiredApprovals
      ? "fully_approved"
      : currentSigners.length === 0
        ? "pending_first"
        : "pending_second";
  return { ...order, currentSigners, pendingSigners, status };
}

export function groupByStatus(
  entries: DualControlBoardEntry[]
): Record<DualControlStatus, DualControlBoardEntry[]> {
  const groups: Record<DualControlStatus, DualControlBoardEntry[]> = {
    pending_first: [],
    pending_second: [],
    fully_approved: [],
    rejected: [],
  };
  for (const entry of entries) groups[entry.order.status].push(entry);
  return groups;
}
