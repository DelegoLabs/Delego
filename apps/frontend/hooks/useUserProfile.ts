"use client";

import useSWR from "swr";
import type { User, UserPreferences } from "@delegolabs/types";

const fetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => {
    if (!res.ok) {
      const error = new Error("Failed to fetch user profile");
      (error as any).status = res.status;
      throw error;
    }
    return res.json();
  });

export interface UserProfile {
  user: User;
  preferences: UserPreferences;
}

const DEFAULT_USER: User = {
  id: "",
  stellarAddress: "",
  displayName: "",
  email: "",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const DEFAULT_PREFERENCES: UserPreferences = {
  userId: "",
  currency: "USD",
  theme: "system",
  notificationsEnabled: true,
  defaultSpendingLimit: 0n,
  requireApproval: true,
  notificationEmail: true,
  notificationPush: false,
};

export interface UseUserProfileResult {
  user: User;
  preferences: UserPreferences;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
  isValidating: boolean;
}

/**
 * Fetches the signed-in user's profile and preferences.
 * Falls back to defaults if the API is unavailable.
 */
export function useUserProfile(): UseUserProfileResult {
  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<UserProfile>(
    "/api/v1/me",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
    }
  );

  return {
    user: data?.user ?? DEFAULT_USER,
    preferences: data?.preferences ?? DEFAULT_PREFERENCES,
    isLoading,
    error: error ?? null,
    mutate,
    isValidating,
  };
}

/**
 * Hook to save user profile updates.
 */
export function useSaveUserProfile() {
  const saveUser = async (user: User) => {
    const res = await fetch("/api/v1/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(user),
    });
    if (!res.ok) {
      const err = new Error("Failed to save profile");
      (err as any).status = res.status;
      throw err;
    }
    return res.json();
  };

  const savePreferences = async (preferences: UserPreferences) => {
    const res = await fetch("/api/v1/me/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(preferences),
    });
    if (!res.ok) {
      const err = new Error("Failed to save preferences");
      (err as any).status = res.status;
      throw err;
    }
    return res.json();
  };

  return { saveUser, savePreferences };
}