import { describe, it, expect } from "vitest";
import {
  groupProofs,
  isHashesOnly,
  resolveProofHashExplorerUrl,
  summarizeProofs,
  truncateHash,
  type ProofAttachment,
} from "./proofAttachments";
import {
  proofHashesOnly,
  proofMatrix,
  proofOpaqueHash,
  proofTxHash,
} from "../mocks/fixtures/proofs";

describe("resolveProofHashExplorerUrl", () => {
  it("links a 64-hex hash to the network's explorer", () => {
    expect(resolveProofHashExplorerUrl(proofTxHash.value, "mainnet")).toBe(
      `https://stellar.expert/explorer/public/tx/${proofTxHash.value}`
    );
    expect(resolveProofHashExplorerUrl(proofTxHash.value, "testnet")).toBe(
      `https://stellar.expert/explorer/testnet/tx/${proofTxHash.value}`
    );
  });

  it("normalizes case and surrounding whitespace", () => {
    const url = resolveProofHashExplorerUrl(
      `  ${proofTxHash.value.toUpperCase()}  `,
      "testnet"
    );
    expect(url).toBe(
      `https://stellar.expert/explorer/testnet/tx/${proofTxHash.value}`
    );
  });

  it("returns null for a value that isn't an on-chain hash", () => {
    expect(resolveProofHashExplorerUrl(proofOpaqueHash.value, "testnet")).toBeNull();
    expect(resolveProofHashExplorerUrl("deadbeef", "testnet")).toBeNull();
  });
});

describe("truncateHash", () => {
  it("middle-truncates long values", () => {
    expect(truncateHash(proofTxHash.value)).toBe(
      `${proofTxHash.value.slice(0, 8)}…${proofTxHash.value.slice(-8)}`
    );
  });

  it("leaves short values untouched", () => {
    expect(truncateHash("abc123")).toBe("abc123");
  });
});

describe("isHashesOnly", () => {
  it("is true when every proof is a hash", () => {
    expect(isHashesOnly(proofHashesOnly)).toBe(true);
  });

  it("is false for a mixed set or an empty set", () => {
    expect(isHashesOnly(proofMatrix)).toBe(false);
    expect(isHashesOnly([])).toBe(false);
  });
});

describe("groupProofs / summarizeProofs", () => {
  it("splits a mixed list by kind, preserving order", () => {
    const { images, links, hashes } = groupProofs(proofMatrix);
    expect(images).toHaveLength(2);
    expect(links).toHaveLength(1);
    expect(hashes).toHaveLength(2);
  });

  it("summarizes counts with pluralization", () => {
    expect(summarizeProofs(proofMatrix)).toBe("2 photos, 1 link, 2 hashes");
    const single: ProofAttachment[] = [
      { kind: "image", url: "x" },
      { kind: "hash", value: "y" },
    ];
    expect(summarizeProofs(single)).toBe("1 photo, 1 hash");
  });
});
