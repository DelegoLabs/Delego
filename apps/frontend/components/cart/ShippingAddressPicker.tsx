"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SavedShippingAddress } from "@delegolabs/types";
import { useSavedShippingAddresses } from "../../hooks/useSavedShippingAddresses";

export interface ShippingAddressPickerProps {
  selectedAddressId?: string | null;
  onSelectAddress?: (address: SavedShippingAddress) => void;
}

export function ShippingAddressPicker({
  selectedAddressId,
  onSelectAddress,
}: ShippingAddressPickerProps) {
  const { addresses, defaultAddress, isLoaded } = useSavedShippingAddresses();
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    selectedAddressId ?? null
  );

  // Pre-select default saved address automatically once addresses load
  useEffect(() => {
    if (selectedAddressId !== undefined) {
      setInternalSelectedId(selectedAddressId);
      return;
    }

    if (addresses.length > 0) {
      const active = addresses.find((a) => a.id === internalSelectedId);
      if (!active) {
        const initial = defaultAddress || addresses[0];
        setInternalSelectedId(initial.id);
        onSelectAddress?.(initial);
      }
    } else {
      setInternalSelectedId(null);
    }
  }, [addresses, defaultAddress, selectedAddressId, internalSelectedId, onSelectAddress]);

  const handleSelect = (address: SavedShippingAddress) => {
    setInternalSelectedId(address.id);
    onSelectAddress?.(address);
  };

  if (!isLoaded) {
    return (
      <div data-testid="shipping-address-picker-loading" style={{ color: "#6b7280", fontSize: "0.875rem" }}>
        Loading delivery addresses…
      </div>
    );
  }

  return (
    <div
      data-testid="shipping-address-picker"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "1rem",
        background: "#f9fafb",
        borderRadius: "0.5rem",
        border: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#111827" }}>
          Delivery Address
        </span>
        <Link
          href="/settings/addresses"
          style={{
            fontSize: "0.8125rem",
            color: "#2563eb",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Manage addresses
        </Link>
      </div>

      {addresses.length === 0 ? (
        <div data-testid="no-saved-addresses" style={{ fontSize: "0.875rem", color: "#6b7280" }}>
          <p style={{ margin: "0 0 0.5rem" }}>No saved addresses found.</p>
          <Link
            href="/settings/addresses"
            style={{
              color: "#2563eb",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            + Add a delivery address
          </Link>
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-label="Shipping Address"
          style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
        >
          {addresses.map((address) => {
            const isSelected = internalSelectedId === address.id;
            return (
              <label
                key={address.id}
                htmlFor={`address-radio-${address.id}`}
                data-testid={`address-picker-item-${address.id}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                  padding: "0.75rem",
                  borderRadius: "0.375rem",
                  border: `1.5px solid ${isSelected ? "#2563eb" : "#e5e7eb"}`,
                  background: isSelected ? "#eff6ff" : "#fff",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <input
                  type="radio"
                  id={`address-radio-${address.id}`}
                  name="saved-shipping-address"
                  value={address.id}
                  checked={isSelected}
                  onChange={() => handleSelect(address)}
                  data-testid={`address-radio-${address.id}`}
                  style={{ marginTop: "0.2rem", cursor: "pointer" }}
                />
                <div style={{ flex: 1, fontSize: "0.8125rem" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span
                      style={{
                        padding: "0.1rem 0.4rem",
                        borderRadius: "0.25rem",
                        background: isSelected ? "#dbeafe" : "#f3f4f6",
                        color: isSelected ? "#1e40af" : "#374151",
                        fontSize: "0.6875rem",
                        fontWeight: 700,
                      }}
                    >
                      {address.label}
                    </span>
                    {address.isDefault && (
                      <span
                        data-testid={`picker-default-badge-${address.id}`}
                        style={{
                          padding: "0.1rem 0.4rem",
                          borderRadius: "0.25rem",
                          background: "#dcfce7",
                          color: "#166534",
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                        }}
                      >
                        Default
                      </span>
                    )}
                    <strong style={{ color: "#111827", fontSize: "0.875rem" }}>
                      {address.recipientName}
                    </strong>
                  </div>
                  <div style={{ color: "#4b5563" }}>
                    {address.street}, {address.city}, {address.state}{" "}
                    {address.postalCode}, {address.country}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
