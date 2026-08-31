"use client";

import Link from "next/link";
import { useDataSaver } from "../../hooks/useDataSaver";

/**
 * Header indicator shown whenever reduced data mode is active (#623), so the
 * effect isn't invisible — links to Settings for the escape hatch ("load
 * images anyway" lives per-image; the mode toggle itself lives in Settings).
 */
export function DataSaverChip() {
  const { reducedModeActive } = useDataSaver();

  if (!reducedModeActive) return null;

  return (
    <Link
      href="/settings"
      className="data-saver-chip"
      title="Reduced data mode is active — images load on tap, charts show summary numbers"
    >
      Data saver
    </Link>
  );
}
