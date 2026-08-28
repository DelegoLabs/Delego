import type { ApiResponse, ContractVersionInfo } from "@delegolabs/types";

export function buildContractVersions(): ContractVersionInfo[] {
  return [
    { name: "escrow", version: "1.4.0" },
    { name: "permissions", version: "1.2.1" },
    { name: "registry", version: "2.0.0" },
  ];
}

export function okResponse<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}
