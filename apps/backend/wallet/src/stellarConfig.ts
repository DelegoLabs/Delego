import { Networks } from "@stellar/stellar-sdk";

/**
 * Resolved Stellar network name.
 *
 * `"custom"` is returned only when `STELLAR_PASSPHRASE` was set to a
 * non-empty, non-standard value together with explicit
 * `STELLAR_HORIZON_URL` and `SOROBAN_RPC_URL`. It is not part of the public
 * `StellarNetwork` type (`packages/types/src/wallet.ts`) — call sites that
 * surface the network name to API consumers should map "custom" to a
 * suitable fallback.
 */
export type ResolvedStellarNetwork =
  | "testnet"
  | "mainnet"
  | "futurenet"
  | "custom";

export type KnownStellarNetwork = Exclude<ResolvedStellarNetwork, "custom">;

export interface StellarConfig {
  network: ResolvedStellarNetwork;
  networkPassphrase: string;
  horizonUrl: string;
  sorobanRpcUrl: string;
}

const NETWORK_TO_PASSPHRASE: Record<KnownStellarNetwork, string> = {
  testnet: Networks.TESTNET,
  mainnet: Networks.PUBLIC,
  futurenet: Networks.FUTURENET,
};

const NETWORK_DEFAULTS: Record<
  KnownStellarNetwork,
  { horizon: string; rpc: string }
> = {
  testnet: {
    horizon: "https://horizon-testnet.stellar.org",
    rpc: "https://soroban-testnet.stellar.org",
  },
  mainnet: {
    horizon: "https://horizon.stellar.org",
    rpc: "https://soroban-mainnet.stellar.org",
  },
  futurenet: {
    horizon: "https://horizon-futurenet.stellar.org",
    rpc: "https://rpc-futurenet.stellar.org",
  },
};

function passphraseToNetwork(
  passphrase: string
): KnownStellarNetwork | null {
  for (const [name, candidate] of Object.entries(NETWORK_TO_PASSPHRASE) as [
    KnownStellarNetwork,
    string
  ][]) {
    if (candidate === passphrase) return name;
  }
  return null;
}

