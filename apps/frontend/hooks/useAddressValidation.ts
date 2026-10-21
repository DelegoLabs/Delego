import { useMemo } from "react";
import type { AddressValidationResult } from "../types/addressValidation";

export interface UseAddressValidationParams {
  streetAddress: string;
  postalCode: string;
  countryCode: string;
}

const PO_BOX_PATTERN = /(^|\s)(p\.?\s*o\.?\s*box|post\s*office\s*box|po\s*box)(\s|$)/i;

const COUNTRY_CODES = {
  US: "US",
  UK: "UK",
  GB: "UK",
  CA: "CA",
  DE: "DE",
  FR: "FR",
  ES: "ES",
  IT: "IT",
  NL: "NL",
  BE: "BE",
  IE: "IE",
  AT: "AT",
} as const;

function normalizeCountryCode(countryCode: string): string {
  const trimmed = countryCode.trim();
  if (!trimmed) return "";

  const normalized = trimmed.toUpperCase().replace(/[^A-Z]/g, "");
  if (normalized === "USA" || normalized === "UNITEDSTATES") return COUNTRY_CODES.US;
  if (normalized === "GB" || normalized === "UK" || normalized === "GREATBRITAIN" || normalized === "UNITEDKINGDOM") return COUNTRY_CODES.UK;
  if (normalized === "CAN" || normalized === "CANADA") return COUNTRY_CODES.CA;
  if (normalized === "DE" || normalized === "DEU" || normalized === "GERMANY") return COUNTRY_CODES.DE;
  if (normalized === "FR" || normalized === "FRA" || normalized === "FRANCE") return COUNTRY_CODES.FR;
  if (normalized === "ES" || normalized === "ESP" || normalized === "SPAIN") return COUNTRY_CODES.ES;
  if (normalized === "IT" || normalized === "ITA" || normalized === "ITALY") return COUNTRY_CODES.IT;
  if (normalized === "NL" || normalized === "NLD" || normalized === "NETHERLANDS") return COUNTRY_CODES.NL;
  if (normalized === "BE" || normalized === "BEL" || normalized === "BELGIUM") return COUNTRY_CODES.BE;
  if (normalized === "IE" || normalized === "IRL" || normalized === "IRELAND") return COUNTRY_CODES.IE;
  if (normalized === "AT" || normalized === "AUT" || normalized === "AUSTRIA") return COUNTRY_CODES.AT;

  return normalized;
}

function formatPostalCode(postalCode: string, countryCode: string): string {
  const cleaned = postalCode.trim();
  if (!cleaned) return "";

  switch (countryCode) {
    case COUNTRY_CODES.US: {
      const digits = cleaned.replace(/[^A-Z0-9]/gi, "");
      if (digits.length <= 5) return digits.toUpperCase();
      return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`.slice(0, 10).toUpperCase();
    }
    case COUNTRY_CODES.UK: {
      const compact = cleaned.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (!compact) return "";
      if (/^[A-Z]{1,2}\d[A-Z\d]?[A-Z\d]?[A-Z\d]?[A-Z\d]?$/.test(compact)) {
        const outer = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
        if (outer) {
          return `${outer[1]} ${outer[2]}`;
        }
        if (compact.length <= 3) return compact;
        return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
      }
      return compact;
    }
    case COUNTRY_CODES.CA: {
      const compact = cleaned.replace(/[^A-Z0-9]/gi, "").toUpperCase();
      if (compact.length < 6) return compact;
      return `${compact.slice(0, 3)} ${compact.slice(3, 6)}`;
    }
    default: {
      return cleaned.replace(/\s+/g, " ").trim().toUpperCase();
    }
  }
}

function isValidPostalCode(postalCode: string, countryCode: string): boolean {
  const normalized = postalCode.trim();
  if (!normalized) return false;

  switch (countryCode) {
    case COUNTRY_CODES.US:
      return /^\d{5}(?:-\d{4})?$/.test(normalized);
    case COUNTRY_CODES.UK:
      return /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i.test(normalized);
    case COUNTRY_CODES.CA:
      return /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i.test(normalized);
    case COUNTRY_CODES.DE:
      return /^\d{5}$/.test(normalized);
    case COUNTRY_CODES.FR:
      return /^\d{5}$/.test(normalized);
    case COUNTRY_CODES.ES:
      return /^\d{5}$/.test(normalized);
    case COUNTRY_CODES.IT:
      return /^\d{5}$/.test(normalized);
    case COUNTRY_CODES.NL:
      return /^\d{4}\s?[A-Z]{2}$/i.test(normalized);
    case COUNTRY_CODES.BE:
      return /^\d{4}$/.test(normalized);
    case COUNTRY_CODES.IE:
      return /^[A-Z\d]{7,8}$/i.test(normalized);
    case COUNTRY_CODES.AT:
      return /^\d{4}$/.test(normalized);
    default:
      return normalized.length >= 3 && normalized.length <= 10;
  }
}

function getCountryLabel(countryCode: string): string {
  switch (countryCode) {
    case COUNTRY_CODES.US:
      return "US";
    case COUNTRY_CODES.UK:
      return "UK";
    case COUNTRY_CODES.CA:
      return "Canada";
    case COUNTRY_CODES.DE:
      return "Germany";
    case COUNTRY_CODES.FR:
      return "France";
    case COUNTRY_CODES.ES:
      return "Spain";
    case COUNTRY_CODES.IT:
      return "Italy";
    case COUNTRY_CODES.NL:
      return "Netherlands";
    case COUNTRY_CODES.BE:
      return "Belgium";
    case COUNTRY_CODES.IE:
      return "Ireland";
    case COUNTRY_CODES.AT:
      return "Austria";
    default:
      return countryCode || "this country";
  }
}

/**
 * Validates the address inputs and returns the normalized address result.
 * The actual validation logic can be implemented in a later step.
 */
export function useAddressValidation({
  streetAddress,
  postalCode,
  countryCode,
}: UseAddressValidationParams): AddressValidationResult {
  return useMemo<AddressValidationResult>(() => {
    const normalizedCountryCode = normalizeCountryCode(countryCode);
    const formattedPostalCode = formatPostalCode(postalCode, normalizedCountryCode);
    const normalizedStreetAddress = streetAddress.trim();

    if (!normalizedStreetAddress || !formattedPostalCode || !normalizedCountryCode) {
      return {
        isValid: false,
        formattedPostalCode,
        countryCode: normalizedCountryCode,
        validationError: "Street address, postal code, and country code are required.",
      };
    }

    if (PO_BOX_PATTERN.test(normalizedStreetAddress)) {
      return {
        isValid: false,
        formattedPostalCode,
        countryCode: normalizedCountryCode,
        validationError: "P.O. Box addresses are not accepted for this delivery.",
      };
    }

    if (!isValidPostalCode(formattedPostalCode, normalizedCountryCode)) {
      return {
        isValid: false,
        formattedPostalCode,
        countryCode: normalizedCountryCode,
        validationError: `Invalid postal code for ${getCountryLabel(normalizedCountryCode)}.`,
      };
    }

    return {
      isValid: true,
      formattedPostalCode,
      countryCode: normalizedCountryCode,
    };
  }, [streetAddress, postalCode, countryCode]);
}
