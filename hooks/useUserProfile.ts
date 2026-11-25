import useSWR from "swr";

export interface UserProfile {
  id: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  [key: string]: unknown;
}

const fetcher = async (url: string): Promise<UserProfile> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.status}`);
  }
  return res.json() as Promise<UserProfile>;
};

export function useUserProfile(userId?: string) {
  const { data, error, isLoading, mutate } = useSWR<UserProfile>(
    userId ? `/api/users/${encodeURIComponent(userId)}` : null,
    fetcher
  );

  return {
    profile: data,
    error,
    isLoading,
    refresh: mutate,
  };
}

export default useUserProfile;
