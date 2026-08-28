"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useLocale } from "next-intl";
import { AnalyticsDashboard } from "../../components/analytics/AnalyticsDashboard";
import {
  parseAnalyticsRange,
  type AnalyticsRange,
} from "../../lib/analytics";

export default function AnalyticsPage() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const range = parseAnalyticsRange(searchParams.get("range"));

  const setRange = useCallback(
    (next: AnalyticsRange) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("range", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  return (
    <div className="settings-page">
      <header className="header">
        <h1>Analytics</h1>
        <p>Compare delegation policies and view aggregate spending data</p>
      </header>

      <AnalyticsDashboard
        range={range}
        locale={locale}
        onRangeChange={setRange}
      />
    </div>
  );
}
