"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Card, FormField, StroopsInput } from "@delego/ui";
import type {
  CreateDelegationInput,
  DelegationPermissionLevel,
} from "@delego/types";

const PERMISSION_LEVELS: DelegationPermissionLevel[] = [
  "VIEW_ONLY",
  "AUTO_APPROVE",
  "SIGNER",
  "ADMIN",
];

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface DelegationFormProps {
  /** Wallet ID pre-filled from the connected wallet, if known */
  defaultWalletId?: string;
  /** Called with the new delegation payload. May be async (creation is optimistic either way). */
  onSubmit: (input: CreateDelegationInput) => void | Promise<unknown>;
  onCancel?: () => void;
}

/** Form for granting a new delegation to an AI agent. */
export function DelegationForm({
  defaultWalletId = "",
  onSubmit,
  onCancel,
}: DelegationFormProps) {
  const [agentId, setAgentId] = useState("");
  const [walletId, setWalletId] = useState(defaultWalletId);
  const [label, setLabel] = useState("");
  const [permissionLevel, setPermissionLevel] =
    useState<DelegationPermissionLevel>("AUTO_APPROVE");
  const [maxPerTransaction, setMaxPerTransaction] = useState<bigint>(0n);
  const [maxTotal, setMaxTotal] = useState<bigint>(0n);
  const [allowedMerchants, setAllowedMerchants] = useState("");
  const [allowedCategories, setAllowedCategories] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!agentId.trim() || !walletId.trim() || !label.trim()) {
      setFormError("Agent, wallet, and label are required");
      return;
    }
    if (maxTotal <= 0n) {
      setFormError("Total spending limit must be greater than zero");
      return;
    }

    const input: CreateDelegationInput = {
      agentId: agentId.trim(),
      walletId: walletId.trim(),
      label: label.trim(),
      permissionLevel,
      policy: {
        maxPerTransaction: maxPerTransaction.toString(),
        maxTotal: maxTotal.toString(),
        allowedMerchants: parseCsv(allowedMerchants),
        allowedCategories: parseCsv(allowedCategories),
        ...(expiresAt && {
          expiresAt: new Date(expiresAt).toISOString(),
        }),
      },
    };

    setSubmitting(true);
    try {
      await onSubmit(input);
      setAgentId("");
      setLabel("");
      setMaxPerTransaction(0n);
      setMaxTotal(0n);
      setAllowedMerchants("");
      setAllowedCategories("");
      setExpiresAt("");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create delegation"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card title="Grant a new delegation" ariaLabel="Create delegation">
      <form className="settings-section" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Agent ID"
          required
          hint="The AI agent that will receive this delegation"
          inputProps={{
            value: agentId,
            onChange: (e) => setAgentId(e.target.value),
            placeholder: "agent-shopping-01",
            style: { width: "100%" },
          }}
        />

        <FormField
          label="Wallet ID"
          required
          hint="The Stellar wallet this delegation draws spending authority from"
          inputProps={{
            value: walletId,
            onChange: (e) => setWalletId(e.target.value),
            placeholder: "wallet-id",
            style: { width: "100%" },
          }}
        />

        <FormField
          label="Label"
          required
          hint="A short name to identify this delegation"
          inputProps={{
            value: label,
            onChange: (e) => setLabel(e.target.value),
            placeholder: "Groceries agent",
            style: { width: "100%" },
          }}
        />

        <div>
          <label htmlFor="permission-level" style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}>
            Permission level
          </label>
          <select
            id="permission-level"
            value={permissionLevel}
            onChange={(e) =>
              setPermissionLevel(e.target.value as DelegationPermissionLevel)
            }
            style={{ width: "100%", padding: "0.5rem", borderRadius: "0.375rem" }}
          >
            {PERMISSION_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}>
            Max per transaction
          </label>
          <StroopsInput
            value={maxPerTransaction}
            onChange={setMaxPerTransaction}
            style={{ width: "100%" }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 500, marginBottom: "0.5rem" }}>
            Max total spend
          </label>
          <StroopsInput
            value={maxTotal}
            onChange={setMaxTotal}
            style={{ width: "100%" }}
          />
        </div>

        <FormField
          label="Allowed merchants"
          hint="Comma-separated merchant IDs; leave blank to allow all"
          inputProps={{
            value: allowedMerchants,
            onChange: (e) => setAllowedMerchants(e.target.value),
            placeholder: "merchant-a, merchant-b",
            style: { width: "100%" },
          }}
        />

        <FormField
          label="Allowed categories"
          hint="Comma-separated category names; leave blank to allow all"
          inputProps={{
            value: allowedCategories,
            onChange: (e) => setAllowedCategories(e.target.value),
            placeholder: "groceries, electronics",
            style: { width: "100%" },
          }}
        />

        <FormField
          label="Expires"
          hint="Optional expiry date"
          inputProps={{
            type: "date",
            value: expiresAt,
            onChange: (e) => setExpiresAt(e.target.value),
            style: { width: "100%" },
          }}
        />

        {formError && (
          <div className="settings-status error" role="alert">
            {formError}
          </div>
        )}

        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create delegation"}
          </Button>
          {onCancel && (
            <Button variant="ghost" type="button" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
