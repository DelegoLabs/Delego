"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Amount, Button } from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import { useNetwork } from "../../hooks/useNetwork";
import { useWallet } from "../../hooks/useWallet";
import {
  LEDGER_CLOSE_SECONDS,
  computeTimeoutRefundState,
  fetchCurrentLedger,
  formatLedgerCountdown,
  invokeEscrowRefund,
  signWithFreighter,
} from "../../lib/timeoutRefund";

export interface TimeoutRefundButtonProps {
  /** Escrow contract address ("C..."). */
  contractId: string;
  timeoutLedger: number;
  refundAmountStroops: string;
  /** Seed value for the current ledger; polled from Soroban RPC afterwards. */
  initialLedger?: number;
  onRefunded?: (txHash: string) => void;
}

/**
 * Buyer's "Claim full refund" action once the escrow's Soroban timeout ledger
 * passes without delivery (#713). Disabled with a countdown while
 * `currentLedger < timeoutLedger`, then invokes the contract's `refund()`.
 */
export function TimeoutRefundButton({
  contractId,
  timeoutLedger,
  refundAmountStroops,
  initialLedger,
  onRefunded,
}: TimeoutRefundButtonProps) {
  const { network } = useNetwork();
  const { address } = useWallet();
  const { currencyId, rate } = useCurrency();

  const [currentLedger, setCurrentLedger] = useState<number | null>(initialLedger ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const state =
    currentLedger === null
      ? null
      : computeTimeoutRefundState(currentLedger, timeoutLedger, refundAmountStroops);

  // Poll the latest ledger until the timeout passes.
  useEffect(() => {
    if (state?.canRefund || txHash) return;
    let cancelled = false;
    const tick = () => {
      fetchCurrentLedger(network.sorobanRpcUrl)
        .then((ledger) => {
          if (!cancelled) setCurrentLedger(ledger);
        })
        .catch(() => {
          // Keep the last known ledger; the next tick retries.
        });
    };
    tick();
    const id = setInterval(tick, LEDGER_CLOSE_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [network.sorobanRpcUrl, state?.canRefund, txHash]);

  const handleRefund = useCallback(async () => {
    if (inFlightRef.current || !state?.canRefund || !address) return;
    inFlightRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await invokeEscrowRefund({
        rpcUrl: network.sorobanRpcUrl,
        networkPassphrase: network.networkPassphrase,
        contractId,
        buyerAddress: address,
        signTransaction: (xdr) =>
          signWithFreighter(xdr, network.networkPassphrase, address),
      });
      setTxHash(result.txHash);
      onRefunded?.(result.txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed. Please try again.");
    } finally {
      setSubmitting(false);
      inFlightRef.current = false;
    }
  }, [address, contractId, network, onRefunded, state?.canRefund]);

  if (txHash) {
    return (
      <p role="status" className="settings-status success">
        Refund claimed. Transaction <code>{txHash.slice(0, 12)}…</code>
      </p>
    );
  }

  const disabled = !state?.canRefund || !address || submitting;
  const countdown =
    state && !state.canRefund
      ? `Available in ${state.remainingLedgers.toLocaleString()} ledgers (${formatLedgerCountdown(state.remainingLedgers)})`
      : null;

  return (
    <div className="timeout-refund">
      <Button
        variant="primary"
        type="button"
        onClick={() => void handleRefund()}
        disabled={disabled}
        loading={submitting}
        aria-describedby="timeout-refund-hint"
      >
        {submitting ? "Claiming refund…" : "Claim full refund"}
      </Button>
      <p id="timeout-refund-hint" className="stat-label" aria-live="polite" style={{ margin: 0 }}>
        {state === null && "Checking escrow timeout…"}
        {countdown}
        {state?.canRefund && (
          <>
            Delivery timed out — refund{" "}
            <Amount
              stroops={/^\d+$/.test(refundAmountStroops) ? BigInt(refundAmountStroops) : 0n}
              currency={currencyId}
              xlmUsdRate={rate?.xlmUsdRate}
            />{" "}
            to your wallet.
          </>
        )}
        {state?.canRefund && !address && " Connect your wallet to claim it."}
      </p>
      {error && (
        <p role="alert" className="settings-status error" style={{ margin: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}
