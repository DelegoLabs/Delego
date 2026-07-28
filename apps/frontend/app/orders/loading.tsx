export default function Loading() {
  return (
    <div className="settings-page">
      <header className="header">
        <h1>Transaction History</h1>
        <p>Loading orders...</p>
      </header>

      <div className="card skeleton">
        <div className="skeleton-title" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
      </div>
    </div>
  );
}
