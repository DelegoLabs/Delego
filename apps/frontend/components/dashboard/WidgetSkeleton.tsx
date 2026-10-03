"use client";

/**
 * Fixed-size skeleton matching the widget's reserved dimensions so the
 * skeleton↔content swap does not cause CLS (#625).
 */
export function WidgetSkeleton({
  name,
  minHeight,
}: {
  name: string;
  minHeight: string;
}) {
  return (
    <div
      className="widget-skeleton card skeleton"
      style={{ minHeight }}
      // A plain div has no role, so it may carry neither aria-busy nor
      // aria-label (axe's aria-prohibited-attr flagged every dashboard widget).
      role="status"
      aria-busy="true"
      aria-label={`Loading ${name}`}
    >
      <div className="skeleton-title" />
      <div className="skeleton-text" />
      <div className="skeleton-text" style={{ width: "70%" }} />
    </div>
  );
}
