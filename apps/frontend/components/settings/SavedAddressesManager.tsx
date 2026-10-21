"use client";

import { useState } from "react";
import type { SavedShippingAddress } from "@delegolabs/types";
import { Badge, Button, Card } from "@delegolabs/ui";
import { useSavedShippingAddresses } from "../../hooks/useSavedShippingAddresses";

interface AddressFormData {
  label: "Home" | "Work" | "Other";
  recipientName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressFormData = {
  label: "Home",
  recipientName: "",
  street: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  isDefault: false,
};

export function SavedAddressesManager() {
  const {
    addresses,
    isLoaded,
    addAddress,
    editAddress,
    deleteAddress,
    setDefault,
  } = useSavedShippingAddresses();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AddressFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      ...EMPTY_FORM,
      isDefault: addresses.length === 0,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const handleOpenEdit = (address: SavedShippingAddress) => {
    setEditingId(address.id);
    setFormData({
      label: address.label,
      recipientName: address.recipientName,
      street: address.street,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country,
      isDefault: address.isDefault,
    });
    setFormErrors({});
    setIsFormOpen(true);
  };

  const handleCancel = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormErrors({});
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!formData.recipientName.trim()) {
      errors.recipientName = "Recipient name is required";
    }
    if (!formData.street.trim()) {
      errors.street = "Street address is required";
    }
    if (!formData.city.trim()) {
      errors.city = "City is required";
    }
    if (!formData.state.trim()) {
      errors.state = "State / Province is required";
    }
    if (!formData.postalCode.trim()) {
      errors.postalCode = "Postal code is required";
    }
    if (!formData.country.trim()) {
      errors.country = "Country is required";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (editingId) {
      editAddress({
        id: editingId,
        ...formData,
      });
      showNotification("Address updated successfully.");
    } else {
      addAddress(formData);
      showNotification("Address added successfully.");
    }

    handleCancel();
  };

  const handleDelete = (id: string) => {
    deleteAddress(id);
    showNotification("Address deleted.");
  };

  const handleSetDefault = (id: string) => {
    setDefault(id);
    showNotification("Default shipping address updated.");
  };

  if (!isLoaded) {
    return (
      <div data-testid="saved-addresses-loading" style={{ padding: "1.5rem" }}>
        Loading addresses…
      </div>
    );
  }

