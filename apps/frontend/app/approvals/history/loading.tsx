export default function Loading() {
  return (
    <div className="settings-page">
      <header className="header">
        <h1>Approval history</h1>
        <p>Loading your decision history...</p>
      </header>

      <section className="card skeleton">
        <div className="skeleton-title" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
      </section>
    </div>
  );
}
