"use client";

import {
  FIAT_CURRENCY_CODES,
  FIAT_CURRENCIES,
  type FiatCurrency,
} from "../../lib/fiatCurrencies";

export interface FiatCurrencySwitcherProps {
  /** Currently selected fiat currency. */
  value: FiatCurrency;
  onChange: (currency: FiatCurrency) => void;
  id?: string;
  disabled?: boolean;
}

/**
 * Dropdown that lets a buyer choose the fiat currency storefront prices are
 * estimated in (#805).
 */
export function FiatCurrencySwitcher({
  value,
  onChange,
  id = "fiat-currency-select",
  disabled = false,
}: FiatCurrencySwitcherProps) {
  return (
    <div className="fiat-currency-switcher">
      <label htmlFor={id}>Display currency</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as FiatCurrency)}
      >
        {FIAT_CURRENCY_CODES.map((code) => (
          <option key={code} value={code}>
            {`${FIAT_CURRENCIES[code].symbol} ${code}`}
          </option>
        ))}
      </select>
    </div>
  );
}
