import { env } from "./env";
import { createRetryingFetch } from "./api";
import type { UserPreferenceItem } from "@delegolabs/types";

const retryingFetch = createRetryingFetch();

/**
 * Loads the user's agent preferences from the API.
 */
export async function getUserPreferences(): Promise<UserPreferenceItem[]> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/api/agent/preferences`, {
    credentials: "include",
  });
  if (!res.ok) {
    if (res.status === 404) return [];
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Failed to load user preferences (${res.status}).`);
  }
  const body = await res.json();
  return body.data || [];
}

/**
 * Updates a user preference item.
 */
export async function updateUserPreference(item: UserPreferenceItem): Promise<void> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/api/agent/preferences`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Failed to update user preference (${res.status}).`);
  }
}

/**
 * Deletes a user preference item by key.
 */
export async function deleteUserPreference(key: string): Promise<void> {
  const res = await retryingFetch(`${env.NEXT_PUBLIC_API_URL}/api/agent/preferences/${encodeURIComponent(key)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `Failed to delete user preference (${res.status}).`);
  }
}
