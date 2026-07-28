"use client";

import { useState } from "react";
import { GlobalSearch } from "../search/GlobalSearch";
import { MobileNav } from "./MobileNav";
import { WalletConnectButton } from "../wallet/WalletConnectButton";
import { NetworkToggle } from "../network/NetworkToggle";
import { NotificationBell } from "../notifications/NotificationBell";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Top application bar.
 * On mobile it exposes a hamburger button that toggles the MobileNav drawer;
 * on desktop the hamburger is hidden (navigation lives in the Sidebar).
 */
export function Header() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="app-header">
      <button
        type="button"
        className="hamburger"
        onClick={() => setMobileNavOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={mobileNavOpen}
      >
        ☰
      </button>

      <p className="app-header-brand">Delego</p>

      <GlobalSearch />

      <div className="app-header-spacer" />

      <ThemeToggle />

      <NetworkToggle />

      <NotificationBell />

      <WalletConnectButton />

      <MobileNav open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
    </header>
  );
}
