import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AutoReleaseMeta } from "../../lib/autoRelease";
import { AutoReleaseBadge } from "./AutoReleaseBadge";

const HASH = "3f".repeat(32);

function makeMeta(overrides: Partial<AutoReleaseMeta> = {}): AutoReleaseMeta {
  return {
    isAutoReleased: true,
    oracleProvider: "fedex",
    deliveredTimestamp: "2026-09-20T14:05:00.000Z",
    signatureProofHash: HASH,
    ...overrides,
  };
}

describe("AutoReleaseBadge", () => {
  it("renders nothing for a manual release, so the two are distinguishable", () => {
    render(<AutoReleaseBadge meta={makeMeta({ isAutoReleased: false })} />);

    expect(screen.queryByTestId("auto-release-badge")).toBeNull();
  });

  it("renders nothing when an auto-release has no usable proof", () => {
    render(<AutoReleaseBadge meta={makeMeta({ signatureProofHash: "short" })} />);

    expect(screen.queryByTestId("auto-release-badge")).toBeNull();
  });

  it("renders the badge for a verified carrier release", () => {
    render(<AutoReleaseBadge meta={makeMeta()} />);

    expect(screen.getByTestId("auto-release-badge")).toHaveTextContent("Auto-released");
    expect(
      screen.getByRole("button", { name: /auto-released via fedex tracking/i })
    ).toBeInTheDocument();
  });

  it("opens the delivery-proof modal with the oracle signature", () => {
    render(<AutoReleaseBadge meta={makeMeta()} orderId="order-7" />);

    expect(screen.queryByTestId("auto-release-proof-modal")).toBeNull();

    fireEvent.click(screen.getByTestId("auto-release-badge"));

    const modal = screen.getByTestId("auto-release-proof-modal");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveTextContent("FedEx");
    expect(modal).toHaveTextContent("order-7");
    expect(modal.querySelector("code")).toHaveTextContent("3f3f3f3f3f…3f3f3f3f");
  });

  it("closes the proof modal on Escape", () => {
    render(<AutoReleaseBadge meta={makeMeta()} />);

    fireEvent.click(screen.getByTestId("auto-release-badge"));
    expect(screen.getByTestId("auto-release-proof-modal")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByTestId("auto-release-proof-modal")).toBeNull();
  });
});
