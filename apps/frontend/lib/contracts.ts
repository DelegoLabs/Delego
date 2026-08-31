export type ContractName = "escrow" | "permissions" | "registry";
import type { NetworkId } from "./networks";

/**
 * Per-network Soroban contract registry (Settings → Network & contracts).
 *
 * Addresses come from build-time env config (one per contract per network) —
 * deployed *versions* are fetched live from the API (see
 * hooks/useContractVersions.ts). Next.js only inlines `process.env.NEXT_PUBLIC_*`
 * references it can statically see, so each lookup below is a literal
 * property access rather than a dynamic `process.env[key]`.
 */

export const CONTRACT_NAMES: readonly ContractName[] = ["escrow", "permissions", "registry"];

export const CONTRACT_LABELS: Record<ContractName, string> = {
  escrow: "Escrow",
  permissions: "Permissions",
  registry: "Registry",
};

export interface ContractRegistryEntry {
  name: ContractName;
  label: string;
  /** Configured contract address for this network, or null if unset. */
  address: string | null;
  /** False when `address` is set but fails StrKey checksum/format validation. */
  addressValid: boolean;
}

function readConfiguredAddress(networkId: NetworkId, name: ContractName): string | null {
  let raw: string | undefined;
  switch (networkId) {
    case "testnet":
      switch (name) {
        case "escrow":
          raw = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID_TESTNET;
          break;
        case "permissions":
          raw = process.env.NEXT_PUBLIC_PERMISSIONS_CONTRACT_ID_TESTNET;
          break;
        case "registry":
          raw = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID_TESTNET;
          break;
      }
      break;
    case "mainnet":
      switch (name) {
        case "escrow":
          raw = process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID_MAINNET;
          break;
        case "permissions":
          raw = process.env.NEXT_PUBLIC_PERMISSIONS_CONTRACT_ID_MAINNET;
          break;
        case "registry":
          raw = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID_MAINNET;
          break;
      }
      break;
  }
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Stellar contract StrKey version byte ("C..." addresses). */
const CONTRACT_VERSION_BYTE = 2 << 3;

function base32Decode(input: string): Uint8Array | null {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

/** CRC16/XModem, as used by Stellar's StrKey checksum. */
function crc16xmodem(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}

/**
 * Validates a Stellar contract address (StrKey "C..." form): correct prefix,
 * base32 alphabet, version byte, and CRC16/XModem checksum. Self-contained
 * (no @stellar/sdk dependency) since only contract-address validation is
 * needed here.
 */
export function isValidContractAddress(address: string): boolean {
  if (typeof address !== "string" || address.length !== 56 || address[0] !== "C") {
    return false;
  }
  if (!/^[A-Z2-7]+$/.test(address)) return false;

  const decoded = base32Decode(address);
  // version(1) + payload(32) + checksum(2) = 35 bytes
  if (!decoded || decoded.length !== 35) return false;

  if (decoded[0] !== CONTRACT_VERSION_BYTE) return false;

  const payload = decoded.slice(0, 33);
  const checksum = decoded.slice(33, 35);
  const expected = crc16xmodem(payload);
  // Checksum is little-endian.
  return checksum[0] === (expected & 0xff) && checksum[1] === ((expected >>> 8) & 0xff);
}

/** Configured contracts for a network, with address validation applied. */
export function getConfiguredContracts(networkId: NetworkId): ContractRegistryEntry[] {
  return CONTRACT_NAMES.map((name) => {
    const address = readConfiguredAddress(networkId, name);
    return {
      name,
      label: CONTRACT_LABELS[name],
      address,
      addressValid: address !== null && isValidContractAddress(address),
    };
  });
}

/** Explorer URL for a contract address on the given network. */
export function explorerContractUrl(networkId: NetworkId, address: string): string {
  const base =
    networkId === "mainnet"
      ? "https://stellar.expert/explorer/public"
      : "https://stellar.expert/explorer/testnet";
  return `${base}/contract/${address}`;
}
