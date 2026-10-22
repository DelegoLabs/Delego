"use client";

import React, { useState } from "react";
import type { LedgerConnectionState } from "@delegolabs/types";
import { ledgerAdapter, DEFAULT_LEDGER_BIP32_PATH } from "../../lib/wallet/ledgerAdapter";

export interface LedgerConnectionWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: (state: LedgerConnectionState) => void;
}

export function LedgerConnectionWizard({
  isOpen,
  onClose,
  onConnected,
}: LedgerConnectionWizardProps) {
  const [bip32Path, setBip32Path] = useState(DEFAULT_LEDGER_BIP32_PATH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<LedgerConnectionState>({
    isConnected: false,
    bip32Path: DEFAULT_LEDGER_BIP32_PATH,
    isAppOpen: false,
  });

  if (!isOpen) return null;

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const connState = await ledgerAdapter.connectLedger(bip32Path);
      setState(connState);
      if (onConnected) {
        onConnected(connState);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Ledger device.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ledger-wizard-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 id="ledger-wizard-title" className="text-xl font-bold text-slate-900 dark:text-white">
            Connect Ledger Hardware Wallet
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close Ledger wizard"
          >
            ✕
          </button>
        </div>

        <div className="my-6 space-y-4">
          <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 list-decimal list-inside">
            <li>Connect your Ledger device via USB.</li>
            <li>Unlock your device with your PIN.</li>
            <li>Open the <strong>Stellar</strong> application on your Ledger device.</li>
            <li>Click <strong>Connect Ledger</strong> below.</li>
          </ol>

          <div className="pt-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              BIP32 Derivation Path
            </label>
            <input
              type="text"
              value={bip32Path}
              onChange={(e) => setBip32Path(e.target.value)}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs">
              {error}
            </div>
          )}

          {state.isConnected && (
            <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 text-xs space-y-1">
              <p className="font-bold">Ledger Connected Successfully!</p>
              <p>Device: {state.deviceModel || "Ledger Device"}</p>
              <p className="font-mono text-[11px] break-all">Public Key: {state.publicKey}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {state.isConnected ? "Done" : "Cancel"}
          </button>
          {!state.isConnected && (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Connecting..." : "Connect Ledger"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
