import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  DeliveryEstimateBadge,
  addBusinessDays,
  calculateDeliveryEstimate,
  formatDeliveryWindow,
  toIsoDate,
} from "./DeliveryEstimateBadge";

const MONDAY = "2026-10-19";
const FRIDAY = "2026-10-23";
const SATURDAY = "2026-10-24";

describe("addBusinessDays", () => {
  it("returns the same date when adding zero business days", () => {
    expect(toIsoDate(addBusinessDays(MONDAY, 0))).toBe(MONDAY);
  });

  it("advances across weekdays", () => {
    expect(toIsoDate(addBusinessDays(MONDAY, 3))).toBe("2026-10-22");
  });

  it("skips Saturday and Sunday", () => {
    expect(toIsoDate(addBusinessDays(FRIDAY, 1))).toBe("2026-10-26");
    expect(toIsoDate(addBusinessDays(FRIDAY, 2))).toBe("2026-10-27");
    expect(toIsoDate(addBusinessDays(SATURDAY, 1))).toBe("2026-10-26");
  });

  it("crosses multiple weekends", () => {
    expect(toIsoDate(addBusinessDays(MONDAY, 10))).toBe("2026-11-02");
  });

  it("uses an injected non-business day predicate", () => {
    const holiday = "2026-10-21";
    const isBusinessDay = (date: Date) =>
      date.getUTCDay() !== 0 &&
      date.getUTCDay() !== 6 &&
      toIsoDate(date) !== holiday;

    expect(toIsoDate(addBusinessDays(MONDAY, 2, isBusinessDay))).toBe(
      "2026-10-22"
    );
  });
});

describe("calculateDeliveryEstimate", () => {
  it("calculates an ISO delivery window from handling and transit days", () => {
    const estimate = calculateDeliveryEstimate({
      handlingDays: 1,
      transitDaysMin: 3,
      transitDaysMax: 5,
      baseDate: MONDAY,
    });

    expect(estimate).toEqual({
      handlingDays: 1,
      transitDaysMin: 3,
      transitDaysMax: 5,
      earliestArrivalDate: "2026-10-23",
      latestArrivalDate: "2026-10-27",
    });
  });

  it("starts counting from the next business day on weekend orders", () => {
    const estimate = calculateDeliveryEstimate({
      handlingDays: 1,
      transitDaysMin: 1,
      transitDaysMax: 2,
      baseDate: SATURDAY,
    });

    expect(estimate.earliestArrivalDate).toBe("2026-10-28");
    expect(estimate.latestArrivalDate).toBe("2026-10-29");
  });

  it("skips merchant holidays supplied as non-business days", () => {
    const holiday = "2026-10-21";
    const estimate = calculateDeliveryEstimate({
      handlingDays: 1,
      transitDaysMin: 1,
      transitDaysMax: 1,
      baseDate: MONDAY,
      isBusinessDay: (date) =>
        date.getUTCDay() !== 0 &&
        date.getUTCDay() !== 6 &&
        toIsoDate(date) !== holiday,
    });

    expect(estimate.earliestArrivalDate).toBe("2026-10-22");
    expect(estimate.latestArrivalDate).toBe("2026-10-22");
  });

  it("normalizes reversed and invalid transit ranges", () => {
    const estimate = calculateDeliveryEstimate({
      handlingDays: -2,
      transitDaysMin: 5,
      transitDaysMax: 3,
      baseDate: MONDAY,
    });

    expect(estimate.handlingDays).toBe(0);
    expect(estimate.transitDaysMin).toBe(3);
    expect(estimate.transitDaysMax).toBe(5);
    expect(estimate.earliestArrivalDate).toBe("2026-10-22");
    expect(estimate.latestArrivalDate).toBe("2026-10-26");
  });

  it("keeps positional express estimates backwards compatible", () => {
    const estimate = calculateDeliveryEstimate(1, 4, 7, MONDAY, true);

    expect(estimate.transitDaysMin).toBe(2);
    expect(estimate.transitDaysMax).toBe(3);
    expect(estimate.earliestArrivalDate).toBe("2026-10-22");
    expect(estimate.latestArrivalDate).toBe("2026-10-23");
  });

  it("uses explicit express transit days when provided", () => {
    const estimate = calculateDeliveryEstimate({
      handlingDays: 1,
      transitDaysMin: 4,
      transitDaysMax: 7,
      expressTransitDaysMin: 1,
      expressTransitDaysMax: 2,
      baseDate: MONDAY,
      isExpress: true,
    });

    expect(estimate.earliestArrivalDate).toBe("2026-10-21");
    expect(estimate.latestArrivalDate).toBe("2026-10-22");
  });
});

