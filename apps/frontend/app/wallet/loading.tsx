export default function Loading() {
  return (
    <div className="settings-page">
      <header className="header">
        <h1>Wallet</h1>
        <p>Loading wallet status...</p>
      </header>

      <div className="card skeleton">
        <div className="skeleton-title" />
        <div className="skeleton-text" />
        <div className="skeleton-text" />
        <div className="skeleton-button" />
      </div>

      <div className="card skeleton">
        <div className="skeleton-title" />
        <div className="skeleton-text" />
      </div>
    </div>
  );
}
