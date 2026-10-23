/**
 * Public API barrel for the analytics feature.
 * Other features may only import analytics components via this file.
 */
export { AnalyticsDashboard } from "./AnalyticsDashboard";
export { SpendingOverview } from "./SpendingOverview";
export { SpendChart } from "./SpendChart";
export { RangeSwitcher } from "./RangeSwitcher";
export { SpendForecastChart } from "./SpendForecastChart";
export type { SpendForecastChartProps } from "./SpendForecastChart";
export type { SpendForecastPoint } from "../../lib/spendForecast";
export type { ForecastHorizonDays } from "../../lib/spendForecast";
export { SpendingByCategoryCard } from "./SpendingByCategoryCard";
export { SpendingDonutChart } from "./SpendingDonutChart";
export { SpendingLegend } from "./SpendingLegend";
export { SpendingRangeSelector } from "./SpendingRangeSelector";
export type {
  SpendMode,
  SpendingCategoryRange,
  BuyerSpendingCategory,
} from "../../lib/spendingByCategory";
