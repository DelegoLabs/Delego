/**
 * Validates a merchant's Stellar payout address at registration time (#791).
 *
 * Two layers: `validatePayoutAddressFormat` checks the StrKey shape/checksum
 * synchronously (no network access), and `validatePayoutAddressOnNetwork`
 * additionally confirms the account actually exists (is funded) on the
 * active network via Soroban RPC's `getAccount` — same client call as
 * `lib/sorobanInvoke.ts` and `lib/timeoutRefund.ts`. A payout address must be
 * a plain account (G...), not a muxed account or contract, since it is the
 * destination of ordinary payments.
 */

// StrKey comes from the SDK's `base` subpath so the synchronous format check
// does not drag the Soroban contract/rpc surface into every route's bundle;
// the network check below loads `rpc` lazily because it is async anyway.
import { StrKey } from "@stellar/stellar-sdk/base";
import type { NetworkConfig } from "./networks";

export interface AddressValidation {
  valid: boolean;
  error?: string;
}

/** Synchronous format/checksum check only — no network access. */
export function validatePayoutAddressFormat(raw: string): AddressValidation {
  const address = raw.trim();
  if (!address) {
    return { valid: false, error: "Enter your Stellar payout address." };
  }
  if (address.startsWith("S")) {
    return {
      valid: false,
      error: "That looks like a secret key — never share it. Enter your public address, which starts with G.",
    };
  }
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return {
      valid: false,
      error: "Enter a valid Stellar public key (starts with G, 56 characters).",
    };
  }
  return { valid: true };
}

/**
 * Format check, then confirms the account exists (is funded) on the given
 * network. An address can be correctly formatted but never funded, which
 * Soroban RPC reports as a "not found" style error rather than a thrown
 * network failure — both are surfaced here as a clear validation message
 * rather than an unhandled rejection.
 */
export async function validatePayoutAddressOnNetwork(
  raw: string,
  network: Pick<NetworkConfig, "sorobanRpcUrl" | "label">
): Promise<AddressValidation> {
  const format = validatePayoutAddressFormat(raw);
  if (!format.valid) return format;

  const address = raw.trim();
  const { rpc } = await import("@stellar/stellar-sdk");
  const server = new rpc.Server(network.sorobanRpcUrl, {
    allowHttp: network.sorobanRpcUrl.startsWith("http://"),
  });

  try {
    await server.getAccount(address);
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found|404/i.test(message)) {
      return {
        valid: false,
        error: `This address isn't funded on ${network.label} yet. Fund the account, then try again.`,
      };
    }
    return {
      valid: false,
      error: "Couldn't reach the network to verify this address. Check your connection and try again.",
    };
  }
}
