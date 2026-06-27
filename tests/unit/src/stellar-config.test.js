import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Networks } from "@stellar/stellar-sdk";
import { resolveAndValidateStellarConfig } from "../../../apps/backend/wallet/dist/src/stellarConfig.js";

/** Build a stub NodeJS.ProcessEnv shaped object for the validator. */
function makeEnv(overrides = {}) {
  return {
    STELLAR_NETWORK: undefined,
    STELLAR_PASSPHRASE: undefined,
    STELLAR_HORIZON_URL: undefined,
    SOROBAN_RPC_URL: undefined,
    ...overrides,
  };
}

describe("Stellar Network Passphrase Validation (#120)", () => {
  it("defaults to the Test SDF Network passphrase when no env vars are set", () => {
    const config = resolveAndValidateStellarConfig(makeEnv());
    assert.equal(config.network, "testnet");
    assert.equal(config.networkPassphrase, Networks.TESTNET);
    assert.equal(config.horizonUrl, "https://horizon-testnet.stellar.org");
    assert.equal(config.sorobanRpcUrl, "https://soroban-testnet.stellar.org");
  });

  it("resolves STELLAR_NETWORK=mainnet to the Networks.PUBLIC passphrase", () => {
    const config = resolveAndValidateStellarConfig(
      makeEnv({ STELLAR_NETWORK: "mainnet" })
    );
    assert.equal(config.network, "mainnet");
    assert.equal(config.networkPassphrase, Networks.PUBLIC);
    assert.equal(config.horizonUrl, "https://horizon.stellar.org");
  });

  it("resolves STELLAR_NETWORK=futurenet to the Networks.FUTURENET passphrase", () => {
    const config = resolveAndValidateStellarConfig(
      makeEnv({ STELLAR_NETWORK: "futurenet" })
    );
    assert.equal(config.network, "futurenet");
    assert.equal(config.networkPassphrase, Networks.FUTURENET);
    assert.equal(config.horizonUrl, "https://horizon-futurenet.stellar.org");
  });

  it("treats STELLAR_NETWORK case-insensitively and trims whitespace", () => {
    const config = resolveAndValidateStellarConfig(
      makeEnv({ STELLAR_NETWORK: "  MAINNET  " })
    );
    assert.equal(config.network, "mainnet");
    assert.equal(config.networkPassphrase, Networks.PUBLIC);
  });

  it("honors explicit STELLAR_HORIZON_URL and SOROBAN_RPC_URL overrides", () => {
    const config = resolveAndValidateStellarConfig(
      makeEnv({
        STELLAR_NETWORK: "testnet",
        STELLAR_HORIZON_URL: "https://my-horizon.example.test",
        SOROBAN_RPC_URL: "https://my-rpc.example.test",
      })
    );
    assert.equal(config.horizonUrl, "https://my-horizon.example.test");
    assert.equal(config.sorobanRpcUrl, "https://my-rpc.example.test");
  });

  it("accepts an explicit matching STELLAR_PASSPHRASE on the testnet", () => {
    const config = resolveAndValidateStellarConfig(
      makeEnv({
        STELLAR_NETWORK: "testnet",
        STELLAR_PASSPHRASE: Networks.TESTNET,
      })
    );
    assert.equal(config.network, "testnet");
    assert.equal(config.networkPassphrase, Networks.TESTNET);
  });

  it("accepts Networks.PUBLIC when STELLAR_NETWORK=mainnet", () => {
    const config = resolveAndValidateStellarConfig(
      makeEnv({
        STELLAR_NETWORK: "mainnet",
        STELLAR_PASSPHRASE: Networks.PUBLIC,
      })
    );
    assert.equal(config.network, "mainnet");
    assert.equal(config.networkPassphrase, Networks.PUBLIC);
  });

  it("accepts a custom STELLAR_PASSPHRASE together with explicit URLs", () => {
    const customPassphrase =
      "My Custom Standalone Network ; January 2025";
    const config = resolveAndValidateStellarConfig(
      makeEnv({
        STELLAR_NETWORK: "testnet",
        STELLAR_PASSPHRASE: customPassphrase,
        STELLAR_HORIZON_URL: "https://horizon.standalone.example",
        SOROBAN_RPC_URL: "https://rpc.standalone.example",
      })
    );
    assert.equal(config.network, "custom");
    assert.equal(config.networkPassphrase, customPassphrase);
    assert.equal(config.horizonUrl, "https://horizon.standalone.example");
    assert.equal(config.sorobanRpcUrl, "https://rpc.standalone.example");
  });

  it("rejects an unknown STELLAR_NETWORK value", () => {
    assert.throws(
      () =>
        resolveAndValidateStellarConfig(makeEnv({ STELLAR_NETWORK: "starwars" })),
      /STELLAR_NETWORK="starwars" is not recognized/
    );
  });

  it("rejects an empty / whitespace STELLAR_PASSPHRASE", () => {
    assert.throws(
      () =>
        resolveAndValidateStellarConfig(makeEnv({ STELLAR_PASSPHRASE: "   " })),
      /STELLAR_PASSPHRASE is set but empty/
    );
  });

  it("rejects an empty STELLAR_PASSPHRASE ('')", () => {
    assert.throws(
      () =>
        resolveAndValidateStellarConfig(makeEnv({ STELLAR_PASSPHRASE: "" })),
      /STELLAR_PASSPHRASE is set but empty/
    );
  });

  it("rejects a STELLAR_PASSPHRASE that disagrees with STELLAR_NETWORK", () => {
    assert.throws(
      () =>
        resolveAndValidateStellarConfig(
          makeEnv({
            STELLAR_NETWORK: "testnet",
            STELLAR_PASSPHRASE: Networks.PUBLIC,
          })
        ),
      /does not match STELLAR_NETWORK="testnet"/
    );
  });

  it("rejects a custom STELLAR_PASSPHRASE without explicit URLs", () => {
    assert.throws(
      () =>
        resolveAndValidateStellarConfig(
          makeEnv({
            STELLAR_PASSPHRASE:
              "My Custom Standalone Network ; January 2025",
          })
        ),
      /Both STELLAR_HORIZON_URL and SOROBAN_RPC_URL must be set/
    );
  });
});
