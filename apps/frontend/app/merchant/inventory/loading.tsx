export default function Loading() {
  return (
    <div className="settings-page">
      <header className="header">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-64 animate-pulse rounded bg-gray-200 mt-2" />
      </header>
      <section className="card skeleton">
        <div className="skeleton-title" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
        <div className="skeleton-button" />
      </section>
    </div>
  );
}