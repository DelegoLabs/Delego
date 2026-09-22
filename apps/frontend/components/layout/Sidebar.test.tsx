import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { Sidebar } from "./Sidebar";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));
vi.mock("../tour/TourProvider", () => ({
  useTour: () => ({ start: vi.fn(), active: false, stepIndex: 0 }),
}));

describe("Sidebar", () => {
  it("renders nav labels from the en message catalog", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Sidebar />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByRole("link", { name: /dashboard/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Primary navigation" })
    ).toBeInTheDocument();
  });

  it("renders translated nav labels for a locale with full nav coverage", () => {
    render(
      <NextIntlClientProvider locale="de" messages={deMessages}>
        <Sidebar />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByRole("link", { name: /Übersicht/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: "Hauptnavigation" })
    ).toBeInTheDocument();
  });
});
