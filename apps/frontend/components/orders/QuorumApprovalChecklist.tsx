"use client";

import { useEffect, useState, useCallback, useRef } from "react";

export interface QuorumSignerStatus {
  signerAddress: string;
  signerName?: string;
  hasSigned: boolean;
  signatureTimestamp?: string;
}

export interface QuorumChecklistProps {
  requiredThreshold: number;
  signers: QuorumSignerStatus[];
  orderId: string;
  onDisburse?: (orderId: string) => void | Promise<unknown>;
}

export function QuorumApprovalChecklist({
  requiredThreshold,
  signers: initialSigners,
  orderId,
  onDisburse,
}: QuorumChecklistProps) {
  const [signers, setSigners] = useState<QuorumSignerStatus[]>(initialSigners);
  const [isPolling, setIsPolling] = useState(true);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    setSigners(initialSigners);
  }, [initialSigners]);

  const pollOnChainSignatures = useCallback(async () => {
    try {
      // Query Soroban contract state/events for signature updates
      const res = await fetch(`/api/orders/${orderId}/quorum-signatures`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        throw new Error(`RPC status ${res.status}`);
      }
      const data = (await res.json()) as { signers?: QuorumSignerStatus[] };
      if (!isMountedRef.current) return;

      if (Array.isArray(data.signers)) {
        // Deduplicate and update reactive state
        const signerMap = new Map<string, QuorumSignerStatus>();
        data.signers.forEach((s) => {
          signerMap.set(s.signerAddress, s);
        });
        setSigners(Array.from(signerMap.values()));
        setRpcError(null);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setRpcError(err instanceof Error ? err.message : "Failed to fetch signatures");
    }
  }, [orderId]);

  useEffect(() => {
    isMountedRef.current = true;
    let timer: NodeJS.Timeout;

    if (isPolling) {
      void pollOnChainSignatures();
      timer = setInterval(() => {
        void pollOnChainSignatures();
      }, 5000);
    }

    return () => {
      isMountedRef.current = false;
      if (timer) clearInterval(timer);
    };
  }, [isPolling, pollOnChainSignatures]);

  // Distinct authorized signers that have signed
  const distinctSignedAddresses = new Set(
    signers.filter((s) => s.hasSigned).map((s) => s.signerAddress)
  );
  const signedCount = distinctSignedAddresses.size;
  const isThresholdMet = signedCount >= requiredThreshold;

  const handleExecuteDisbursement = async () => {
    if (!isThresholdMet || isExecuting) return;
    setIsExecuting(true);
    try {
      // Authoritative verify before executing disbursement
      const verifyRes = await fetch(`/api/orders/${orderId}/verify-quorum`, {
        method: "POST",
      });
      if (!verifyRes.ok) {
        throw new Error("Authoritative on-chain verification failed");
      }
      if (onDisburse) {
        await onDisburse(orderId);
      }
    } catch (err) {
      setRpcError(err instanceof Error ? err.message : "Disbursement execution failed");
    } finally {
      if (isMountedRef.current) {
        setIsExecuting(false);
      }
    }
  };

  return (
    <div className="quorum-checklist" data-testid="quorum-approval-checklist">
      <div className="quorum-checklist-header flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-900">Multi-Sig Quorum Progress</h4>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded ${
            isThresholdMet ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
          }`}
          data-testid="quorum-threshold-badge"
        >
          {signedCount} of {requiredThreshold} Required
        </span>
      </div>

      {rpcError && (
        <div className="text-xs text-red-600 mb-2" data-testid="quorum-rpc-error">
          RPC Error: {rpcError}
        </div>
      )}

      <ul className="quorum-signer-list divide-y divide-gray-100 mb-4">
        {signers.map((signer) => (
          <li
            key={signer.signerAddress}
            className="py-2 flex items-center justify-between text-xs"
            data-testid={`quorum-signer-${signer.signerAddress}`}
          >
            <div className="flex flex-col">
              <span className="font-medium text-gray-800">
                {signer.signerName || `${signer.signerAddress.slice(0, 6)}...${signer.signerAddress.slice(-4)}`}
              </span>
              <span className="text-gray-400 font-mono text-[10px]">{signer.signerAddress}</span>
            </div>
            <div className="flex flex-col items-end">
              {signer.hasSigned ? (
                <span className="text-green-600 font-semibold flex items-center gap-1">
                  ✓ Signed
                </span>
              ) : (
                <span className="text-gray-400">Pending</span>
              )}
              {signer.signatureTimestamp && (
                <span className="text-[10px] text-gray-400">
                  {new Date(signer.signatureTimestamp).toLocaleTimeString()}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={!isThresholdMet || isExecuting}
        onClick={handleExecuteDisbursement}
        className={`w-full py-2 px-4 rounded font-medium text-sm transition-colors ${
          isThresholdMet && !isExecuting
            ? "bg-blue-600 text-white hover:bg-blue-700 cursor-pointer"
            : "bg-gray-200 text-gray-400 cursor-not-allowed"
        }`}
        data-testid="execute-disbursement-cta"
      >
        {isExecuting ? "Executing Disbursement..." : "Execute Disbursement"}
      </button>
    </div>
  );
}
