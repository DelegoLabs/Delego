/**
 * KYC types for the merchant feature.
 *
 * Re-exported from `lib/kycUpload` so the merchant barrel stays the only
 * public entry point while the implementation lives with the client helpers.
 */
export type {
  KycDocumentType,
  KycUploadData,
  KycUploadResult,
  KycVerificationStatus,
} from "../../lib/kycUpload";
