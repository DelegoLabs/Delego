"use client";

import React from "react";
import type { SorobanSimulationMetrics } from "@delegolabs/types";
import {
  DEFAULT_SOROBAN_RESOURCE_LIMITS,
  formatStroopsToXlm,
} from "../../lib/sorobanSimulation";

export interface SimulationDiagnosticsModalProps {
  isOpen: boolean;
  metrics: SorobanSimulationMetrics | null;
  warnings?: string[];
  error?: string | null;
  onClose: () => void;
  onConfirmSign?: () => void;
}

export function SimulationDiagnosticsModal({
  isOpen,
  metrics,
  warnings = [],
  error,
  onClose,
  onConfirmSign,
}: SimulationDiagnosticsModalProps) {
  if (!isOpen) return null;

  const isSuccess = metrics?.isSimulatedSuccessfully && !error;

  const cpuPct = metrics
    ? Math.min(
        100,
        Math.round((metrics.cpuInstructions / DEFAULT_SOROBAN_RESOURCE_LIMITS.cpuInstructions) * 100)
      )
    : 0;

  const memoryPct = metrics
    ? Math.min(
        100,
        Math.round((metrics.memoryBytes / DEFAULT_SOROBAN_RESOURCE_LIMITS.memoryBytes) * 100)
      )
    : 0;

  const readPct = metrics
    ? Math.min(
        100,
        Math.round((metrics.readBytes / DEFAULT_SOROBAN_RESOURCE_LIMITS.readBytes) * 100)
      )
    : 0;

  const writePct = metrics
    ? Math.min(
        100,
        Math.round((metrics.writeBytes / DEFAULT_SOROBAN_RESOURCE_LIMITS.writeBytes) * 100)
      )
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="simulation-modal-title"
    >
      <div className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
          <h2 id="simulation-modal-title" className="text-xl font-bold text-slate-900 dark:text-white">
            Soroban Simulation Diagnostics
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close diagnostics"
          >
            ✕
          </button>
        </div>

        {!isSuccess ? (
          <div className="my-6 p-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300">
            <h3 className="font-semibold text-sm mb-1">Simulation Failed</h3>
            <p className="text-sm font-mono break-all">{error || "Contract simulation returned an error."}</p>
            <p className="mt-3 text-xs text-red-600 dark:text-red-400">
              Signing is disabled for safety when transaction simulation fails.
            </p>
          </div>
        ) : (
          <div className="my-6 space-y-4">
            {warnings.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs space-y-1">
                <span className="font-semibold">Resource Warning:</span>
                {warnings.map((w, idx) => (
                  <p key={idx}>{w}</p>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">Min Resource Fee</span>
                <p className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-1">
                  {metrics?.minResourceFeeStroops} Stroops
                  <span className="block text-xs font-normal text-slate-400">
                    ({formatStroopsToXlm(metrics?.minResourceFeeStroops || "0")})
                  </span>
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <span className="text-slate-500">Status</span>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  Simulated Successfully
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600 dark:text-slate-300">CPU Instructions</span>
                  <span className="font-mono text-slate-500">
                    {metrics?.cpuInstructions.toLocaleString()} / {DEFAULT_SOROBAN_RESOURCE_LIMITS.cpuInstructions.toLocaleString()} ({cpuPct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${cpuPct >= 80 ? "bg-amber-500" : "bg-indigo-600"}`}
                    style={{ width: `${cpuPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600 dark:text-slate-300">Memory Bytes</span>
                  <span className="font-mono text-slate-500">
                    {metrics?.memoryBytes.toLocaleString()} B ({memoryPct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600" style={{ width: `${memoryPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600 dark:text-slate-300">Read Footprint</span>
                  <span className="font-mono text-slate-500">
                    {metrics?.readBytes.toLocaleString()} B ({readPct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: `${readPct}%` }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-600 dark:text-slate-300">Write Footprint</span>
                  <span className="font-mono text-slate-500">
                    {metrics?.writeBytes.toLocaleString()} B ({writePct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-600" style={{ width: `${writePct}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          {isSuccess && onConfirmSign && (
            <button
              onClick={onConfirmSign}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Proceed to Sign
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
