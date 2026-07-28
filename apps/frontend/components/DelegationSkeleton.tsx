/** Skeleton placeholder rows matching the shape of a delegation list item. */
export function DelegationSkeleton() {
  return (
    <div className="skeleton-form skeleton" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="skeleton-form">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" style={{ width: "40%" }} />
        </div>
      ))}
    </div>
  );
}
