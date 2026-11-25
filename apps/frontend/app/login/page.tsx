"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, Card } from "@delegolabs/ui";
import { useWallet } from "../../hooks/useWallet";
import { api } from "../../lib/api";
import { AUTH_TOKEN_COOKIE } from "../../lib/authSession";
import { sanitizeRedirectUrl } from "../../lib/redirect";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const wallet = useWallet();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const returnTo = sanitizeRedirectUrl(searchParams.get("returnTo") ?? searchParams.get("next"));

  useEffect(() => {
    if (wallet.status === "connected" && wallet.address) {
      document.cookie = `${AUTH_TOKEN_COOKIE}=wallet-session; Path=/; SameSite=Lax`;
      api.setToken(wallet.address);
      setStatus("Wallet connected");
      router.replace(returnTo);
    }
  }, [router, returnTo, wallet.address, wallet.status]);

  const handleConnect = async () => {
    setError(null);
    setStatus("Connecting to Freighter...");
    try {
      await wallet.connect("freighter");
    } catch (err) {
      setStatus(null);
      setError(
        err instanceof Error
          ? err.message
          : "Wallet connection failed. Please try again."
      );
    }
  };

  return (
    <div className="settings-page">
      <Card title="Sign in" ariaLabel="Sign in to Delego">
        <p>Connect your Stellar wallet to continue.</p>
        {wallet.status === "unavailable" && (
          <div role="alert">
            <p>Freighter was not detected.</p>
            <a
              href="https://www.freighter.app/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Install Freighter
            </a>
          </div>
        )}
        {wallet.status === "error" && wallet.error && (
          <p role="alert">{wallet.error}</p>
        )}
        {error && <p role="alert">{error}</p>}
        {status && <p role="status" aria-live="polite">{status}</p>}
        <Button
          variant="primary"
          onClick={() => void handleConnect()}
          disabled={
            wallet.status === "checking" ||
            wallet.status === "connecting" ||
            wallet.status === "connected"
          }
        >
          {wallet.status === "connecting" ? "Connecting..." : "Connect Freighter"}
        </Button>
      </Card>
    </div>
  );
}
