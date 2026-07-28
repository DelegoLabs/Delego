/** Skeleton placeholder rows matching the shape of an order list item. */
export function OrderSkeleton() {
  return (
    <div className="skeleton-form skeleton" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="skeleton-form">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" style={{ width: "50%" }} />
        </div>
      ))}
    </div>
  );
}
