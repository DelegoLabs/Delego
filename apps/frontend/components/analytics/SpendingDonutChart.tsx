"use client";

import { useState } from "react";
import { formatAmount, stroopsHelperText } from "@delegolabs/ui";
import type { BuyerSpendingCategory } from "../../lib/spendingByCategory";
import { categoryColor } from "../../lib/categoryBudgets";
import { formatXlm } from "../../lib/orders";

export interface SpendingDonutChartProps {
  /** Categories to draw, already filtered to the active spend mode. */
  categories: BuyerSpendingCategory[];
  locale?: string;
  /** USD value of 1 XLM — when present, tooltips also show the USD equivalent. */
  xlmUsdRate?: number;
}

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 80;
const STROKE_WIDTH = 36;

/** Angle (0° = top, clockwise) to SVG cartesian coordinates. */
function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

/** SVG path `d` for a circular arc from startAngle to endAngle. */
function arcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    "M",
    start.x.toFixed(3),
    start.y.toFixed(3),
    "A",
    r,
    r,
    0,
    largeArc,
    0,
    end.x.toFixed(3),
    end.y.toFixed(3),
  ].join(" ");
}

/**
 * Dependency-light SVG donut chart of spend by category (#989). Each category
 * is one stroked arc; hovering a segment expands it, dims the rest, and shows
 * the exact stroop and USD amounts in a tooltip. Follows the BalanceSparkline
 * convention (raw SVG, no charting library).
 */
export function SpendingDonutChart({
  categories,
  locale,
  xlmUsdRate,
}: SpendingDonutChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const totals = categories.map((c) => BigInt(c.totalSpentStroops));
  const grandTotal = totals.reduce((sum, t) => sum + t, 0n);

  if (grandTotal <= 0n) {
    return (
      <div className="spending-donut-empty">
        <p>No spending to display for the selected range.</p>
      </div>
    );
  }

  let cursor = 0;
  const segments = categories.map((category, index) => {
    const total = totals[index];
    const angle = (Number(total) / Number(grandTotal)) * 360;
    const startAngle = cursor;
    const endAngle = cursor + angle;
    cursor = endAngle;
    return {
      category,
      total,
      startAngle,
      endAngle,
      color: categoryColor(index),
    };
  });

  const hovered = hoverIndex !== null ? segments[hoverIndex] : null;
  const activeTotal = hovered ? hovered.total : grandTotal;
  const activeLabel = hovered ? hovered.category.category : "Total";
  const activePercent = hovered ? hovered.category.percentageOfTotal : 100;

  return (
    <div className="spending-donut">
      <div className="spending-donut-svg-wrap">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          role="img"
          aria-label="Spending by category"
          className="spending-donut-svg"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {segments.map((segment, index) => {
            const isActive = hoverIndex === index;
            const dimmed = hoverIndex !== null && !isActive;
            const label = `${segment.category.category}: ${formatXlm(
              segment.total,
              locale
            )} XLM, ${segment.category.percentageOfTotal.toFixed(1)}% of total`;
            return (
              <path
                key={segment.category.category}
                d={arcPath(
                  CENTER,
                  CENTER,
                  RADIUS,
                  segment.startAngle,
                  segment.endAngle
                )}
                fill="none"
                stroke={segment.color}
                strokeWidth={isActive ? STROKE_WIDTH + 4 : STROKE_WIDTH}
                strokeLinecap="butt"
                opacity={dimmed ? 0.35 : 1}
                style={{
                  transition: "opacity 0.15s ease, stroke-width 0.15s ease",
                }}
                tabIndex={0}
                aria-label={label}
                onMouseEnter={() => setHoverIndex(index)}
                onFocus={() => setHoverIndex(index)}
                onBlur={() => setHoverIndex(null)}
              >
                <title>{label}</title>
              </path>
            );
          })}
          <text
            x={CENTER}
            y={CENTER - 4}
            textAnchor="middle"
            className="spending-donut-center-label"
          >
            {activeLabel}
          </text>
          <text
            x={CENTER}
            y={CENTER + 18}
            textAnchor="middle"
            className="spending-donut-center-value"
          >
            {formatXlm(activeTotal, locale)} XLM
          </text>
          {hovered && (
            <text
              x={CENTER}
              y={CENTER + 36}
              textAnchor="middle"
              className="spending-donut-center-percent"
            >
              {activePercent.toFixed(1)}%
            </text>
          )}
        </svg>
      </div>

      {hovered && (
        <div role="tooltip" className="spending-donut-tooltip">
          <strong className="spending-donut-tooltip-title">
            {hovered.category.category}
          </strong>
          <span className="spending-donut-tooltip-amount">
            {formatXlm(hovered.total, locale)} XLM
          </span>
          <span className="spending-donut-tooltip-stroops">
            {stroopsHelperText(hovered.total, locale)}
          </span>
          {xlmUsdRate ? (
            <span className="spending-donut-tooltip-usd">
              ≈{" "}
              {
                formatAmount(hovered.total, {
                  locale,
                  currency: "USD",
                  xlmUsdRate,
                }).value
              }
            </span>
          ) : null}
          <span className="spending-donut-tooltip-percent">
            {hovered.category.percentageOfTotal.toFixed(1)}% of total spend
          </span>
          <span className="spending-donut-tooltip-split">
            Autonomous:{" "}
            {formatXlm(BigInt(hovered.category.autonomousSpendStroops), locale)}{" "}
            XLM
          </span>
          <span className="spending-donut-tooltip-split">
            Manual:{" "}
            {formatXlm(BigInt(hovered.category.manualSpendStroops), locale)} XLM
          </span>
        </div>
      )}
    </div>
  );
}
