"use client";

import { useCallback, useState } from "react";

/**
 * Selection is keyed by approval id and lives here, above any virtualized row — a virtualized
 * row unmounting when it scrolls out of view must never lose or reset its selection state.
 */
export function useApprovalSelection() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelected(new Set(ids));
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  return { selected, toggle, selectAll, clear, isSelected, count: selected.size };
}
