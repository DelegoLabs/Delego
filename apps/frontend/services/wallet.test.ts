import { describe, expect, it } from "vitest";
import {
  USER_DECLINED_CODE,
  WALLET_CANCELLED_MESSAGE,
  WalletActionError,
  classifyWalletError,
  isUserDeclined,
} from "./wallet";

describe("classifyWalletError", () => {
  it("classifies Freighter's -4 code as user_declined", () => {
    const details = classifyWalletError({
      code: USER_DECLINED_CODE,
      message: "User declined to sign the transaction",
    });
    expect(details.code).toBe("user_declined");
    expect(details.walletName).toBe("Freighter");
  });

  it("classifies common decline messages", () => {
    expect(isUserDeclined(new Error("User declined to sign transaction"))).toBe(
      true
    );
    expect(isUserDeclined(new Error("Request was rejected by user"))).toBe(true);
    expect(isUserDeclined(new Error("Signing cancelled by user"))).toBe(true);
  });

  it("reads the nested adapter error shape", () => {
    const details = classifyWalletError({
      error: { code: -4, message: "User declined to sign" },
    });
    expect(details.code).toBe("user_declined");
  });

  it("does not treat a network submit failure as a user decline", () => {
    const details = classifyWalletError(
      new Error("The network rejected the transaction. Please try again.")
    );
    expect(details.code).toBe("network_error");
    expect(isUserDeclined(details)).toBe(false);
  });

  it("classifies locked wallets, fee shortfalls, and network errors", () => {
    expect(classifyWalletError(new Error("Wallet is locked")).code).toBe(
      "wallet_locked"
    );
    expect(
      classifyWalletError(new Error("Insufficient balance for fee")).code
    ).toBe("insufficient_fee");
    expect(classifyWalletError(new Error("Request timed out")).code).toBe(
      "network_error"
    );
  });

  it("falls back to unknown with a friendly default message", () => {
    const details = classifyWalletError(undefined);
    expect(details.code).toBe("unknown");
    expect(details.message.length).toBeGreaterThan(0);
  });

  it("accepts a bare string", () => {
    expect(classifyWalletError("User declined").code).toBe("user_declined");
  });
});

describe("WalletActionError", () => {
  it("carries the normalized code and wallet name", () => {
    const err = new WalletActionError(
      classifyWalletError({ code: -4, message: "User declined to sign" })
    );
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WalletActionError");
    expect(err.code).toBe("user_declined");
    expect(err.walletName).toBe("Freighter");
  });
});

describe("WALLET_CANCELLED_MESSAGE", () => {
  it("is the neutral cancellation copy", () => {
    expect(WALLET_CANCELLED_MESSAGE).toBe("Transaction cancelled by user");
  });
});
