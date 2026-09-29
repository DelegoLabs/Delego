import { useState } from 'react';

export interface KillSwitchModalProps {
  activeDelegationCount: number;
  onConfirmRevokeAll(): Promise<void>;
}

const CONFIRM_PHRASE = 'REVOKE';

export function KillSwitchModal({ activeDelegationCount, onConfirmRevokeAll }: KillSwitchModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfirmed = confirmation === CONFIRM_PHRASE;

  const openModal = () => {
    setConfirmation('');
    setError(null);
    setIsOpen(true);
  };

  const closeModal = () => {
    if (isRevoking) return;
    setIsOpen(false);
    setConfirmation('');
    setError(null);
  };

  const handleConfirm = async () => {
    if (!isConfirmed || isRevoking) return;
    setIsRevoking(true);
    setError(null);
    try {
      await onConfirmRevokeAll();
      setIsOpen(false);
      setConfirmation('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke delegations. Please try again.');
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <>
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-red-500 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 className="text-sm font-semibold text-red-700">Emergency Kill-Switch</h2>
          <p className="mt-1 text-sm text-red-600">
            Instantly revoke all active AI agent spending permissions.
            {activeDelegationCount > 0
              ? ` ${activeDelegationCount} active delegation${activeDelegationCount === 1 ? '' : 's'} will be revoked.`
              : ' No active delegations at the moment.'}
          </p>
        </div>
        <button
          type="button"
          onClick={openModal}
          disabled={activeDelegationCount === 0}
          className="shrink-0 rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Revoke All Permissions
        </button>
      </div>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="kill-switch-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h2 id="kill-switch-title" className="text-lg font-semibold text-red-700">
              Revoke all delegations?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              This will immediately broadcast an on-chain revocation for all{' '}
              {activeDelegationCount} active delegation{activeDelegationCount === 1 ? '' : 's'}. This action cannot be undone.
            </p>

            <label htmlFor="kill-switch-confirm" className="mt-4 block text-sm font-medium text-gray-700">
              Type <span className="font-mono font-semibold">{CONFIRM_PHRASE}</span> to confirm
            </label>
            <input
              id="kill-switch-confirm"
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              disabled={isRevoking}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 disabled:bg-gray-100"
            />

            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {error}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                disabled={isRevoking}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!isConfirmed || isRevoking}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isRevoking ? 'Revoking…' : 'Revoke All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default KillSwitchModal;
