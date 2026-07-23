import type { VaultService } from "./vault.js";

export interface HSMKeySignerAdapter {
  sign(data: Buffer, keyId: string): Promise<Buffer>;
  getPublicKey(keyId: string): Promise<string>;
}

export interface HsmKeySignerOptions {
  adapter?: HSMKeySignerAdapter;
  fallbackVault?: Pick<VaultService, "getKey" | "listPublicKeys">;
  defaultKeyId?: string;
  enabled?: boolean;
}

export class HsmKeySignerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "HsmKeySignerError";
  }
}

function isDevelopmentEnvironment(): boolean {
  return ["development", "dev", "test"].includes((process.env.NODE_ENV ?? "").toLowerCase());
}

function resolveBoolean(value: boolean | undefined, fallback: boolean): boolean {
  return value ?? fallback;
}

function resolveEffectiveKeyId(requestedKeyId: string, defaultKeyId: string): string {
  const effective = requestedKeyId.trim() || defaultKeyId.trim();
  if (!effective) {
    throw new HsmKeySignerError("keyId is required", "KEY_SIGNER_MISSING_KEY_ID");
  }
  return effective;
}

function buildDefaultAdapter(): HSMKeySignerAdapter {
  const endpoint = process.env.WALLET_HSM_ENDPOINT?.trim();
  const token = process.env.WALLET_HSM_TOKEN?.trim() || process.env.WALLET_HSM_API_KEY?.trim();

  if (!endpoint) {
    return {
      sign: async () => {
        throw new HsmKeySignerError(
          "WALLET_HSM_ENDPOINT is not configured",
          "KEY_SIGNER_HSM_UNAVAILABLE",
          true
        );
      },
      getPublicKey: async () => {
        throw new HsmKeySignerError(
          "WALLET_HSM_ENDPOINT is not configured",
          "KEY_SIGNER_HSM_UNAVAILABLE",
          true
        );
      },
    };
  }

  return {
    async sign(data: Buffer, keyId: string): Promise<Buffer> {
      const response = await fetch(`${endpoint.replace(/\/$/, "")}/sign`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ keyId, data: data.toString("base64") }),
      });

      if (!response.ok) {
        throw new HsmKeySignerError(
          `HSM signing request failed with status ${response.status}`,
          "KEY_SIGNER_HSM_UNAVAILABLE",
          true
        );
      }

      const payload = (await response.json().catch(() => ({}))) as { signature?: string };
      if (typeof payload.signature !== "string" || payload.signature.trim() === "") {
        throw new HsmKeySignerError("HSM returned an empty signature", "KEY_SIGNER_EMPTY_SIGNATURE");
      }

      return Buffer.from(payload.signature, "base64");
    },
    async getPublicKey(keyId: string): Promise<string> {
      const response = await fetch(`${endpoint.replace(/\/$/, "")}/public-key/${encodeURIComponent(keyId)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new HsmKeySignerError(
          `HSM public key request failed with status ${response.status}`,
          "KEY_SIGNER_HSM_UNAVAILABLE",
          true
        );
      }

      const payload = (await response.json().catch(() => ({}))) as { publicKey?: string };
      if (typeof payload.publicKey !== "string" || payload.publicKey.trim() === "") {
        throw new HsmKeySignerError("HSM returned an empty public key", "KEY_SIGNER_EMPTY_PUBLIC_KEY");
      }

      return payload.publicKey;
    },
  };
}

export class HsmKeySigner {
  private readonly adapter: HSMKeySignerAdapter;
  private readonly fallbackVault?: Pick<VaultService, "getKey" | "listPublicKeys">;
  private readonly defaultKeyId: string;
  private readonly enabled: boolean;

  constructor(options: HsmKeySignerOptions = {}) {
    const fallbackEnabled = resolveBoolean(options.enabled, true);
    this.adapter = options.adapter ?? buildDefaultAdapter();
    this.fallbackVault = options.fallbackVault;
    this.defaultKeyId = options.defaultKeyId ?? process.env.WALLET_HSM_KEY_ID ?? "";
    this.enabled = fallbackEnabled && (process.env.WALLET_HSM_ENABLED?.trim().toLowerCase() !== "false");
  }

  private shouldFallback(error: unknown): boolean {
    if (!this.fallbackVault) {
      return false;
    }
    if (isDevelopmentEnvironment()) {
      return true;
    }

    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes("connection") || message.toLowerCase().includes("refused");
  }

  private async fallbackSign(data: Buffer, keyId: string): Promise<Buffer> {
    const resolvedKeyId = resolveEffectiveKeyId(keyId, this.defaultKeyId);
    const secret = await this.fallbackVault!.getKey(resolvedKeyId);
    const { Keypair } = await import("@stellar/stellar-sdk");
    return Buffer.from(Keypair.fromSecret(secret).sign(data));
  }

  private async fallbackGetPublicKey(keyId: string): Promise<string> {
    const resolvedKeyId = resolveEffectiveKeyId(keyId, this.defaultKeyId);
    const keys = await this.fallbackVault!.listPublicKeys();
    if (!keys.includes(resolvedKeyId)) {
      throw new HsmKeySignerError(`Key not found in vault: ${resolvedKeyId}`, "KEY_SIGNER_KEY_NOT_FOUND");
    }
    return resolvedKeyId;
  }

  async sign(data: Buffer, keyId: string): Promise<Buffer> {
    if (!this.enabled) {
      return this.fallbackSign(data, keyId);
    }

    try {
      return await this.adapter.sign(data, resolveEffectiveKeyId(keyId, this.defaultKeyId));
    } catch (error) {
      if (this.shouldFallback(error)) {
        return this.fallbackSign(data, keyId);
      }
      throw error;
    }
  }

  async getPublicKey(keyId: string): Promise<string> {
    if (!this.enabled) {
      return this.fallbackGetPublicKey(keyId);
    }

    try {
      return await this.adapter.getPublicKey(resolveEffectiveKeyId(keyId, this.defaultKeyId));
    } catch (error) {
      if (this.shouldFallback(error)) {
        return this.fallbackGetPublicKey(keyId);
      }
      throw error;
    }
  }
}
