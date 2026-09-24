"use client";

import { useId, useMemo, useState } from "react";
import { Badge, Button, Card } from "@delegolabs/ui";
import {
  filterMerchantRules,
  shortenAddress,
  validateNewRule,
  type MerchantFilterRule,
  type MerchantPolicyFilter,
} from "../../lib/merchantFilters";

export interface MerchantFilterManagerProps {
  rules: MerchantFilterRule[];
  onAdd: (rule: MerchantFilterRule) => void;
  onRemove: (address: string) => void;
}

const POLICY_TAGS: { value: MerchantPolicyFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "allow", label: "Allowlist" },
  { value: "block", label: "Blocklist" },
];

function formatAddedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * Allowlist approved merchant addresses and blocklist suspicious stores
 * (#717). Quick-add validates the Stellar address with a specific message
 * for each failure mode; the table supports address/name lookup and a
 * policy tag filter.
 */
export function MerchantFilterManager({ rules, onAdd, onRemove }: MerchantFilterManagerProps) {
  const idPrefix = useId();
  const [address, setAddress] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [policy, setPolicy] = useState<MerchantFilterRule["policy"]>("allow");
  const [reason, setReason] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<MerchantPolicyFilter>("all");

  const visible = useMemo(() => filterMerchantRules(rules, query, tag), [rules, query, tag]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const validation = validateNewRule(address, rules);
    if (!validation.valid) {
      setAddressError(validation.error ?? "Invalid address.");
      return;
    }
    onAdd({
      address: address.trim(),
      merchantName: merchantName.trim() || undefined,
      policy,
      addedAt: new Date().toISOString(),
      reason: reason.trim() || undefined,
    });
    setAddress("");
    setMerchantName("");
    setReason("");
    setAddressError(null);
  }

  const addressInputId = `${idPrefix}-address`;
  const addressErrorId = `${idPrefix}-address-error`;

  return (
    <Card title="Merchant allowlist & blocklist" ariaLabel="Merchant allowlist and blocklist">
      <form className="merchant-filter-add" onSubmit={handleAdd} noValidate>
        <div className="merchant-filter-field merchant-filter-field-wide">
          <label htmlFor={addressInputId}>Merchant Stellar address</label>
          <input
            id={addressInputId}
            className="order-search"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (addressError) setAddressError(null);
            }}
            placeholder="G…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={addressError ? true : undefined}
            aria-describedby={addressError ? addressErrorId : undefined}
          />
          {addressError && (
            <p id={addressErrorId} role="alert" className="merchant-filter-error">
              {addressError}
            </p>
          )}
        </div>
        <div className="merchant-filter-field">
          <label htmlFor={`${idPrefix}-name`}>Name (optional)</label>
          <input
            id={`${idPrefix}-name`}
            className="order-search"
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
          />
        </div>
        <div className="merchant-filter-field">
          <label htmlFor={`${idPrefix}-policy`}>Policy</label>
          <select
            id={`${idPrefix}-policy`}
            className="order-search"
            value={policy}
            onChange={(e) => setPolicy(e.target.value as MerchantFilterRule["policy"])}
          >
            <option value="allow">Allow</option>
            <option value="block">Block</option>
          </select>
        </div>
        <div className="merchant-filter-field merchant-filter-field-wide">
          <label htmlFor={`${idPrefix}-reason`}>Reason (optional)</label>
          <input
            id={`${idPrefix}-reason`}
            className="order-search"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={policy === "block" ? "e.g. Suspected counterfeit goods" : ""}
          />
        </div>
        <div className="form-actions">
          <Button variant="primary" type="submit">
            Add merchant
          </Button>
        </div>
      </form>

      <div className="merchant-filter-toolbar">
        <input
          type="search"
          className="order-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Look up by address, name or reason"
          aria-label="Search merchant rules"
        />
        <div role="group" aria-label="Filter by policy" className="merchant-filter-tags">
          {POLICY_TAGS.map((t) => (
            <button
              key={t.value}
              type="button"
              className="merchant-filter-tag"
              aria-pressed={tag === t.value}
              onClick={() => setTag(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="comparison-table-wrapper">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Merchant</th>
              <th scope="col">Policy</th>
              <th scope="col">Reason</th>
              <th scope="col">Added</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="stat-label">
                  {rules.length === 0
                    ? "No merchant rules yet — add an address above."
                    : "No rules match your search."}
                </td>
              </tr>
            ) : (
              visible.map((rule) => (
                <tr key={rule.address}>
                  <td>
                    {rule.merchantName && <div>{rule.merchantName}</div>}
                    <code title={rule.address}>{shortenAddress(rule.address)}</code>
                  </td>
                  <td>
                    <Badge tone={rule.policy === "allow" ? "success" : "error"}>
                      {rule.policy === "allow" ? "Allowed" : "Blocked"}
                    </Badge>
                  </td>
                  <td>{rule.reason ?? "—"}</td>
                  <td>{formatAddedAt(rule.addedAt)}</td>
                  <td>
                    <Button
                      variant="ghost"
                      onClick={() => onRemove(rule.address)}
                      ariaLabel={`Remove ${rule.merchantName ?? rule.address} from ${
                        rule.policy === "allow" ? "allowlist" : "blocklist"
                      }`}
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
