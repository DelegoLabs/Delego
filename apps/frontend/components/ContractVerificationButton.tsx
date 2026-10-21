"use client";

import { useState } from "react";
import type { NetworkId } from "../lib/networks";
import {
  ContractVerificationModal,
  type ContractVerificationModalProps,
} from "./ContractVerificationModal";

export interface ContractVerificationButtonProps {
  contractAddress: string;
  contractLabel: string;
  networkId: NetworkId;
  /** Forwarded to the modal (tests). */
  verify?: ContractVerificationModalProps["verify"];
}

/** "Verify" trigger that opens the bytecode explorer for one contract (#999). */
export function ContractVerificationButton({
  contractAddress,
  contractLabel,
  networkId,
  verify,
}: ContractVerificationButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="copy-button"
        aria-haspopup="dialog"
        aria-label={`Verify ${contractLabel} contract bytecode`}
        onClick={() => setOpen(true)}
      >
        Verify
      </button>
      <ContractVerificationModal
        open={open}
        contractAddress={contractAddress}
        contractLabel={contractLabel}
        networkId={networkId}
        onClose={() => setOpen(false)}
        verify={verify}
      />
    </>
  );
}

export default ContractVerificationButton;
