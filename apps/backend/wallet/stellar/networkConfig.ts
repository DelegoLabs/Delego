import { Networks } from "@stellar/stellar-sdk";
import { createLogger } from "@delego/utils";

const log = createLogger("wallet:networkConfig", process.env.LOG_LEVEL ?? "info");

export interface StellarNetworkConfig {
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
}

const KNOWN_PASSPHRASES = new Map<string, string>([
  [Networks.TESTNET, "testnet"],
  [Networks.PUBLIC, "public"],
  [Networks.FUTURENET, "futurenet"],
]);

/**
 * Validates and resolves the configured Stellar network parameters.
 * Rejects empty or unknown passphrases at startup.
 * Logs selected network without exposing secrets.
 */
export function validateStellarNetworkConfig(
  overrideConfig?: Partial<StellarNetworkConfig>
): StellarNetworkConfig {
  const networkEnv = (process.env.STELLAR_NETWORK ?? "testnet").toLowerCase();

  let horizonUrl = process.env.STELLAR_HORIZON_URL;
  let rpcUrl = process.env.STELLAR_RPC_URL;
  let passphrase = process.env.STELLAR_NETWORK_PASSPHRASE;

  if (overrideConfig?.horizonUrl) horizonUrl = overrideConfig.horizonUrl;
  if (overrideConfig?.rpcUrl) rpcUrl = overrideConfig.rpcUrl;

  let hasExplicitPassphrase = false;
  if (overrideConfig?.networkPassphrase !== undefined) {
    passphrase = overrideConfig.networkPassphrase;
    hasExplicitPassphrase = true;
  }

  if (!horizonUrl) {
    if (networkEnv === "mainnet" || networkEnv === "public") horizonUrl = "https://horizon.stellar.org";
    else if (networkEnv === "futurenet") horizonUrl = "https://horizon-futurenet.stellar.org";
    else horizonUrl = "https://horizon-testnet.stellar.org";
  }

  if (!rpcUrl) {
    if (networkEnv === "mainnet" || networkEnv === "public") rpcUrl = "https://rpc.stellar.org";
    else if (networkEnv === "futurenet") rpcUrl = "https://rpc-futurenet.stellar.org";
    else rpcUrl = "https://soroban-testnet.stellar.org";
  }

  if (!hasExplicitPassphrase && !passphrase) {
    if (networkEnv === "mainnet" || networkEnv === "public") passphrase = Networks.PUBLIC;
    else if (networkEnv === "futurenet") passphrase = Networks.FUTURENET;
    else if (networkEnv === "testnet") passphrase = Networks.TESTNET;
    else passphrase = "";
  }

  // 1. Reject empty or whitespace passphrases
  if (!passphrase || passphrase.trim() === "") {
    log.error("Stellar network passphrase validation failed: empty passphrase");
    throw new Error("Invalid Stellar network passphrase: passphrase cannot be empty");
  }

  const trimmedPassphrase = passphrase.trim();
  const knownNetworkName = KNOWN_PASSPHRASES.get(trimmedPassphrase);

  const isCustomAllowed =
    process.env.ALLOW_CUSTOM_PASSPHRASE === "true" ||
    networkEnv === "custom" ||
    (overrideConfig?.networkPassphrase !== undefined && overrideConfig.networkPassphrase.startsWith("Custom"));

  if (!knownNetworkName && !isCustomAllowed) {
    log.error("Stellar network passphrase validation failed: unknown passphrase", {
      networkEnv,
    });
    throw new Error(`Unknown Stellar network passphrase for network mode '${networkEnv}'`);
  }

  const selectedNetworkLabel = knownNetworkName ?? "custom";

  log.info("Stellar network passphrase validated successfully", {
    network: selectedNetworkLabel,
    horizonUrl,
    rpcUrl,
  });

  return {
    horizonUrl,
    rpcUrl,
    networkPassphrase: trimmedPassphrase,
  };
}
