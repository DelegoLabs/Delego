"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  CURRENCIES,
  CURRENCY_STORAGE_KEY,
  DEFAULT_CURRENCY_ID,
  getCurrencyConfig,
  isCurrencyId,
  type CurrencyConfig,
  type CurrencyId,
} from "../lib/currencies";
import {
  CURRENCY_PREFERENCE_STORAGE_KEY,
  DEFAULT_CURRENCY_PREFERENCE,
  parseStoredCurrencyPreference,
  type CurrencyPreference,
  type DisplayCurrencyMode,
} from "../lib/currencyPreference";
import { fetchXlmRate, isRateStale, type RateSnapshot } from "../lib/rates";

export type { DisplayCurrencyMode, CurrencyPreference };

interface CurrencyContextValue {
  currencyId: CurrencyId;
  currency: CurrencyConfig;
  currencies: CurrencyConfig[];
  setCurrency: (id: CurrencyId) => void;
  preference: CurrencyPreference;
  setPreference: (
    next:
      | CurrencyPreference
      | ((prev: CurrencyPreference) => CurrencyPreference)
  ) => void;
  setCurrencyMode: (mode: DisplayCurrencyMode) => void;
  setTargetFiat: (fiat: CurrencyPreference["targetFiat"]) => void;
  toggleCurrencyMode: () => void;
  rate: RateSnapshot | null;
  rateIsStale: boolean;
  hydrated: boolean;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currencyId, setCurrencyId] = useState<CurrencyId>(DEFAULT_CURRENCY_ID);
  const [preference, setPreferenceState] = useState<CurrencyPreference>(
    DEFAULT_CURRENCY_PREFERENCE
  );
  const [hydrated, setHydrated] = useState(false);
  const [rate, setRate] = useState<RateSnapshot | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(CURRENCY_STORAGE_KEY);
      if (stored && isCurrencyId(stored)) {
        setCurrencyId(stored);
      }
      const storedPref = window.localStorage.getItem(
        CURRENCY_PREFERENCE_STORAGE_KEY
      );
      if (storedPref) {
        setPreferenceState(parseStoredCurrencyPreference(storedPref));
      }
    } catch {
      // localStorage unavailable in private browsing
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === CURRENCY_STORAGE_KEY && event.newValue) {
        if (isCurrencyId(event.newValue)) {
          setCurrencyId(event.newValue);
        }
      }
      if (event.key === CURRENCY_PREFERENCE_STORAGE_KEY && event.newValue) {
        setPreferenceState(parseStoredCurrencyPreference(event.newValue));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isEstimateMode = CURRENCIES[currencyId].isEstimate;

  useEffect(() => {
    if (!isEstimateMode) return;
    const controller = new AbortController();
    fetchXlmRate(controller.signal).then(setRate);
    return () => controller.abort();
  }, [isEstimateMode]);

  const setCurrency = useCallback((id: CurrencyId) => {
    setCurrencyId(id);
    try {
      window.localStorage.setItem(CURRENCY_STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }, []);

  const setPreference = useCallback(
    (
      next:
        | CurrencyPreference
        | ((prev: CurrencyPreference) => CurrencyPreference)
    ) => {
      setPreferenceState((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        try {
          window.localStorage.setItem(
            CURRENCY_PREFERENCE_STORAGE_KEY,
            JSON.stringify(resolved)
          );
        } catch {
          // ignore
        }
        return resolved;
      });
    },
    []
  );

  const setCurrencyMode = useCallback(
    (mode: DisplayCurrencyMode) => {
      setPreference((prev) => ({ ...prev, mode }));
    },
    [setPreference]
  );

  const setTargetFiat = useCallback(
    (targetFiat: CurrencyPreference["targetFiat"]) => {
      setPreference((prev) => ({ ...prev, targetFiat }));
    },
    [setPreference]
  );

  const toggleCurrencyMode = useCallback(() => {
    setPreference((prev) => ({
      ...prev,
      mode:
        prev.mode === "crypto_primary" ? "fiat_primary" : "crypto_primary",
    }));
  }, [setPreference]);

  const value = useMemo<CurrencyContextValue>(
    () => ({
      currencyId,
      currency: getCurrencyConfig(currencyId),
      currencies: Object.values(CURRENCIES),
      setCurrency,
      preference,
      setPreference,
      setCurrencyMode,
      setTargetFiat,
      toggleCurrencyMode,
      rate,
      rateIsStale: rate ? isRateStale(rate) : false,
      hydrated,
    }),
    [
      currencyId,
      setCurrency,
      preference,
      setPreference,
      setCurrencyMode,
      setTargetFiat,
      toggleCurrencyMode,
      rate,
      hydrated,
    ]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency(): CurrencyContextValue {
  const ctx = useContext(CurrencyContext);
  if (!ctx) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return ctx;
}

export function useCurrencyPreference() {
  const {
    preference,
    setPreference,
    setCurrencyMode,
    setTargetFiat,
    toggleCurrencyMode,
  } = useCurrency();
  return {
    preference,
    mode: preference.mode,
    targetFiat: preference.targetFiat,
    setPreference,
    setCurrencyMode,
    setTargetFiat,
    toggleCurrencyMode,
  };
}
