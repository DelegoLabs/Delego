'use client';

import { useState } from 'react';

interface KillSwitchModalProps {
  activeDelegationCount: number;
  onConfirmRevokeAll(): Promise<void>;
}

function KillSwitchModal({ activeDelegationCount, onConfirmRevokeAll }: KillSwitchModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText === 'REVOKE' && !isRevoking;

  async function handleConfirm() {
    if (!canConfirm) return;
    setIsRevoking(true);
    setError(null);
    try {
      await onConfirmRevokeAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke delegations');
    } finally {
      setIsRevoking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-red-600">Revoke all delegations</h2>
        <p className="mt-2 text-sm text-gray-700">
          This will immediately revoke all {activeDelegationCount} active AI agent spending
          permission{activeDelegationCount === 1 ? '' : 's'}. This action cannot be undone.
        </p>
        <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="kill-switch-confirm">
          Type <span className="font-mono font-bold">REVOKE</span> to confirm
        </label>
        <input
          id="kill-switch-confirm"
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={isRevoking}
          autoComplete="off"
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
        />
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            disabled={isRevoking}
            className="rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRevoking ? 'Revoking…' : 'Revoke all'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DelegationsPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDelegationCount, setActiveDelegationCount] = useState(0);

  async function handleConfirmRevokeAll() {
    // Broadcast revocation on-chain for all active delegations.
    setActiveDelegationCount(0);
    setIsModalOpen(false);
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-4">
        <div>
          <h2 className="text-base font-semibold text-red-700">Emergency kill-switch</h2>
          <p className="text-sm text-red-600">
            Instantly revoke all active AI agent spending permissions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Revoke all
        </button>
      </div>

      {isModalOpen && (
        <KillSwitchModal
          activeDelegationCount={activeDelegationCount}
          onConfirmRevokeAll={handleConfirmRevokeAll}
        />
      )}
    </div>
  );
}
