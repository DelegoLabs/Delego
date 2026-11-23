export default function Loading() {
  return (
    <div className="settings-page">
      <header className="header">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-72 animate-pulse rounded bg-gray-200 mt-2" />
      </header>
      <section className="grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card skeleton">
            <div className="skeleton-title" />
            <div className="skeleton-text" />
            <div className="skeleton-text" />
            <div className="skeleton-button" />
          </div>
        ))}
      </section>
    </div>
  );
}