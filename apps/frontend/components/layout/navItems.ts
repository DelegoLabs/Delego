/** Shared primary navigation items for the sidebar and mobile nav. */
/** Single navigation entry used by the app shell. */
export interface NavItem {
  label: string;
  href: string;
  /** Emoji icon — TODO: replace with design-system icon set */
  icon: string;
}

/** Canonical navigation items for the main application shell. */
export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "🏠" },
  { label: "Delegations", href: "/delegations", icon: "🤝" },
  { label: "Orders", href: "/orders", icon: "📦" },
  { label: "Approvals", href: "/approvals", icon: "🛡️" },
  { label: "Tracking", href: "/tracking", icon: "🚚" },
  { label: "Analytics", href: "/analytics", icon: "📊" },
  { label: "Wallet", href: "/wallet", icon: "👛" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];
