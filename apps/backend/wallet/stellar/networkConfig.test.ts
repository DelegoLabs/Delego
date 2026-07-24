import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Networks } from "@stellar/stellar-sdk";
import { validateStellarNetworkConfig } from "./networkConfig.js";

describe("Stellar Network Passphrase Validation (Issue #120)", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.STELLAR_NETWORK;
    delete process.env.STELLAR_NETWORK_PASSPHRASE;
    delete process.env.STELLAR_HORIZON_URL;
    delete process.env.STELLAR_RPC_URL;
    delete process.env.ALLOW_CUSTOM_PASSPHRASE;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("validates testnet passphrase by default", () => {
    const config = validateStellarNetworkConfig();
    expect(config.networkPassphrase).toBe(Networks.TESTNET);
    expect(config.horizonUrl).toContain("testnet");
    expect(config.rpcUrl).toContain("testnet");
  });

  it("validates public (mainnet) network passphrase", () => {
    process.env.STELLAR_NETWORK = "mainnet";
    const config = validateStellarNetworkConfig();
    expect(config.networkPassphrase).toBe(Networks.PUBLIC);
    expect(config.horizonUrl).toBe("https://horizon.stellar.org");
    expect(config.rpcUrl).toBe("https://rpc.stellar.org");
  });

  it("validates custom network passphrase when custom mode is allowed", () => {
    process.env.STELLAR_NETWORK = "custom";
    process.env.ALLOW_CUSTOM_PASSPHRASE = "true";
    const customPass = "Custom Local Standalone Network ; 2026";
    const config = validateStellarNetworkConfig({
      networkPassphrase: customPass,
      horizonUrl: "http://localhost:8000",
      rpcUrl: "http://localhost:8000/soroban/rpc",
    });

    expect(config.networkPassphrase).toBe(customPass);
    expect(config.horizonUrl).toBe("http://localhost:8000");
    expect(config.rpcUrl).toBe("http://localhost:8000/soroban/rpc");
  });

  it("rejects empty passphrase at startup", () => {
    expect(() =>
      validateStellarNetworkConfig({ networkPassphrase: "" })
    ).toThrow("Invalid Stellar network passphrase: passphrase cannot be empty");

    expect(() =>
      validateStellarNetworkConfig({ networkPassphrase: "   " })
    ).toThrow("Invalid Stellar network passphrase: passphrase cannot be empty");
  });

  it("rejects unknown network passphrase when not in custom mode", () => {
    process.env.STELLAR_NETWORK = "unknown_net";
    process.env.ALLOW_CUSTOM_PASSPHRASE = "false";
    expect(() =>
      validateStellarNetworkConfig({ networkPassphrase: "Some Random Unknown Passphrase" })
    ).toThrow("Unknown Stellar network passphrase");
  });
});
