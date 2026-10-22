import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ShippingAddressPicker } from "./ShippingAddressPicker";
import { writeSavedShippingAddresses } from "../../lib/savedShippingAddresses";
import type { SavedShippingAddress } from "@delegolabs/types";

const MOCK_ADDRESSES: SavedShippingAddress[] = [
  {
    id: "home_1",
    label: "Home",
    recipientName: "Bob Smith",
    street: "100 Pine St",
    city: "Seattle",
    state: "WA",
    postalCode: "98101",
    country: "USA",
    isDefault: false,
  },
  {
    id: "work_2",
    label: "Work",
    recipientName: "Bob Smith",
    street: "200 Pike St",
    city: "Seattle",
    state: "WA",
    postalCode: "98102",
    country: "USA",
    isDefault: true,
  },
];

describe("ShippingAddressPicker component in checkout flow", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders empty state when no saved addresses exist", () => {
    render(<ShippingAddressPicker />);

    expect(screen.getByText("Delivery Address")).toBeInTheDocument();
    expect(screen.getByText("No saved addresses found.")).toBeInTheDocument();
    expect(screen.getByText("+ Add a delivery address")).toBeInTheDocument();
  });

  it("renders saved addresses radio list and pre-selects default saved address automatically", () => {
    writeSavedShippingAddresses(MOCK_ADDRESSES);
    const onSelect = vi.fn();

    render(<ShippingAddressPicker onSelectAddress={onSelect} />);

    expect(screen.getByRole("radiogroup", { name: "Shipping Address" })).toBeInTheDocument();

    const homeRadio = screen.getByTestId("address-radio-home_1") as HTMLInputElement;
    const workRadio = screen.getByTestId("address-radio-work_2") as HTMLInputElement;

    expect(homeRadio).toBeInTheDocument();
    expect(workRadio).toBeInTheDocument();

    // Default address (work_2) should be checked automatically
    expect(workRadio.checked).toBe(true);
    expect(homeRadio.checked).toBe(false);

    expect(screen.getByTestId("picker-default-badge-work_2")).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "work_2", isDefault: true })
    );
  });

  it("allows selecting a different address with 1 click", async () => {
    writeSavedShippingAddresses(MOCK_ADDRESSES);
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<ShippingAddressPicker onSelectAddress={onSelect} />);

    const homeRadio = screen.getByTestId("address-radio-home_1") as HTMLInputElement;
    const workRadio = screen.getByTestId("address-radio-work_2") as HTMLInputElement;

    expect(workRadio.checked).toBe(true);

    // 1-click on the home address
    await user.click(homeRadio);

    expect(homeRadio.checked).toBe(true);
    expect(workRadio.checked).toBe(false);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "home_1" })
    );
  });
});
