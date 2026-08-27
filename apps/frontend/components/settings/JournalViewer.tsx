"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import {
  clearConsentJournal,
  filterConsentEntries,
  getConsentScreens,
  type ConsentEntry,
  type ConsentOutcome,
} from "../../services/consentJournal";

export interface JournalViewerProps {
  /** Horizon base URL for building block-explorer deep links */
  horizonUrl: string;
  isLiveNetwork: boolean;
}

const OUTCOME_LABELS: Record<ConsentOutcome, string> = {
  signed: "Signed",
  rejected: "Rejected",
  error: "Error",
};

function buildTxUrl(hash: string, isLive: boolean): string {
  const base = isLive
    ? "https://stellar.expert/explorer/public"
    : "https://stellar.expert/explorer/testnet";
  return `${base}/tx/${hash}`;
}

function OutcomeBadge({ outcome }: { outcome: ConsentOutcome }) {
  const cls =
    outcome === "signed"
      ? "journal-badge journal-badge-signed"
      : outcome === "rejected"
        ? "journal-badge journal-badge-rejected"
        : "journal-badge journal-badge-error";
  return (
    <span className={cls} aria-label={`Outcome: ${OUTCOME_LABELS[outcome]}`}>
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}

/**
 * Accessible journal viewer for the personal signing-consent log (#591).
 * Rendered inside Settings → Security.
 *
 * Features:
 *  - Search (free-text across summary, hash, screen)
 *  - Filter by outcome and source screen
 *  - Block-explorer deep links for each hash
 *  - "Clear Journal" button protected by a confirmation modal
 *  - Full keyboard navigation; ARIA roles and labels throughout
 */
export function JournalViewer({
  horizonUrl,
  isLiveNetwork,
}: JournalViewerProps) {
  const [entries, setEntries] = useState<ConsentEntry[]>([]);
  const [query, setQuery] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<ConsentOutcome | "">("");
  const [screenFilter, setScreenFilter] = useState("");
  const [screens, setScreens] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  const confirmModalRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(() => {
    setEntries(
      filterConsentEntries(
        query,
        outcomeFilter || undefined,
        screenFilter || undefined
      )
    );
    setScreens(getConsentScreens());
  }, [query, outcomeFilter, screenFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Trap focus inside the confirmation modal when it opens.
  useEffect(() => {
    if (showConfirm) {
      cancelRef.current?.focus();
    }
  }, [showConfirm]);

  const handleClear = () => {
    clearConsentJournal();
    setShowConfirm(false);
    refresh();
  };

  return (
    <section aria-labelledby="journal-heading">
      <Card ariaLabel="Signing consent journal">
        <div className="journal-viewer">
          <h2 id="journal-heading" className="journal-heading">
            Signing Consent Log
          </h2>
          <p className="journal-hint">
            A local record of every transaction your wallet has been asked to
            sign. No private keys or secrets are stored.
          </p>

          {/* Search & filter bar */}
          <div
            className="journal-filters"
            role="search"
            aria-label="Filter journal"
          >
            <label htmlFor="journal-search" className="sr-only">
              Search journal
            </label>
            <input
              id="journal-search"
              type="search"
              className="journal-search-input"
              placeholder="Search by summary, hash, or screen…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search journal entries"
            />

            <label htmlFor="journal-outcome-filter" className="sr-only">
              Filter by outcome
            </label>
            <select
              id="journal-outcome-filter"
              className="journal-select"
              value={outcomeFilter}
              onChange={(e) =>
                setOutcomeFilter(e.target.value as ConsentOutcome | "")
              }
              aria-label="Filter by outcome"
            >
              <option value="">All outcomes</option>
              <option value="signed">Signed</option>
              <option value="rejected">Rejected</option>
              <option value="error">Error</option>
            </select>

            {screens.length > 0 && (
              <>
                <label htmlFor="journal-screen-filter" className="sr-only">
                  Filter by screen
                </label>
                <select
                  id="journal-screen-filter"
                  className="journal-select"
                  value={screenFilter}
                  onChange={(e) => setScreenFilter(e.target.value)}
                  aria-label="Filter by source screen"
                >
                  <option value="">All screens</option>
                  {screens.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Entries list */}
          {entries.length === 0 ? (
            <p className="journal-empty" role="status">
              No journal entries found.
            </p>
          ) : (
            <ul
              className="journal-list"
              aria-label={`${entries.length} journal entries`}
            >
              {entries.map((entry, idx) => {
                const shortHash = entry.txHash
                  ? `${entry.txHash.slice(0, 8)}…${entry.txHash.slice(-6)}`
                  : null;
                const txUrl = entry.txHash
                  ? buildTxUrl(entry.txHash, isLiveNetwork)
                  : null;

                return (
                  <li key={idx} className="journal-entry">
                    <div className="journal-entry-header">
                      <time
                        dateTime={entry.timestamp}
                        className="journal-timestamp"
                      >
                        {new Date(entry.timestamp).toLocaleString()}
                      </time>
                      <OutcomeBadge outcome={entry.outcome} />
                    </div>
                    <p className="journal-summary">{entry.summary}</p>
                    <div className="journal-meta">
                      <span className="journal-screen">
                        Screen: {entry.sourceScreen}
                      </span>
                      {txUrl && shortHash && (
                        <a
                          href={txUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="journal-tx-link"
                          aria-label={`View transaction ${shortHash} on block explorer`}
                        >
                          {shortHash} ↗
                        </a>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Clear journal button */}
          <div className="journal-actions">
            <Button
              variant="secondary"
              onClick={() => setShowConfirm(true)}
              aria-haspopup="dialog"
            >
              Clear Journal
            </Button>
          </div>
        </div>
      </Card>

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="journal-clear-title"
          aria-describedby="journal-clear-desc"
          className="modal-overlay"
          onKeyDown={(e) => {
            if (e.key === "Escape") setShowConfirm(false);
          }}
        >
          <div className="modal-panel" ref={confirmModalRef}>
            <h3 id="journal-clear-title">Clear signing consent log?</h3>
            <p id="journal-clear-desc">
              This will permanently delete all {entries.length} journal entries.
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                ref={cancelRef}
                type="button"
                className="btn-secondary"
                onClick={() => setShowConfirm(false)}
              >
                Cancel
              </button>
              <Button variant="primary" onClick={handleClear}>
                Clear journal
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
