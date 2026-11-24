import useSWR from "swr";

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  [key: string]: unknown;
}

const fetcher = async (url: string): Promise<UserProfile> => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to load user profile (${res.status})`);
  }
  return res.json() as Promise<UserProfile>;
};

export function useUserProfile() {
  const { data, error, isLoading, mutate } = useSWR<UserProfile>(
    "/api/users/me",
    fetcher,
  );

  return {
    user: data,
    error,
    isLoading,
    refresh: mutate,
  };
}

export default useUserProfile;
