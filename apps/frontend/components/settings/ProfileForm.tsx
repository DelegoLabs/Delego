"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Card, FormField, Button } from "@delego/ui";
import type { User } from "@delego/types";

/** Fields on the User that are editable from the profile form. */
export type ProfileFormValues = Pick<User, "displayName" | "email">;

export interface ProfileFormProps {
  /** The user whose profile is being edited */
  user: User;
  /** Persist the updated profile fields. May be async. */
  onSave: (values: ProfileFormValues) => void | Promise<void>;
}

/**
 * Profile form — edit the user's display name and email.
 * The Stellar address is shown read-only as it is the user's identity.
 */
export function ProfileForm({ user, onSave }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [emailError, setEmailError] = useState<string | undefined>();

  const validate = (): boolean => {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Enter a valid email address");
      return false;
    }
    setEmailError(undefined);
    return true;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus(null);
    if (!validate()) return;

    setSaving(true);
    try {
      await onSave({
        displayName: displayName.trim() || null,
        email: email.trim() || null,
      });
      setStatus({ type: "success", message: "Profile updated" });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Failed to save profile",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Profile" ariaLabel="Profile settings">
      <form className="settings-section" onSubmit={handleSubmit} noValidate>
        <FormField
          label="Stellar address"
          hint="Your wallet address — this is your identity and cannot be changed"
          inputProps={{
            value: user.stellarAddress,
            readOnly: true,
            style: { width: "100%", fontFamily: "monospace" },
          }}
        />

        <FormField
          label="Display name"
          inputProps={{
            value: displayName,
            onChange: (e) => setDisplayName(e.target.value),
            placeholder: "How should we address you?",
            autoComplete: "name",
            style: { width: "100%" },
          }}
        />

        <FormField
          label="Email"
          error={emailError}
          hint="Used for order and approval notifications"
          inputProps={{
            type: "email",
            value: email,
            onChange: (e) => setEmail(e.target.value),
            placeholder: "you@example.com",
            autoComplete: "email",
            style: { width: "100%" },
          }}
        />

        {status && (
          <div className={`settings-status ${status.type}`} role="status">
            {status.message}
          </div>
        )}

        <div className="form-actions">
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
