// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoBanner } from "./DemoBanner";
import { enableDemoMode, isDemoMode } from "../../lib/demoMode";

describe("DemoBanner", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("renders nothing when demo mode is off", async () => {
    render(<DemoBanner />);
    // The component starts hidden and only reveals itself in an effect
    // (see the hydration-safety note in DemoBanner.tsx) — give it a tick.
    await waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  it("renders an unmissable banner when demo mode is on", async () => {
    enableDemoMode();
    render(<DemoBanner />);

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(screen.getByText(/Demo — no real funds/)).toBeInTheDocument();
  });

  it("exits demo mode when the exit button is clicked", async () => {
    enableDemoMode();
    const originalLocation = window.location;
    // @ts-expect-error -- overriding window.location for the test
    delete window.location;
    // @ts-expect-error -- partial Location stub is enough for this assertion
    window.location = { href: "" };

    const user = userEvent.setup();
    render(<DemoBanner />);

    const exitButton = await screen.findByRole("button", { name: "Exit demo" });
    await user.click(exitButton);

    expect(isDemoMode()).toBe(false);
    expect(window.location.href).toBe("/");

    window.location = originalLocation;
  });
});
