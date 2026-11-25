"use client";

import { useState } from "react";
import { ActivityTimeline, Amount, Card } from "@delegolabs/ui";
import { ShipmentTracker, type TrackingMilestone } from "@delegolabs/ui";
import { useTranslations } from "next-intl";
import type {
  Order,
  PackageTrackingInfo,
  TrackingStatus,
} from "@delegolabs/types";
import { isTerminal, orderToTimelineEvents } from "../../lib/orders";
import { useCurrency } from "../../hooks/useCurrency";

export interface OrderTrackingCardProps {
  order: Order;
}

function formatTime(date: Date | string | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Live-tracking card: lifecycle timeline plus the latest known order details. */
export function OrderTrackingCard({ order }: OrderTrackingCardProps) {
  const t = useTranslations("orderTracking.card");
  const tStatus = useTranslations("orderTracking.status");
  const settled = isTerminal(order);
  const { currencyId, rate } = useCurrency();
  const [selectedPackage, setSelectedPackage] = useState(0);

  return (
    <Card
      title={t("title", { orderId: order.id })}
      ariaLabel={t("ariaLabel", { orderId: order.id })}
    >
      <ActivityTimeline
        events={orderToTimelineEvents(order)}
        ariaLabel={t("progressAriaLabel")}
      />

      {order.packages && order.packages.length > 0 && (
        <PackageTrackingTabs
          orderId={order.id}
          packages={order.packages}
          selectedIndex={selectedPackage}
          onSelect={setSelectedPackage}
        />
      )}

      <dl className="wallet-detail-list">
        <div className="wallet-detail-row">
          <dt>{t("merchant")}</dt>
          <dd>{order.merchantId}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>{t("total")}</dt>
          <dd>
            <Amount
              stroops={order.totalStroops}
              currency={currencyId}
              xlmUsdRate={rate?.xlmUsdRate}
            />
          </dd>
        </div>
        <div className="wallet-detail-row">
          <dt>{t("escrow")}</dt>
          <dd>{order.escrowContractId ?? t("notYetEscrowed")}</dd>
        </div>
        <div className="wallet-detail-row">
          <dt>{settled ? t("completed") : t("lastUpdate")}</dt>
          <dd>{formatTime(order.updatedAt)}</dd>
        </div>
      </dl>
    </Card>
  );
}

const PACKAGE_STAGES: TrackingStatus[] = [
  "label_created",
  "in_transit",
  "out_for_delivery",
  "delivered",
];

function statusLabel(status: TrackingStatus, tStatus: ReturnType<typeof useTranslations>): string {
  return tStatus(status);
}

interface PackageTrackingTabsProps {
  orderId: string;
  packages: PackageTrackingInfo[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function PackageTrackingTabs({
  orderId,
  packages,
  selectedIndex,
  onSelect,
}: PackageTrackingTabsProps) {
  const t = useTranslations("orderTracking.card");
  const tStatus = useTranslations("orderTracking.status");
  const activeIndex = Math.min(selectedIndex, packages.length - 1);
  const selected = packages[activeIndex];
  const latestKnownStage = [...selected.events]
    .reverse()
    .find(
      (event) => event.status && PACKAGE_STAGES.includes(event.status)
    )?.status;
  const activeStage =
    selected.status === "exception"
      ? Math.max(0, PACKAGE_STAGES.indexOf(latestKnownStage ?? "in_transit"))
      : PACKAGE_STAGES.indexOf(selected.status);
  const progress = (Math.max(activeStage, 0) / 3) * 100;
  const milestones: TrackingMilestone[] = selected.events.map(
    (event, index) => ({
      ...event,
      status: event.status ?? (index === 0 ? "label_created" : selected.status),
    })
  );
  const tabId = (index: number) => `${orderId}-package-tab-${index}`;
  const panelId = (index: number) => `${orderId}-package-panel-${index}`;

  return (
    <section
      aria-label="Package tracking"
      className="mt-6 border-t border-gray-200 pt-5"
    >
      <h3 className="mb-3 text-base font-semibold">
        {t("packages", { count: packages.length })}
      </h3>
      <div
        role="tablist"
        aria-label="Order packages"
        className="mb-4 flex flex-wrap gap-2"
      >
        {packages.map((pkg, index) => (
          <button
            key={pkg.packageId}
            type="button"
            id={tabId(index)}
            role="tab"
            aria-selected={activeIndex === index}
            tabIndex={activeIndex === index ? 0 : -1}
            aria-controls={panelId(index)}
            onClick={() => onSelect(index)}
            onKeyDown={(event) => {
              let nextIndex: number | undefined;
              if (event.key === "ArrowRight") {
                nextIndex = (index + 1) % packages.length;
              } else if (event.key === "ArrowLeft") {
                nextIndex = (index - 1 + packages.length) % packages.length;
              } else if (event.key === "Home") {
                nextIndex = 0;
              } else if (event.key === "End") {
                nextIndex = packages.length - 1;
              }
              if (nextIndex !== undefined) {
                event.preventDefault();
                onSelect(nextIndex);
                document.getElementById(tabId(nextIndex))?.focus();
              }
            }}
            className="rounded-md border px-3 py-2 text-sm aria-selected:border-blue-600 aria-selected:bg-blue-50 aria-selected:text-blue-800"
          >
            {t("packageTab", { index: index + 1, carrier: pkg.carrierName })}
          </button>
        ))}
      </div>
      <div
        id={panelId(activeIndex)}
        role="tabpanel"
        aria-labelledby={tabId(activeIndex)}
        className="space-y-4"
      >
        <div>
          <div className="mb-2 flex justify-between gap-4 text-sm">
            <span>{t("deliveryProgress")}</span>
            <span aria-live="polite">{statusLabel(selected.status, tStatus)}</span>
          </div>
          <div
            role="progressbar"
            aria-label={t("packageProgressAriaLabel", { index: activeIndex + 1 })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={statusLabel(selected.status, tStatus)}
            className="h-2 overflow-hidden rounded-full bg-gray-200"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${selected.status === "exception" ? "bg-amber-500" : "bg-emerald-600"}`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <ol className="mt-2 flex justify-between gap-2 text-xs text-gray-600">
            {PACKAGE_STAGES.map((stage) => (
              <li key={stage}>{statusLabel(stage, tStatus)}</li>
            ))}
          </ol>
        </div>
        <ShipmentTracker
          carrier={selected.carrierName}
          trackingNumber={selected.trackingNumber}
          milestones={milestones}
          estimatedDelivery={selected.estimatedDelivery ?? t("notProvided")}
        />
      </div>
    </section>
  );
}
