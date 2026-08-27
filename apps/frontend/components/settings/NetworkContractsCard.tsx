"use client";

import { Badge, Card } from "@delegolabs/ui";
import { NETWORK_IDS, getNetworkConfig, type NetworkId } from "../../lib/networks";
import { getConfiguredContracts, explorerContractUrl } from "../../lib/contracts";
import { useContractVersions } from "../../hooks/useContractVersions";
import { useNetwork } from "../../hooks/useNetwork";

interface NetworkContractsSectionProps {
  networkId: NetworkId;
  isActive: boolean;
}

function NetworkContractsSection({ networkId, isActive }: NetworkContractsSectionProps) {
  const network = getNetworkConfig(networkId);
  const contracts = getConfiguredContracts(networkId);
  const { versions, loading, error } = useContractVersions(networkId);
  const hasInvalidAddress = contracts.some((c) => c.address !== null && !c.addressValid);

  return (
    <div className="network-contracts-section">
      <div className="network-contracts-section-header">
        <h4>{network.label}</h4>
        {isActive && <Badge tone="info">Active</Badge>}
      </div>

      {hasInvalidAddress && (
        <div className="settings-status error" role="alert">
          One or more configured contract addresses for {network.label} failed
          checksum/format validation. Double-check the deployment config before
          trusting this network.
        </div>
      )}

      <div className="comparison-table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Contract</th>
              <th scope="col">Address</th>
              <th scope="col">Version</th>
              <th scope="col">Explorer</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((contract) => (
              <tr key={contract.name}>
                <td>{contract.label}</td>
                <td>
                  {contract.address ? (
                    <code className="contract-address">{contract.address}</code>
                  ) : (
                    <span className="contract-address-missing">Not configured</span>
                  )}
                  {contract.address && !contract.addressValid && (
                    <div className="contract-address-warning" role="alert">
                      Invalid address format
                    </div>
                  )}
                </td>
                <td>
                  {loading ? "…" : error ? "—" : versions[contract.name] ?? "—"}
                </td>
                <td>
                  {contract.address && contract.addressValid ? (
                    <a
                      href={explorerContractUrl(networkId, contract.address)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Settings → "Network & contracts": deployed escrow / permissions / registry
 * contract addresses per network (from env/config), live-fetched deployed
 * versions, and explorer links — so users can verify exactly which contract
 * versions hold their funds.
 */
export function NetworkContractsCard() {
  const { networkId } = useNetwork();

  return (
    <Card title="Network & Contracts" ariaLabel="Network and contracts">
      <p className="settings-toggle-hint">
        Deployed contract addresses backing escrow, permissions, and registry
        for each supported Stellar network.
      </p>
      {NETWORK_IDS.map((id) => (
        <NetworkContractsSection key={id} networkId={id} isActive={id === networkId} />
      ))}
    </Card>
  );
}
