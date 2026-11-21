"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useCart } from "../../hooks/useCart";
import { NavPendingBadge } from "./NavPendingBadge";
import { activeNavHref } from "./navItems";

export interface MobileNavItem {
  label: string;
  icon: string;
  route: string;
  badgeCount?: number;
  isActive: boolean;
}

/**
 * Fixed bottom navigation bar for mobile viewports (< 768 px).
 *
 * Surfaces four quick-action destinations — Store, Orders (with pending
 * approvals badge), Cart (with item count badge), and Agent Copilot — that
 * are hard to reach from the top header on small screens.
 *
 * Hidden on desktop via CSS; shown exclusively when the viewport is narrower
 * than the 768 px breakpoint defined in globals.css.
 *
 * Safe-area inset padding (`padding-bottom: env(safe-area-inset-bottom)`) is
 * applied so the bar clears the iPhone home indicator bar.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const t = useTranslations("mobileBottomNav");
  const { summary, openDrawer } = useCart();

  const activeHref = activeNavHref(pathname);

  const handleAgentClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent("open-agent"));
  }, []);

  const cartCount = summary.totalQuantity;

  return (
    <nav
      className="mobile-bottom-nav"
      aria-label={t("ariaLabel")}
      data-testid="mobile-bottom-nav"
    >
      {/* Store */}
      <Link
        href="/store"
        prefetch
        className={`mobile-bottom-nav__item focus-visible-ring${activeHref === "/store" ? " mobile-bottom-nav__item--active" : ""}`}
        aria-current={activeHref === "/store" ? "page" : undefined}
        data-testid="mobile-bottom-nav-store"
      >
        <span className="mobile-bottom-nav__icon" aria-hidden="true">
          🏪
        </span>
        <span className="mobile-bottom-nav__label">{t("store")}</span>
      </Link>

      {/* Orders — badge mirrors pending approvals counter */}
      <Link
        href="/orders"
        prefetch
        className={`mobile-bottom-nav__item focus-visible-ring${activeHref === "/orders" ? " mobile-bottom-nav__item--active" : ""}`}
        aria-current={activeHref === "/orders" ? "page" : undefined}
        data-testid="mobile-bottom-nav-orders"
      >
        <span className="mobile-bottom-nav__icon-wrap" aria-hidden="true">
          <span className="mobile-bottom-nav__icon">📦</span>
          {/* Re-uses the same live pending-approval count the sidebar badge shows */}
          <NavPendingBadge />
        </span>
        <span className="mobile-bottom-nav__label">{t("orders")}</span>
      </Link>

      {/* Cart — badge shows total item quantity */}
      <button
        type="button"
        className={`mobile-bottom-nav__item focus-visible-ring${activeHref === "/cart" ? " mobile-bottom-nav__item--active" : ""}`}
        onClick={openDrawer}
        aria-label={
          cartCount > 0
            ? t("cartWithCount", { count: cartCount })
            : t("cart")
        }
        data-testid="mobile-bottom-nav-cart"
      >
        <span className="mobile-bottom-nav__icon-wrap" aria-hidden="true">
          <span className="mobile-bottom-nav__icon">🛒</span>
          {cartCount > 0 && (
            <span
              className="mobile-bottom-nav__badge"
              data-testid="mobile-bottom-nav-cart-badge"
              aria-hidden="true"
            >
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          )}
        </span>
        <span className="mobile-bottom-nav__label">{t("cart")}</span>
      </button>

      {/* Agent Copilot */}
      <button
        type="button"
        className="mobile-bottom-nav__item focus-visible-ring"
        onClick={handleAgentClick}
        aria-label={t("copilot")}
        data-testid="mobile-bottom-nav-copilot"
      >
        <span className="mobile-bottom-nav__icon" aria-hidden="true">
          🤖
        </span>
        <span className="mobile-bottom-nav__label">{t("copilot")}</span>
      </button>
    </nav>
  );
}
