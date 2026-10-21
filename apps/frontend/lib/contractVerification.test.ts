import { describe, expect, it, vi } from "vitest";
import {
  buildVerificationDetails,
  decodeContractMeta,
  fetchContractCode,
  readContractMeta,
  truncateWasmHash,
  wasmCustomSections,
  type ContractRelease,
} from "./contractVerification";

const HASH = "ab".repeat(32);
const COMMIT = "4f1c9b2d7e8a6c5b3a2f1e0d9c8b7a6f5e4d3c2b";

const RELEASE: ContractRelease = {
  wasmHash: HASH.toUpperCase(),
  contract: "delego-escrow",
  releaseTag: "v1.4.0",
  gitCommitHash: COMMIT,
  sorobanSdkVersion: "22.0.0",
  buildProofUrl: "https://github.com/DelegoLabs/Delego-contracts/actions/runs/1",
};

// --- helpers to build a WASM module with a contractmetav0 section ---------

function xdrString(s: string): number[] {
  const bytes = [...new TextEncoder().encode(s)];
  const len = bytes.length;
  const pad = (4 - (len % 4)) % 4;
  return [(len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff, ...bytes, ...Array(pad).fill(0)];
}

function metaEntry(key: string, val: string): number[] {
  return [0, 0, 0, 0, ...xdrString(key), ...xdrString(val)];
}

function leb(n: number): number[] {
  const out: number[] = [];
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n) byte |= 0x80;
    out.push(byte);
  } while (n);
  return out;
}

function customSection(name: string, payload: number[]): number[] {
  const nameBytes = [...new TextEncoder().encode(name)];
  const body = [...leb(nameBytes.length), ...nameBytes, ...payload];
  return [0, ...leb(body.length), ...body];
}

function wasmWithMeta(entries: Array<[string, string]>): Uint8Array {
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    // An unrelated empty type section, then the meta.
    0x01, 0x01, 0x00,
    ...customSection("contractspecv0", [1, 2, 3]),
    ...customSection("contractmetav0", entries.flatMap(([k, v]) => metaEntry(k, v))),
  ]);
}

describe("WASM meta parsing", () => {
  it("finds custom sections by name and decodes ScMetaV0 entries", () => {
    const wasm = wasmWithMeta([
      ["rsver", "1.81.0"],
      ["rssdkver", "22.0.0#8c3f1a"],
      ["source_rev", COMMIT],
    ]);
    expect(wasmCustomSections(wasm, "contractspecv0")).toHaveLength(1);
    expect(readContractMeta(wasm)).toEqual({
      rsver: "1.81.0",
      rssdkver: "22.0.0#8c3f1a",
      source_rev: COMMIT,
    });
  });

  it("pads odd-length XDR strings correctly", () => {
    const payload = new Uint8Array([...metaEntry("a", "bcd"), ...metaEntry("ef", "g")]);
    expect(decodeContractMeta(payload)).toEqual({ a: "bcd", ef: "g" });
  });

  it("rejects non-WASM input", () => {
    expect(() => wasmCustomSections(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]), "x")).toThrow(
      /Not a WebAssembly module/
    );
  });
});

describe("buildVerificationDetails", () => {
  it("marks a hash listed in the release manifest as source verified", () => {
    const details = buildVerificationDetails(
      "CCONTRACT",
      HASH,
      { rsver: "1.81.0", rssdkver: "22.0.0#8c3f1a" },
      [RELEASE]
    );
    expect(details).toMatchObject({
      contractAddress: "CCONTRACT",
      wasmHash: HASH,
      gitCommitHash: COMMIT,
      sorobanSdkVersion: "22.0.0",
      isSourceVerified: true,
      rustcVersion: "1.81.0",
      releaseUrl: "https://github.com/DelegoLabs/Delego-contracts/releases/tag/v1.4.0",
      commitUrl: `https://github.com/DelegoLabs/Delego-contracts/commit/${COMMIT}`,
      buildProofUrl: RELEASE.buildProofUrl,
    });
  });

  it("reports an unknown hash as unverified, falling back to embedded meta", () => {
    const details = buildVerificationDetails(
      "CCONTRACT",
      "cd".repeat(32),
      { rssdkver: "21.7.1#abc", source_rev: "deadbeef" },
      [RELEASE]
    );
    expect(details.isSourceVerified).toBe(false);
    expect(details.release).toBeNull();
    expect(details.releaseUrl).toBeNull();
    expect(details.sorobanSdkVersion).toBe("21.7.1");
    expect(details.gitCommitHash).toBe("deadbeef");
  });

  it("truncates hashes for display", () => {
    expect(truncateWasmHash(HASH)).toBe("abababab…abababab");
  });
});

describe("fetchContractCode", () => {
  it("reads the WASM hash from the instance entry and the code from its code entry", async () => {
    const { StrKey } = await import("@stellar/stellar-sdk");
    const address = StrKey.encodeContract(Buffer.alloc(32, 7));
    const hashBytes = Buffer.from(HASH, "hex");
    const wasm = wasmWithMeta([["rsver", "1.81.0"]]);

    const getLedgerEntries = vi
      .fn()
      .mockResolvedValueOnce({
        entries: [
          {
            val: {
              contractData: () => ({
                val: () => ({
                  instance: () => ({
                    executable: () => ({
                      switch: () => ({ name: "contractExecutableWasm" }),
                      wasmHash: () => hashBytes,
                    }),
                  }),
                }),
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        entries: [{ val: { contractCode: () => ({ code: () => Buffer.from(wasm) }) } }],
      });

    const sdk = await import("@stellar/stellar-sdk");
    const spy = vi
      .spyOn(sdk.rpc.Server.prototype, "getLedgerEntries")
      .mockImplementation(getLedgerEntries);

    const result = await fetchContractCode("https://rpc.example", address);
    expect(result.wasmHash).toBe(HASH);
    expect(result.wasm && readContractMeta(result.wasm)).toEqual({ rsver: "1.81.0" });
    expect(getLedgerEntries).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
