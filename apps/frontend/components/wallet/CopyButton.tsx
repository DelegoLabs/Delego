"use client";

import { useState } from "react";
import { copySensitive } from "../../lib/clipboard";

export interface CopyButtonProps {
  /** The sensitive value to copy (Stellar address, tx hash, etc.). */
  value: string;
  /** Accessible label for the button, e.g. "Copy address". */
  label?: string;
  /** Short display text inside the button. Defaults to "Copy". */
  children?: React.ReactNode;
}

/**
 * Reusable copy button for security-sensitive values (#592).
 * Routes all copies through copySensitive() which schedules a 30-second
 * clipboard clearance and cancels any prior pending clear.
 */
export function CopyButton({
  value,
  label = "Copy",
  children = "Copy",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copySensitive(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied — silently no-op.
    }
  };

  return (
    <>
      <button
        type="button"
        className="copy-button"
        onClick={handleCopy}
        aria-label={label}
        title={label}
      >
        {copied ? "Copied!" : children}
      </button>
      {copied && (
        <span role="status" aria-live="polite" className="sr-only">
          Copied to clipboard. Will be cleared in 30 seconds.
        </span>
      )}
    </>
  );
}
