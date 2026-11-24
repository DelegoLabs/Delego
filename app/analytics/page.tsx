import { useTranslations } from "next-intl";

export default function AnalyticsPage() {
  const t = useTranslations("analytics");

  return (
    <main style={{ padding: "var(--space-6, 24px)", color: "var(--color-text, #111827)", background: "var(--color-surface, #ffffff)", minHeight: "100vh" }}>
      <h1 style={{ fontSize: "var(--font-size-2xl, 1.5rem)", fontWeight: 600, marginBottom: "var(--space-4, 16px)" }}>
        {t("title")}
      </h1>
      <p style={{ color: "var(--color-text-muted, #6b7280)" }}>{t("description")}</p>
    </main>
  );
}
