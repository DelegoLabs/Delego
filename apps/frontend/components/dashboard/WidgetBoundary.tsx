"use client";

import { Suspense, type ReactNode } from "react";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";
import { WidgetSkeleton } from "./WidgetSkeleton";

export interface WidgetBoundaryProps {
  name: string;
  /** Reserved height (e.g. "12rem") — applied to skeleton AND content. */
  minHeight: string;
  children: ReactNode;
}

/**
 * Composition: ErrorBoundary × Suspense.
 *
 *   slow ≠ broken   — a pending child shows this widget's skeleton, not the page
 *   error ≠ blank   — a thrown child is caught here; siblings keep rendering
 *
 * See docs/dashboard-widget-composition.md for the full matrix.
 */
export function WidgetBoundary({ name, minHeight, children }: WidgetBoundaryProps) {
  return (
    <WidgetErrorBoundary name={name} minHeight={minHeight}>
      <Suspense fallback={<WidgetSkeleton name={name} minHeight={minHeight} />}>
        <div className="dashboard-widget" style={{ minHeight }}>
          {children}
        </div>
      </Suspense>
    </WidgetErrorBoundary>
  );
}
