"use client";

import { useId, useMemo } from "react";
import type { DailySpendPoint } from "../../lib/weeklyReport";

export interface DailySpendSparklineProps {
  series: DailySpendPoint[];
  width?: number;
  height?: number;
  className?: string;
}

export function DailySpendSparkline({
  series,
  width = 500,
  height = 120,
  className = "",
}: DailySpendSparklineProps) {
  const rawGradientId = useId();
  const gradientId = `daily-spend-gradient-${rawGradientId.replace(/:/g, "")}`;
  const padding = { top: 16, bottom: 24, left: 16, right: 16 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const chart = useMemo(() => {
    if (series.length < 2) return null;

    const values = series.map((point) => point.totalXlm);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    const points = series.map((point, index) => {
      const x = padding.left + (index / (series.length - 1)) * innerWidth;
      const y =
        maxValue === minValue
          ? padding.top + innerHeight / 2
          : padding.top +
            innerHeight -
            ((point.totalXlm - minValue) / (maxValue - minValue)) * innerHeight;
      return { x, y, date: point.date, totalXlm: point.totalXlm };
    });

    const pathD = points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
      )
      .join(" ");
    const baseline = (padding.top + innerHeight).toFixed(2);
    const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(2)} ${baseline} L ${points[0].x.toFixed(2)} ${baseline} Z`;

    return { points, pathD, areaD, maxValue };
  }, [series, innerWidth, innerHeight, padding.left, padding.top]);

  if (!chart) {
    return (
      <div
        className={`sparkline-empty ${className}`}
        role="img"
        aria-label="No daily spend data available"
      >
        <span className="sparkline-empty-text">
          No daily spend in this period.
        </span>
      </div>
    );
  }

  const lastPoint = chart.points[chart.points.length - 1];
  const lastDate = new Date(`${lastPoint.date}T00:00:00Z`).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", timeZone: "UTC" }
  );

  return (
    <div className={`sparkline-container ${className}`}>
      <div className="sparkline-header">
        <span className="sparkline-title">Daily spend</span>
        <span className="sparkline-badge">
          <span className="sparkline-date">{lastDate}</span>:{" "}
          <strong>{lastPoint.totalXlm.toFixed(2)} XLM</strong>
        </span>
      </div>

      <div className="sparkline-svg-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          className="sparkline-svg"
          role="img"
          aria-label={`Daily spend over ${series.length} days, highest ${chart.maxValue.toFixed(2)} XLM`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor="var(--color-accent)"
                stopOpacity="0.25"
              />
              <stop
                offset="100%"
                stopColor="var(--color-accent)"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          <path d={chart.areaD} fill={`url(#${gradientId})`} />
          <path
            d={chart.pathD}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={4}
            fill="var(--color-accent)"
          />
        </svg>
      </div>
    </div>
  );
}
