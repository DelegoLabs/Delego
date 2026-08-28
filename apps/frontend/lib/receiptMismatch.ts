/**
 * Mismatch detector for on-chain receipt verification (#581).
 *
 * Compares field-by-field values fetched from a receipt getter against
 * the equivalent locally-displayed order/escrow data. Any divergence is a
 * potential integrity issue (stale local cache, a compromised backend, or
 * an on-chain state the UI hasn't caught up to yet) and must raise a
 * prominent warning rather than being silently ignored.
 */

export interface FieldComparison {
  field: string;
  localValue: unknown;
  onChainValue: unknown;
  matches: boolean;
}

export interface ReceiptComparisonResult {
  matches: boolean;
  fields: FieldComparison[];
  /** Fields present locally or on-chain but not both. */
  missingFields: string[];
}

/** Normalizes a value for comparison: bigints and numbers compare as strings. */
function normalize(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return value.toString();
  return String(value);
}

/**
 * Compares `localData` against `onChainData` field-by-field over the
 * given field list. A field present in one but not the other is reported
 * in `missingFields` and always counts as a mismatch — verification
 * should never treat "we can't compare this field" as "it matches".
 */
export function compareReceiptFields(
  localData: Record<string, unknown>,
  onChainData: Record<string, unknown>,
  fields: readonly string[]
): ReceiptComparisonResult {
  const comparisons: FieldComparison[] = [];
  const missingFields: string[] = [];

  for (const field of fields) {
    const hasLocal = field in localData;
    const hasOnChain = field in onChainData;

    if (!hasLocal || !hasOnChain) {
      missingFields.push(field);
      comparisons.push({
        field,
        localValue: hasLocal ? localData[field] : undefined,
        onChainValue: hasOnChain ? onChainData[field] : undefined,
        matches: false,
      });
      continue;
    }

    const localValue = localData[field];
    const onChainValue = onChainData[field];
    comparisons.push({
      field,
      localValue,
      onChainValue,
      matches: normalize(localValue) === normalize(onChainValue),
    });
  }

  return {
    matches: comparisons.every((c) => c.matches),
    fields: comparisons,
    missingFields,
  };
}
