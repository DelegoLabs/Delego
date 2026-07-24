// Issue #214
import { 
  type UserNotificationPreferences, 
  type NotificationEventType,
  getEnabledChannels
} from "./preferences.js";

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

export function routeContractEventWithPreferences(
  eventType: string,
  userPreferences: UserNotificationPreferences | null
): ContractNotificationRoute | null {
  const baseRoute = ROUTE_TABLE.find((r) => r.eventType === eventType);
  if (!baseRoute) {
    return null;
  }

  if (!userPreferences) {
    return baseRoute;
  }

  const enabledChannels = getEnabledChannels(
    userPreferences,
    eventType as NotificationEventType
  );

  if (enabledChannels.length === 0) {
    return null;
  }

  return {
    ...baseRoute,
    channels: enabledChannels as Array<"email" | "push">,
  };
}
