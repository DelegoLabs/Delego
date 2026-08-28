"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { activeNavHref, navItems } from "./navItems";
import { useTour } from "../tour/TourProvider";

/**
 * Desktop sidebar navigation.
 * Hidden below the mobile breakpoint (see `.sidebar` rules in globals.css),
 * where navigation is provided by the Header + MobileNav pair instead.
 */
export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tApp = useTranslations("app");
  const { start } = useTour();

  return (
    <aside className="sidebar" aria-label={t("primaryNavigation")}>
      <p className="sidebar-brand">{tApp("brand")}</p>
      <nav>
        <ul className="nav-list">
          {navItems.map((item) => {
            const isActive = item.href === activeNavHref(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`nav-link${isActive ? " active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  data-nav={item.labelKey}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {t(item.labelKey)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Help section — replay tour (#637) */}
      <div style={{ marginTop: "auto", padding: "1rem 0.5rem 0.5rem" }}>
        <button
          type="button"
          onClick={start}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            width: "100%",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            color: "var(--color-text-secondary, #4b5563)",
            textAlign: "left",
          }}
          aria-label="Replay product tour"
        >
          <span aria-hidden="true">🎯</span> Take the tour
        </button>
      </div>
    </aside>
  );
}
