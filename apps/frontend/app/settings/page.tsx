"use client";

import { useState } from "react";
import Link from "next/link";
import type { User, UserPreferences } from "@delegolabs/types";
import { Button } from "@delegolabs/ui";
import {
  ProfileForm,
  type ProfileFormValues,
} from "../../components/settings/ProfileForm";
import {
  PreferencesForm,
  type PreferencesFormValues,
} from "../../components/settings/PreferencesForm";
import { NotificationSettingsCard } from "../../components/notifications/NotificationSettingsCard";
import { AccessibilitySettingsCard } from "../../components/settings/AccessibilitySettingsCard";
import { DataSaverSettingsCard } from "../../components/settings/DataSaverSettingsCard";
import { LanguageSwitcher } from "../../components/settings/LanguageSwitcher";
import { CurrencySwitcher } from "../../components/settings/CurrencySwitcher";
import { TimeFormatSwitcher } from "../../components/settings/TimeFormatSwitcher";
import { ChatAudioSettingsCard } from "../../components/settings/ChatAudioSettingsCard";
import { NetworkContractsCard } from "../../components/settings/NetworkContractsCard";
import { OfflineDataCard } from "../../components/settings/OfflineDataCard";
import { PrivacyExportCard } from "../../components/settings/PrivacyExportCard";
import { DataErasureCard } from "../../components/settings/DataErasureCard";
import { KillSwitchCard } from "../../components/settings/KillSwitchCard";
import { ConsentSettingsCard } from "../../components/settings/ConsentSettingsCard";
import { AgentSettingsCard } from "../../components/settings/AgentSettingsCard";
import { AgentUserPreferencesList } from "../../components/settings/AgentUserPreferencesList";
import type { AgentPersonaConfig } from "../../lib/agentConfig";
import { MerchantWebhookCard } from "../../components/settings/MerchantWebhookCard";
import { CategoryBudgetAllocationCard } from "../../components/settings/CategoryBudgetAllocationCard";
import type { CategoryBudgetAllocation } from "../../components/settings/CategoryBudgetAllocationCard";

/**
 * Placeholder user + preferences until the API exposes `/api/v1/me` endpoints.
 * TODO: replace with a `useUserProfile` hook backed by DelegoClient once the
 * user/preferences endpoints are implemented in @delegolabs/sdk.
 */
const PLACEHOLDER_USER: User = {
  id: "user-placeholder",
  stellarAddress: "GB...PLACEHOLDER",
  displayName: "",
  email: "",
  createdAt: new Date(),
  updatedAt: new Date(),
};

/**
 * Placeholder agent config until the API exposes a GET counterpart to
 * `PUT /api/agent/config`. TODO: replace with a `useAgentConfig` hook once
 * that read endpoint exists.
 */
const PLACEHOLDER_AGENT_CONFIG: AgentPersonaConfig = {
  agentId: "agent-placeholder",
  name: "Shopping Agent",
  strategy: "balanced",
  maxAutonomousBudgetStroops: "500000000",
  negotiationAllowed: true,
  preferredAsset: "USDC",
};

const PLACEHOLDER_PREFERENCES: UserPreferences = {
  userId: "user-placeholder",
  currency: "USD",
  theme: "system",
  notificationsEnabled: true,
  defaultSpendingLimit: 0n,
  requireApproval: true,
  notificationEmail: true,
  notificationPush: false,
};

/**
 * Placeholder active delegation count until the API exposes a delegations
 * endpoint. TODO: replace with a `useActiveDelegations` hook once that read
 * endpoint exists in @delegolabs/sdk.
 */
const PLACEHOLDER_ACTIVE_DELEGATION_COUNT = 3;

/**
 * Placeholder category budget allocations until the API exposes a budget
 * allocation endpoint. TODO: replace with a `useCategoryBudgets` hook once
 * that read endpoint exists in @delegolabs/sdk.
 */
const PLACEHOLDER_CATEGORY_BUDGETS: CategoryBudgetAllocation[] = [
  { category: "Groceries", monthlyLimitStroops: 500000000n, currentSpentStroops: 320000000n },
  { category: "Dining", monthlyLimitStroops: 300000000n, currentSpentStroops: 285000000n },
  { category: "Transport", monthlyLimitStroops: 200000000n, currentSpentStroops: 90000000n },
  { category: "Entertainment", monthlyLimitStroops: 150000000n, currentSpentStroops: 40000000n },
  { category: "Utilities", monthlyLimitStroops: 250000000n, currentSpentStroops: 110000000n },
];
/** Props for the emergency delegation kill-switch modal. */
export interface KillSwitchModalProps {
  activeDelegationCount: number;
  onConfirmRevokeAll(): Promise<void>;
}

/**
 * Two-step confirmation modal for the emergency delegation kill-switch.
 * The confirm action stays disabled until the user types the exact string
 * "REVOKE", and revocation is broadcast on-chain via `onConfirmRevokeAll`.
 */
