"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useNetwork } from "../../hooks/useNetwork";
import { useWallet } from "../../hooks/useWallet";
import { getConfiguredContracts } from "../../lib/contracts";
import {
  KILL_SWITCH_CONFIRM_PHRASE,
  executeKillSwitch,
  hasKillSwitchAction,
  isKillSwitchConfirmed,
  type KillSwitchPayload,
  type KillSwitchResult,
} from "../../lib/killSwitch";
import { signWithFreighter } from "../../lib/sorobanInvoke";

type Step = "review" | "confirm";

/**
 * Settings → Danger zone → Emergency kill-switch (#719). Revokes every agent
 * spending key on-chain in one transaction, behind a double confirmation:
 * a review step, then typing REVOKE.
 */
export function KillSwitchCard() {
  const { address } = useWallet();
  const { network, networkId } = useNetwork();
  const panelRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("review");
  const [revokeAll, setRevokeAll] = useState(true);
  const [cancelPending, setCancelPending] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KillSwitchResult | null>(null);

  useFocusTrap(panelRef, open);

  const close = useCallback(() => {
    if (running) return;
    setOpen(false);
    setStep("review");
    setConfirmText("");
    setError(null);
  }, [running]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  const payload: KillSwitchPayload | null = address
    ? {
        walletAddress: address,
        revokeAllDelegations: revokeAll,
        cancelPendingOrders: cancelPending,
      }
    : null;

  async function handleExecute() {
    if (!payload || !isKillSwitchConfirmed(confirmText) || running) return;
    setRunning(true);
    setError(null);
    try {
      const permissions = getConfiguredContracts(networkId).find(
        (c) => c.name === "permissions"
      );
      const outcome = await executeKillSwitch({
        payload,
        rpcUrl: network.sorobanRpcUrl,
        networkPassphrase: network.networkPassphrase,
        permissionsContractId: permissions?.addressValid ? permissions.address : null,
        signTransaction: (xdr) =>
          signWithFreighter(xdr, network.networkPassphrase, payload.walletAddress),
      });
      setResult(outcome);
      setOpen(false);
      setStep("review");
      setConfirmText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The kill-switch failed. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card title="Danger zone" ariaLabel="Emergency kill-switch" className="kill-switch-card">
      <div className="settings-section">
        <div>
          <p className="settings-toggle-label">Emergency kill-switch</p>
          <p className="settings-toggle-hint">
            Instantly revokes every agent&apos;s spending key on-chain in a single
            transaction. Use this if an agent is misbehaving or you think a key
            has been compromised. Agents need a new delegation before they can
            spend again.
          </p>
        </div>

        {result && (
          <div className="settings-status success" role="status">
            {result.revokeTxHash && (
              <>
                All delegations revoked (tx <code>{result.revokeTxHash.slice(0, 12)}…</code>).{" "}
              </>
            )}
            {result.cancelledOrders !== null &&
              `${result.cancelledOrders} pending order${result.cancelledOrders === 1 ? "" : "s"} cancelled.`}
          </div>
        )}
        {result?.cancelError && (
          <div className="settings-status error" role="alert">
            Delegations were revoked, but pending orders couldn&apos;t be cancelled:{" "}
            {result.cancelError}
          </div>
        )}

        <div className="form-actions">
          <Button
            variant="destructive"
            className="kill-switch-button"
            onClick={() => {
              setResult(null);
              setOpen(true);
            }}
            disabled={!address}
          >
            Revoke all agent access
          </Button>
        </div>
        {!address && (
          <p className="settings-toggle-hint">Connect your wallet to use the kill-switch.</p>
        )}
      </div>

      {open && payload && (
        <div className="approval-drawer-overlay" onClick={close}>
          <div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="kill-switch-title"
            aria-describedby="kill-switch-desc"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="kill-switch-modal"
          >
            <h2 id="kill-switch-title" style={{ margin: 0 }}>
              {step === "review" ? "Revoke all agent access?" : "Confirm emergency revocation"}
            </h2>

            {step === "review" ? (
              <>
                <p id="kill-switch-desc" style={{ margin: 0 }}>
                  This can&apos;t be undone. Choose what the kill-switch should do:
                </p>
                <label className="kill-switch-option">
                  <input
                    type="checkbox"
                    checked={revokeAll}
                    onChange={(e) => setRevokeAll(e.target.checked)}
                  />
                  Revoke every agent delegation on-chain
                </label>
                <label className="kill-switch-option">
                  <input
                    type="checkbox"
                    checked={cancelPending}
                    onChange={(e) => setCancelPending(e.target.checked)}
                  />
                  Cancel all pending orders
                </label>
                <div className="form-actions">
                  <Button variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setStep("confirm")}
                    disabled={!hasKillSwitchAction(payload)}
                  >
                    Continue
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p id="kill-switch-desc" style={{ margin: 0 }}>
                  Type <strong>{KILL_SWITCH_CONFIRM_PHRASE}</strong> to confirm.
                  {revokeAll && " You'll be asked to sign one transaction in your wallet."}
                </p>
                <input
                  type="text"
                  className="order-search"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={KILL_SWITCH_CONFIRM_PHRASE}
                  aria-label={`Type ${KILL_SWITCH_CONFIRM_PHRASE} to confirm`}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={running}
                  autoFocus
                />
                {error && (
                  <p role="alert" className="settings-status error" style={{ margin: 0 }}>
                    {error}
                  </p>
                )}
                <div className="form-actions">
                  <Button variant="ghost" onClick={() => setStep("review")} disabled={running}>
                    Back
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void handleExecute()}
                    disabled={!isKillSwitchConfirmed(confirmText) || running}
                    loading={running}
                  >
                    {running ? "Revoking…" : "Revoke everything now"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
