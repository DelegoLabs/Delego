"use client";

import { useTranslations } from "next-intl";

export default function AnalyticsPage() {
  const t = useTranslations("analytics");

  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
    </main>
  );
}