function KillSwitchModal({
  activeDelegationCount,
  onConfirmRevokeAll,
}: KillSwitchModalProps) {
  const [confirmation, setConfirmation] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmation === "REVOKE" && !isRevoking;

  const handleConfirm = async () => {
    if (!canConfirm) {
      return;
    }
    setIsRevoking(true);
    setError(null);
    try {
      await onConfirmRevokeAll();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to revoke delegations. Please try again."
      );
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kill-switch-modal-title"
      className="kill-switch-modal"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.5)",
        zIndex: 1000,
      }}
    >
      <div
        className="kill-switch-modal__panel"
        style={{
          background: "#fff",
          borderRadius: "0.5rem",
          padding: "1.5rem",
          maxWidth: "28rem",
          width: "100%",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
        }}
      >
        <h2 id="kill-switch-modal-title" style={{ color: "#b91c1c" }}>
          Revoke all agent spending permissions?
        </h2>
        <p>
          This will immediately revoke all {activeDelegationCount} active AI
          agent delegation{activeDelegationCount === 1 ? "" : "s"} and
          broadcast the revocation on-chain. This action cannot be undone.
        </p>
        <label htmlFor="kill-switch-confirmation">
          Type <strong>REVOKE</strong> to confirm
        </label>
        <input
          id="kill-switch-confirmation"
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          disabled={isRevoking}
          style={{
            display: "block",
            width: "100%",
            margin: "0.5rem 0 1rem",
            padding: "0.5rem",
            border: "1px solid #d1d5db",
            borderRadius: "0.375rem",
          }}
        />
        {error ? (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <Button
            variant="secondary"
            onClick={() => setConfirmation("")}
            disabled={isRevoking}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {isRevoking ? "Revoking…" : "Revoke all"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Settings page that owns local profile and preference state. */
export default function SettingsPage() {
  const [user, setUser] = useState<User>(PLACEHOLDER_USER);
  const [preferences, setPreferences] = useState<UserPreferences>(
    PLACEHOLDER_PREFERENCES
  );
  const [isKillSwitchOpen, setIsKillSwitchOpen] = useState(false);
  const [categoryBudgets, setCategoryBudgets] = useState<
    CategoryBudgetAllocation[]
  >(PLACEHOLDER_CATEGORY_BUDGETS);

  const handleSaveProfile = async (values: ProfileFormValues) => {
    // TODO: persist via api.updateProfile(values) once the endpoint exists.
    setUser((prev) => ({ ...prev, ...values, updatedAt: new Date() }));
  };

  const handleSavePreferences = async (values: PreferencesFormValues) => {
    // TODO: persist via api.updatePreferences(values) once the endpoint exists.
    setPreferences((prev) => ({ ...prev, ...values }));
  };

  const handleSaveCategoryBudgets = async (
    allocations: CategoryBudgetAllocation[]
  ) => {
    // TODO: persist via api.updateCategoryBudgets(allocations) once the
    // endpoint exists in @delegolabs/sdk.
    setCategoryBudgets(allocations);
  };
  const handleConfirmRevokeAll = async () => {
    // TODO: broadcast revocation on-chain via api.revokeAllDelegations() once
    // the endpoint exists in @delegolabs/sdk.
    setIsKillSwitchOpen(false);
  };

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Settings</h1>
        <p>Manage your profile, spending controls, and notifications</p>
      </header>

      <section
        className="emergency-kill-switch-banner"
        role="alert"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "1rem",
          marginBottom: "1rem",
          background: "#fef2f2",
          border: "1px solid #b91c1c",
          borderRadius: "0.5rem",
        }}
      >
        <div>
          <strong style={{ color: "#b91c1c" }}>Emergency kill-switch</strong>
          <p style={{ margin: 0 }}>
            Instantly revoke all active AI agent spending permissions.
          </p>
        </div>
        <Button variant="destructive" onClick={() => setIsKillSwitchOpen(true)}>
          Revoke all permissions
        </Button>
      </section>

      {isKillSwitchOpen ? (
        <KillSwitchModal
          activeDelegationCount={PLACEHOLDER_ACTIVE_DELEGATION_COUNT}
          onConfirmRevokeAll={handleConfirmRevokeAll}
        />
      ) : null}

      <ProfileForm user={user} onSave={handleSaveProfile} />
      <PreferencesForm
        preferences={preferences}
        onSave={handleSavePreferences}
      />
      <OfflineDataCard />
      <AccessibilitySettingsCard />
      <DataSaverSettingsCard />
      <NotificationSettingsCard />
      <LanguageSwitcher />
      <CurrencySwitcher />
      <TimeFormatSwitcher />
      <ChatAudioSettingsCard />
      <NetworkContractsCard />
      <CategoryBudgetAllocationCard
        allocations={categoryBudgets}
        onSave={handleSaveCategoryBudgets}
      />
      <AgentSettingsCard config={PLACEHOLDER_AGENT_CONFIG} />
      <AgentUserPreferencesList />
      <MerchantWebhookCard />
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Link href="/settings/webhooks/logs" prefetch={true}>
          <Button variant="secondary">View webhook activity</Button>
        </Link>
      </div>
      <ConsentSettingsCard />
      <PrivacyExportCard user={user} preferences={preferences} />
      <DataErasureCard />
      <KillSwitchCard />
    </div>
  );
}
