"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("notFound");

  const handleCommandPalette = () => {
    if (typeof window !== "undefined" && (window as unknown as { __commandPalette?: { open?: () => void } }).__commandPalette?.open) {
      ((window as unknown as { __commandPalette: { open: () => void } }).__commandPalette as { open: () => void }).open();
    }
  };

  return (
    <div className="settings-page">
      <header className="header">
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          style={{ margin: "0 auto 1rem", color: "var(--color-text-muted, #6b7280)" }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M16 16s-1.5-2-4-2-4 2-4 2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        <h1>404</h1>
        <p>{t("description")}</p>
      </header>

      <nav className="nav-links" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "1.5rem" }}>
        <button
          type="button"
          onClick={handleCommandPalette}
          className="nav-link"
          style={{ textAlign: "center", cursor: "pointer", background: "none", border: "none", font: "inherit" }}
        >
          ⌘K Open Command Palette
        </button>
        <Link href="/" prefetch={true} className="nav-link" style={{ textAlign: "center" }}>
          {t("goHome")}
        </Link>
        <Link href="/orders" prefetch={true} className="nav-link" style={{ textAlign: "center" }}>
          Orders
        </Link>
        <Link href="/delegations" prefetch={true} className="nav-link" style={{ textAlign: "center" }}>
          Delegations
        </Link>
        <Link href="/wallet" prefetch={true} className="nav-link" style={{ textAlign: "center" }}>
          Wallet
        </Link>
      </nav>
    </div>
  );
}