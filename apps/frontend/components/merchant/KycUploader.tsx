"use client";

/**
 * Public merchant entry point for the KYC uploader. The UI itself lives in
 * `KycDocumentUploader`; this module keeps the barrel export stable.
 */
export {
  KycDocumentUploader as KycUploader,
  type KycUploaderProps,
} from "./KycDocumentUploader";
