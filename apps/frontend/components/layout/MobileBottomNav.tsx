"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import {
  AgentIcon,
  CartIcon,
  OrdersIcon,
  StoreIcon,
  type IconComponent,
} from "@delegolabs/ui";
import { useCart } from "../../hooks/useCart";
import { NavPendingBadge } from "./NavPendingBadge";
import { activeNavHref } from "./navItems";

export interface MobileNavItem {
  label: string;
  icon: IconComponent;
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
  const { summary, openDrawer, drawerOpen } = useCart();

  const activeHref = activeNavHref(pathname);
  const isStoreActive =
    pathname === "/store" || pathname.startsWith("/store/");
  const isOrdersActive = activeHref === "/orders";
  const isCartActive = drawerOpen;

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
        className={`mobile-bottom-nav__item focus-visible-ring${isStoreActive ? " mobile-bottom-nav__item--active" : ""}`}
        aria-current={isStoreActive ? "page" : undefined}
        data-testid="mobile-bottom-nav-store"
      >
        <span className="mobile-bottom-nav__icon" aria-hidden="true">
          <StoreIcon size={22} />
        </span>
        <span className="mobile-bottom-nav__label">{t("store")}</span>
      </Link>

      {/* Orders — badge mirrors pending approvals counter */}
      <Link
        href="/orders"
        prefetch
        className={`mobile-bottom-nav__item focus-visible-ring${isOrdersActive ? " mobile-bottom-nav__item--active" : ""}`}
        aria-current={isOrdersActive ? "page" : undefined}
        data-testid="mobile-bottom-nav-orders"
      >
        <span className="mobile-bottom-nav__icon-wrap" aria-hidden="true">
          <span className="mobile-bottom-nav__icon">
            <OrdersIcon size={22} />
          </span>
          {/* Re-uses the same live pending-approval count the sidebar badge shows */}
          <NavPendingBadge />
        </span>
        <span className="mobile-bottom-nav__label">{t("orders")}</span>
      </Link>

      {/* Cart — badge shows total item quantity */}
      <button
        type="button"
        className={`mobile-bottom-nav__item focus-visible-ring${isCartActive ? " mobile-bottom-nav__item--active" : ""}`}
        onClick={openDrawer}
        aria-label={
          cartCount > 0 ? t("cartWithCount", { count: cartCount }) : t("cart")
        }
        data-testid="mobile-bottom-nav-cart"
      >
        <span className="mobile-bottom-nav__icon-wrap" aria-hidden="true">
          <span className="mobile-bottom-nav__icon">
            <CartIcon size={22} />
          </span>
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
          <AgentIcon size={22} />
        </span>
        <span className="mobile-bottom-nav__label">{t("copilot")}</span>
      </button>
    </nav>
  );
}
