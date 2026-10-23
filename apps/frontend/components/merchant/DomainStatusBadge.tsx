"use client";

import { Badge, type BadgeProps, type BadgeTone } from "@delegolabs/ui";

export type DomainStatusBadgeStatus =
  | "configured"
  | "not-configured"
  | "active"
  | "pending"
  | "error"
  | "checking";

interface StatusPresentation {
  tone: BadgeTone;
  label: string;
}

const PRESENTATIONS: Record<DomainStatusBadgeStatus, StatusPresentation> = {
  configured: { tone: "success", label: "Configured" },
  "not-configured": { tone: "error", label: "Not configured" },
  active: { tone: "success", label: "Active" },
  pending: { tone: "warning", label: "Pending" },
  error: { tone: "error", label: "Error" },
  checking: { tone: "neutral", label: "Checking…" },
};

export interface DomainStatusBadgeProps extends Omit<BadgeProps, "tone" | "children"> {
  status: DomainStatusBadgeStatus;
}

export function DomainStatusBadge({ status, ...props }: DomainStatusBadgeProps) {
  const presentation = PRESENTATIONS[status];

  return (
    <Badge tone={presentation.tone} {...props}>
      {presentation.label}
    </Badge>
  );
}
