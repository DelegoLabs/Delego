import { DelegoClient } from "@delego/sdk";
import { env } from "./env";

/**
 * Shared API client instance for the web app.
 *
 * Persists the auth token in localStorage (via the SDK's default storage)
 * and redirects to /login when a request comes back 401 (#405).
 */
export const api = new DelegoClient({
  baseUrl: env.NEXT_PUBLIC_API_URL,
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  },
});
