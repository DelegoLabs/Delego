import type { SavedShippingAddress } from "@delegolabs/types";

export const SAVED_SHIPPING_ADDRESSES_STORAGE_KEY =
  "delego_saved_shipping_addresses_v1";

export const SAVED_SHIPPING_ADDRESSES_EVENT =
  "delego:saved_shipping_addresses_updated";

/**
 * Validates and sanitizes a raw parsed object into a SavedShippingAddress.
 */
function isValidAddress(item: unknown): item is SavedShippingAddress {
  if (!item || typeof item !== "object") return false;
  const a = item as Record<string, unknown>;
  const validLabel = a.label === "Home" || a.label === "Work" || a.label === "Other";
  return (
    typeof a.id === "string" &&
    validLabel &&
    typeof a.recipientName === "string" &&
    typeof a.street === "string" &&
    typeof a.city === "string" &&
    typeof a.state === "string" &&
    typeof a.postalCode === "string" &&
    typeof a.country === "string" &&
    typeof a.isDefault === "boolean"
  );
}

/**
 * Reads all saved shipping addresses from localStorage.
 */
export function getSavedShippingAddresses(): SavedShippingAddress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SAVED_SHIPPING_ADDRESSES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidAddress);
  } catch {
    return [];
  }
}

/**
 * Persists addresses to localStorage and broadcasts the change event.
 */
export function writeSavedShippingAddresses(
  addresses: SavedShippingAddress[]
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SAVED_SHIPPING_ADDRESSES_STORAGE_KEY,
      JSON.stringify(addresses)
    );
    window.dispatchEvent(
      new CustomEvent(SAVED_SHIPPING_ADDRESSES_EVENT, { detail: addresses })
    );
  } catch {
    // Quota exceeded or private browsing mode
  }
}

/**
 * Creates or updates a saved shipping address.
 * If set as default (or if it is the first saved address), all other addresses are marked non-default.
 */
export function saveShippingAddress(
  addressInput: Omit<SavedShippingAddress, "id"> & { id?: string }
): SavedShippingAddress {
  const current = getSavedShippingAddresses();
  const isEditing = Boolean(addressInput.id && current.some((a) => a.id === addressInput.id));
  const id = addressInput.id || `addr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // If this is the only address or explicitly marked default, set isDefault = true
  const shouldBeDefault = addressInput.isDefault || current.length === 0;

  const targetAddress: SavedShippingAddress = {
    id,
    label: addressInput.label,
    recipientName: addressInput.recipientName.trim(),
    street: addressInput.street.trim(),
    city: addressInput.city.trim(),
    state: addressInput.state.trim(),
    postalCode: addressInput.postalCode.trim(),
    country: addressInput.country.trim(),
    isDefault: shouldBeDefault,
  };

  let nextAddresses: SavedShippingAddress[];

  if (isEditing) {
    nextAddresses = current.map((item) => {
      if (item.id === id) {
        return targetAddress;
      }
      return shouldBeDefault ? { ...item, isDefault: false } : item;
    });
  } else {
    const adjustedCurrent = shouldBeDefault
      ? current.map((item) => ({ ...item, isDefault: false }))
      : current;
    nextAddresses = [...adjustedCurrent, targetAddress];
  }

  // Ensure at least one default if addresses exist
  if (!nextAddresses.some((a) => a.isDefault) && nextAddresses.length > 0) {
    nextAddresses[0].isDefault = true;
  }

  writeSavedShippingAddresses(nextAddresses);
  return targetAddress;
}

/**
 * Deletes a shipping address by ID.
 * If the deleted address was default and remaining addresses exist, the first becomes default.
 */
export function deleteShippingAddress(id: string): void {
  const current = getSavedShippingAddresses();
  const addressToDelete = current.find((a) => a.id === id);
  const remaining = current.filter((a) => a.id !== id);

  if (addressToDelete?.isDefault && remaining.length > 0) {
    remaining[0].isDefault = true;
  }

  writeSavedShippingAddresses(remaining);
}

/**
 * Sets a specific address as default, unsetting default on all others.
 */
export function setDefaultShippingAddress(id: string): void {
  const current = getSavedShippingAddresses();
  const updated = current.map((address) => ({
    ...address,
    isDefault: address.id === id,
  }));
  writeSavedShippingAddresses(updated);
}

/**
 * Returns the default shipping address if one exists.
 */
export function getDefaultShippingAddress(
  addresses?: SavedShippingAddress[]
): SavedShippingAddress | null {
  const list = addresses || getSavedShippingAddresses();
  if (list.length === 0) return null;
  return list.find((a) => a.isDefault) || list[0];
}
