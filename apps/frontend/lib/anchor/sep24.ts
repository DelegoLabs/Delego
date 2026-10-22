import type { Sep0024InteractiveSession } from "@delegolabs/types";

export interface AnchorConfig {
  domain: string;
  transferServerUrl: string;
  supportedAssets: string[];
}

export const SUPPORTED_ANCHORS: Record<string, AnchorConfig> = {
  USD: {
    domain: "anchor.usd.example.com",
    transferServerUrl: "https://anchor.usd.example.com/sep24",
    supportedAssets: ["USD"],
  },
  EUR: {
    domain: "anchor.eur.example.com",
    transferServerUrl: "https://anchor.eur.example.com/sep24",
    supportedAssets: ["EUR"],
  },
  NGN: {
    domain: "anchor.ngn.example.com",
    transferServerUrl: "https://anchor.ngn.example.com/sep24",
    supportedAssets: ["NGN"],
  },
};

export interface InitiateSep24Params {
  assetCode: "USD" | "EUR" | "NGN";
  action: "deposit" | "withdraw";
  account: string;
  amount?: string;
  authToken?: string;
  customAnchorUrl?: string;
}

export function validateAnchorUrl(urlStr: string, allowedDomain?: string): URL {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error(`Invalid anchor URL format: ${urlStr}`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`Insecure anchor protocol: ${url.protocol}. Only HTTPS is permitted.`);
  }

  if (allowedDomain) {
    const isDomainMatch =
      url.hostname === allowedDomain || url.hostname.endsWith(`.${allowedDomain}`);
    if (!isDomainMatch) {
      throw new Error(`Disallowed anchor origin domain: ${url.hostname}`);
    }
  }

  return url;
}

export async function initiateSep24Transfer(
  params: InitiateSep24Params
): Promise<Sep0024InteractiveSession> {
  const { assetCode, action, account, amount, authToken, customAnchorUrl } = params;

  const anchorConfig = SUPPORTED_ANCHORS[assetCode];
  if (!anchorConfig) {
    throw new Error(`Unsupported currency for SEP-0024 transfer: ${assetCode}`);
  }

  const baseUrl = customAnchorUrl || anchorConfig.transferServerUrl;
  validateAnchorUrl(baseUrl, anchorConfig.domain);

  const endpoint = `${baseUrl}/transactions/${action}/interactive`;

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const body = new URLSearchParams();
  body.append("asset_code", assetCode);
  body.append("account", account);
  if (amount) {
    body.append("amount", amount);
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Anchor transfer initiation failed (${res.status}): ${errText || res.statusText}`
    );
  }

  const data = await res.json();
  if (!data || typeof data !== "object") {
    throw new Error("Invalid response format from anchor interactive endpoint.");
  }

  const interactiveUrl = data.url || data.interactive_url;
  const transactionId = data.id || data.transaction_id;

  if (!interactiveUrl || !transactionId) {
    throw new Error("Anchor interactive response missing required interactive url or transaction id.");
  }

  validateAnchorUrl(interactiveUrl, anchorConfig.domain);

  return {
    anchorDomain: anchorConfig.domain,
    assetCode,
    action,
    interactiveUrl,
    transactionId,
  };
}

export interface Sep24TransactionStatus {
  id: string;
  status:
    | "incomplete"
    | "pending_user_transfer_start"
    | "pending_external"
    | "pending_anchor"
    | "pending_stellar"
    | "pending_trust"
    | "pending_user"
    | "completed"
    | "refunded"
    | "expired"
    | "no_market"
    | "too_small"
    | "too_large"
    | "error";
  amountIn?: string;
  amountOut?: string;
  message?: string;
}

export async function verifySep24Transaction(
  transactionId: string,
  anchorDomain: string,
  authToken?: string
): Promise<Sep24TransactionStatus> {
  const matchedConfig = Object.values(SUPPORTED_ANCHORS).find(
    (cfg) => cfg.domain === anchorDomain
  );
  if (!matchedConfig) {
    throw new Error(`Unknown or untrusted anchor domain: ${anchorDomain}`);
  }

  const endpoint = `${matchedConfig.transferServerUrl}/transaction?id=${encodeURIComponent(
    transactionId
  )}`;
  validateAnchorUrl(endpoint, matchedConfig.domain);

  const headers: Record<string, string> = {};
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(endpoint, { headers });
  if (!res.ok) {
    throw new Error(`Failed to verify anchor transaction status (${res.status})`);
  }

  const data = await res.json();
  const tx = data.transaction || data;

  if (!tx || !tx.status) {
    throw new Error("Invalid transaction status response from anchor.");
  }

  return {
    id: tx.id || transactionId,
    status: tx.status,
    amountIn: tx.amount_in,
    amountOut: tx.amount_out,
    message: tx.message,
  };
}
