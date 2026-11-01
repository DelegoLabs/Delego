"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePendingApprovalBadge } from "../../hooks/usePendingApprovalBadge";

/**
 * Data schema representing a single item in the mobile bottom navigation bar.
 */
export interface MobileNavItem {
  label: string;
  icon: string;
  route: string;
  badgeCount?: number;
  isActive: boolean;
}

export interface MobileBottomNavProps {
  /** Optional custom navigation items for testing or custom shells */
  items?: MobileNavItem[];
  /** Optional callback fired when an item is tapped */
  onItemClick?(item: MobileNavItem): void;
}

/**
 * Responsive Mobile Bottom Navigation Bar (Issue #1027).
 * Displays exclusively on mobile viewports (< 768px), providing quick access
 * to Store, Orders (with unread badge for pending approvals), Cart, and Copilot.
 * Includes safe area inset padding (`pb-safe`) for iPhone home indicator bars.
 */
export function MobileBottomNav({ items: customItems, onItemClick }: MobileBottomNavProps) {
  const pathname = usePathname();
  const pendingApprovalsCount = usePendingApprovalBadge();

  // If custom items are provided, calculate active state and pass through
  const items: MobileNavItem[] = customItems
    ? customItems.map((item) => ({
        ...item,
        isActive:
          item.isActive !== undefined
            ? item.isActive
            : item.route === "/"
              ? pathname === "/"
              : pathname === item.route || pathname.startsWith(`${item.route}/`),
      }))
    : [
        {
          label: "Store",
          icon: "🛍️",
          route: "/store",
          isActive: pathname === "/" || pathname === "/store" || pathname.startsWith("/store/"),
        },
        {
          label: "Orders",
          icon: "📦",
          route: "/orders",
          badgeCount: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
          isActive: pathname === "/orders" || pathname.startsWith("/orders/"),
        },
        {
          label: "Cart",
          icon: "🛒",
          route: "/cart",
          isActive: pathname === "/cart" || pathname.startsWith("/cart/"),
        },
        {
          label: "Copilot",
          icon: "🤖",
          route: "/assistant",
          isActive: pathname === "/assistant" || pathname.startsWith("/assistant/"),
        },
      ];

  return (
    <nav
      className="mobile-bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-bg-primary,#ffffff)]/95 backdrop-blur-md border-t border-[var(--color-border,#e5e7eb)] pb-safe transition-transform duration-200"
      aria-label="Mobile Navigation"
      data-testid="mobile-bottom-nav"
    >
      <ul className="flex items-center justify-around h-16 max-w-lg mx-auto px-2 m-0 p-0 list-none">
        {items.map((item) => {
          const formattedBadge =
            item.badgeCount && item.badgeCount > 0
              ? item.badgeCount > 99
                ? "99+"
                : String(item.badgeCount)
              : null;

          return (
            <li key={item.route} className="flex-1 text-center">
              <Link
                href={item.route}
                onClick={() => onItemClick?.(item)}
                className={`flex flex-col items-center justify-center py-1 px-2 rounded-lg transition-colors duration-150 relative select-none focus-visible-ring ${
                  item.isActive
                    ? "text-[var(--color-accent,#2563eb)] font-semibold active-nav-tab"
                    : "text-[var(--color-fg-muted,#6b7280)] hover:text-[var(--color-fg-primary,#111827)]"
                }`}
                aria-current={item.isActive ? "page" : undefined}
                data-testid={`mobile-nav-item-${item.label.toLowerCase()}`}
              >
                <div className="relative inline-flex items-center justify-center">
                  <span className="text-xl leading-none" aria-hidden="true">
                    {item.icon}
                  </span>
                  {formattedBadge && (
                    <span
                      className="absolute -top-1 -right-2.5 min-w-[1.125rem] h-4.5 px-1 bg-[var(--color-danger,#ef4444)] text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none"
                      data-testid={`badge-${item.label.toLowerCase()}`}
                      aria-label={`${formattedBadge} pending approvals`}
                    >
                      {formattedBadge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] mt-1 leading-tight tracking-tight">
                  {item.label}
                </span>
                {item.isActive && (
                  <span
                    className="absolute bottom-0 w-8 h-0.5 bg-[var(--color-accent,#2563eb)] rounded-full"
                    aria-hidden="true"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
