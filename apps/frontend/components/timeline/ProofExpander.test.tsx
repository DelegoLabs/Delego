import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ProofExpander } from "./ProofExpander";
import {
  proofHashesOnly,
  proofImage,
  proofImageBroken,
  proofImagesOnly,
  proofMatrix,
  proofOpaqueHash,
  proofTxHash,
  proofTrackingLink,
} from "../../mocks/fixtures/proofs";

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("ProofExpander — fixture matrix", () => {
  it("renders nothing when there are no proofs", () => {
    const { container } = render(<ProofExpander proofs={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("summarizes the attachment mix on the trigger", () => {
    render(<ProofExpander proofs={proofMatrix} networkId="testnet" />);
    expect(screen.getByText(/^View proof/)).toBeInTheDocument();
    expect(screen.getByText("(2 photos, 1 link, 2 hashes)")).toBeInTheDocument();
  });

  it("renders each attachment type: image thumbnail, tracking link, hash rows", () => {
    render(<ProofExpander proofs={proofMatrix} networkId="mainnet" />);

    expect(
      screen.getByRole("button", {
        name: `View proof image: ${proofImage.alt}`,
      })
    ).toBeInTheDocument();

    const trackingLink = screen.getByRole("link", { name: proofTrackingLink.label! });
    expect(trackingLink).toHaveAttribute("href", proofTrackingLink.url);

    // Resolvable hash → explorer link; opaque hash → "cryptographic receipt".
    expect(
      screen.getByRole("link", { name: "View on explorer" })
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/public/tx/${proofTxHash.value}`
    );
    expect(screen.getByText("cryptographic receipt")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Copy hash" })
    ).toHaveLength(2);
  });

  it("shows the 'cryptographic receipt' placeholder when proofs are hashes-only", () => {
    render(<ProofExpander proofs={proofHashesOnly} networkId="testnet" />);
    expect(
      screen.getByText(/Cryptographic receipt — there.s no photo or link/i)
    ).toBeInTheDocument();
    // Explorer link still offered for the resolvable one.
    expect(
      screen.getByRole("link", { name: "View on explorer" })
    ).toHaveAttribute(
      "href",
      `https://stellar.expert/explorer/testnet/tx/${proofTxHash.value}`
    );
  });

  it("degrades a broken image to an 'open original' link", () => {
    render(<ProofExpander proofs={[proofImageBroken]} />);
    const img = document.querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    const link = screen.getByRole("link", {
      name: /open original/i,
    });
    expect(link).toHaveAttribute("href", proofImageBroken.url);
  });

  it("copies a hash value to the clipboard", async () => {
    render(<ProofExpander proofs={[proofOpaqueHash]} networkId="testnet" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy hash" }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        proofOpaqueHash.value
      )
    );
  });
});

describe("ProofExpander — image lightbox", () => {
  it("opens a focus-trapped dialog and closes it on Esc", () => {
    render(<ProofExpander proofs={proofImagesOnly} />);
    fireEvent.click(
      screen.getByRole("button", { name: `View proof image: ${proofImage.alt}` })
    );

    const dialog = screen.getByRole("dialog", {
      name: `Proof image: ${proofImage.alt}`,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(
      within(dialog).getByText(proofImage.caption!)
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: /Proof image/ })
    ).not.toBeInTheDocument();
  });

  it("closes the lightbox on a backdrop click", () => {
    const { container } = render(<ProofExpander proofs={proofImagesOnly} />);
    fireEvent.click(
      screen.getByRole("button", { name: `View proof image: ${proofImage.alt}` })
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const overlay = container.querySelector(".proof-lightbox-overlay");
    fireEvent.click(overlay as Element);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
