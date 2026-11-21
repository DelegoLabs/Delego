"use client";

import { useEffect, useRef } from "react";
import { Button } from "@delegolabs/ui";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { FriendbotRequestState } from "../../hooks/useFriendbot";

export interface FriendbotModalProps {
  isOpen: boolean;
  address: string;
  state: FriendbotRequestState;
  onFund: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: FriendbotRequestState["status"] }) {
  if (status === "requesting" || status === "polling") {
    return (
      <span
        className="friendbot-modal-spinner"
        role="img"
        aria-label="Loading"
      />
    );
  }
  if (status === "success") {
    return (
      <span
        className="friendbot-modal-icon friendbot-modal-icon--success"
        role="img"
        aria-label="Success"
      >
        ✓
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="friendbot-modal-icon friendbot-modal-icon--error"
        role="img"
        aria-label="Error"
      >
        ✕
      </span>
    );
  }
  return (
    <span
      className="friendbot-modal-icon friendbot-modal-icon--info"
      role="img"
      aria-label="Faucet"
    >
      💧
    </span>
  );
}

function statusHeading(status: FriendbotRequestState["status"]): string {
  switch (status) {
    case "requesting":
      return "Requesting funds…";
    case "polling":
      return "Waiting for ledger confirmation…";
    case "success":
      return "Account funded";
    case "error":
      return "Funding failed";
    default:
      return "Fund your testnet account";
  }
}

function statusBody(
  status: FriendbotRequestState["status"],
  state: FriendbotRequestState
): string {
  switch (status) {
    case "requesting":
      return "Calling the Stellar Friendbot faucet…";
    case "polling":
      return "Transaction submitted. Polling Horizon for ledger inclusion — this usually takes a few seconds.";
    case "success":
      return `10,000 XLM has been sent to your testnet account. Your balance will refresh automatically.`;
    case "error":
      return state.errorMessage ?? "Something went wrong. Please try again.";
    default:
      return "This connected account has no active XLM balance. Use the Stellar Friendbot faucet to receive 10,000 free testnet XLM instantly.";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * FriendbotModal – issue #905
 *
 * Non-intrusive dialog that shows the full Friendbot request lifecycle:
 *   idle → requesting → polling → success | error
 *
 * Includes:
 *  - Live status and spinner during request + polling phases
 *  - Transaction hash link on success
 *  - 60-second countdown cooldown timer preventing duplicate requests
 *  - Focus-trap + Escape-to-close for accessibility
 */
export function FriendbotModal({
  isOpen,
  address,
  state,
  onFund,
  onClose,
}: FriendbotModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap({ containerRef: panelRef, isActive: isOpen, onEscape: onClose });

  // Auto-close after a short delay when the request succeeds and the cooldown
  // has started (balance refresh has been triggered by the parent).
  const successCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (state.status === "success") {
      successCloseTimer.current = setTimeout(onClose, 4_000);
    }
    return () => {
      if (successCloseTimer.current) clearTimeout(successCloseTimer.current);
    };
  }, [state.status, onClose]);

  if (!isOpen) return null;

  const { status, transactionHash, cooldownSecondsRemaining } = state;
  const isBusy = status === "requesting" || status === "polling";
  const hasCooldown = cooldownSecondsRemaining > 0;
  const canFund = !isBusy && !hasCooldown && status !== "success";

  return (
    <div
      className="approval-drawer-overlay friendbot-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Fund testnet account with Friendbot"
        aria-live="polite"
        tabIndex={-1}
        className="friendbot-modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="friendbot-modal-header">
          <StatusIcon status={status} />
          <h2 className="friendbot-modal-title">{statusHeading(status)}</h2>
          <button
            type="button"
            className="approval-drawer-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <p className="friendbot-modal-body">{statusBody(status, state)}</p>

        {/* Address */}
        <div className="friendbot-modal-address">
          <span className="friendbot-modal-address-label">Address</span>
          <code className="friendbot-modal-address-value">{address}</code>
        </div>

        {/* Transaction hash on success */}
        {status === "success" && transactionHash && (
          <div className="friendbot-modal-tx">
            <span className="friendbot-modal-address-label">Transaction</span>
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="friendbot-modal-tx-link"
            >
              {transactionHash.slice(0, 8)}…{transactionHash.slice(-8)}
            </a>
          </div>
        )}

        {/* Polling progress indicator */}
        {status === "polling" && (
          <div
            className="friendbot-modal-progress"
            role="status"
            aria-live="polite"
          >
            <div className="friendbot-modal-progress-bar" />
          </div>
        )}

        {/* Cooldown timer */}
        {hasCooldown && (
          <p className="friendbot-modal-cooldown" role="status" aria-live="polite">
            Next request available in{" "}
            <strong>{cooldownSecondsRemaining}s</strong>
          </p>
        )}

        {/* Actions */}
        <div className="form-actions friendbot-modal-actions">
          <Button
            variant="ghost"
            type="button"
            onClick={onClose}
            disabled={isBusy}
          >
            {status === "success" ? "Close" : "Cancel"}
          </Button>

          {canFund && (
            <Button
              variant="primary"
              type="button"
              onClick={onFund}
              disabled={!canFund}
              loading={isBusy}
            >
              Fund with Friendbot
            </Button>
          )}

          {hasCooldown && status !== "success" && (
            <Button variant="primary" type="button" disabled>
              Cooldown ({cooldownSecondsRemaining}s)
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
