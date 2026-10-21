"use client";

import React, { useState } from "react";
import type { QrDownloadOptions } from "@delegolabs/types";
import { downloadQrCode } from "../../lib/qrDownload";

export interface CheckoutQrDropdownProps {
  paymentUri: string;
  orderReference: string;
  sizePx?: number;
}

export function CheckoutQrDropdown({
  paymentUri,
  orderReference,
  sizePx = 300,
}: CheckoutQrDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async (format: "png" | "svg") => {
    setDownloading(true);
    setError(null);
    try {
      const options: QrDownloadOptions = {
        format,
        sizePx,
        fileName: orderReference,
      };
      await downloadQrCode(paymentUri, options);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download QR code.");
    } finally {
      setDownloading(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={downloading}
        className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition focus:outline-none focus:ring-2 focus:ring-slate-400"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Download QR Code Options"
      >
        <span>Download QR</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-48 rounded-lg bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 z-20 py-1"
          role="menu"
          aria-orientation="vertical"
        >
          <button
            onClick={() => handleDownload("png")}
            className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
            role="menuitem"
          >
            <span>Download PNG</span>
            <span className="text-[10px] text-slate-400 uppercase">Image</span>
          </button>
          <button
            onClick={() => handleDownload("svg")}
            className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between"
            role="menuitem"
          >
            <span>Download SVG</span>
            <span className="text-[10px] text-slate-400 uppercase">Vector</span>
          </button>
        </div>
      )}

      {error && (
        <div className="mt-1 text-[11px] text-red-600 dark:text-red-400" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
