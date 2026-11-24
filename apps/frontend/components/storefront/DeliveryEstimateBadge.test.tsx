import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DeliveryEstimateBadge,
  addBusinessDays,
  calculateDeliveryEstimate,
  formatDeliveryDate,
} from "./DeliveryEstimateBadge";

describe("addBusinessDays", () => {
  it("returns the same date when adding 0 business days", () => {
    const monday = new Date(2026, 9, 19); // Oct 19, 2026 (Monday)
    const result = addBusinessDays(monday, 0);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(9);
    expect(result.getDate()).toBe(19);
  });

  it("advances normally across weekdays", () => {
    const monday = new Date(2026, 9, 19); // Oct 19 (Mon)
    const result = addBusinessDays(monday, 3); // Oct 22 (Thu)
    expect(result.getDate()).toBe(22);
    expect(result.getDay()).toBe(4); // Thursday
  });

  it("skips Saturday and Sunday when crossing a weekend", () => {
    const friday = new Date(2026, 9, 23); // Oct 23, 2026 (Friday)
    const mondayResult = addBusinessDays(friday, 1);
    expect(mondayResult.getDate()).toBe(26); // Oct 26 (Monday)
    expect(mondayResult.getDay()).toBe(1);

    const tuesdayResult = addBusinessDays(friday, 2);
    expect(tuesdayResult.getDate()).toBe(27); // Oct 27 (Tuesday)
    expect(tuesdayResult.getDay()).toBe(2);
  });

  it("handles multiple weekends correctly", () => {
    const monday = new Date(2026, 9, 19); // Oct 19 (Mon)
    const twoWeeksLater = addBusinessDays(monday, 10); // 10 business days = 2 full weeks
    expect(twoWeeksLater.getDate()).toBe(2); // Nov 2, 2026 (Monday)
    expect(twoWeeksLater.getMonth()).toBe(10);
  });
});

describe("calculateDeliveryEstimate", () => {
  it("calculates earliest and latest arrival dates matching the schema", () => {
    const monday = new Date(2026, 9, 19); // Oct 19 (Mon)
    // 1 handling day + 3 to 5 transit days = 4 to 6 business days
    // Mon + 4 biz days -> Fri Oct 23
    // Mon + 6 biz days -> Tue Oct 27 (skips Sat/Sun)
    const estimate = calculateDeliveryEstimate(1, 3, 5, monday);

    expect(estimate.handlingDays).toBe(1);
    expect(estimate.transitDaysMin).toBe(3);
    expect(estimate.transitDaysMax).toBe(5);
    expect(estimate.earliestArrivalDate).toBe(formatDeliveryDate(new Date(2026, 9, 23)));
    expect(estimate.latestArrivalDate).toBe(formatDeliveryDate(new Date(2026, 9, 27)));
  });

  it("accelerates transit calculation for express shipping", () => {
    const monday = new Date(2026, 9, 19);
    // Express caps transit window to 2-3 days
    // 1 handling day + 2 express transit min = 3 biz days -> Thu Oct 22
    // 1 handling day + 3 express transit max = 4 biz days -> Fri Oct 23
    const estimate = calculateDeliveryEstimate(1, 4, 7, monday, true);

    expect(estimate.transitDaysMin).toBeLessThanOrEqual(2);
    expect(estimate.transitDaysMax).toBeLessThanOrEqual(3);
    expect(estimate.earliestArrivalDate).toBe(formatDeliveryDate(new Date(2026, 9, 22)));
    expect(estimate.latestArrivalDate).toBe(formatDeliveryDate(new Date(2026, 9, 23)));
  });
});

describe("DeliveryEstimateBadge", () => {
  it("renders the estimated arrival range correctly", () => {
    const baseDate = new Date(2026, 9, 19); // Oct 19
    render(
      <DeliveryEstimateBadge
        handlingDays={1}
        transitDaysMin={3}
        transitDaysMax={5}
        baseDate={baseDate}
      />
    );

    expect(screen.getByRole("region", { name: /delivery estimate/i })).toBeInTheDocument();
    expect(screen.getByText(/Arrives between/i)).toBeInTheDocument();
    expect(screen.getByText(/\(1d handling\)/i)).toBeInTheDocument();
  });

  it("highlights express shipping with an express badge", () => {
    const baseDate = new Date(2026, 9, 19);
    render(
      <DeliveryEstimateBadge
        handlingDays={0}
        transitDaysMin={1}
        transitDaysMax={2}
        baseDate={baseDate}
        isExpress={true}
      />
    );

    expect(screen.getByText(/Express/i)).toBeInTheDocument();
    expect(screen.getByText(/⚡/)).toBeInTheDocument();
  });

  it("handles same earliest and latest date gracefully", () => {
    const baseDate = new Date(2026, 9, 19);
    render(
      <DeliveryEstimateBadge
        handlingDays={1}
        transitDaysMin={2}
        transitDaysMax={2}
        baseDate={baseDate}
      />
    );

    expect(screen.getByText(/Arrives by/i)).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <DeliveryEstimateBadge className="custom-test-class" />
    );

    expect(container.firstChild).toHaveClass("custom-test-class");
  });
});
