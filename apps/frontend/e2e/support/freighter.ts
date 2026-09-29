import type { Page } from "@playwright/test";
import { E2E_WALLET_ADDRESS } from "./fixtures";
import { installFreighterStub } from "./freighter-bridge";

export interface FreighterStubOptions {
  /** Address the synthetic wallet reports. Defaults to E2E_WALLET_ADDRESS. */
  address?: string;
  /**
   * Grant the origin wallet access up front, skipping the `Connect Wallet`
   * CTA. Defaults to false, mirroring a first-time visitor.
   */
  allowed?: boolean;
}

/**
 * Injects a synthetic Freighter wallet before any page script runs (FE-044),
 * so wallet flows are deterministic in CI without installing the extension.
 *
 * Models both halves of the `@stellar/freighter-api@6` contract — the
 * `window.freighter` marker *and* the extension's `window.postMessage`
 * protocol (see ./freighter-bridge.ts for why both are required).
 */
export async function stubFreighter(
  page: Page,
  options: FreighterStubOptions | string = {}
): Promise<void> {
  const resolved: FreighterStubOptions =
    typeof options === "string" ? { address: options } : options;

  await page.addInitScript(installFreighterStub, {
    address: resolved.address ?? E2E_WALLET_ADDRESS,
    allowed: resolved.allowed ?? false,
  });
}
