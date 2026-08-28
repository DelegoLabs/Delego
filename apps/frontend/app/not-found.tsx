import Link from "next/link";

export default function NotFound() {
  return (
    <div className="settings-page">
      <header className="header">
        <h1>404</h1>
        <p>The page you&apos;re looking for doesn&apos;t exist.</p>
      </header>
      {/* Single, low-cost link — viewport prefetch is fine (#621). */}
      <Link href="/" prefetch={true} className="nav-link">
        Go Home
      </Link>
    </div>
  );
}
