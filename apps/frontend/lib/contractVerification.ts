/**
 * Soroban contract bytecode verification (#999).
 *
 * Answers "is the contract holding my funds the code Delego published?":
 *
 * 1. The contract's instance ledger entry is read straight from Soroban RPC
 *    to get the SHA-256 hash of the WASM it executes — no Delego API in the
 *    middle, so the answer can't be spoofed by our own backend.
 * 2. The WASM's `contractmetav0` custom section is decoded for the build
 *    parameters soroban-sdk embeds (`rsver`, `rssdkver`, and any
 *    `--meta key=value` pairs such as `source_rev`).
 * 3. The hash is looked up in the published release manifest. A match means
 *    the deployed bytecode is byte-identical to a reproducible build of a
 *    tagged release — that, and only that, is what "source verified" means.
 */

export interface ContractVerificationMetadata {
  contractAddress: string;
  wasmHash: string;
  gitCommitHash: string;
  sorobanSdkVersion: string;
  isSourceVerified: boolean;
}

/** A reproducible build published with a contracts release. */
export interface ContractRelease {
  /** Hex SHA-256 of the optimized WASM artifact. */
  wasmHash: string;
  /** Contract crate, e.g. "delego-escrow". */
  contract: string;
  /** Git tag of the release, e.g. "v1.4.0". */
  releaseTag: string;
  gitCommitHash: string;
  sorobanSdkVersion: string;
  /** CI run / attestation proving the artifact was rebuilt from source. */
  buildProofUrl?: string;
}

/** Everything the explorer modal shows. */
export interface ContractVerificationDetails extends ContractVerificationMetadata {
  /** Raw `contractmetav0` key/value pairs (compilation parameters). */
  buildMeta: Record<string, string>;
  /** Rust compiler version from `rsver`, if embedded. */
  rustcVersion: string | null;
  release: ContractRelease | null;
  releaseUrl: string | null;
  commitUrl: string | null;
  buildProofUrl: string | null;
}

export const CONTRACTS_REPO_URL = "https://github.com/DelegoLabs/Delego-contracts";

/**
 * Reproducible builds of tagged releases. Each entry is added by the
 * contracts release workflow alongside the GitHub release that publishes the
 * same WASM; anything deployed that isn't listed here is reported as
 * unverified.
 */
export const PUBLISHED_CONTRACT_RELEASES: readonly ContractRelease[] = [];

const HEX64 = /^[0-9a-f]{64}$/;

export function normalizeWasmHash(hash: string): string {
  return hash.trim().toLowerCase();
}

/** `abcd1234…9876fedc` */
export function truncateWasmHash(hash: string, edge = 8): string {
  const h = normalizeWasmHash(hash);
  return h.length <= edge * 2 + 1 ? h : `${h.slice(0, edge)}…${h.slice(-edge)}`;
}

export function findRelease(
  wasmHash: string,
  releases: readonly ContractRelease[] = PUBLISHED_CONTRACT_RELEASES
): ContractRelease | null {
  const wanted = normalizeWasmHash(wasmHash);
  return releases.find((r) => normalizeWasmHash(r.wasmHash) === wanted) ?? null;
}

export function releaseUrl(tag: string): string {
  return `${CONTRACTS_REPO_URL}/releases/tag/${encodeURIComponent(tag)}`;
}

export function commitUrl(commit: string): string | null {
  return /^[0-9a-f]{7,40}$/i.test(commit)
    ? `${CONTRACTS_REPO_URL}/commit/${commit.toLowerCase()}`
    : null;
}

// ---------------------------------------------------------------------------
// WASM metadata
// ---------------------------------------------------------------------------

function readLeb128(bytes: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    if (pos >= bytes.length) throw new Error("Truncated WASM.");
    const byte = bytes[pos++]!;
    result += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return [result, pos];
    shift += 7;
    if (shift > 35) throw new Error("Malformed WASM LEB128.");
  }
}

/** Payloads of every custom section named `name`, in order. */
export function wasmCustomSections(wasm: Uint8Array, name: string): Uint8Array[] {
  const magic = [0x00, 0x61, 0x73, 0x6d];
  if (wasm.length < 8 || magic.some((b, i) => wasm[i] !== b)) {
    throw new Error("Not a WebAssembly module.");
  }
  const decoder = new TextDecoder();
  const sections: Uint8Array[] = [];
  let pos = 8;
  while (pos < wasm.length) {
    const id = wasm[pos++]!;
    const [size, start] = readLeb128(wasm, pos);
    const end = start + size;
    if (end > wasm.length) throw new Error("Truncated WASM section.");
    if (id === 0) {
      const [nameLen, nameStart] = readLeb128(wasm, start);
      const sectionName = decoder.decode(wasm.subarray(nameStart, nameStart + nameLen));
      if (sectionName === name) sections.push(wasm.subarray(nameStart + nameLen, end));
    }
    pos = end;
  }
  return sections;
}

