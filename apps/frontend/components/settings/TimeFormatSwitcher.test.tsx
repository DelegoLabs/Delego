import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, beforeEach } from "vitest";
import { TimeFormatSwitcher } from "./TimeFormatSwitcher";
import { TimeFormatProvider } from "../../hooks/useTimeFormat";
import { TIME_FORMAT_STORAGE_KEY } from "../../lib/timeFormat";

function renderSwitcher() {
  return render(
    <TimeFormatProvider>
      <TimeFormatSwitcher />
    </TimeFormatProvider>
  );
}

describe("TimeFormatSwitcher", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to auto timezone, 24-hour clock, and Monday", () => {
    renderSwitcher();

    expect(screen.getByLabelText("Timezone")).toHaveValue("auto");
    expect(screen.getByLabelText("Clock format")).toHaveValue("24h");
    expect(screen.getByLabelText("First day of week")).toHaveValue("1");
  });

  it("lists a representative set of timezones as options", () => {
    renderSwitcher();

    expect(
      screen.getByRole("option", { name: "Auto (device timezone)" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "America/New York" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Asia/Tokyo" })
    ).toBeInTheDocument();
  });

  it("switching the timezone persists the choice", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.selectOptions(
      screen.getByLabelText("Timezone"),
      "Asia/Tokyo"
    );

    expect(screen.getByLabelText("Timezone")).toHaveValue("Asia/Tokyo");
    expect(
      JSON.parse(window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY) ?? "{}")
    ).toMatchObject({ timezone: "Asia/Tokyo" });
  });

  it("switching the clock format persists the choice", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.selectOptions(
      screen.getByLabelText("Clock format"),
      "12-hour (2:30 PM)"
    );

    expect(screen.getByLabelText("Clock format")).toHaveValue("12h");
    expect(
      JSON.parse(window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY) ?? "{}")
    ).toMatchObject({ clockFormat: "12h" });
  });

  it("switching the first day of week persists the choice", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.selectOptions(
      screen.getByLabelText("First day of week"),
      "Sunday"
    );

    expect(screen.getByLabelText("First day of week")).toHaveValue("7");
    expect(
      JSON.parse(window.localStorage.getItem(TIME_FORMAT_STORAGE_KEY) ?? "{}")
    ).toMatchObject({ firstDayOfWeek: 7 });
  });

  it("changing one preference does not reset the others", async () => {
    const user = userEvent.setup();
    renderSwitcher();

    await user.selectOptions(
      screen.getByLabelText("Clock format"),
      "12-hour (2:30 PM)"
    );
    await user.selectOptions(
      screen.getByLabelText("Timezone"),
      "Europe/London"
    );

    expect(screen.getByLabelText("Clock format")).toHaveValue("12h");
    expect(screen.getByLabelText("Timezone")).toHaveValue("Europe/London");
  });

  it("shows the resolved device timezone when 'auto' is selected", () => {
    renderSwitcher();
    expect(screen.getByText(/Following your device/i)).toBeInTheDocument();
  });
});
