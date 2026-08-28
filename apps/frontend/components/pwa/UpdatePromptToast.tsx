"use client";

import { useServiceWorkerUpdate } from "../../hooks/useServiceWorkerUpdate";

/**
 * Non-blocking toast for a waiting service worker (#626). Dismiss defers
 * the reload until the next idle navigation (or 7 days).
 */
export function UpdatePromptToast() {
  const { waiting, copy, reload, dismiss } = useServiceWorkerUpdate();

  if (!waiting) return null;

  return (
    <div className="sw-update-toast" role="status">
      <div className="sw-update-toast-text">
        <p className="sw-update-toast-title">{copy.title}</p>
        <p className="sw-update-toast-body">{copy.body}</p>
      </div>
      <button
        type="button"
        className="sw-update-toast-action"
        onClick={() => void reload()}
      >
        {copy.reloadLabel}
      </button>
      <button
        type="button"
        className="sw-update-toast-dismiss"
        onClick={dismiss}
        aria-label="Dismiss update prompt"
      >
        Later
      </button>
    </div>
  );
}
