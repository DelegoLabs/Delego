export default function Loading() {
  return (
    <div className="settings-page" aria-busy="true" aria-label="Loading merchant directory">
      <header className="header">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-gray-200 mt-2" />
      </header>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="h-10 flex-1 min-w-[200px] animate-pulse rounded bg-gray-200" />
        <div className="h-10 w-44 animate-pulse rounded bg-gray-200" />
      </div>
      <section className="grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="card skeleton">
            <div className="skeleton-title" />
            <div className="skeleton-text mt-2" />
            <div className="skeleton-button mt-4" />
          </div>
        ))}
      </section>
    </div>
  );
}
