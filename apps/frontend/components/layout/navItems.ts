/** Shared primary navigation items for the sidebar and mobile nav. */
/** Single navigation entry used by the app shell. */
export interface NavItem {
  /** Key under the "nav" namespace in messages/*.json */
  labelKey:
    | "dashboard"
    | "delegations"
    | "orders"
    | "approvals"
    | "approvalsPending"
    | "approvalsHistory"
    | "tracking"
    | "analytics"
    | "wallet"
    | "settings";
  href: string;
  /** Emoji icon — TODO: replace with design-system icon set */
  icon: string;
  /**
   * Which live counter to render inside the link (#780). Only one item carries
   * a badge today; the indirection keeps the shells from growing a per-item
   * conditional when the next one needs one.
   */
  badge?: "pendingApprovals";
}

/** Canonical navigation items for the main application shell. */
export const navItems: NavItem[] = [
  { labelKey: "dashboard", href: "/", icon: "🏠" },
  { labelKey: "delegations", href: "/delegations", icon: "🤝" },
  { labelKey: "orders", href: "/orders", icon: "📦" },
  { labelKey: "approvals", href: "/approvals", icon: "🛡️" },
  {
    labelKey: "approvalsPending",
    href: "/approvals/pending",
    icon: "✍️",
    badge: "pendingApprovals",
  },
  { labelKey: "approvalsHistory", href: "/approvals/history", icon: "🗂️" },
  { labelKey: "tracking", href: "/tracking", icon: "🚚" },
  { labelKey: "analytics", href: "/analytics", icon: "📊" },
  { labelKey: "wallet", href: "/wallet", icon: "👛" },
  { labelKey: "settings", href: "/settings", icon: "⚙️" },
];

/**
 * Props for the responsive floating action button that gives buyers instant
 * access to the AI assistant from any page on mobile screens.
 */
export interface FabButtonProps {
  /** Number of unread proposals surfaced as a badge on the FAB. */
  unreadProposalsCount: number;
  /** Invoked when the buyer taps the FAB to launch the assistant. */
  onClick(): void;
}

/** Href the FAB navigates to when launching the AI assistant. */
export const fabAssistantHref = "/assistant";

/**
 * The nav item whose href best matches `pathname` — longest prefix wins, so a
 * nested route like `/approvals/history` activates its own entry rather than
 * also lighting up the `/approvals` parent. Returns `null` when nothing matches.
 */
export function activeNavHref(
  pathname: string,
  items: NavItem[] = navItems
): string | null {
  let best: string | null = null;
  for (const item of items) {
    const matches =
      item.href === "/"
        ? pathname === "/"
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (best === null || item.href.length > best.length)) {
      best = item.href;
    }
  }
  return best;
}

/**
 * Formats the unread proposals count for the FAB badge, capping the display at
 * "99+" so the badge stays compact on small screens. Returns `null` when there
 * is nothing unread so the badge can be hidden entirely.
 */
export function formatFabBadgeCount(unreadProposalsCount: number): string | null {
  if (!Number.isFinite(unreadProposalsCount) || unreadProposalsCount <= 0) {
    return null;
  }
  const count = Math.floor(unreadProposalsCount);
  return count > 99 ? "99+" : String(count);
}

/**
 * Whether the FAB should animate its entrance. On mobile the FAB reveals once
 * the buyer scrolls past `threshold` pixels, keeping the initial viewport clear.
 */
export function shouldRevealFab(scrollY: number, threshold = 120): boolean {
  return Number.isFinite(scrollY) && scrollY > threshold;
}
