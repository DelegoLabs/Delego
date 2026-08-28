"use client";

import { useState } from "react";
import type { User, UserPreferences } from "@delegolabs/types";
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
import { NetworkContractsCard } from "../../components/settings/NetworkContractsCard";
import { OfflineDataCard } from "../../components/settings/OfflineDataCard";

/**
 * Placeholder user + preferences until the API exposes `/api/v1/me` endpoints.
 * TODO: replace with a `useUserProfile` hook backed by DelegoClient once the
 * user/preferences endpoints are implemented in @delegolabs/sdk.
 */
const PLACEHOLDER_USER: User = {
  id: "user-placeholder",
  stellarAddress: "GB...PLACEHOLDER",
  displayName: null,
  email: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PLACEHOLDER_PREFERENCES: UserPreferences = {
  userId: "user-placeholder",
  defaultSpendingLimit: 0n,
  requireApproval: true,
  notificationEmail: true,
  notificationPush: false,
};

/** Settings page that owns local profile and preference state. */
export default function SettingsPage() {
  const [user, setUser] = useState<User>(PLACEHOLDER_USER);
  const [preferences, setPreferences] = useState<UserPreferences>(
    PLACEHOLDER_PREFERENCES
  );

  const handleSaveProfile = async (values: ProfileFormValues) => {
    // TODO: persist via api.updateProfile(values) once the endpoint exists.
    setUser((prev) => ({ ...prev, ...values, updatedAt: new Date() }));
  };

  const handleSavePreferences = async (values: PreferencesFormValues) => {
    // TODO: persist via api.updatePreferences(values) once the endpoint exists.
    setPreferences((prev) => ({ ...prev, ...values }));
  };

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Settings</h1>
        <p>Manage your profile, spending controls, and notifications</p>
      </header>

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
      <NetworkContractsCard />
    </div>
  );
}
