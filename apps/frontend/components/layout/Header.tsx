"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GlobalSearch } from "../search/GlobalSearch";
import { MobileNav } from "./MobileNav";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { NetworkToggle } from "../network/NetworkToggle";
import { NotificationBell } from "../notifications/NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPaletteTrigger } from "../command-palette/CommandPaletteTrigger";
import { DataSaverChip } from "./DataSaverChip";

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
    <header className="app-header">
      <button
        type="button"
        className="hamburger"
        onClick={() => setMobileNavOpen(true)}
        aria-label={t("openMenu")}
        aria-expanded={mobileNavOpen}
      >
        ☰
      </button>

      <p className="app-header-brand">{tApp("brand")}</p>

      <GlobalSearch />

      <CommandPaletteTrigger />

      <div className="app-header-spacer" />

      <DataSaverChip />

      <ThemeToggle />

      <NetworkToggle />

      <NotificationBell />

      <WalletConnectButton />

      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    </header>
  );
}
