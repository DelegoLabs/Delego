import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../messages/en.json";
import deMessages from "../messages/de.json";
import NotFound from "./not-found";

describe("NotFound", () => {
  it("renders the not-found copy from the en catalog", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <NotFound />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByText("The page you're looking for doesn't exist.")
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute(
      "href",
      "/"
    );
  });

  it("renders translated copy in German", () => {
    render(
      <NextIntlClientProvider locale="de" messages={deMessages}>
        <NotFound />
      </NextIntlClientProvider>
    );

    expect(
      screen.getByText("Die gesuchte Seite existiert nicht.")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Zur Startseite" })
    ).toBeInTheDocument();
  });
});
