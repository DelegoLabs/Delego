"use client";

/**
 * INVARIANT: this file is provably read-only. It must never import or call
 * any spend-mutating endpoint (transactions/submit, escrow deposit/release/
 * refund, delegation update). It only ever calls api.previewSpend, which is
 * backed by a Soroban `simulateTransaction` call on the server — simulation
 * never signs or submits a transaction, so there is no code path here that
 * can touch a real balance or spending policy.
 */

import { useState } from "react";
import { StroopsInput, Card } from "@delego/ui";
import { stroopsToDisplay } from "@delego/utils/currency";
import { useWallet } from "../../hooks/useWallet";
import { api } from "../../lib/api";
import { remediationForReason } from "../../lib/spendPreview";
import type { SpendPreview } from "@delego/types";

export interface SpendPreviewSimulatorProps {
  /** Called when the result suggests editing spending limits or the merchant allowlist. */
  onEditLimits?: () => void;
  /** Called when the result suggests resuming a paused delegation. */
  onResume?: () => void;
}

type SimState = "idle" | "loading" | "succeeded" | "failed";

const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

/**
 * Dry-run panel: "if this delegate spends X right now, what happens?" Reads
 * the real on-chain preview_spend getter — see the invariant comment above.
 *
 * The delegate and merchant addresses are plain text inputs rather than
 * derived from the delegation, because this app's domain model doesn't
 * store a Stellar address for an agent (Delegation.agentId is an opaque
 * string) or for a merchant (allowedMerchants holds merchant IDs, not
 * addresses) — see the ticket's open questions.
 */
export function SpendPreviewSimulator({ onEditLimits, onResume }: SpendPreviewSimulatorProps) {
  const { address: ownerAddress } = useWallet();
  const [amountStroops, setAmountStroops] = useState(0n);
  const [delegate, setDelegate] = useState("");
  const [merchant, setMerchant] = useState("");
  const [state, setState] = useState<SimState>("idle");
  const [result, setResult] = useState<SpendPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const delegateValid = STELLAR_ADDRESS_RE.test(delegate);
  const merchantValid = STELLAR_ADDRESS_RE.test(merchant);
  const canSimulate =
    !!ownerAddress && delegateValid && merchantValid && amountStroops > 0n && state !== "loading";

  const handleSimulate = async () => {
    if (!ownerAddress || !canSimulate) return;
    setState("loading");
    setError(null);
    setResult(null);
    try {
      const res = await api.previewSpend({
        owner: ownerAddress,
        delegate,
        amountStroops: amountStroops.toString(),
        merchant,
      });
      if (res.error || !res.data) {
        setState("failed");
        setError(res.error?.message ?? "Simulation failed");
        return;
      }
      setState("succeeded");
      setResult(res.data);
    } catch {
      setState("failed");
      setError("Simulation failed");
    }
  };

  const remediation = result && !result.allowed ? remediationForReason(result.reason) : null;

  return (
    <Card title="Simulate a spend" ariaLabel="Spend limit simulator">
      <div className="settings-section">
        <label htmlFor="sim-amount">Amount</label>
        <StroopsInput id="sim-amount" value={amountStroops} onChange={setAmountStroops} style={{ width: "100%" }} />

        <label htmlFor="sim-delegate">Delegate address</label>
        <input
          id="sim-delegate"
          value={delegate}
          onChange={(e) => setDelegate(e.target.value.trim())}
          placeholder="G…"
          style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem" }}
        />

        <label htmlFor="sim-merchant">Merchant address</label>
        <input
          id="sim-merchant"
          value={merchant}
          onChange={(e) => setMerchant(e.target.value.trim())}
          placeholder="G…"
          style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem" }}
        />

        <div className="form-actions">
          <button type="button" onClick={handleSimulate} disabled={!canSimulate}>
            {state === "loading" ? "Simulating…" : "Simulate"}
          </button>
        </div>

        {state === "idle" && !result && (
          <p className="stat-label">Enter an amount and both addresses, then simulate.</p>
        )}

        {state === "loading" && <p className="stat-label">Running simulation…</p>}

        {state === "failed" && error && (
          <p className="settings-status error" role="alert">
            {error}
          </p>
        )}

        {state === "succeeded" && result && (
          <div
            role="status"
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              borderRadius: "0.5rem",
              border: `1px solid ${result.allowed ? "var(--color-success-border, #a7f3d0)" : "var(--color-error-border, #fecaca)"}`,
              background: result.allowed ? "var(--color-success-bg, #ecfdf5)" : "var(--color-error-bg, #fee2e2)",
            }}
          >
            <p style={{ margin: "0 0 0.375rem", fontWeight: 600 }}>
              {result.allowed ? "Allowed" : "Denied"}
            </p>
            <p style={{ margin: "0 0 0.375rem" }}>
              Remaining after this spend: {stroopsToDisplay(BigInt(result.remainingAfterStroops))} XLM
            </p>
            {remediation && (
              <>
                <p style={{ margin: "0 0 0.5rem" }}>Blocked by: {remediation.constraint}</p>
                <button
                  type="button"
                  onClick={remediation.action === "resume" ? onResume : onEditLimits}
                >
                  {remediation.actionLabel}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
