"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";

const TOAST_DURATION_MS = 5_000;

export function BackOnlineToast() {
  const t = useTranslations("offline");
  const { connectivityState } = useOnlineStatus();
  const [visible, setVisible] = useState(false);
  const wasOnline = useRef(connectivityState.isOnline);

  useEffect(() => {
    if (!wasOnline.current && connectivityState.isOnline) {
      setVisible(true);
    }
    wasOnline.current = connectivityState.isOnline;
  }, [connectivityState.isOnline]);

  useEffect(() => {
    if (!visible) return;
    const timeout = window.setTimeout(
      () => setVisible(false),
      TOAST_DURATION_MS
    );
    return () => window.clearTimeout(timeout);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="back-online-toast" role="status" aria-live="polite">
      <span>{t("backOnline")}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={t("dismissBackOnline")}
      >
        {t("dismissBackOnline")}
      </button>
    </div>
  );
}
