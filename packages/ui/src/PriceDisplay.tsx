import type { HTMLAttributes } from "react";

export type DisplayCurrencyMode = "crypto_primary" | "fiat_primary";

export interface CurrencyPreference {
  mode: DisplayCurrencyMode;
  targetFiat: "USD" | "EUR" | "GBP" | "NGN";
}

const STROOPS_PER_UNIT = 10_000_000n;

const DEFAULT_FIAT_RATES: Record<CurrencyPreference["targetFiat"], number> = {
  USD: 0.12,
  EUR: 0.11,
  GBP: 0.095,
  NGN: 190,
};

export interface PriceDisplayProps
  extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Amount in stroops (1 XLM or 1 USDC = 10,000,000 stroops). */
  stroops: bigint | number | string;
  /** Crypto asset code (e.g. "XLM", "USDC"). Defaults to "XLM". */
  currency?: "XLM" | "USDC" | "EURC" | string;
  /** Display mode: "crypto_primary" or "fiat_primary". Defaults to "crypto_primary". */
  mode?: DisplayCurrencyMode;
  /** Target localized fiat currency. Defaults to "USD". */
  targetFiat?: CurrencyPreference["targetFiat"];
  /** Optional conversion rate (fiat per 1 XLM/crypto unit). */
  fiatRate?: number;
  /** BCP-47 locale for number formatting. */
  locale?: string;
  /** Whether to render the alternate secondary value. Defaults to true. */
  showSecondary?: boolean;
  /** Root HTML tag to render. Defaults to "span". */
  as?: "span" | "div";
}

function toStroopsBigInt(input: bigint | number | string): bigint {
  if (typeof input === "bigint") return input;
  if (typeof input === "number") return BigInt(Math.trunc(input));
  const clean = String(input).trim();
  if (/^-?\d+$/.test(clean)) return BigInt(clean);
  const num = Number(clean);
  if (!Number.isNaN(num)) return BigInt(Math.trunc(num));
  return 0n;
}

export function PriceDisplay({
  stroops,
  currency = "XLM",
  mode = "crypto_primary",
  targetFiat = "USD",
  fiatRate,
  locale,
  showSecondary = true,
  as: Component = "span",
  className = "",
  style,
  ...rest
}: PriceDisplayProps) {
  const stroopsBigInt = toStroopsBigInt(stroops);
  const cryptoUnits = Number(stroopsBigInt) / Number(STROOPS_PER_UNIT);

  const cryptoFormatted = `${cryptoUnits.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  })} ${currency}`.trim();

  const rate = fiatRate ?? DEFAULT_FIAT_RATES[targetFiat] ?? 0.12;
  const fiatUnits = cryptoUnits * rate;

  let fiatFormatted: string;
  try {
    fiatFormatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: targetFiat,
    }).format(fiatUnits);
  } catch {
    fiatFormatted = `${targetFiat} ${fiatUnits.toFixed(2)}`;
  }

  const isCryptoPrimary = mode === "crypto_primary";
  const primaryValue = isCryptoPrimary ? cryptoFormatted : fiatFormatted;
  const secondaryValue = isCryptoPrimary
    ? `(${fiatFormatted})`
    : `(${cryptoFormatted})`;

  const combinedClass = [
    "price-display",
    `price-display--${mode}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component
      className={combinedClass}
      data-testid="price-display"
      data-currency-mode={mode}
      data-target-fiat={targetFiat}
      style={{
        display: Component === "div" ? "flex" : "inline-flex",
        alignItems: "baseline",
        gap: "0.35rem",
        ...style,
      }}
      {...rest}
    >
      <span
        className="price-display-primary"
        data-testid="price-primary"
        style={{ fontWeight: 600 }}
      >
        {primaryValue}
      </span>
      {showSecondary && (
        <span
          className="price-display-secondary"
          data-testid="price-secondary"
          style={{
            fontSize: "0.85em",
            opacity: 0.75,
            fontWeight: 400,
          }}
        >
          {secondaryValue}
        </span>
      )}
    </Component>
  );
}
