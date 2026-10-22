import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SavedAddressesManager } from "./SavedAddressesManager";
import {
  SAVED_SHIPPING_ADDRESSES_STORAGE_KEY,
  writeSavedShippingAddresses,
} from "../../lib/savedShippingAddresses";
import type { SavedShippingAddress } from "@delegolabs/types";

const INITIAL_ADDRESSES: SavedShippingAddress[] = [
  {
    id: "addr_1",
    label: "Home",
    recipientName: "Alice Wonderland",
    street: "123 Main St",
    city: "San Francisco",
    state: "CA",
    postalCode: "94105",
    country: "USA",
    isDefault: true,
  },
  {
    id: "addr_2",
    label: "Work",
    recipientName: "Alice Wonderland",
    street: "456 Market St",
    city: "San Francisco",
    state: "CA",
    postalCode: "94103",
    country: "USA",
    isDefault: false,
  },
];

describe("SavedAddressesManager component", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("renders existing saved addresses from storage", async () => {
    writeSavedShippingAddresses(INITIAL_ADDRESSES);
    render(<SavedAddressesManager />);

    expect(screen.getByText("Delivery Addresses")).toBeInTheDocument();
    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("456 Market St")).toBeInTheDocument();
    expect(screen.getByTestId("default-badge-addr_1")).toBeInTheDocument();
  });

  it("renders empty state when no addresses exist", async () => {
    render(<SavedAddressesManager />);

    expect(
      screen.getByText("No saved delivery addresses yet.")
    ).toBeInTheDocument();
  });

  it("adds a new address and persists it", async () => {
    render(<SavedAddressesManager />);

    const user = userEvent.setup();
    const addBtn = screen.getByTestId("add-address-button");
    await user.click(addBtn);

    expect(screen.getByTestId("address-form")).toBeInTheDocument();

    await user.selectOptions(screen.getByTestId("input-label"), "Work");
    await user.type(screen.getByTestId("input-recipient"), "Bob Builder");
    await user.type(screen.getByTestId("input-street"), "789 Work Ave");
    await user.type(screen.getByTestId("input-city"), "New York");
    await user.type(screen.getByTestId("input-state"), "NY");
    await user.type(screen.getByTestId("input-postal"), "10001");
    await user.type(screen.getByTestId("input-country"), "USA");

    await user.click(screen.getByTestId("save-address-btn"));

    await waitFor(() => {
      expect(screen.getByText("789 Work Ave")).toBeInTheDocument();
      expect(screen.getByText("Bob Builder")).toBeInTheDocument();
    });

    const stored = JSON.parse(
      localStorage.getItem(SAVED_SHIPPING_ADDRESSES_STORAGE_KEY) || "[]"
    );
    expect(stored.length).toBe(1);
    expect(stored[0].recipientName).toBe("Bob Builder");
    // First address should automatically be default
    expect(stored[0].isDefault).toBe(true);
  });

  it("edits an existing address", async () => {
    writeSavedShippingAddresses(INITIAL_ADDRESSES);
    render(<SavedAddressesManager />);

    const user = userEvent.setup();
    const editBtn = screen.getByTestId("edit-address-addr_1");
    await user.click(editBtn);

    const recipientInput = screen.getByTestId("input-recipient");
    expect(recipientInput).toHaveValue("Alice Wonderland");

    await user.clear(recipientInput);
    await user.type(recipientInput, "Alice Smith");

    const streetInput = screen.getByTestId("input-street");
    await user.clear(streetInput);
    await user.type(streetInput, "123 Updated St");

    await user.click(screen.getByTestId("save-address-btn"));

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument();
      expect(screen.getByText("123 Updated St")).toBeInTheDocument();
    });

    const stored = JSON.parse(
      localStorage.getItem(SAVED_SHIPPING_ADDRESSES_STORAGE_KEY) || "[]"
    );
    const updated = stored.find((a: SavedShippingAddress) => a.id === "addr_1");
    expect(updated?.recipientName).toBe("Alice Smith");
    expect(updated?.street).toBe("123 Updated St");
  });

  it("deletes an address", async () => {
    writeSavedShippingAddresses(INITIAL_ADDRESSES);
    render(<SavedAddressesManager />);

    const user = userEvent.setup();
    const deleteBtn = screen.getByTestId("delete-address-addr_2");
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(screen.queryByText("456 Market St")).not.toBeInTheDocument();
    });

    const stored = JSON.parse(
      localStorage.getItem(SAVED_SHIPPING_ADDRESSES_STORAGE_KEY) || "[]"
    );
    expect(stored.length).toBe(1);
    expect(stored[0].id).toBe("addr_1");
  });

  it("toggles and sets an address as default", async () => {
    writeSavedShippingAddresses(INITIAL_ADDRESSES);
    render(<SavedAddressesManager />);

    const user = userEvent.setup();
    // Initially addr_1 is default, addr_2 has "Set as Default" button
    expect(screen.getByTestId("default-badge-addr_1")).toBeInTheDocument();
    const setDefaultBtn = screen.getByTestId("set-default-addr_2");

    await user.click(setDefaultBtn);

    await waitFor(() => {
      expect(screen.getByTestId("default-badge-addr_2")).toBeInTheDocument();
      expect(screen.queryByTestId("default-badge-addr_1")).not.toBeInTheDocument();
    });

    const stored = JSON.parse(
      localStorage.getItem(SAVED_SHIPPING_ADDRESSES_STORAGE_KEY) || "[]"
    );
    const addr1 = stored.find((a: SavedShippingAddress) => a.id === "addr_1");
    const addr2 = stored.find((a: SavedShippingAddress) => a.id === "addr_2");
    expect(addr1?.isDefault).toBe(false);
    expect(addr2?.isDefault).toBe(true);
  });

  it("validates required fields before submitting", async () => {
    render(<SavedAddressesManager />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("add-address-button"));

    // Submit empty form
    await user.click(screen.getByTestId("save-address-btn"));

    expect(screen.getByText("Recipient name is required")).toBeInTheDocument();
    expect(screen.getByText("Street address is required")).toBeInTheDocument();
    expect(screen.getByText("City is required")).toBeInTheDocument();
  });
});
