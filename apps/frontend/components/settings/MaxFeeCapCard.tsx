"use client";

import { useEffect, useState } from "react";
import { Button, Card, StroopsInput } from "@delegolabs/ui";
import { useFeeSurgeGuard } from "../../hooks/useFeeSurgeGuard";
import {
  DEFAULT_MAX_FEE_CAP_STROOPS,
  isValidMaxFeeCapStroops,
} from "../../lib/maxFeeCap";
import { feeSurgeRatio } from "../../lib/feeSurge";

const STROOPS_PER_XLM = 10_000_000n;

/** Formats a stroop amount for display, e.g. "0.01 XLM (100,000 stroops)". */
function formatFee(stroops: string): string {
  if (!/^\d+$/.test(stroops)) return `${stroops} stroops`;
  try {
    const amount = BigInt(stroops);
    const xlm = Number(amount) / Number(STROOPS_PER_XLM);
    const formatted = xlm.toLocaleString(undefined, { maximumFractionDigits: 7 });
    return `${formatted} XLM (${amount.toLocaleString()} stroops)`;
  } catch {
    return `${stroops} stroops`;
  }
}

/**
 * Max-fee comfort limit setting (#1002).
 *
 * The ceiling the user is comfortable paying for a single transaction's
 * network fee. When the live fee estimate crosses it, the transaction flow
 * raises the surge warning and the user has to approve the higher fee
 * explicitly (see `components/transactions/FeeSurgeWarningModal.tsx`).
 *
 * The limit is a plain UI preference, so it lives in localStorage and is
 * deliberately left alone by "Clear local data".
 */
export function MaxFeeCapCard() {
  const { estimate, source, maxFeeStroops, setMaxFeeStroops } = useFeeSurgeGuard();
  const [draftStroops, setDraftStroops] = useState<bigint>(
    BigInt(DEFAULT_MAX_FEE_CAP_STROOPS)
  );
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Keep the input in sync with the persisted limit once it has been read.
  useEffect(() => {
    setDraftStroops(BigInt(maxFeeStroops));
  }, [maxFeeStroops]);

  function handleSave() {
    setStatus(null);
    const value = draftStroops.toString();
    if (!isValidMaxFeeCapStroops(value)) {
      setStatus({
        type: "error",
        message: "Enter a max fee of at least 1 stroop.",
      });
      return;
    }
    if (setMaxFeeStroops(value)) {
      setStatus({ type: "success", message: "Max fee limit updated" });
    } else {
      setStatus({
        type: "error",
        message: "Could not save the max fee limit on this device.",
      });
    }
  }

  function handleReset() {
    setStatus(null);
    setMaxFeeStroops(DEFAULT_MAX_FEE_CAP_STROOPS);
    setDraftStroops(BigInt(DEFAULT_MAX_FEE_CAP_STROOPS));
    setStatus({ type: "success", message: "Max fee limit reset to default" });
  }

  const ratio = estimate ? feeSurgeRatio(estimate) : null;

  return (
    <Card title="Max fee limit" ariaLabel="Max fee limit">
      <div className="settings-section">
        <label
          htmlFor="max-fee-cap"
          style={{ display: "block", fontWeight: 500 }}
        >
          Maximum network fee per transaction
        </label>
        <p
          id="max-fee-cap-hint"
          style={{ fontSize: "0.875rem", color: "#666", margin: "0.25rem 0 0.5rem" }}
        >
          When the network fee for a transaction goes above this limit, we ask
          you to approve the higher fee before signing.
        </p>
        <StroopsInput
          id="max-fee-cap"
          aria-label="Max fee limit in XLM"
          aria-describedby="max-fee-cap-hint"
          value={draftStroops}
          onChange={setDraftStroops}
          showStroopsHint
          style={{ width: "100%" }}
        />

        <dl className="wallet-detail-list" style={{ marginTop: "0.75rem" }}>
          <div className="wallet-detail-row">
            <dt>Current limit</dt>
            <dd>{formatFee(maxFeeStroops)}</dd>
          </div>
          <div className="wallet-detail-row">
            <dt>Recommended fee now</dt>
            <dd>
              {estimate ? formatFee(estimate.recommendedFeeStroops) : "Loading…"}
            </dd>
          </div>
          {estimate && (
            <div className="wallet-detail-row">
              <dt>Network status</dt>
              <dd>
                {estimate.isSurgeActive
                  ? "Congested — fees are above their normal level"
                  : "Normal"}
              </dd>
            </div>
          )}
          {ratio !== null && ratio > 1 && (
            <div className="wallet-detail-row">
              <dt>Compared with base fee</dt>
              <dd>{`${ratio.toFixed(1)}×`}</dd>
            </div>
          )}
        </dl>

        {source === "fallback" && (
          <p
            role="status"
            style={{ fontSize: "0.8125rem", color: "#92400e", marginTop: "0.5rem" }}
          >
            Live network fees are unavailable — showing the minimum network fee.
          </p>
        )}

        {status && (
          <div className={`settings-status ${status.type}`} role="status">
            {status.message}
          </div>
        )}

        <div className="form-actions">
          <Button variant="secondary" type="button" onClick={handleReset}>
            Reset to default
          </Button>
          <Button variant="primary" type="button" onClick={handleSave}>
            Save limit
          </Button>
        </div>
      </div>
    </Card>
  );
}
