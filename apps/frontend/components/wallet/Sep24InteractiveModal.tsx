"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import type { Sep0024InteractiveSession } from "@delegolabs/types";
import { verifySep24Transaction, validateAnchorUrl } from "../../lib/anchor/sep24";

export interface Sep24InteractiveModalProps {
  isOpen: boolean;
  session: Sep0024InteractiveSession | null;
  authToken?: string;
  onClose: () => void;
  onSuccess: (transactionId: string) => void;
  onRefreshBalance?: () => Promise<void> | void;
}

export function Sep24InteractiveModal({
  isOpen,
  session,
  authToken,
  onClose,
  onSuccess,
  onRefreshBalance,
}: Sep24InteractiveModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("Loading anchor interactive interface...");
  const [isCompleted, setIsCompleted] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const verifyCompletion = useCallback(async () => {
    if (!session) return;
    setStatusText("Verifying transaction completion with anchor...");
    try {
      const result = await verifySep24Transaction(
        session.transactionId,
        session.anchorDomain,
        authToken
      );

      if (result.status === "completed") {
        setIsCompleted(true);
        setStatusText("Transfer completed successfully!");
        if (onRefreshBalance) {
          await onRefreshBalance();
        }
        onSuccess(session.transactionId);
      } else if (
        result.status === "error" ||
        result.status === "expired" ||
        result.status === "no_market"
      ) {
        setError(result.message || `Transfer failed with status: ${result.status}`);
      } else {
        setStatusText(`Transaction status: ${result.status}. Waiting for completion...`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify transaction status with anchor.");
    }
  }, [session, authToken, onSuccess, onRefreshBalance]);

  useEffect(() => {
    if (!isOpen || !session) return;

    setLoading(true);
    setError(null);
    setIsCompleted(false);

    try {
      validateAnchorUrl(session.interactiveUrl, session.anchorDomain);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Untrusted or invalid anchor interactive URL.");
      setLoading(false);
    }
  }, [isOpen, session]);

  useEffect(() => {
    if (!isOpen || !session) return;

    const handleMessage = (event: MessageEvent) => {
      let eventOriginDomain = "";
      try {
        eventOriginDomain = new URL(event.origin).hostname;
      } catch {
        return;
      }

      if (
        eventOriginDomain !== session.anchorDomain &&
        !eventOriginDomain.endsWith(`.${session.anchorDomain}`)
      ) {
        return;
      }

      if (event.data && typeof event.data === "object") {
        const { type, transaction, status } = event.data;
        if (type === "transaction_complete" || status === "completed" || transaction?.status === "completed") {
          void verifyCompletion();
        } else if (type === "close") {
          onClose();
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isOpen, session, verifyCompletion, onClose]);

  useEffect(() => {
    if (!isOpen || !session || isCompleted || error) return;

    const pollInterval = setInterval(() => {
      void verifyCompletion();
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [isOpen, session, isCompleted, error, verifyCompletion]);

  if (!isOpen || !session) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sep24-modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 id="sep24-modal-title" className="text-xl font-bold text-slate-900 dark:text-white">
              {session.action === "deposit" ? "Deposit" : "Withdrawal"} {session.assetCode}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Anchor: <span className="font-mono">{session.anchorDomain}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Close transfer modal"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="my-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
            <h3 className="font-semibold text-sm mb-1">Transfer Error</h3>
            <p className="text-sm">{error}</p>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex-1 my-4 flex flex-col min-h-[400px]">
            {loading && (
              <div className="py-2 text-xs text-slate-500 text-center animate-pulse">
                {statusText}
              </div>
            )}
            <iframe
              ref={iframeRef}
              src={session.interactiveUrl}
              title={`SEP-0024 ${session.action} flow`}
              className="w-full flex-1 border-0 rounded-lg bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={() => setLoading(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
