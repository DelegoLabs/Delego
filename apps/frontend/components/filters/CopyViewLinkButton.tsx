"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@delegolabs/ui";

const RESET_DELAY_MS = 2000;

/**
 * "Copy link to this view" affordance for filter-bearing list pages (#510).
 * Copies the current URL — including any query-param-synced filter state —
 * so the exact view can be shared or bookmarked.
 */
export function CopyViewLinkButton() {
  const t = useTranslations("filters");
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      if (resetTimer.current !== null) {
        clearTimeout(resetTimer.current);
      }
      resetTimer.current = setTimeout(() => {
        resetTimer.current = null;
        setCopied(false);
      }, RESET_DELAY_MS);
    } catch {
      // Clipboard access may be denied — silently no-op, nothing to recover.
    }
  };

  return (
    <Button variant="ghost" onClick={handleCopy} ariaLabel={t("copyLink")}>
      {copied ? t("copied") : t("copyLink")}
    </Button>
  );
}
