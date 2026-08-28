// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * `lib/canonicalHost` reads `NEXT_PUBLIC_CANONICAL_HOSTS` from `lib/env` at
 * import time, so each scenario stubs `process.env` and re-imports the
 * component fresh (same pattern as lib/api.test.ts) rather than importing
 * it once at module scope.
 */
async function renderBanner() {
  const { DomainWarningBanner } = await import("./DomainWarningBanner.js");
  return render(<DomainWarningBanner />);
}

function setHostname(hostname: string) {
  const originalLocation = window.location;
  // @ts-expect-error -- overriding window.location for the test
  delete window.location;
  // @ts-expect-error -- partial Location stub is enough for this component
  window.location = { ...originalLocation, hostname };
  return () => {
    window.location = originalLocation;
  };
}

describe("DomainWarningBanner", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    window.sessionStorage.clear();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("renders nothing when no canonical hosts are configured (feature inert)", async () => {
    delete process.env.NEXT_PUBLIC_CANONICAL_HOSTS;
    const restore = setHostname("totally-not-delego.com");
    await renderBanner();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    restore();
  });

  it("renders nothing on the canonical host", async () => {
    process.env.NEXT_PUBLIC_CANONICAL_HOSTS = "delego.app";
    const restore = setHostname("delego.app");
    await renderBanner();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    restore();
  });

  it("renders nothing on allowlisted dev/preview hosts", async () => {
    process.env.NEXT_PUBLIC_CANONICAL_HOSTS = "delego.app";
    const restore = setHostname("localhost");
    await renderBanner();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    restore();
  });

  it("warns on a lookalike-host simulation, with the security contact linked", async () => {
    process.env.NEXT_PUBLIC_CANONICAL_HOSTS = "delego.app";
    const restore = setHostname("de1ego.app");
    await renderBanner();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/You're not on delego\.app/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "security@delego.app" })
    ).toHaveAttribute("href", "mailto:security@delego.app");
    restore();
  });

  it("dismisses for the session and does not resurface after remount", async () => {
    process.env.NEXT_PUBLIC_CANONICAL_HOSTS = "delego.app";
    const restore = setHostname("de1ego.app");
    const user = userEvent.setup();

    const { unmount } = await renderBanner();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    await user.click(
      screen.getByRole("button", { name: "Dismiss domain warning" })
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());

    unmount();
    await renderBanner();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());

    restore();
  });
});
