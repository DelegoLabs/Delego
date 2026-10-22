"use client";

import {
  PriceDisplay as UiPriceDisplay,
  type PriceDisplayProps as UiPriceDisplayProps,
} from "@delegolabs/ui";
import { useCurrency } from "../../hooks/useCurrency";
import { useFiatRates } from "../../hooks/useFiatRates";
import { DEFAULT_CURRENCY_PREFERENCE } from "../../lib/currencyPreference";

export interface PriceDisplayProps extends Partial<UiPriceDisplayProps> {
  stroops: bigint | number | string;
}

export function PriceDisplay({
  stroops,
  currency = "XLM",
  mode: propMode,
  targetFiat: propTargetFiat,
  fiatRate: propFiatRate,
  locale,
  showSecondary = true,
  as = "span",
  className,
  style,
  ...rest
}: PriceDisplayProps) {
  let contextPreference = DEFAULT_CURRENCY_PREFERENCE;
  try {
    const currencyCtx = useCurrency();
    if (currencyCtx?.preference) {
      contextPreference = currencyCtx.preference;
    }
  } catch {
    // isolated tests without provider
  }

  const { rates } = useFiatRates();

  const mode = propMode ?? contextPreference.mode;
  const targetFiat = propTargetFiat ?? contextPreference.targetFiat;
  const fiatRate =
    propFiatRate ?? (rates?.rates ? rates.rates[targetFiat] : undefined);

  return (
    <UiPriceDisplay
      stroops={stroops}
      currency={currency}
      mode={mode}
      targetFiat={targetFiat}
      fiatRate={fiatRate}
      locale={locale}
      showSecondary={showSecondary}
      as={as}
      className={className}
      style={style}
      {...rest}
    />
  );
}
