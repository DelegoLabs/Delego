import Link from "next/link";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <div className="settings-page">
      <header className="header">
        <h1>404</h1>
        <p>{t("description")}</p>
      </header>
      {/* Single, low-cost link — viewport prefetch is fine (#621). */}
      <Link href="/" prefetch={true} className="nav-link">
        {t("goHome")}
      </Link>
    </div>
  );
}
