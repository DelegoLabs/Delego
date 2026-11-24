import useSWR from "swr";

export interface UserProfile {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  walletAddress?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UseUserProfileResult {
  profile: UserProfile | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  mutate: () => Promise<UserProfile | undefined>;
}

const PROFILE_ENDPOINT = "/api/user/profile";

async function profileFetcher(url: string): Promise<UserProfile> {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to load user profile (HTTP ${response.status})`);
  }

  return (await response.json()) as UserProfile;
}

export function useUserProfile(): UseUserProfileResult {
  const { data, error, isLoading, mutate } = useSWR<UserProfile>(
    PROFILE_ENDPOINT,
    profileFetcher,
    { revalidateOnFocus: false },
  );

  return {
    profile: data,
    isLoading,
    isError: Boolean(error),
    error,
    mutate: () => mutate(),
  };
}

export default useUserProfile;