/**
 * Decodes a stream of XDR `ScMetaEntry` values (`SC_META_V0 { string key;
 * string val; }`) as written to `contractmetav0`.
 */
export function decodeContractMeta(payload: Uint8Array): Record<string, string> {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const decoder = new TextDecoder();
  const meta: Record<string, string> = {};
  let pos = 0;
  const readString = () => {
    const len = view.getUint32(pos);
    pos += 4;
    if (pos + len > payload.length) throw new Error("Truncated contract meta.");
    const value = decoder.decode(payload.subarray(pos, pos + len));
    pos += len + ((4 - (len % 4)) % 4);
    return value;
  };
  while (pos + 4 <= payload.length) {
    const kind = view.getInt32(pos);
    pos += 4;
    if (kind !== 0) break; // Unknown ScMetaEntry arm — stop rather than misread.
    const key = readString();
    meta[key] = readString();
  }
  return meta;
}

export function readContractMeta(wasm: Uint8Array): Record<string, string> {
  return Object.assign(
    {},
    ...wasmCustomSections(wasm, "contractmetav0").map(decodeContractMeta)
  );
}

/** "22.0.0#4f1c9b…" → { version: "22.0.0", rev: "4f1c9b…" } */
export function parseSdkVersion(value: string | undefined): {
  version: string | null;
  rev: string | null;
} {
  if (!value) return { version: null, rev: null };
  const [version, rev] = value.split("#");
  return { version: version || null, rev: rev || null };
}

/** Combines the RPC hash, the WASM meta and the release manifest. */
export function buildVerificationDetails(
  contractAddress: string,
  wasmHash: string,
  buildMeta: Record<string, string>,
  releases: readonly ContractRelease[] = PUBLISHED_CONTRACT_RELEASES
): ContractVerificationDetails {
  const hash = normalizeWasmHash(wasmHash);
  const release = findRelease(hash, releases);
  const sdk = parseSdkVersion(buildMeta.rssdkver);
  const gitCommitHash =
    release?.gitCommitHash ?? buildMeta.source_rev ?? buildMeta.git_commit ?? "";
  return {
    contractAddress,
    wasmHash: hash,
    gitCommitHash,
    sorobanSdkVersion: sdk.version ?? release?.sorobanSdkVersion ?? "unknown",
    isSourceVerified: release !== null,
    buildMeta,
    rustcVersion: buildMeta.rsver ?? null,
    release,
    releaseUrl: release ? releaseUrl(release.releaseTag) : null,
    commitUrl: gitCommitHash ? commitUrl(gitCommitHash) : null,
    buildProofUrl: release?.buildProofUrl ?? null,
  };
}

// ---------------------------------------------------------------------------
// Soroban RPC
// ---------------------------------------------------------------------------

export interface ContractCodeFetch {
  wasmHash: string;
  /** Null for Stellar Asset Contracts, which have no WASM. */
  wasm: Uint8Array | null;
}

/**
 * Reads the contract instance (→ WASM hash) and its code entry (→ bytecode)
 * from Soroban RPC. The SDK is loaded lazily to keep it out of the settings
 * page's initial bundle.
 */
export async function fetchContractCode(
  rpcUrl: string,
  contractAddress: string
): Promise<ContractCodeFetch> {
  const { Address, rpc, xdr } = await import("@stellar/stellar-sdk");
  const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith("http://") });

  const instanceKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractAddress).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    })
  );
  const instance = await server.getLedgerEntries(instanceKey);
  const entry = instance.entries[0];
  if (!entry) throw new Error("Contract instance not found on this network.");

  const executable = entry.val.contractData().val().instance().executable();
  if (executable.switch().name !== "contractExecutableWasm") {
    throw new Error("This is a Stellar Asset Contract — it runs built-in code, not WASM.");
  }
  const hashBytes = executable.wasmHash();
  const wasmHash = Array.from(hashBytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const codeKey = xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: hashBytes })
  );
  const code = await server.getLedgerEntries(codeKey);
  const codeEntry = code.entries[0];
  const wasm = codeEntry ? new Uint8Array(codeEntry.val.contractCode().code()) : null;

  if (!HEX64.test(wasmHash)) throw new Error("RPC returned a malformed WASM hash.");
  return { wasmHash, wasm };
}

/** Full verification lookup for one contract on one network. */
export async function verifyContract(
  rpcUrl: string,
  contractAddress: string,
  releases: readonly ContractRelease[] = PUBLISHED_CONTRACT_RELEASES
): Promise<ContractVerificationDetails> {
  const { wasmHash, wasm } = await fetchContractCode(rpcUrl, contractAddress);
  let meta: Record<string, string> = {};
  if (wasm) {
    try {
      meta = readContractMeta(wasm);
    } catch {
      // Unreadable meta doesn't change the hash comparison.
    }
  }
  return buildVerificationDetails(contractAddress, wasmHash, meta, releases);
}
