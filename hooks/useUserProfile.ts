import useSWR from "swr";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  [key: string]: unknown;
}

export function useUserProfile(userId?: string | null) {
  const { data, error, isLoading, mutate } = useSWR<UserProfile>(
    userId ? `/api/users/${encodeURIComponent(userId)}` : null,
    async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load user profile (${res.status})`);
      }
      return (await res.json()) as UserProfile;
    },
  );

  return {
    profile: data,
    error,
    isLoading,
    refresh: mutate,
  };
}