describe("formatDeliveryWindow", () => {
  it("formats a range", () => {
    expect(
      formatDeliveryWindow({
        handlingDays: 1,
        transitDaysMin: 3,
        transitDaysMax: 5,
        earliestArrivalDate: "2026-10-23",
        latestArrivalDate: "2026-10-27",
      })
    ).toBe("Arrives between Oct 23 - Oct 27");
  });

  it("formats a single arrival day", () => {
    expect(
      formatDeliveryWindow({
        handlingDays: 1,
        transitDaysMin: 2,
        transitDaysMax: 2,
        earliestArrivalDate: "2026-10-22",
        latestArrivalDate: "2026-10-22",
      })
    ).toBe("Arrives by Oct 22");
  });
});

describe("DeliveryEstimateBadge", () => {
  it("renders the arrival range with machine-readable dates", () => {
    render(
      <DeliveryEstimateBadge
        handlingDays={1}
        transitDaysMin={3}
        transitDaysMax={5}
        baseDate={MONDAY}
      />
    );

    const badge = screen.getByRole("region", { name: "Delivery estimate" });
    expect(within(badge).getByText(/Arrives between/i)).toBeInTheDocument();
    expect(within(badge).getByText("Oct 23")).toHaveAttribute(
      "dateTime",
      "2026-10-23"
    );
    expect(within(badge).getByText("Oct 27")).toHaveAttribute(
      "dateTime",
      "2026-10-27"
    );
    expect(within(badge).getByText("(1d handling)")).toBeInTheDocument();
  });

  it("highlights express delivery with its own arrival dates", () => {
    render(
      <DeliveryEstimateBadge
        handlingDays={0}
        transitDaysMin={1}
        transitDaysMax={2}
        expressTransitDaysMin={1}
        expressTransitDaysMax={1}
        baseDate={MONDAY}
        isExpress
      />
    );

    const badge = screen.getByRole("region", {
      name: "Express delivery estimate",
    });
    expect(within(badge).getByText("Express")).toBeInTheDocument();
    expect(within(badge).getByText(/Arrives by Oct 20/i)).toBeInTheDocument();
  });

  it("shows standard and express option windows together", () => {
    render(
      <DeliveryEstimateBadge
        handlingDays={1}
        transitDaysMin={3}
        transitDaysMax={5}
        expressTransitDaysMin={1}
        expressTransitDaysMax={2}
        baseDate={MONDAY}
        showExpress
      />
    );

    const badge = screen.getByTestId("delivery-estimate-badge");
    expect(within(badge).getAllByText(/Arrives between/i)).toHaveLength(2);
    expect(badge.textContent).toContain("Arrives between Oct 23 - Oct 27");
    expect(badge.textContent).toContain(
      "Express deliveryArrives between Oct 21 - Oct 22"
    );
  });

  it("hides extra detail in compact mode", () => {
    render(
      <DeliveryEstimateBadge
        handlingDays={1}
        transitDaysMin={3}
        transitDaysMax={5}
        expressTransitDaysMin={1}
        expressTransitDaysMax={2}
        baseDate={MONDAY}
        showExpress
        compact
      />
    );

    const badge = screen.getByTestId("delivery-estimate-badge");
    expect(badge).toHaveClass("delivery-estimate-badge--compact");
    expect(within(badge).queryByText(/handling/i)).not.toBeInTheDocument();
    expect(within(badge).queryByText(/Express delivery/i)).not.toBeInTheDocument();
  });

  it("applies a custom className", () => {
    const { container } = render(
      <DeliveryEstimateBadge className="custom-test-class" baseDate={MONDAY} />
    );
    expect(container.firstChild).toHaveClass("custom-test-class");
  });
});
