"use client";

import Link from "next/link";
import { formatXlm } from "../../lib/orders";

export interface SpendVelocityGaugeProps {
  currentSpendStroops: string;
  limitStroops: string;
  windowHours: number;
  remainingSeconds: number;
}

export function SpendVelocityGauge({
  currentSpendStroops,
  limitStroops,
  windowHours,
  remainingSeconds,
}: SpendVelocityGaugeProps) {
  const current = BigInt(currentSpendStroops || "0");
  const limit = BigInt(limitStroops || "0");

  let percentage = 0;
  if (limit > 0n) {
    percentage = Math.min(
      Math.round(Number((current * 10000n) / limit) / 100),
      100
    );
  } else if (current > 0n) {
    percentage = 100;
  }

  let strokeColor = "#16a34a"; // Green (<60%)
  if (percentage >= 90) {
    strokeColor = "#dc2626"; // Red (>90%)
  } else if (percentage >= 60) {
    strokeColor = "#f59e0b"; // Amber (60%-90%)
  }

  const remainingStroops = limit > current ? limit - current : 0n;

  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const timeResetStr = `${hours}h ${minutes}m`;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
      data-testid="spend-velocity-gauge"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Spending Velocity Gauge</h3>
          <p className="text-xs text-gray-500">{windowHours}-Hour Rolling Window</p>
        </div>
        <Link
          href="/settings"
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
          data-testid="velocity-policy-adjust-link"
        >
          Adjust Policy →
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r={radius}
              className="text-gray-100"
              strokeWidth="10"
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              stroke={strokeColor}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-500 ease-out"
              data-testid="gauge-progress-circle"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-bold text-gray-900">{percentage}%</span>
            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Used</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full text-xs">
          <div className="bg-gray-50 p-3 rounded-lg">
            <span className="text-gray-500 block mb-0.5">Current Spend</span>
            <span className="font-semibold text-gray-900 block" data-testid="current-spend">
              {formatXlm(current)} XLM
            </span>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <span className="text-gray-500 block mb-0.5">Spending Limit</span>
            <span className="font-semibold text-gray-900 block" data-testid="spending-limit">
              {formatXlm(limit)} XLM
            </span>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <span className="text-gray-500 block mb-0.5">Remaining Allowance</span>
            <span className="font-semibold text-gray-900 block" data-testid="remaining-allowance">
              {formatXlm(remainingStroops)} XLM
            </span>
          </div>
          <div className="bg-gray-50 p-3 rounded-lg">
            <span className="text-gray-500 block mb-0.5">Window Reset</span>
            <span className="font-semibold text-gray-900 block" data-testid="time-until-reset">
              in {timeResetStr}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
