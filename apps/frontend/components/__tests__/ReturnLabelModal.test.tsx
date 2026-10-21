import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RETURN_HUB_STORAGE_KEY, ReturnLabelModal } from "../ReturnLabelModal";
import { Code128Barcode, ReturnShippingLabelPDF } from "../ReturnShippingLabelPDF";
import { code128Bars, encodeCode128 } from "../../lib/code128";

const HUB = "Delego Returns Hub\n12 Warehouse Rd\nLagos 100001";

function renderModal() {
  const pdf = new Blob(["%PDF-1.3"], { type: "application/pdf" });
  const generatePdf = vi.fn().mockResolvedValue(pdf);
  const emailToBuyer = vi.fn().mockResolvedValue(undefined);
  const download = vi.fn();
  render(
    <ReturnLabelModal
      open
      orderId="ord-42"
      buyerAddress="Ada Buyer, 5 Market St, Abuja"
      onClose={vi.fn()}
      generatePdf={generatePdf}
      emailToBuyer={emailToBuyer}
      download={download}
    />
  );
  return { pdf, generatePdf, emailToBuyer, download };
}

function fillForm(tracking = "1Z999AA10123456784") {
  fireEvent.change(screen.getByLabelText("Carrier"), { target: { value: "fedex" } });
  fireEvent.change(screen.getByLabelText("Tracking number"), { target: { value: tracking } });
  fireEvent.change(screen.getByLabelText("Return hub address"), { target: { value: HUB } });
}

afterEach(() => {
  window.localStorage.clear();
});

describe("ReturnShippingLabelPDF", () => {
  it("renders carrier mark, both addresses, barcode and tracking text", () => {
    render(
      <ReturnShippingLabelPDF
        config={{
          orderId: "ord-42",
          buyerAddress: "Ada Buyer\n5 Market St",
          merchantHubAddress: HUB,
          trackingNumber: "1234 5678 9012",
          carrier: "dhl",
        }}
      />
    );
    const label = screen.getByTestId("return-shipping-label");
    expect(within(label).getByTestId("carrier-mark")).toHaveTextContent("DHL");
    expect(within(label).getByTestId("hub-address")).toHaveTextContent("12 Warehouse Rd");
    expect(within(label).getByText("Ada Buyer")).toBeInTheDocument();
    expect(within(label).getByTestId("tracking-text")).toHaveTextContent("123456789012");
    expect(within(label).getByRole("img", { name: /Code 128 barcode for 123456789012/ }))
      .toBeInTheDocument();
    expect(within(label).getByText("Order ord-42")).toBeInTheDocument();
  });
});

describe("Code128Barcode", () => {
  it("draws one rect per bar of the encoded value", () => {
    const { container } = render(<Code128Barcode value="RMA-00042" />);
    const expected = code128Bars(encodeCode128("RMA-00042"));
    expect(container.querySelectorAll("rect")).toHaveLength(expected.length);
    expect(container.querySelector("rect")?.getAttribute("x")).toBe(String(expected[0]!.x));
  });

  it("renders nothing for unencodable input", () => {
    const { container } = render(<Code128Barcode value="" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});

describe("ReturnLabelModal", () => {
  it("disables actions until the label is complete, then previews it", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Download Label" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Email to Buyer" })).toBeDisabled();
    expect(screen.queryByTestId("return-shipping-label")).toBeNull();

    fillForm();
    expect(screen.getByRole("button", { name: "Download Label" })).toBeEnabled();
    expect(screen.getByTestId("carrier-mark")).toHaveTextContent("FedEx");
    expect(screen.getByTestId("code128-barcode")).toBeInTheDocument();
  });

  it("downloads the generated PDF and remembers the hub address", async () => {
    const { pdf, generatePdf, download } = renderModal();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Download Label" }));

    await waitFor(() => expect(download).toHaveBeenCalledWith("return-label-ord-42.pdf", pdf));
    expect(generatePdf).toHaveBeenCalledWith({
      orderId: "ord-42",
      buyerAddress: "Ada Buyer, 5 Market St, Abuja",
      merchantHubAddress: HUB,
      trackingNumber: "1Z999AA10123456784",
      carrier: "fedex",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Label downloaded.");
    expect(window.localStorage.getItem(RETURN_HUB_STORAGE_KEY)).toBe(HUB);
  });

  it("emails the label to the buyer and surfaces failures", async () => {
    const { pdf, emailToBuyer } = renderModal();
    fillForm();
    emailToBuyer.mockRejectedValueOnce(new Error("Mail service down"));
    fireEvent.click(screen.getByRole("button", { name: "Email to Buyer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mail service down");

    fireEvent.click(screen.getByRole("button", { name: "Email to Buyer" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Label emailed to the buyer.")
    );
    expect(emailToBuyer).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderId: "ord-42", carrier: "fedex" }),
      pdf
    );
  });
});
