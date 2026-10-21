export interface AddressValidationResult {
  isValid: boolean;
  formattedPostalCode: string;
  countryCode: string;
  validationError?: string;
}
