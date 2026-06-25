// Issue #214
export interface ContractNotificationRoute {
  eventType: string;
  templateName: string;
  channels: Array<"email" | "push">;
}

const ROUTE_TABLE: ContractNotificationRoute[] = [
  {
    eventType: "escrow.released",
    templateName: "escrow-released",
    channels: ["email", "push"],
  },
  {
    eventType: "escrow.locked",
    templateName: "approval-request",
    channels: ["email", "push"],
  },
  {
    eventType: "payment.failed",
    templateName: "payment-failed",
    channels: ["email"],
  },
  {
    eventType: "permission.granted",
    templateName: "permission-granted",
    channels: ["push"],
  },
  {
    eventType: "permission.revoked",
    templateName: "permission-revoked",
    channels: ["push"],
  },
];

export function routeContractEvent(
  eventType: string
): ContractNotificationRoute | null {
  return ROUTE_TABLE.find((r) => r.eventType === eventType) ?? null;
}
