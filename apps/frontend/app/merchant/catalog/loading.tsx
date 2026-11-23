export default function Loading() {
  return (
    <div className="settings-page">
      <header className="header">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-64 animate-pulse rounded bg-gray-200 mt-2" />
      </header>
      <section className="grid">
        {[1, 2, 3, 4, 6].map((i) => (
          <div key={i} className="card skeleton">
            <div className="h-32 w-full animate-pulse rounded bg-gray-200" />
            <div className="skeleton-title mt-3" />
            <div className="skeleton-text" />
            <div className="skeleton-button" />
          </div>
        ))}
      </section>
    </div>
  );
}