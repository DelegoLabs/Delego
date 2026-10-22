import { describe, it, expect, vi, beforeEach } from "vitest";
import { StrKey } from "@stellar/stellar-sdk";
import { ledgerAdapter } from "./ledgerAdapter";

vi.mock("@ledgerhq/hw-transport-webhid", () => ({
  default: {
    create: vi.fn().mockResolvedValue({
      deviceModel: { id: "nanoS" },
      close: vi.fn(),
    }),
  },
}));

vi.mock("@ledgerhq/hw-app-str", () => ({
  default: vi.fn().mockImplementation(() => ({
    getPublicKey: vi
      .fn()
      .mockResolvedValue({ rawPublicKey: Buffer.alloc(32, 1) }),
    signTransaction: vi.fn().mockResolvedValue({ signature: Buffer.from("fakesig") }),
  })),
}));

describe("LedgerAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("navigator", { hid: {} });
  });

  it("detects WebHID availability", async () => {
    const available = await ledgerAdapter.detect();
    expect(available).toBe(true);
  });

  it("connects and retrieves public key from mock device", async () => {
    const state = await ledgerAdapter.connectLedger("44'/148'/0'");
    expect(state.isConnected).toBe(true);
    expect(state.publicKey).toBe(
      StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1))
    );
    expect(state.deviceModel).toBe("nanoS");
  });

  it("signs transaction with mock app", async () => {
    const sig = await ledgerAdapter.signTransaction("BASE64XDR");
    expect(sig).toBe(Buffer.from("fakesig").toString("base64"));
  });
});
