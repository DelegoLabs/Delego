"use client";

import { useState } from "react";
import { Card, Button } from "@delegolabs/ui";
import { useErasureRequest } from "../../hooks/useErasureRequest";
import { useDataErasureCapability } from "../../hooks/useDataErasureCapability";
import { clearAllLocalData } from "../../lib/localDataClear";

const CONFIRM_PHRASE = "DELETE";
const COOLDOWN_DAYS = 30;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Settings → Privacy → "Delete my data" (#610). Two independent tiers with
 * deliberately distinct consequence copy:
 *
 * - Local-only: clears cached data on this device (consent journal,
 *   approval notes, tracked transactions, address book, delegation tags,
 *   notifications, escrow timelines/cancel-grace state, the offline
 *   mutation queue) — executes immediately, verifiably, and never touches
 *   the server or your account.
 * - Server: requests full account erasure. Requires a typed confirmation,
 *   then enters a 30-day cooldown during which the request can be
 *   cancelled; the account is never touched client-side — this tier is
 *   purely a request/cancel lifecycle until the backend confirms
 *   finalization on its own schedule.
 *
 * The server tier only renders once `useDataErasureCapability` confirms the
 * backend advertises support (#610 feature-detection) — an older/degraded
 * API hides the option entirely rather than accepting a request it can't
 * honor.
 */
export function DataErasureCard() {
  const [localClearing, setLocalClearing] = useState(false);
  const [localResult, setLocalResult] = useState<{ clearedKeys: string[] } | null>(
    null
  );
  const [confirmingServer, setConfirmingServer] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const erasureCapable = useDataErasureCapability();
  const { request, requesting, cancelling, error, submit, cancel } =
    useErasureRequest();

  const handleClearLocal = async () => {
    setLocalClearing(true);
    setLocalResult(null);
    try {
      const result = await clearAllLocalData();
      setLocalResult(result);
    } finally {
      setLocalClearing(false);
    }
  };

  const handleSubmitErasure = async () => {
    if (confirmText !== CONFIRM_PHRASE) return;
    await submit();
    setConfirmingServer(false);
    setConfirmText("");
  };

  const pending = request?.status === "pending";

  return (
    <Card title="Delete my data" ariaLabel="Data erasure">
      <div className="settings-section">
        {/* Local-only tier */}
        <div>
          <p className="settings-toggle-label">Clear local data</p>
          <p className="settings-toggle-hint">
            Immediately clears data cached on this device only — your
            signing-consent journal, approval notes, tracked transactions,
            address book, delegation tags, notifications, and queued
            offline actions. Your account and server-side data are
            untouched, and this can&apos;t be undone on this device once run.
          </p>
        </div>

        {localResult && (
          <div className="settings-status success" role="status">
            Cleared {localResult.clearedKeys.length} local record
            {localResult.clearedKeys.length === 1 ? "" : "s"} from this
            device.
          </div>
        )}

        <div className="form-actions">
          <Button
            variant="secondary"
            onClick={handleClearLocal}
            disabled={localClearing}
          >
            {localClearing ? "Clearing…" : "Clear local data"}
          </Button>
        </div>

        {/* Server tier */}
        {erasureCapable && (
          <>
            <div>
              <p className="settings-toggle-label">Delete my account data</p>
              <p className="settings-toggle-hint">
                Requests permanent erasure of your account and all
                server-side data — delegations, orders, approval history,
                everything. This is a request, not an immediate deletion:
                once logged, it enters a {COOLDOWN_DAYS}-day cooldown before
                it&apos;s finalized, and you can cancel any time before then.
                Nothing is deleted from our servers until the cooldown
                elapses.
              </p>
            </div>

            {error && (
              <div className="settings-status error" role="alert">
                {error}
              </div>
            )}

            {pending && request ? (
              <>
                <div className="settings-status" role="status">
                  Erasure pending since {formatDate(request.requestedAt)} —
                  final on {formatDate(request.finalizesAt)}. Contact
                  support to cancel from another device.
                </div>
                <div className="form-actions">
                  <Button
                    variant="secondary"
                    onClick={cancel}
                    disabled={cancelling}
                  >
                    {cancelling ? "Cancelling…" : "Cancel erasure request"}
                  </Button>
                </div>
              </>
            ) : confirmingServer ? (
              <div className="settings-section">
                <label htmlFor="erasure-confirm-input" className="settings-toggle-label">
                  Type {CONFIRM_PHRASE} to confirm
                </label>
                <input
                  id="erasure-confirm-input"
                  type="text"
                  className="order-search"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={CONFIRM_PHRASE}
                  autoComplete="off"
                  disabled={requesting}
                />
                <div className="form-actions">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setConfirmingServer(false);
                      setConfirmText("");
                    }}
                    disabled={requesting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleSubmitErasure}
                    disabled={confirmText !== CONFIRM_PHRASE || requesting}
                    loading={requesting}
                  >
                    {requesting ? "Submitting…" : "Request account erasure"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="form-actions">
                <Button
                  variant="destructive"
                  onClick={() => setConfirmingServer(true)}
                >
                  Delete my account data
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