  return (
    <div data-testid="saved-addresses-manager" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
            Delivery Addresses
          </h2>
          <p style={{ margin: "0.25rem 0 0", color: "#6b7280", fontSize: "0.875rem" }}>
            Save delivery addresses to easily select them in 1 click during checkout.
          </p>
        </div>
        {!isFormOpen && (
          <Button
            type="button"
            variant="primary"
            onClick={handleOpenAdd}
            data-testid="add-address-button"
          >
            Add New Address
          </Button>
        )}
      </div>

      {/* Notification banner */}
      {notification && (
        <div
          role="status"
          aria-live="polite"
          data-testid="address-notification"
          style={{
            padding: "0.75rem 1rem",
            background: "#eff6ff",
            color: "#1e40af",
            border: "1px solid #bfdbfe",
            borderRadius: "0.5rem",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          {notification}
        </div>
      )}

      {/* Add / Edit Form Modal or Panel */}
      {isFormOpen && (
        <Card>
          <form
            onSubmit={handleSubmit}
            data-testid="address-form"
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
              {editingId ? "Edit Delivery Address" : "Add New Delivery Address"}
            </h3>

            {/* Label selection */}
            <div>
              <label
                htmlFor="address-label"
                style={{ display: "block", marginBottom: "0.375rem", fontWeight: 600, fontSize: "0.875rem" }}
              >
                Address Label
              </label>
              <select
                id="address-label"
                data-testid="input-label"
                value={formData.label}
                onChange={(e) =>
                  setFormData({ ...formData, label: e.target.value as "Home" | "Work" | "Other" })
                }
                style={{
                  width: "100%",
                  maxWidth: "16rem",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                  background: "#fff",
                }}
              >
                <option value="Home">Home</option>
                <option value="Work">Work</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {/* Recipient Name */}
            <div>
              <label
                htmlFor="recipient-name"
                style={{ display: "block", marginBottom: "0.375rem", fontWeight: 600, fontSize: "0.875rem" }}
              >
                Recipient Name *
              </label>
              <input
                id="recipient-name"
                type="text"
                data-testid="input-recipient"
                value={formData.recipientName}
                onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                placeholder="e.g. Jane Doe"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: `1px solid ${formErrors.recipientName ? "#dc2626" : "#d1d5db"}`,
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              />
              {formErrors.recipientName && (
                <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                  {formErrors.recipientName}
                </p>
              )}
            </div>

            {/* Street Address */}
            <div>
              <label
                htmlFor="street-address"
                style={{ display: "block", marginBottom: "0.375rem", fontWeight: 600, fontSize: "0.875rem" }}
              >
                Street Address *
              </label>
              <input
                id="street-address"
                type="text"
                data-testid="input-street"
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                placeholder="e.g. 123 Market St, Suite 400"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  border: `1px solid ${formErrors.street ? "#dc2626" : "#d1d5db"}`,
                  borderRadius: "0.375rem",
                  fontSize: "0.875rem",
                }}
              />
              {formErrors.street && (
                <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                  {formErrors.street}
                </p>
              )}
            </div>

            {/* City & State grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label
                  htmlFor="city"
                  style={{ display: "block", marginBottom: "0.375rem", fontWeight: 600, fontSize: "0.875rem" }}
                >
                  City *
                </label>
                <input
                  id="city"
                  type="text"
                  data-testid="input-city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="e.g. San Francisco"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: `1px solid ${formErrors.city ? "#dc2626" : "#d1d5db"}`,
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                  }}
                />
                {formErrors.city && (
                  <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                    {formErrors.city}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="state"
                  style={{ display: "block", marginBottom: "0.375rem", fontWeight: 600, fontSize: "0.875rem" }}
                >
                  State / Province *
                </label>
                <input
                  id="state"
                  type="text"
                  data-testid="input-state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="e.g. CA"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: `1px solid ${formErrors.state ? "#dc2626" : "#d1d5db"}`,
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                  }}
                />
                {formErrors.state && (
                  <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                    {formErrors.state}
                  </p>
                )}
              </div>
            </div>

            {/* Postal Code & Country grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label
                  htmlFor="postal-code"
                  style={{ display: "block", marginBottom: "0.375rem", fontWeight: 600, fontSize: "0.875rem" }}
                >
                  Postal / ZIP Code *
                </label>
                <input
                  id="postal-code"
                  type="text"
                  data-testid="input-postal"
                  value={formData.postalCode}
                  onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                  placeholder="e.g. 94105"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: `1px solid ${formErrors.postalCode ? "#dc2626" : "#d1d5db"}`,
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                  }}
                />
                {formErrors.postalCode && (
                  <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                    {formErrors.postalCode}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="country"
                  style={{ display: "block", marginBottom: "0.375rem", fontWeight: 600, fontSize: "0.875rem" }}
                >
                  Country *
                </label>
                <input
                  id="country"
                  type="text"
                  data-testid="input-country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="e.g. United States"
                  style={{
                    width: "100%",
                    padding: "0.5rem 0.75rem",
                    border: `1px solid ${formErrors.country ? "#dc2626" : "#d1d5db"}`,
                    borderRadius: "0.375rem",
                    fontSize: "0.875rem",
                  }}
                />
                {formErrors.country && (
                  <p style={{ color: "#dc2626", fontSize: "0.75rem", margin: "0.25rem 0 0" }}>
                    {formErrors.country}
                  </p>
                )}
              </div>
            </div>

            {/* Set as default checkbox */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
              <input
                id="is-default-checkbox"
                type="checkbox"
                data-testid="input-default"
                checked={formData.isDefault}
                onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
              />
              <label
                htmlFor="is-default-checkbox"
                style={{ fontSize: "0.875rem", fontWeight: 500, cursor: "pointer" }}
              >
                Set as default shipping address
              </label>
            </div>

            {/* Form actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.5rem" }}>
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                data-testid="cancel-address-btn"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                data-testid="save-address-btn"
              >
                {editingId ? "Update Address" : "Save Address"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Address cards list */}
      {addresses.length === 0 ? (
        <Card>
          <div
            data-testid="empty-addresses-message"
            style={{ textAlign: "center", padding: "2rem", color: "#6b7280" }}
          >
            <p style={{ margin: 0, fontWeight: 500 }}>No saved delivery addresses yet.</p>
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
              Add an address to enjoy quick 1-click checkout.
            </p>
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {addresses.map((address) => (
            <Card key={address.id}>
              <div
                data-testid={`address-card-${address.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span
                      style={{
                        padding: "0.15rem 0.5rem",
                        borderRadius: "0.25rem",
                        background: "#e0e7ff",
                        color: "#3730a3",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {address.label}
                    </span>
                    {address.isDefault && (
                      <span
                        data-testid={`default-badge-${address.id}`}
                        style={{
                          padding: "0.15rem 0.5rem",
                          borderRadius: "0.25rem",
                          background: "#dcfce7",
                          color: "#166534",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                        }}
                      >
                        Default
                      </span>
                    )}
                  </div>

                  <strong style={{ fontSize: "1rem", color: "#111827" }}>
                    {address.recipientName}
                  </strong>
                  <div style={{ fontSize: "0.875rem", color: "#4b5563" }}>
                    {address.street}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#4b5563" }}>
                    {address.city}, {address.state} {address.postalCode}
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#4b5563" }}>
                    {address.country}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {!address.isDefault && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleSetDefault(address.id)}
                      data-testid={`set-default-${address.id}`}
                    >
                      Set as Default
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleOpenEdit(address)}
                    data-testid={`edit-address-${address.id}`}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleDelete(address.id)}
                    data-testid={`delete-address-${address.id}`}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
