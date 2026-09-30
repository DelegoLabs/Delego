import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReturnLabelModal } from "./ReturnLabelModal";
import type { ReturnLabelData } from "../../lib/returnLabel";

const LABEL: ReturnLabelData = {
  rmaNumber: "RMA-2049",
  returnAddress: "Delego Returns, 12 Warehouse Rd, Lagos",
  carrierBarcodeSvg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><rect width="200" height="60" /></svg>',
  carrier: "DHL",
  trackingNumber: "DHL-77821",
  orderId: "order-1",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReturnLabelModal", () => {
  it("renders nothing when closed or without a label", () => {
    const { container } = render(
      <ReturnLabelModal isOpen={false} label={LABEL} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the RMA number, return address, and carrier barcode", () => {
    render(<ReturnLabelModal isOpen label={LABEL} onClose={vi.fn()} />);

    expect(screen.getByText("RMA-2049")).toBeInTheDocument();
    expect(screen.getByText("Delego Returns")).toBeInTheDocument();
    expect(screen.getByText("Lagos")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /carrier barcode rma-2049/i })
    ).toBeInTheDocument();
  });

  it("prints through window.print when no PDF frame is present", async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<ReturnLabelModal isOpen label={LABEL} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Print label" }));

    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("copies the tracking number", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ReturnLabelModal isOpen label={LABEL} onClose={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /copy return tracking number/i })
    );

    expect(writeText).toHaveBeenCalledWith("DHL-77821");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ReturnLabelModal isOpen label={LABEL} onClose={onClose} />);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
