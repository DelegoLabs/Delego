export interface DeliveryEstimate {
  handlingDays: number;
  transitDaysMin: number;
  transitDaysMax: number;
  earliestArrivalDate: string;
  latestArrivalDate: string;
}

export type BusinessDayPredicate = (date: Date) => boolean;
export type DeliveryDateInput = Date | number | string;

export interface DeliveryEstimateInput {
  handlingDays?: number;
  transitDaysMin?: number;
  transitDaysMax?: number;
  baseDate?: DeliveryDateInput;
  isExpress?: boolean;
  expressTransitDaysMin?: number;
  expressTransitDaysMax?: number;
  isBusinessDay?: BusinessDayPredicate;
}

const DEFAULT_HANDLING_DAYS = 1;
const DEFAULT_TRANSIT_DAYS_MIN = 3;
const DEFAULT_TRANSIT_DAYS_MAX = 5;
const DEFAULT_EXPRESS_TRANSIT_DAYS_MIN = 2;
const DEFAULT_EXPRESS_TRANSIT_DAYS_MAX = 3;

export function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

function normalizeDayCount(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toUtcDate(value: DeliveryDateInput): Date {
  if (typeof value === "string") {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (isoMatch) {
      return new Date(
        Date.UTC(
          Number(isoMatch[1]),
          Number(isoMatch[2]) - 1,
          Number(isoMatch[3])
        )
      );
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? new Date()
      : new Date(
          Date.UTC(
            parsed.getFullYear(),
            parsed.getMonth(),
            parsed.getDate()
          )
        );
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date();
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
}

export function toIsoDate(value: DeliveryDateInput): string {
  return toUtcDate(value).toISOString().slice(0, 10);
}

export function addBusinessDays(
  startDate: DeliveryDateInput,
  businessDaysToAdd: number,
  isBusinessDay: BusinessDayPredicate = isWeekday
): Date {
  const result = toUtcDate(startDate);
  let remaining = normalizeDayCount(businessDaysToAdd, 0);

  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    if (isBusinessDay(result)) remaining -= 1;
  }

  return result;
}

function startOnBusinessDay(
  value: DeliveryDateInput,
  isBusinessDay: BusinessDayPredicate
): Date {
  const result = toUtcDate(value);
  while (!isBusinessDay(result)) result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

export function calculateDeliveryEstimate(
  input?: DeliveryEstimateInput
): DeliveryEstimate;
export function calculateDeliveryEstimate(
  handlingDays?: number,
  transitDaysMin?: number,
  transitDaysMax?: number,
  baseDate?: DeliveryDateInput,
  isExpress?: boolean,
  isBusinessDay?: BusinessDayPredicate
): DeliveryEstimate;
export function calculateDeliveryEstimate(
  inputOrHandlingDays: DeliveryEstimateInput | number = {},
  transitDaysMin?: number,
  transitDaysMax?: number,
  baseDate?: DeliveryDateInput,
  isExpress = false,
  isBusinessDay?: BusinessDayPredicate
): DeliveryEstimate {
  const input: DeliveryEstimateInput =
    typeof inputOrHandlingDays === "object" && inputOrHandlingDays !== null
      ? inputOrHandlingDays
      : {
          handlingDays: inputOrHandlingDays,
          transitDaysMin,
          transitDaysMax,
          baseDate,
          isExpress,
          isBusinessDay,
        };

  const handlingDays = normalizeDayCount(
    input.handlingDays,
    DEFAULT_HANDLING_DAYS
  );
  const standardMin = normalizeDayCount(
    input.transitDaysMin,
    DEFAULT_TRANSIT_DAYS_MIN
  );
  const standardMax = normalizeDayCount(
    input.transitDaysMax,
    DEFAULT_TRANSIT_DAYS_MAX
  );
  const minTransit = Math.min(standardMin, standardMax);
  const maxTransit = Math.max(standardMin, standardMax);

  let effectiveTransitMin = minTransit;
  let effectiveTransitMax = maxTransit;

  if (input.isExpress) {
    effectiveTransitMin =
      input.expressTransitDaysMin === undefined
        ? clamp(minTransit, 1, DEFAULT_EXPRESS_TRANSIT_DAYS_MIN)
        : normalizeDayCount(
            input.expressTransitDaysMin,
            DEFAULT_EXPRESS_TRANSIT_DAYS_MIN
          );
    effectiveTransitMax =
      input.expressTransitDaysMax === undefined
        ? Math.max(
            effectiveTransitMin,
            clamp(
              maxTransit,
              effectiveTransitMin,
              DEFAULT_EXPRESS_TRANSIT_DAYS_MAX
            )
          )
        : Math.max(
            effectiveTransitMin,
            normalizeDayCount(
              input.expressTransitDaysMax,
              DEFAULT_EXPRESS_TRANSIT_DAYS_MAX
            )
          );
  }

  const businessDay = input.isBusinessDay ?? isWeekday;
  const start = startOnBusinessDay(input.baseDate ?? new Date(), businessDay);
  const earliest = addBusinessDays(
    start,
    handlingDays + effectiveTransitMin,
    businessDay
  );
  const latest = addBusinessDays(
    start,
    handlingDays + effectiveTransitMax,
    businessDay
  );

  return {
    handlingDays,
    transitDaysMin: effectiveTransitMin,
    transitDaysMax: effectiveTransitMax,
    earliestArrivalDate: toIsoDate(earliest),
    latestArrivalDate: toIsoDate(latest),
  };
}

export function formatDeliveryDate(
  value: DeliveryDateInput,
  locale = "en-US"
): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(toUtcDate(value));
}

export function formatDeliveryWindow(
  estimate: DeliveryEstimate,
  locale = "en-US"
): string {
  const earliest = formatDeliveryDate(estimate.earliestArrivalDate, locale);
  const latest = formatDeliveryDate(estimate.latestArrivalDate, locale);
  return earliest === latest
    ? `Arrives by ${earliest}`
    : `Arrives between ${earliest} - ${latest}`;
}
