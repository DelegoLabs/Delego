import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { BackOnlineToast } from "./BackOnlineToast";

const messages = {
  offline: {
    backOnline: "Back Online",
    dismissBackOnline: "Dismiss",
  },
};

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    get: () => value,
  });
}

describe("BackOnlineToast", () => {
  it("shows a celebratory toast only after an offline-to-online transition", async () => {
    setOnline(true);
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <BackOnlineToast />
      </NextIntlClientProvider>
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await act(async () => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await act(async () => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.getByRole("status")).toHaveTextContent("Back Online");
  });
});
