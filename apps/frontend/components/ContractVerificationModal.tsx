"use client";

/**
 * Soroban contract bytecode explorer (#999).
 *
 * Fetches the deployed WASM hash straight from Soroban RPC, shows the build
 * parameters embedded in the WASM, and — when the hash matches a published
 * reproducible build — links the GitHub release, source commit and build
 * proof, so users can check exactly what code holds their funds.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button } from "@delegolabs/ui";
import { CopyButton } from "./wallet/CopyButton";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { explorerContractUrl } from "../lib/contracts";
import {
  truncateWasmHash,
  verifyContract,
  type ContractVerificationDetails,
} from "../lib/contractVerification";
import { getNetworkConfig, type NetworkId } from "../lib/networks";

export type { ContractVerificationMetadata } from "../lib/contractVerification";

export interface ContractVerificationModalProps {
  open: boolean;
  contractAddress: string;
  /** Human label, e.g. "Escrow". */
  contractLabel: string;
  networkId: NetworkId;
  onClose: () => void;
  /** Overridable for tests; defaults to a live Soroban RPC lookup. */
  verify?: (rpcUrl: string, contractAddress: string) => Promise<ContractVerificationDetails>;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; details: ContractVerificationDetails };

const BUILD_META_LABELS: Record<string, string> = {
  rsver: "Rust compiler",
  rssdkver: "soroban-sdk (with git rev)",
  source_rev: "Source revision",
  source_repo: "Source repository",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="wallet-detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function ContractVerificationModal({
  open,
  contractAddress,
  contractLabel,
  networkId,
  onClose,
  verify = verifyContract,
}: ContractVerificationModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap({ containerRef: panelRef, isActive: open, onEscape: onClose });
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const verifyRef = useRef(verify);
  verifyRef.current = verify;

  const load = useCallback(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const { sorobanRpcUrl } = getNetworkConfig(networkId);
    verifyRef
      .current(sorobanRpcUrl, contractAddress)
      .then((details) => {
        if (!cancelled) setState({ kind: "ready", details });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : "Could not reach Soroban RPC.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [contractAddress, networkId]);

  useEffect(() => {
    if (!open) return;
    return load();
  }, [open, load]);

  if (!open) return null;

  const network = getNetworkConfig(networkId);

  return (
    <div className="approval-drawer-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contract-verification-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--color-bg-surface, #fff)",
          borderRadius: "0.75rem",
          padding: "1.25rem",
          maxWidth: "36rem",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          margin: "5vh auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.875rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <h2 id="contract-verification-title" style={{ margin: 0, fontSize: "1.125rem" }}>
            {contractLabel} contract bytecode
          </h2>
          <Badge tone={network.isLive ? "warning" : "info"}>{network.label}</Badge>
        </div>

        {state.kind === "loading" && (
          <p role="status" style={{ margin: 0, color: "#6b7280" }}>
            Fetching WASM hash from Soroban RPC…
          </p>
        )}

        {state.kind === "error" && (
          <div role="alert" className="settings-status error">
            <p style={{ margin: "0 0 0.5rem" }}>{state.message}</p>
            <Button type="button" variant="secondary" onClick={() => load()}>
              Retry
            </Button>
          </div>
        )}

        {state.kind === "ready" && (
          <VerificationDetails details={state.details} networkId={networkId} />
        )}

        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function VerificationDetails({
  details,
  networkId,
}: {
  details: ContractVerificationDetails;
  networkId: NetworkId;
}) {
  const extraMeta = Object.entries(details.buildMeta).filter(
    ([key]) => !["rsver", "rssdkver"].includes(key)
  );

  return (
    <>
      {details.isSourceVerified ? (
        <div data-testid="verification-status" data-verified="true">
          <Badge tone="success">Source verified</Badge>
          <p style={{ margin: "0.375rem 0 0", fontSize: "0.8125rem" }}>
            The deployed bytecode is byte-identical to the reproducible build of release{" "}
            <strong>{details.release?.releaseTag}</strong>.
          </p>
        </div>
      ) : (
        <div data-testid="verification-status" data-verified="false">
          <Badge tone="warning">Unverified</Badge>
          <p style={{ margin: "0.375rem 0 0", fontSize: "0.8125rem" }}>
            This WASM hash doesn&rsquo;t match any published Delego release. Don&rsquo;t
            trust it with funds until it&rsquo;s been verified.
          </p>
        </div>
      )}

      <dl className="wallet-detail-list">
        <Row label="Contract">
          <code style={{ wordBreak: "break-all" }}>{details.contractAddress}</code>
        </Row>
        <Row label="WASM hash">
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
            <code title={details.wasmHash} data-testid="wasm-hash">
              {truncateWasmHash(details.wasmHash)}
            </code>
            <CopyButton value={details.wasmHash} label="Copy WASM hash" />
          </span>
        </Row>
        <Row label="soroban-sdk">{details.sorobanSdkVersion}</Row>
        {details.rustcVersion && <Row label="Rust compiler">{details.rustcVersion}</Row>}
        <Row label="Git commit">
          {details.gitCommitHash ? (
            details.commitUrl ? (
              <a href={details.commitUrl} target="_blank" rel="noopener noreferrer">
                <code>{details.gitCommitHash.slice(0, 12)}</code>
              </a>
            ) : (
              <code>{details.gitCommitHash}</code>
            )
          ) : (
            "Not embedded"
          )}
        </Row>
        {extraMeta.map(([key, value]) => (
          <Row key={key} label={BUILD_META_LABELS[key] ?? key}>
            <code style={{ wordBreak: "break-all" }}>{value}</code>
          </Row>
        ))}
      </dl>

      <ul style={{ margin: 0, paddingLeft: "1.125rem", fontSize: "0.875rem" }}>
        {details.releaseUrl && (
          <li>
            <a href={details.releaseUrl} target="_blank" rel="noopener noreferrer">
              GitHub release {details.release?.releaseTag}
            </a>
          </li>
        )}
        {details.buildProofUrl && (
          <li>
            <a href={details.buildProofUrl} target="_blank" rel="noopener noreferrer">
              Build reproducibility proof
            </a>
          </li>
        )}
        <li>
          <a
            href={explorerContractUrl(networkId, details.contractAddress)}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Stellar Expert
          </a>
        </li>
      </ul>
    </>
  );
}

export default ContractVerificationModal;
