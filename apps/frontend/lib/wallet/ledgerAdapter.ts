import type { LedgerConnectionState } from "@delegolabs/types";
import { StrKey } from "@stellar/stellar-sdk";
import type Str from "@ledgerhq/hw-app-str";
import type { StellarWalletAdapter } from "./types";

export const DEFAULT_LEDGER_BIP32_PATH = "44'/148'/0'";

export class LedgerAdapter implements StellarWalletAdapter {
  readonly id = "ledger";
  readonly name = "Ledger Hardware Wallet";
  readonly icon = "ledger";
  readonly installUrl = "https://www.ledger.com/";

  private bip32Path = DEFAULT_LEDGER_BIP32_PATH;
  private transport: ConstructorParameters<typeof Str>[0] | null = null;
  private appStr: Str | null = null;
  private connectedPublicKey: string | null = null;
  private deviceModelName: string | undefined = undefined;

  async detect(): Promise<boolean> {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return false;
    }
    return "hid" in navigator;
  }

  async isAvailable(): Promise<boolean> {
    return this.detect();
  }

  async getAddress(): Promise<string | null> {
    return this.connectedPublicKey;
  }

  async getNetwork(): Promise<{ network: string | null; networkPassphrase: string | null } | null> {
    return { network: "PUBLIC", networkPassphrase: null };
  }

  async connectLedger(bipPath: string = DEFAULT_LEDGER_BIP32_PATH): Promise<LedgerConnectionState> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error("WebHID is not supported in this browser environment.");
    }

    try {
      const TransportWebHID = (await import("@ledgerhq/hw-transport-webhid")).default;
      const StrApp = (await import("@ledgerhq/hw-app-str")).default;

      const transport = await TransportWebHID.create();
      this.transport = transport;
      const appStr = new StrApp(transport);
      this.appStr = appStr;
      this.bip32Path = bipPath;

      const res = await appStr.getPublicKey(this.bip32Path);
      const publicKey = res.rawPublicKey
        ? StrKey.encodeEd25519PublicKey(res.rawPublicKey)
        : Reflect.get(res, "publicKey");
      if (typeof publicKey !== "string") {
        throw new Error("Failed to retrieve public key from Ledger device.");
      }

      this.connectedPublicKey = publicKey;
      const deviceModel = Reflect.get(transport, "deviceModel");
      this.deviceModelName =
        typeof deviceModel === "object" &&
        deviceModel !== null &&
        "id" in deviceModel &&
        typeof deviceModel.id === "string"
          ? deviceModel.id
          : "Ledger Device";

      return {
        isConnected: true,
        bip32Path: this.bip32Path,
        publicKey: this.connectedPublicKey,
        deviceModel: this.deviceModelName,
        isAppOpen: true,
      };
    } catch (err) {
      await this.disconnect();
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("0x6804") || msg.includes("locked")) {
        throw new Error("Ledger device is locked. Please unlock your device and try again.");
      }
      if (msg.includes("0x6700") || msg.includes("App")) {
        throw new Error("Stellar app is not open on Ledger device. Please open the Stellar app.");
      }
      throw new Error(`Ledger connection error: ${msg}`);
    }
  }

  async connect(): Promise<string> {
    const state = await this.connectLedger(this.bip32Path);
    if (!state.publicKey) {
      throw new Error("Failed to connect to Ledger device.");
    }
    return state.publicKey;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        // ignore disconnect errors
      }
    }
    this.transport = null;
    this.appStr = null;
    this.connectedPublicKey = null;
    this.deviceModelName = undefined;
  }

  async getPublicKey(): Promise<string> {
    if (this.connectedPublicKey) {
      return this.connectedPublicKey;
    }
    const state = await this.connectLedger(this.bip32Path);
    if (!state.publicKey) {
      throw new Error("No public key available on Ledger device.");
    }
    return state.publicKey;
  }

  async signTransaction(xdr: string, _opts?: { networkPassphrase?: string }): Promise<string> {
    if (!this.appStr) {
      await this.connect();
    }
    const appStr = this.appStr;
    if (!appStr) {
      throw new Error("Failed to connect to Ledger device.");
    }

    try {
      const result = await appStr.signTransaction(this.bip32Path, Buffer.from(xdr, "base64"));
      if (!result || !result.signature) {
        throw new Error("Transaction signing was rejected on Ledger device.");
      }
      return result.signature.toString("base64");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("0x6985") || msg.includes("denied") || msg.includes("rejected")) {
        throw new Error("Transaction signing was rejected on the Ledger device.");
      }
      throw new Error(`Ledger signing error: ${msg}`);
    }
  }

  async signBlob(blob: Uint8Array): Promise<Uint8Array> {
    if (!this.appStr) {
      await this.connect();
    }
    const appStr = this.appStr;
    if (!appStr) {
      throw new Error("Failed to connect to Ledger device.");
    }

    try {
      const result = await appStr.signHash(this.bip32Path, Buffer.from(blob));
      if (!result || !result.signature) {
        throw new Error("Blob signing was rejected on Ledger device.");
      }
      return new Uint8Array(result.signature);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Ledger blob signing error: ${msg}`);
    }
  }
}

export const ledgerAdapter = new LedgerAdapter();
