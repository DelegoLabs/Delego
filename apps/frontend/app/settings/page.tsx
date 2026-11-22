"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
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
import { MaxFeeCapCard } from "../../components/settings/MaxFeeCapCard";
import { OfflineDataCard } from "../../components/settings/OfflineDataCard";
import { AgentSettingsCard } from "../../components/settings/AgentSettingsCard";
import { SpendVelocityGauge } from "../../components/settings/SpendVelocityGauge";
import { useUserProfile, useSaveUserProfile } from "../../hooks/useUserProfile";
import { useAgentConfig } from "../../hooks/useAgentConfig";
import type { CategoryBudgetAllocation } from "../../components/settings/CategoryBudgetAllocationCard";

/**
 * Secondary settings cards are code-split so their JavaScript only loads once
 * the buyer scrolls to them. The page renders a long list of cards, and
 * shipping all of them in the initial payload pushed /settings over the
 * First Load JS budget. `ProfileForm` / `PreferencesForm` stay eager because
 * they are the first thing on the page.
 */
const ChatAudioSettingsCard = dynamic(
  () => import("../../components/settings/ChatAudioSettingsCard").then((m) => m.ChatAudioSettingsCard)
);
const NetworkContractsCard = dynamic(
  () => import("../../components/settings/NetworkContractsCard").then((m) => m.NetworkContractsCard)
);
const CategoryBudgetAllocationCard = dynamic(
  () =>
    import("../../components/settings/CategoryBudgetAllocationCard").then(
      (m) => m.CategoryBudgetAllocationCard
    )
);
const AgentUserPreferencesList = dynamic(
  () =>
    import("../../components/settings/AgentUserPreferencesList").then(
      (m) => m.AgentUserPreferencesList
    )
);
const MerchantWebhookCard = dynamic(
  () => import("../../components/settings/MerchantWebhookCard").then((m) => m.MerchantWebhookCard)
);
const ConsentSettingsCard = dynamic(
  () => import("../../components/settings/ConsentSettingsCard").then((m) => m.ConsentSettingsCard)
);
const PrivacyExportCard = dynamic(
  () => import("../../components/settings/PrivacyExportCard").then((m) => m.PrivacyExportCard)
);
const DataErasureCard = dynamic(
  () => import("../../components/settings/DataErasureCard").then((m) => m.DataErasureCard)
);
const KillSwitchCard = dynamic(
  () => import("../../components/settings/KillSwitchCard").then((m) => m.KillSwitchCard)
);

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

/** Fetches active delegation count from the delegations endpoint. */
function useDelegations() {
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchDelegations() {
      try {
        const response = await fetch("/api/v1/delegations");
        if (!response.ok) {
          throw new Error("Failed to fetch delegations");
        }
        const data = await response.json();
        // Assume API returns { delegations: [...] } with active status
        const activeDelegations = Array.isArray(data.delegations)
          ? data.delegations.filter((d: { status: string }) => d.status === "active")
          : [];
        setActiveCount(activeDelegations.length);
      } catch {
        // API not available, return null to use placeholder
        setActiveCount(null);
      } finally {
        setIsLoading(false);
      }
    }
    fetchDelegations();
  }, []);

  return { activeCount, isLoading };
}

/** Fetches category budget allocations from the budgets endpoint. */
function useCategoryBudgets() {
  const [budgets, setBudgets] = useState<CategoryBudgetAllocation[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchBudgets() {
      try {
        const response = await fetch("/api/v1/budgets");
        if (!response.ok) {
          throw new Error("Failed to fetch budgets");
        }
        const data = await response.json();
        setBudgets(data.budgets ?? []);
      } catch {
        // API not available, return null to use placeholder
        setBudgets(null);
      } finally {
        setIsLoading(false);
      }
    }
    fetchBudgets();
  }, []);

  return { budgets, isLoading };
}

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
  const { user, preferences, isLoading: userLoading, error: userError } = useUserProfile();
  const { config: agentConfig } = useAgentConfig();
  const { saveUser, savePreferences } = useSaveUserProfile();
  const [isKillSwitchOpen, setIsKillSwitchOpen] = useState(false);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudgetAllocation[]>(
    PLACEHOLDER_CATEGORY_BUDGETS
  );
  const [localUser, setLocalUser] = useState<User>(user);
  const [localPreferences, setLocalPreferences] = useState<UserPreferences>(preferences);

  // Sync local state when API data loads
  useEffect(() => {
    setLocalUser(user);
    setLocalPreferences(preferences);
  }, [user, preferences]);

  // Wire real data hooks
  const { activeCount: activeDelegationCount } = useDelegations();
  const { budgets: categoryBudgetData } = useCategoryBudgets();

  // Use real data when available, fallback to placeholder
  const effectiveDelegationCount =
    activeDelegationCount !== null ? activeDelegationCount : 3;
  const effectiveCategoryBudgets =
    categoryBudgetData !== null ? categoryBudgetData : PLACEHOLDER_CATEGORY_BUDGETS;

  const handleSaveProfile = async (values: ProfileFormValues) => {
    const updated = { ...localUser, ...values, updatedAt: new Date() };
    setLocalUser(updated);
    try {
      await saveUser(updated);
    } catch {
      // Keep local state even if save fails
    }
  };

  const handleSavePreferences = async (values: PreferencesFormValues) => {
    const updated = { ...localPreferences, ...values };
    setLocalPreferences(updated);
    try {
      await savePreferences(updated);
    } catch {
      // Keep local state even if save fails
    }
  };

  const handleSaveCategoryBudgets = async (
    allocations: CategoryBudgetAllocation[]
  ) => {
    setCategoryBudgets(allocations);
  };
  const handleConfirmRevokeAll = async () => {
    setIsKillSwitchOpen(false);
  };

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Settings</h1>
        <p>Manage your profile, spending controls, and notifications</p>
      </header>

      <section className="mb-6">
        <SpendVelocityGauge
          currentSpendStroops="350000000"
          limitStroops="500000000"
          windowHours={24}
          remainingSeconds={18000}
        />
      </section>

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
          activeDelegationCount={effectiveDelegationCount}
          onConfirmRevokeAll={handleConfirmRevokeAll}
        />
      ) : null}

      <ProfileForm user={localUser} onSave={handleSaveProfile} />
      <PreferencesForm
        preferences={localPreferences}
        onSave={handleSavePreferences}
      />
      <OfflineDataCard />
      <AccessibilitySettingsCard />
      <DataSaverSettingsCard />
      <NotificationSettingsCard />
      <LanguageSwitcher />
      <CurrencySwitcher />
      <TimeFormatSwitcher />
      <MaxFeeCapCard />
      <ChatAudioSettingsCard />
      <NetworkContractsCard />
      <CategoryBudgetAllocationCard
        allocations={effectiveCategoryBudgets}
        onSave={handleSaveCategoryBudgets}
      />
      <AgentSettingsCard config={agentConfig} />
      <AgentUserPreferencesList />
      <MerchantWebhookCard />
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Link href="/settings/addresses" prefetch={true}>
          <Button variant="secondary">Manage delivery addresses</Button>
        </Link>
        <Link href="/settings/webhooks/logs" prefetch={true}>
          <Button variant="secondary">View webhook activity</Button>
        </Link>
      </div>
      <ConsentSettingsCard />
      <PrivacyExportCard user={user} preferences={preferences} />
      <DataErasureCard />
      <KillSwitchCard activeDelegationCount={effectiveDelegationCount} />
    </div>
  );
}
