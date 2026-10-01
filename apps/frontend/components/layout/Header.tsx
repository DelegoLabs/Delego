"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GlobalSearch } from "../search/GlobalSearch";
import { MobileNav } from "./MobileNav";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { NetworkToggle } from "../network/NetworkToggle";
import { SorobanHealthIndicator } from "../network/SorobanHealthIndicator";
import { NotificationBell } from "../notifications/NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPaletteTrigger } from "../command-palette/CommandPaletteTrigger";
import { ChatDrawerTrigger } from "../chat/public";
import { DataSaverChip } from "./DataSaverChip";
import { BalanceSwitcher } from "./BalanceSwitcher";

/**
 * Top application bar.
 * On mobile it exposes a hamburger button that toggles the MobileNav drawer;
 * on desktop the hamburger is hidden (navigation lives in the Sidebar).
 */
export function Header() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const t = useTranslations("nav");
  const tApp = useTranslations("app");

  return (
    <>
      <a href="#main-content" className="skip-to-content focus-visible-ring">
        {t("skipToContent")}
      </a>
      <header className="app-header">
        <button
          type="button"
          className="hamburger focus-visible-ring"
          onClick={() => setMobileNavOpen(true)}
          aria-label={t("openMenu")}
          aria-expanded={mobileNavOpen}
        >
          ☰
        </button>

        <p className="app-header-brand">{tApp("brand")}</p>

        <GlobalSearch />

        <CommandPaletteTrigger />

        <ChatDrawerTrigger />

        <div className="app-header-spacer" />

        <DataSaverChip />

        <ThemeToggle />

        <NetworkToggle />

        <SorobanHealthIndicator />

        <NotificationBell />

        <BalanceSwitcher />

        <WalletConnectButton />

        <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
      </header>
    </>
  );
}
