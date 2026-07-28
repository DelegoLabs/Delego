export default function Loading() {
  return (
    <div className="settings-page">
      <header className="header">
        <h1>Approvals</h1>
        <p>Loading approval queue...</p>
      </header>

      <section className="grid">
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
          <div className="skeleton-button" />
        </div>
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
          <div className="skeleton-button" />
        </div>
      </section>
    </div>
  );
}
