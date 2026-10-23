import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { TourProvider, useTour } from "./TourProvider";

function TourStatus() {
  const { active, currentStep, start } = useTour();

  return (
    <>
      <output data-testid="tour-active">{String(active)}</output>
      <output data-testid="tour-step">{currentStep?.title ?? ""}</output>
      <button type="button" onClick={start}>
        Start tour
      </button>
    </>
  );
}

describe("TourProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("does not interrupt a first visit with an automatic tour", () => {
    render(
      <TourProvider>
        <TourStatus />
      </TourProvider>
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByTestId("tour-active")).toHaveTextContent("false");
    expect(screen.getByTestId("tour-step")).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("starts the tour when requested", () => {
    render(
      <TourProvider>
        <TourStatus />
      </TourProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Start tour" }));

    expect(screen.getByTestId("tour-active")).toHaveTextContent("true");
    expect(screen.getByTestId("tour-step")).toHaveTextContent(
      "Welcome to Delego"
    );
  });
});
