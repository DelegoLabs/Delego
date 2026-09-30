/**
 * wallets.ts — multi-wallet registry for issue #774.
 *
 * Extends wallet support beyond Freighter (Albedo, Lobstr, xBull,
 * WalletConnect) with a uniform adapter surface:
 *   - `SupportedWallet` / `WalletOption` match the issue's data schema,
 *   - `detectInstalledWallets()` reports what is usable in this browser
 *     without importing anything (safe for SSR and unit tests),
 *   - the active choice persists in sessionStorage so it survives page
 *     navigation but never touches disk beyond the tab session.
 *
 * Deliberately dependency-free: adapter behavior lives with the callers
 * (useWallet), which already lazy-load `@stellar/freighter-api`.
 */

export type SupportedWallet =
  | "freighter"
  | "albedo"
  | "lobstr"
  | "xbull"
  | "walletconnect";

export type WalletKind = "extension" | "redirect" | "qrcode";

export interface WalletOption {
  id: SupportedWallet;
  name: string;
  iconUrl: string;
  isInstalled: boolean;
  connect(): Promise<string>;
}

export interface WalletMetadata {
  id: SupportedWallet;
  name: string;
  kind: WalletKind;
  /** Short user-facing description shown in the selector modal. */
  description: string;
}

export const WALLET_REGISTRY: readonly WalletMetadata[] = [
  {
    id: "freighter",
    name: "Freighter",
    kind: "extension",
    description: "Browser extension (desktop).",
  },
  {
    id: "albedo",
    name: "Albedo",
    kind: "redirect",
    description: "Web wallet — approves in a new tab, no install needed.",
  },
  {
    id: "lobstr",
    name: "LOBSTR",
    kind: "qrcode",
    description: "Mobile wallet — connects by scanning a QR code.",
  },
  {
    id: "xbull",
    name: "xBull",
    kind: "extension",
    description: "Browser extension (desktop).",
  },
  {
    id: "walletconnect",
    name: "WalletConnect",
    kind: "qrcode",
    description: "Any WalletConnect-compatible mobile wallet via QR code.",
  },
] as const;

const STORAGE_KEY = "delego.activeWallet";

function installedExtensionFlags(): Record<SupportedWallet, boolean> {
  const none = {
    freighter: false,
    albedo: false,
    lobstr: false,
    xbull: false,
    walletconnect: false,
  } satisfies Record<SupportedWallet, boolean>;
  if (typeof window === "undefined") return none;
  const w = window as unknown as Record<string, unknown>;
  return {
    // Freighter injects its API host object; other extension wallets are
    // detected the same way when present. Redirect/QR wallets never report
    // as "installed" — they connect on demand (see connect() below).
    freighter: w["freighterApi"] !== undefined || w["freighter"] !== undefined,
    albedo: false,
    lobstr: false,
    xbull: w["xbull"] !== undefined,
    walletconnect: false,
  };
}

/**
 * Snapshot of every registered wallet with live installed flags.
 * Pure (no imports, no DOM writes) — safe to call during render and in tests.
 */
export function detectInstalledWallets(): WalletOption[] {
  const flags = installedExtensionFlags();
  return WALLET_REGISTRY.map((meta) => ({
    id: meta.id,
    name: meta.name,
    iconUrl: "",
    isInstalled: flags[meta.id],
    // Real connection handshake lives in useWallet, which owns the loaded
    // SDK modules; this default rejects so an unwired option can never
    // silently resolve with a wrong address.
    connect: () =>
      Promise.reject(new Error(`${meta.name} is not connected yet`)),
  }));
}

export function getPersistedWalletId(): SupportedWallet | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    return (WALLET_REGISTRY as readonly WalletMetadata[]).some((w) => w.id === raw)
      ? (raw as SupportedWallet)
      : null;
  } catch {
    return null;
  }
}

export function setPersistedWalletId(id: SupportedWallet): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private-mode storage — session persistence is best-effort */
  }
}

export function clearPersistedWalletId(): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
