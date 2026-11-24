"use client";

import { useTranslations } from "next-intl";
import { SafeExternalLink } from "@delegolabs/ui";

export default function AnalyticsPage() {
  const t = useTranslations("analytics");

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-gray-600">{t("description")}</p>
      <SafeExternalLink
        href="https://docs.delego.network/analytics"
        className="text-blue-600 underline"
      >
        {t("learnMore")}
      </SafeExternalLink>
    </main>
  );
}
