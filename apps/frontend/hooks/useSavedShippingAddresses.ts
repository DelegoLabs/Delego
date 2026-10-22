"use client";

import { useCallback, useEffect, useState } from "react";
import type { SavedShippingAddress } from "@delegolabs/types";
import {
  SAVED_SHIPPING_ADDRESSES_EVENT,
  deleteShippingAddress,
  getDefaultShippingAddress,
  getSavedShippingAddresses,
  saveShippingAddress,
  setDefaultShippingAddress,
} from "../lib/savedShippingAddresses";

export function useSavedShippingAddresses() {
  const [addresses, setAddresses] = useState<SavedShippingAddress[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(() => {
    const list = getSavedShippingAddresses();
    setAddresses(list);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    refresh();

    const handleUpdate = () => {
      refresh();
    };

    window.addEventListener(SAVED_SHIPPING_ADDRESSES_EVENT, handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener(SAVED_SHIPPING_ADDRESSES_EVENT, handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [refresh]);

  const addAddress = useCallback(
    (address: Omit<SavedShippingAddress, "id">) => {
      return saveShippingAddress(address);
    },
    []
  );

  const editAddress = useCallback(
    (address: SavedShippingAddress) => {
      return saveShippingAddress(address);
    },
    []
  );

  const deleteAddress = useCallback((id: string) => {
    deleteShippingAddress(id);
  }, []);

  const setDefault = useCallback((id: string) => {
    setDefaultShippingAddress(id);
  }, []);

  const defaultAddress = getDefaultShippingAddress(addresses);

  return {
    addresses,
    defaultAddress,
    isLoaded,
    addAddress,
    editAddress,
    deleteAddress,
    setDefault,
    refresh,
  };
}
