// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import deMessages from "../../messages/de.json";
import { Footer } from "./Footer";

vi.mock("./LocaleSelector", () => ({ LocaleSelector: () => null }));

describe("Footer", () => {
  it("localizes its copyright and exposes accessible secondary links", () => {
    render(
      <NextIntlClientProvider locale="de" messages={deMessages}>
        <Footer />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByText(`© ${new Date().getFullYear()} Delego`)
    ).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", {
      name: "Rechtliche Hinweise und Dienste",
    });
    expect(screen.getByRole("link", { name: "Datenschutz" })).toHaveAttribute(
      "href",
      "https://delego.app/privacy"
    );
    expect(
      screen.getByRole("link", { name: "Nutzungsbedingungen" })
    ).toHaveAttribute("href", "https://delego.app/terms");
    expect(screen.getByRole("link", { name: "Status" })).toHaveAttribute(
      "href",
      "https://status.delego.app"
    );
    expect(navigation).toContainElement(
      screen.getByRole("link", { name: "Datenschutz" })
    );
  });
});
