import type { NetworkConfig } from "../../lib/networks";
import type { TokenAllowanceEntry } from "@delegolabs/types";
import { getSpenderContracts, getTrackedTokens, type SpenderContract, type TrackedToken } from "./allowanceConstants";
import { revokeTokenAllowance } from "./revokeAllowance";

export interface UseTokenAllowancesOptions {
  network: NetworkConfig;
  ownerAddress: string | null;
  signTransaction?: (xdr: string) => Promise<string>;
  spenderContracts?: SpenderContract[];
  tokens?: TrackedToken[];
}

export interface UseTokenAllowancesReturn {
  allowances: TokenAllowanceEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  revokingSpender: string | null;
  revokeAllowance: (entry: TokenAllowanceEntry) => Promise<void>;
}
