"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Card } from "@delegolabs/ui";
import { useEscrows } from "../../../hooks/useEscrows";
import { useDispute } from "../../../hooks/useDispute";
import { useNetwork } from "../../../hooks/useNetwork";
import dynamic from "next/dynamic";
import { EscrowCard } from "../../../components/escrows/EscrowCard";
import { DisputeModal } from "../../../components/escrows/DisputeModal";
import { DisputeStatusPanel } from "../../../components/escrows/DisputeStatusPanel";

const OnChainVerificationPanel = dynamic(
  () =>
    import("../../../components/escrows/OnChainVerificationPanel").then(
      (m) => m.OnChainVerificationPanel
    ),
  { ssr: false }
);
import {
  getConfiguredContracts,
  explorerContractUrl,
} from "../../../lib/contracts";
import { escrowKey } from "../../../lib/escrows";
import {
  simulateContractCall,
  type SimulationDryRunResult,
} from "../../../lib/simulationDryRun";
import { SimulationDryRunModal } from "../../../components/transactions/SimulationDryRunModal";

/** Escrow detail page — dispute lifecycle and contract explorer link for a single escrow. */
export default function EscrowDetailPage() {
  const params = useParams();
  const escrowId = (params?.id as string) ?? "";
  const { escrows, loading } = useEscrows();
  const escrow = escrows.find((e) => e.escrowId === escrowId);
  const { networkId, network } = useNetwork();
  const simulationRequest = useRef(0);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulation, setSimulation] = useState<SimulationDryRunResult | null>(
    null
  );
  const {
    dispute,
    submitting,
    error,
    optimisticallyDisputed,
    canOpen,
    openDispute,
  } = useDispute(escrow?.escrowId);
  const [showDisputeModal, setShowDisputeModal] = useState(false);

  if (loading && escrows.length === 0) {
    return (
      <div className="settings-page">
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
        </div>
      </div>
    );
  }

  if (!escrow) {
    return (
      <div className="settings-page">
        <Card title="Escrow not found" ariaLabel="Escrow not found">
          <p>
            No escrow could be found with ID <code>{escrowId}</code>.
          </p>
          <Link href="/escrows" prefetch={true}>
            <Button variant="primary">← Back to Escrows</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const escrowContract = getConfiguredContracts(networkId).find(
    (c) => c.name === "escrow"
  );
  const showDisputeCta = canOpen(escrow.status);
  const showDisputeStatus = dispute !== null || optimisticallyDisputed;

  return (
    <div className="settings-page">
      {/* Single, low-cost link — viewport prefetch is fine (#621). */}
      <Link href="/escrows" prefetch={true} className="receipt-back-link">
        ← Back to Escrows
      </Link>

      <EscrowCard
        escrow={escrow}
        disputedOverride={optimisticallyDisputed && !dispute}
      />

      <div className="form-actions">
        {showDisputeCta && (
          <Button variant="secondary" onClick={() => setShowDisputeModal(true)}>
            Open dispute
          </Button>
        )}
        {escrowContract?.address && escrowContract.addressValid ? (
          <Button
            variant="secondary"
            onClick={() => {
              const contractId = escrowContract.address as string;
              const requestId = simulationRequest.current + 1;
              simulationRequest.current = requestId;
              setSimulationOpen(true);
              setSimulationLoading(true);
              setSimulation(null);
              void simulateContractCall({
                rpcUrl: network.sorobanRpcUrl,
                networkPassphrase: network.networkPassphrase,
                contractId,
                method: "get_buyer_receipt",
                args: [escrowKey(escrow)],
              }).then((result) => {
                if (simulationRequest.current !== requestId) return;
                setSimulation(result);
                setSimulationLoading(false);
              });
            }}
          >
            Simulate contract call
          </Button>
        ) : null}
        {escrowContract?.address && escrowContract.addressValid ? (
          <Button
            variant="ghost"
            onClick={() =>
              window.open(
                explorerContractUrl(
                  networkId,
                  escrowContract.address as string
                ),
                "_blank",
                "noopener,noreferrer"
              )
            }
          >
            View contract
          </Button>
        ) : (
          <Button
            variant="ghost"
            disabled
            title="Escrow contract not configured for this network"
          >
            View contract
          </Button>
        )}
      </div>

      {showDisputeStatus && (
        <DisputeStatusPanel
          escrow={escrow}
          dispute={dispute}
          optimistic={optimisticallyDisputed && !dispute}
        />
      )}

      <OnChainVerificationPanel
        kind="buyer"
        receiptKey={escrowKey(escrow)}
        contractAddress={
          escrowContract?.addressValid
            ? (escrowContract.address as string)
            : null
        }
        localData={{
          buyer: escrow.buyer,
          seller: escrow.seller,
          amount: String(escrow.amount),
        }}
        compareFields={["buyer", "seller", "amount"]}
        fieldLabels={{ buyer: "Buyer", seller: "Seller", amount: "Amount" }}
      />

      <OnChainVerificationPanel
        kind="merchant"
        receiptKey={escrowKey(escrow)}
        contractAddress={
          escrowContract?.addressValid
            ? (escrowContract.address as string)
            : null
        }
        localData={{
          buyer: escrow.buyer,
          seller: escrow.seller,
          amount: String(escrow.amount),
        }}
        compareFields={["buyer", "seller", "amount"]}
        fieldLabels={{ buyer: "Buyer", seller: "Seller", amount: "Amount" }}
      />

      <DisputeModal
        isOpen={showDisputeModal}
        submitting={submitting}
        error={error}
        onSubmit={async (input) => {
          const result = await openDispute(input);
          if (result) setShowDisputeModal(false);
        }}
        onClose={() => setShowDisputeModal(false)}
      />

      <SimulationDryRunModal
        isOpen={simulationOpen}
        result={simulation}
        loading={simulationLoading}
        onClose={() => {
          simulationRequest.current += 1;
          setSimulationOpen(false);
          setSimulationLoading(false);
        }}
        onConfirm={() => {
          simulationRequest.current += 1;
          setSimulationOpen(false);
        }}
      />
    </div>
  );
}
