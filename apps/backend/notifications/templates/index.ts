// Issue #211
export interface PaymentFailedTemplateData {
  userName?: string;
  orderId: string;
  reason: string;
  supportUrl?: string;
}

// Issue #212
export interface EscrowReleasedTemplateData {
  orderId: string;
  amount: string;
  merchantName?: string;
  txHash: string;
}

export function validatePaymentFailedData(data: unknown): PaymentFailedTemplateData {
  if (!data || typeof data !== "object") {
    throw new Error("Template data must be an object");
  }
  const d = data as Record<string, unknown>;
  if (!d.orderId || typeof d.orderId !== "string") {
    throw new Error("orderId is required");
  }
  if (!d.reason || typeof d.reason !== "string") {
    throw new Error("reason is required");
  }
  if (d.userName !== undefined && typeof d.userName !== "string") {
    throw new Error("userName must be a string");
  }
  if (d.supportUrl !== undefined && typeof d.supportUrl !== "string") {
    throw new Error("supportUrl must be a string");
  }
  return {
    orderId: d.orderId,
    reason: d.reason,
    userName: d.userName as string | undefined,
    supportUrl: d.supportUrl as string | undefined,
  };
}

export function validateEscrowReleasedData(data: unknown): EscrowReleasedTemplateData {
  if (!data || typeof data !== "object") {
    throw new Error("Template data must be an object");
  }
  const d = data as Record<string, unknown>;
  if (!d.orderId || typeof d.orderId !== "string") {
    throw new Error("orderId is required");
  }
  if (!d.amount || typeof d.amount !== "string") {
    throw new Error("amount is required");
  }
  if (!d.txHash || typeof d.txHash !== "string") {
    throw new Error("txHash is required");
  }
  if (d.merchantName !== undefined && typeof d.merchantName !== "string") {
    throw new Error("merchantName must be a string");
  }
  return {
    orderId: d.orderId,
    amount: d.amount,
    txHash: d.txHash,
    merchantName: d.merchantName as string | undefined,
  };
}
