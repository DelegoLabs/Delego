import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { axe } from "vitest-axe";
import { APP_CONTENT_ID, SkipToContent } from "./SkipToContent";
import en from "../../messages/en.json";
import de from "../../messages/de.json";

/** Mirrors the landmark structure of app/layout.tsx. */
function Layout() {
  return (
    <NextIntlClientProvider locale="en" messages={en}>
      <SkipToContent />
      <nav aria-label="Primary">
        <button type="button">Orders</button>
        <button type="button">Settings</button>
      </nav>
      <main id={APP_CONTENT_ID} className="app-content" tabIndex={-1}>
        <h1>Dashboard</h1>
        <button type="button">First action</button>
      </main>
    </NextIntlClientProvider>
  );
}

const LABEL = en.nav.skipToContent;

describe("SkipToContent", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("links to the layout's main landmark", () => {
    render(<Layout />);
    const link = screen.getByRole("link", { name: LABEL });
    expect(link).toHaveAttribute("href", `#${APP_CONTENT_ID}`);
    expect(link).toHaveClass("skip-to-content");
    expect(link.getAttribute("href")).toBe(`#${screen.getByRole("main").id}`);
  });

  it("uses the translated label", () => {
    render(
      <NextIntlClientProvider locale="de" messages={de}>
        <SkipToContent />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByRole("link", { name: de.nav.skipToContent })
    ).toBeInTheDocument();
  });

  it("is the first element reached with Tab", async () => {
    const user = userEvent.setup();
    render(<Layout />);
    await user.tab();
    expect(screen.getByRole("link", { name: LABEL })).toHaveFocus();
  });

  it("moves focus to the main landmark when activated with Enter", async () => {
    const user = userEvent.setup();
    render(<Layout />);
    await user.tab();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("main")).toHaveFocus();
    expect(window.location.hash).toBe(`#${APP_CONTENT_ID}`);
  });

  it("continues tabbing from inside the main content, bypassing navigation", async () => {
    const user = userEvent.setup();
    render(<Layout />);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.tab();
    expect(screen.getByRole("button", { name: "First action" })).toHaveFocus();
  });

  it("falls back to native anchor behaviour when the target is missing", async () => {
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <SkipToContent />
      </NextIntlClientProvider>
    );
    const link = screen.getByRole("link");
    await user.click(link);
    expect(link).toHaveFocus();
  });

  describe("axe-core audit", () => {
    // `skip-link` is a best-practice rule, so it's enabled explicitly alongside
    // the WCAG 2.1 A/AA tags e2e/a11y.spec.ts gates on.
    const options = {
      runOnly: {
        type: "tag" as const,
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
      rules: { "skip-link": { enabled: true } },
    };

    it("has no skip-link or WCAG 2.1 A/AA violations", async () => {
      const { container } = render(<Layout />);
      const results = await axe(container, options);
      expect(results.violations.filter((v) => v.id === "skip-link")).toEqual([]);
      expect(results).toHaveNoViolations();
    });

    it("has no violations while the link is focused", async () => {
      const user = userEvent.setup();
      const { container } = render(<Layout />);
      await user.tab();
      expect(await axe(container, options)).toHaveNoViolations();
    });

    it("has no violations after focus moves to the main landmark", async () => {
      const user = userEvent.setup();
      const { container } = render(<Layout />);
      await user.tab();
      await user.keyboard("{Enter}");
      expect(await axe(container, options)).toHaveNoViolations();
    });
  });
});
