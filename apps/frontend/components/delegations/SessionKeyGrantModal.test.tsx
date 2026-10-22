import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionKeyGrantModal } from "./SessionKeyGrantModal";

vi.mock("../../hooks/useWallet", () => ({
  useWallet: () => ({ address: "GBX11111111111111111111111111111111111111111111111111111" }),
}));

vi.mock("../../hooks/useNetwork", () => ({
  useNetwork: () => ({
    network: {
      horizonUrl: "https://horizon-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
  }),
}));

describe("SessionKeyGrantModal with Granular Permissions", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates granular input constraints when budget is zero", async () => {
    render(
      <SessionKeyGrantModal
        open={true}
        onClose={vi.fn()}
        allowedContractCalls={["escrow.release"]}
      />
    );

    const grantBtn = screen.getByText("Grant session key");
    await userEvent.click(grantBtn);

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a spending budget greater than zero.");
  });

  it("validates invalid Stellar merchant addresses", async () => {
    render(
      <SessionKeyGrantModal
        open={true}
        onClose={vi.fn()}
        allowedContractCalls={["escrow.release"]}
      />
    );

    const merchantInput = screen.getByTestId("input-merchant-addresses");
    await userEvent.type(merchantInput, "invalid-address");

    // XLM StroopsInputs use aria-label="Amount in XLM"
    const stroopInputs = screen.getAllByRole("textbox", { name: "Amount in XLM" });
    if (stroopInputs.length > 0) {
      await userEvent.type(stroopInputs[0], "100");
    }

    const grantBtn = screen.getByText("Grant session key");
    await userEvent.click(grantBtn);

    expect(screen.getByRole("alert")).toHaveTextContent("Invalid Stellar merchant address");
  });
});
