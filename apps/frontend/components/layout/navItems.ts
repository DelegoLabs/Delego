/** Shared primary navigation items for the sidebar and mobile nav. */
/** Single navigation entry used by the app shell. */
export interface NavItem {
  /** Key under the "nav" namespace in messages/*.json */
  labelKey:
    | "dashboard"
    | "delegations"
    | "orders"
    | "approvals"
    | "approvalsHistory"
    | "tracking"
    | "analytics"
    | "wallet"
    | "settings";
  href: string;
  /** Emoji icon — TODO: replace with design-system icon set */
  icon: string;
}

/** Canonical navigation items for the main application shell. */
export const navItems: NavItem[] = [
  { labelKey: "dashboard", href: "/", icon: "🏠" },
  { labelKey: "delegations", href: "/delegations", icon: "🤝" },
  { labelKey: "orders", href: "/orders", icon: "📦" },
  { labelKey: "approvals", href: "/approvals", icon: "🛡️" },
  { labelKey: "approvalsHistory", href: "/approvals/history", icon: "🗂️" },
  { labelKey: "tracking", href: "/tracking", icon: "🚚" },
  { labelKey: "analytics", href: "/analytics", icon: "📊" },
  { labelKey: "wallet", href: "/wallet", icon: "👛" },
  { labelKey: "settings", href: "/settings", icon: "⚙️" },
];

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