function resolveNetworkName(raw: string | undefined): KnownStellarNetwork {
  const normalized = (raw ?? "testnet").trim().toLowerCase();
  if (
    normalized === "testnet" ||
    normalized === "mainnet" ||
    normalized === "futurenet"
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid Stellar configuration: STELLAR_NETWORK="${normalized}" is not recognized. ` +
      `Allowed values are: testnet, mainnet, futurenet.`
  );
}

export interface ResolveOptions {
  /** Optional override for STELLAR_NETWORK (defaults to env.STELLAR_NETWORK). */
  network?: string;
  /** Optional override for STELLAR_PASSPHRASE. */
  passphrase?: string;
  /** Optional override for STELLAR_HORIZON_URL. */
  horizonUrl?: string;
  /** Optional override for SOROBAN_RPC_URL. */
  sorobanRpcUrl?: string;
}

/**
 * Resolve and validate the wallet's Stellar network configuration.
 *
 * Reads `STELLAR_NETWORK`, `STELLAR_PASSPHRASE`, `STELLAR_HORIZON_URL`, and
 * `SOROBAN_RPC_URL` from `env` (defaults to `process.env`) and returns a
 * normalized config.
 *
 * Throws on:
 *  - Unknown `STELLAR_NETWORK` value (anything that is not testnet,
 *    mainnet, or futurenet — case-insensitive).
 *  - Empty or whitespace `STELLAR_PASSPHRASE`.
 *  - `STELLAR_PASSPHRASE` set to a known network passphrase that does not
 *    match the named `STELLAR_NETWORK` (e.g. testnet + Public passphrase).
 *
 * Accepts a *custom* (non-empty, non-standard) `STELLAR_PASSPHRASE` only
 * when both `STELLAR_HORIZON_URL` and `SOROBAN_RPC_URL` are set; the
 * returned `network` is then `"custom"`.
 *
 * Call this at wallet-service startup (and again at request time if you
 * want fail-fast on env mutation) before any Horizon/Soroban calls.
 */
export function resolveAndValidateStellarConfig(
  envOrOptions: NodeJS.ProcessEnv | ResolveOptions = process.env
): StellarConfig {
  const isOptions = !("STELLAR_NETWORK" in envOrOptions);
  const get = (key: string): string | undefined => {
    if (!isOptions) {
      return (envOrOptions as NodeJS.ProcessEnv)[key];
    }
    const opts = envOrOptions as ResolveOptions;
    switch (key) {
      case "STELLAR_NETWORK":
        return opts.network;
      case "STELLAR_PASSPHRASE":
        return opts.passphrase;
      case "STELLAR_HORIZON_URL":
        return opts.horizonUrl;
      case "SOROBAN_RPC_URL":
        return opts.sorobanRpcUrl;
      default:
        return undefined;
    }
  };

  return resolveInternal({
    network: get("STELLAR_NETWORK"),
    passphrase: get("STELLAR_PASSPHRASE"),
    horizonUrl: get("STELLAR_HORIZON_URL"),
    sorobanRpcUrl: get("SOROBAN_RPC_URL"),
  });
}

interface InternalOptions {
  network?: string;
  passphrase?: string;
  horizonUrl?: string;
  sorobanRpcUrl?: string;
}

function resolveInternal(opts: InternalOptions): StellarConfig {
  const hasExplicitPassphrase = opts.passphrase !== undefined;
  const trimmedPassphrase = (opts.passphrase ?? "").trim();

  if (hasExplicitPassphrase && trimmedPassphrase.length === 0) {
    throw new Error(
      "Invalid Stellar configuration: STELLAR_PASSPHRASE is set but empty. " +
        "Unset it to use the default for STELLAR_NETWORK, or provide a non-empty passphrase."
    );
  }

  const networkName = resolveNetworkName(opts.network);
  const defaults = NETWORK_DEFAULTS[networkName];

  const explicitHorizon = opts.horizonUrl?.trim();
  const explicitRpc = opts.sorobanRpcUrl?.trim();

  if (hasExplicitPassphrase) {
    const knownFromPassphrase = passphraseToNetwork(trimmedPassphrase);
    let resolvedNetwork: ResolvedStellarNetwork;

    if (knownFromPassphrase !== null) {
      // Known passphrase: must match the named network, otherwise it's a
      // config mismatch (e.g. STELLAR_NETWORK=testnet + STELLAR_PASSPHRASE=Public).
      if (knownFromPassphrase !== networkName) {
        throw new Error(
          `Invalid Stellar configuration: STELLAR_PASSPHRASE="${trimmedPassphrase}" ` +
            `does not match STELLAR_NETWORK="${networkName}". Either align the ` +
            `two variables or omit STELLAR_PASSPHRASE.`
        );
      }
      resolvedNetwork = networkName;
    } else {
      // Custom passphrase: requires both URLs so we know where to point.
      if (!explicitHorizon || !explicitRpc) {
        throw new Error(
          "Invalid Stellar configuration: STELLAR_PASSPHRASE is set to a custom " +
            "(non-standard) value. Both STELLAR_HORIZON_URL and SOROBAN_RPC_URL " +
            "must be set."
        );
      }
      resolvedNetwork = "custom";
    }

    return {
      network: resolvedNetwork,
      networkPassphrase: trimmedPassphrase,
      horizonUrl: explicitHorizon || defaults.horizon,
      sorobanRpcUrl: explicitRpc || defaults.rpc,
    };
  }

  return {
    network: networkName,
    networkPassphrase: NETWORK_TO_PASSPHRASE[networkName],
    horizonUrl: explicitHorizon || defaults.horizon,
    sorobanRpcUrl: explicitRpc || defaults.rpc,
  };
}
