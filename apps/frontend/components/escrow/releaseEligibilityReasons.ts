import type { ReleaseIneligibilityReason } from "@delego/types";

export const RELEASE_INELIGIBILITY_LABEL: Record<ReleaseIneligibilityReason, string> = {
  unauthorized_caller: "Only the buyer or an admin can release these funds.",
  already_released: "Funds have already been released.",
  invalid_status: "This escrow is not in a releasable state.",
};

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) return "now";
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (days === 0 && hours === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
}
