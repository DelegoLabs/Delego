"use client";

import { useEffect, useRef, useState } from "react";
import { computeCartSummary, type CartItem } from "../lib/cart";
import { validatePromoCode, type AppliedPromoCode } from "../lib/promoCode";

/** Bind a validation result to the exact cart and merchant it was quoted for. */
export function useCartPromoCode(items: CartItem[]) {
  const [code, setCode] = useState("");
  const [selectedMerchant, setSelectedMerchant] = useState("");
  const merchants = [
    ...new Map(
      items.map((item) => [item.merchantId, item.merchantName])
    ).entries(),
  ];
  const merchantId = merchants.some(([id]) => id === selectedMerchant)
    ? selectedMerchant
    : (merchants[0]?.[0] ?? "");
  const key = JSON.stringify([merchantId, items]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const requestRef = useRef<AbortController | null>(null);
  const [result, setResult] = useState<{
    key: string;
    promo: AppliedPromoCode;
  } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(
    null
  );
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setPendingKey(null);
    setResult(null);
    setError(null);
    return () => requestRef.current?.abort();
  }, [key]);

  function remove() {
    requestRef.current?.abort();
    requestRef.current = null;
    setPendingKey(null);
    setResult(null);
    setError(null);
  }

  async function apply() {
    remove();
    const trimmed = code.trim();
    if (!trimmed || !merchantId) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setPendingKey(key);
    const merchantItems = items.filter(
      (item) => item.merchantId === merchantId
    );
    try {
      const discount = await validatePromoCode(
        {
          code: trimmed,
          merchantId,
          subtotalStroops: computeCartSummary(merchantItems).subtotalStroops,
          items: merchantItems.map(({ productId, quantity, priceStroops }) => ({
            productId,
            quantity,
            priceStroops,
          })),
        },
        controller.signal
      );
      if (
        !controller.signal.aborted &&
        currentKey.current === key &&
        requestRef.current === controller
      ) {
        setResult({ key, promo: { merchantId, discount } });
      }
    } catch (cause) {
      if (
        !controller.signal.aborted &&
        currentKey.current === key &&
        requestRef.current === controller
      ) {
        setError({
          key,
          message:
            cause instanceof Error && cause.name !== "TypeError"
              ? cause.message
              : "Unable to verify this coupon. Check your connection and try again.",
        });
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setPendingKey(null);
      }
    }
  }

  return {
    code,
    setCode: (value: string) => {
      remove();
      setCode(value);
    },
    merchantId,
    setMerchantId: (value: string) => {
      remove();
      setSelectedMerchant(value);
    },
    merchants,
    apply,
    remove,
    pending: pendingKey === key,
    error: error?.key === key ? error.message : null,
    applied: result?.key === key ? result.promo : null,
  };
}
