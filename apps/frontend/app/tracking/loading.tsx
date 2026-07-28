export default function Loading() {
  return (
    <div className="settings-page">
      <header className="header">
        <h1>Order Tracking</h1>
        <p>Loading live orders...</p>
      </header>

      <section className="grid">
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
        </div>
        <div className="card skeleton">
          <div className="skeleton-title" />
          <div className="skeleton-text" />
          <div className="skeleton-text" />
        </div>
      </section>
    </div>
  );
}
