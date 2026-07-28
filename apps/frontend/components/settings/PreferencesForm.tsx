"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Card, StroopsInput, Button } from "@delego/ui";
import type { UserPreferences } from "@delego/types";

/** Preference fields editable from the form (userId is fixed). */
export type PreferencesFormValues = Omit<UserPreferences, "userId">;

export interface PreferencesFormProps {
  /** Current preferences for the signed-in user */
  preferences: UserPreferences;
  /** Persist the updated preferences. May be async. */
  onSave: (values: PreferencesFormValues) => void | Promise<void>;
}

interface ToggleRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps) {
  return (
    <label className="settings-toggle-row">
      <span>
        <span className="settings-toggle-label">{label}</span>
        <p className="settings-toggle-hint">{hint}</p>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: "1.125rem", height: "1.125rem", marginTop: "0.25rem" }}
      />
    </label>
  );
}

/**
 * Preferences form — spending controls and notification settings.
 * The spending limit is captured in stroops via StroopsInput.
 */
export function PreferencesForm({ preferences, onSave }: PreferencesFormProps) {
  const [defaultSpendingLimit, setDefaultSpendingLimit] = useState<bigint>(
    preferences.defaultSpendingLimit
  );
  const [requireApproval, setRequireApproval] = useState(
    preferences.requireApproval
  );
  const [notificationEmail, setNotificationEmail] = useState(
    preferences.notificationEmail
  );
  const [notificationPush, setNotificationPush] = useState(
    preferences.notificationPush
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      await onSave({
        defaultSpendingLimit,
        requireApproval,
        notificationEmail,
        notificationPush,
      });
      setStatus({ type: "success", message: "Preferences updated" });
    } catch (err) {
      setStatus({
        type: "error",
        message:
          err instanceof Error ? err.message : "Failed to save preferences",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Preferences" ariaLabel="Preference settings">
      <form className="settings-section" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="default-spending-limit"
            style={{ display: "block", fontWeight: 500 }}
          >
            Default spending limit
          </label>
          <div
            id="default-spending-limit-hint"
            style={{
              fontSize: "0.875rem",
              color: "#666",
              margin: "0.25rem 0 0.5rem",
            }}
          >
            Maximum an agent may spend per purchase without explicit approval
          </div>
          <StroopsInput
            id="default-spending-limit"
            aria-describedby="default-spending-limit-hint"
            value={defaultSpendingLimit}
            onChange={setDefaultSpendingLimit}
            style={{ width: "100%" }}
          />
        </div>

        <ToggleRow
          label="Require approval for all purchases"
          hint="Every purchase must be explicitly approved, regardless of the limit"
          checked={requireApproval}
          onChange={setRequireApproval}
        />

        <ToggleRow
          label="Email notifications"
          hint="Receive order and approval updates by email"
          checked={notificationEmail}
          onChange={setNotificationEmail}
        />

        <ToggleRow
          label="Push notifications"
          hint="Receive real-time alerts on your devices"
          checked={notificationPush}
          onChange={setNotificationPush}
        />

        {status && (
          <div className={`settings-status ${status.type}`} role="status">
            {status.message}
          </div>
        )}

        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save preferences"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
