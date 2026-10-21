import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";

import { useAddressValidation } from "./useAddressValidation";

describe("useAddressValidation", () => {
  it("accepts valid US ZIP codes and rejects invalid ones", () => {
    const validUs = renderHook(() =>
      useAddressValidation({
        streetAddress: "123 Main St",
        postalCode: "90210",
        countryCode: "US",
      })
    );

    expect(validUs.result.current.isValid).toBe(true);
    expect(validUs.result.current.formattedPostalCode).toBe("90210");

    const validUsExtended = renderHook(() =>
      useAddressValidation({
        streetAddress: "123 Main St",
        postalCode: "90210-1234",
        countryCode: "US",
      })
    );

    expect(validUsExtended.result.current.isValid).toBe(true);
    expect(validUsExtended.result.current.formattedPostalCode).toBe("90210-1234");

    const invalidUs = renderHook(() =>
      useAddressValidation({
        streetAddress: "123 Main St",
        postalCode: "1234",
        countryCode: "US",
      })
    );

    expect(invalidUs.result.current.isValid).toBe(false);
    expect(invalidUs.result.current.validationError).toContain("Invalid postal code");
  });

  it("formats and validates UK postcodes in uppercase", () => {
    const validUk = renderHook(() =>
      useAddressValidation({
        streetAddress: "10 Downing Street",
        postalCode: "sw1a 1aa",
        countryCode: "UK",
      })
    );

    expect(validUk.result.current.isValid).toBe(true);
    expect(validUk.result.current.formattedPostalCode).toBe("SW1A 1AA");

    const invalidUk = renderHook(() =>
      useAddressValidation({
        streetAddress: "10 Downing Street",
        postalCode: "ABC123",
        countryCode: "UK",
      })
    );

    expect(invalidUk.result.current.isValid).toBe(false);
    expect(invalidUk.result.current.validationError).toContain("Invalid postal code");
  });

  it("accepts valid Canadian postal codes and rejects invalid ones", () => {
    const validCa = renderHook(() =>
      useAddressValidation({
        streetAddress: "1 Queen St",
        postalCode: "k1a 0b1",
        countryCode: "CA",
      })
    );

    expect(validCa.result.current.isValid).toBe(true);
    expect(validCa.result.current.formattedPostalCode).toBe("K1A 0B1");

    const invalidCa = renderHook(() =>
      useAddressValidation({
        streetAddress: "1 Queen St",
        postalCode: "Z9Z 9ZZ",
        countryCode: "CA",
      })
    );

    expect(invalidCa.result.current.isValid).toBe(false);
    expect(invalidCa.result.current.validationError).toContain("Invalid postal code");
  });

  it("validates common EU postal codes and rejects invalid formats", () => {
    const validDe = renderHook(() =>
      useAddressValidation({
        streetAddress: "Unter den Linden 1",
        postalCode: "10115",
        countryCode: "DE",
      })
    );

    expect(validDe.result.current.isValid).toBe(true);
    expect(validDe.result.current.formattedPostalCode).toBe("10115");

    const validFr = renderHook(() =>
      useAddressValidation({
        streetAddress: "12 Rue de l'Église",
        postalCode: "75001",
        countryCode: "FR",
      })
    );

    expect(validFr.result.current.isValid).toBe(true);

    const invalidEu = renderHook(() =>
      useAddressValidation({
        streetAddress: "10 Example Street",
        postalCode: "ABC-456",
        countryCode: "DE",
      })
    );

    expect(invalidEu.result.current.isValid).toBe(false);
    expect(invalidEu.result.current.validationError).toContain("Invalid postal code");
  });

  it("detects P.O. Box entries in the street address", () => {
    const poBox = renderHook(() =>
      useAddressValidation({
        streetAddress: "P.O. Box 123",
        postalCode: "90210",
        countryCode: "US",
      })
    );

    expect(poBox.result.current.isValid).toBe(false);
    expect(poBox.result.current.validationError).toContain("P.O. Box");

    const poBoxAlt = renderHook(() =>
      useAddressValidation({
        streetAddress: "PO Box 456",
        postalCode: "SW1A 1AA",
        countryCode: "UK",
      })
    );

    expect(poBoxAlt.result.current.isValid).toBe(false);
    expect(poBoxAlt.result.current.validationError).toContain("P.O. Box");
  });

  it("returns invalid when a validation error or postal code is wrong", () => {
    const invalidPostal = renderHook(() =>
      useAddressValidation({
        streetAddress: "123 Main St",
        postalCode: "bad-code",
        countryCode: "US",
      })
    );

    expect(invalidPostal.result.current.isValid).toBe(false);
    expect(invalidPostal.result.current.validationError).toBeTruthy();

    const invalidAddress = renderHook(() =>
      useAddressValidation({
        streetAddress: "P.O. Box 22",
        postalCode: "75001",
        countryCode: "FR",
      })
    );

    expect(invalidAddress.result.current.isValid).toBe(false);
    expect(invalidAddress.result.current.validationError).toBeTruthy();
  });
});
