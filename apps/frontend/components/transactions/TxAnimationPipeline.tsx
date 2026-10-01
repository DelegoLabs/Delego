"use client";

/**
 * Step-by-step transaction animation pipeline (#787).
 *
 * Signing -> Submitting -> Confirmed, with a celebration particle burst on
 * completion. Callers own the actual wallet/broadcast/confirm promises; this
 * component only orchestrates visual state transitions.
 */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type TxStepState =
  | "idle"
  | "awaiting_signature"
  | "broadcasting"
  | "confirmed"
  | "failed";

export interface TxAnimationPipelineProps {
  /** Current pipeline state driven by the parent transaction flow. */
  state: TxStepState;
  /** Optional human-readable label for the transaction (e.g. "Pay invoice #12"). */
  label?: string;
  /** Called when the user dismisses a terminal (confirmed/failed) state. */
  onDismiss?: () => void;
}

interface StepDef {
  key: TxStepState;
  title: string;
  description: string;
}

const STEPS: StepDef[] = [
  { key: "awaiting_signature", title: "Sign", description: "Approve in your wallet" },
  { key: "broadcasting", title: "Submit", description: "Broadcasting to the network" },
  { key: "confirmed", title: "Confirmed", description: "Transaction settled" },
];

const ORDER: TxStepState[] = ["idle", "awaiting_signature", "broadcasting", "confirmed"];

/** Index of the active step for a pipeline state (failed maps to last attempted). */
export function stepIndexFor(state: TxStepState): number {
  if (state === "idle") return -1;
  if (state === "failed") return 1;
  const idx = ORDER.indexOf(state);
  return idx === -1 ? -1 : idx - 1;
}

/** True when the pipeline reached a terminal state. */
export function isTerminalTxState(state: TxStepState): boolean {
  return state === "confirmed" || state === "failed";
}

/** Pure confetti particle model so tests don't depend on rAF timing. */
export function confettiParticles(count = 24, seed = 1): Array<{ id: number; x: number; delay: number; rotate: number }> {
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const n = (seed * (i + 3) * 17) % 100;
    particles.push({
      id: i,
      x: (n % 200) - 100,
      delay: (n % 20) / 100,
      rotate: (n % 360),
    });
  }
  return particles;
}

function StepRow({ step, activeIndex, state }: { step: StepDef; activeIndex: number; state: TxStepState }) {
  const stepPos = STEPS.findIndex((s) => s.key === step.key);
  const isDone = stepPos < activeIndex || state === "confirmed";
  const isActive = stepPos === activeIndex && state !== "confirmed" && state !== "failed";
  const isFailed = state === "failed" && stepPos === activeIndex;

  return (
    <div
      data-testid={`tx-step-${step.key}`}
      data-state={isFailed ? "failed" : isDone ? "done" : isActive ? "active" : "pending"}
      className="flex items-start gap-3"
    >
      <div
        aria-hidden
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold ${
          isFailed
            ? "border-red-300 bg-red-50 text-red-700"
            : isDone
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : isActive
                ? "border-primary bg-primary/10 text-primary"
                : "border-slate-200 bg-slate-50 text-slate-400"
        }`}
      >
        {isDone ? "✓" : isFailed ? "!" : stepPos + 1}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{step.title}</p>
        <p className="text-xs text-slate-500">
          {isFailed ? "Failed — you can retry" : step.description}
        </p>
      </div>
      {isActive ? (
        <motion.span
          data-testid="tx-step-spinner"
          aria-label="In progress"
          className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
        />
      ) : null}
    </div>
  );
}

/**
 * Animated stepper for wallet signing -> submit -> confirm.
 *
 * Renders only while a transaction is in flight or just settled. Confirmed
 * state plays a short confetti burst; failed state keeps the last attempted
 * step highlighted with a retry hint.
 */
export function TxAnimationPipeline({
  state,
  label,
  onDismiss,
}: TxAnimationPipelineProps) {
  const [showCelebration, setShowCelebration] = useState(false);
  const activeIndex = useMemo(() => stepIndexFor(state), [state]);
  const particles = useMemo(() => confettiParticles(24, 7), []);

  useEffect(() => {
    if (state === "confirmed") {
      setShowCelebration(true);
      const t = window.setTimeout(() => setShowCelebration(false), 1600);
      return () => window.clearTimeout(t);
    }
    setShowCelebration(false);
    return undefined;
  }, [state]);

  if (state === "idle") return null;

  return (
    <div
      data-testid="tx-animation-pipeline"
      data-state={state}
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      {label ? (
        <p className="mb-3 text-sm font-semibold text-slate-900" data-testid="tx-pipeline-label">
          {label}
        </p>
      ) : null}

      <div className="space-y-3">
        {STEPS.map((step) => (
          <StepRow key={step.key} step={step} activeIndex={activeIndex} state={state} />
        ))}
      </div>

      <AnimatePresence>
        {state === "failed" ? (
          <motion.p
            key="fail"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 text-xs text-red-600"
            data-testid="tx-pipeline-failed"
          >
            Transaction did not go through. Your wallet was not charged the network fee for a
            failed submission where the network rejected it.
          </motion.p>
        ) : null}
        {state === "confirmed" ? (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-3 flex items-center justify-between gap-2"
          >
            <p className="text-xs font-medium text-emerald-700" data-testid="tx-pipeline-confirmed">
              Payment confirmed
            </p>
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                data-testid="tx-pipeline-dismiss"
              >
                Done
              </button>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {showCelebration ? (
        <div className="pointer-events-none absolute inset-0" data-testid="tx-confetti" aria-hidden>
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute left-1/2 top-1/2 h-2 w-2 rounded-sm bg-amber-400"
              initial={{ opacity: 1, x: 0, y: 0, rotate: 0 }}
              animate={{
                opacity: [1, 1, 0],
                x: p.x,
                y: 80 + (p.id % 5) * 12,
                rotate: p.rotate,
              }}
              transition={{ duration: 1.1, delay: p.delay, ease: "easeOut" }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
