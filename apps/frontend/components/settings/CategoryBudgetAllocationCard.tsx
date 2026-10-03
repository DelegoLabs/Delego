"use client";

import { useCallback, useState } from "react";
import { Button, Card } from "@delegolabs/ui";
import { BudgetAllocationChart } from "./BudgetAllocationChart";
import { BudgetAllocationSliders } from "./BudgetAllocationSliders";
import type { CategoryBudgetAllocation } from "./budgetAllocationTypes";

export type { CategoryBudgetAllocation } from "./budgetAllocationTypes";

export interface CategoryBudgetAllocationCardProps {
  allocations: CategoryBudgetAllocation[];
  onSave: (allocations: CategoryBudgetAllocation[]) => void | Promise<unknown>;
  locale?: string;
}

/**
 * Card for managing per-category monthly budgets. Edits stay local until
 * Save is pressed, matching the other settings cards.
 */
export function CategoryBudgetAllocationCard({
  allocations,
  onSave,
  locale,
}: CategoryBudgetAllocationCardProps) {
  const [draft, setDraft] = useState<CategoryBudgetAllocation[]>(allocations);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save category budgets.");
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  return (
    <Card>
      <h2 style={{ fontWeight: 600, marginBottom: "0.75rem" }}>
        Category budgets
      </h2>
      <div style={{ display: "grid", gap: "1.25rem" }}>
        <BudgetAllocationSliders
          allocations={draft}
          onChange={setDraft}
          locale={locale}
        />
        <BudgetAllocationChart allocations={draft} locale={locale} />
      </div>
      {error ? (
        <p role="alert" style={{ color: "#b91c1c", marginTop: "0.75rem" }}>
          {error}
        </p>
      ) : null}
      <div style={{ marginTop: "1rem" }}>
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save category budgets"}
        </Button>
      </div>
    </Card>
  );
}

export default CategoryBudgetAllocationCard;
