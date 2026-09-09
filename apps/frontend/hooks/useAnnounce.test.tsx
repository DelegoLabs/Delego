import { describe, it, expect } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AnnounceProvider, useAnnounce } from "./useAnnounce";

function Announcer({
  message,
  assertive = false,
}: {
  message: string;
  assertive?: boolean;
}) {
  const { announce } = useAnnounce();
  return (
    <button
      type="button"
      onClick={() => announce(message, assertive ? "assertive" : "polite")}
    >
      Trigger
    </button>
  );
}

describe("useAnnounce", () => {
  it("renders empty polite and assertive live regions by default", () => {
    render(
      <AnnounceProvider>
        <div />
      </AnnounceProvider>
    );

    const regions = document.querySelectorAll("[aria-live]");
    expect(regions).toHaveLength(2);
    regions.forEach((region) => expect(region.textContent).toBe(""));
  });

  it("announces a message into the polite region", async () => {
    render(
      <AnnounceProvider>
        <Announcer message="Order approved." />
      </AnnounceProvider>
    );

    screen.getByText("Trigger").click();

    await waitFor(() => {
      const politeRegion = document.querySelector('[aria-live="polite"]');
      expect(politeRegion?.textContent).toBe("Order approved.");
    });
  });

  it("announces a message into the assertive region", async () => {
    render(
      <AnnounceProvider>
        <Announcer message="Something failed." assertive />
      </AnnounceProvider>
    );

    screen.getByText("Trigger").click();

    await waitFor(() => {
      const assertiveRegion = document.querySelector('[aria-live="assertive"]');
      expect(assertiveRegion?.textContent).toBe("Something failed.");
    });
  });

  it("keeps independent polite and assertive announcements from cancelling each other", async () => {
    function DualAnnouncer() {
      const { announce } = useAnnounce();
      return (
        <button
          type="button"
          onClick={() => {
            announce("Order approved.", "polite");
            announce("Something failed.", "assertive");
          }}
        >
          Trigger both
        </button>
      );
    }

    render(
      <AnnounceProvider>
        <DualAnnouncer />
      </AnnounceProvider>
    );

    await act(async () => {
      screen.getByText("Trigger both").click();
    });

    await waitFor(() => {
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
        "Order approved."
      );
      expect(
        document.querySelector('[aria-live="assertive"]')?.textContent
      ).toBe("Something failed.");
    });
  });

  it("falls back gracefully when used outside an AnnounceProvider", () => {
    let result: ReturnType<typeof useAnnounce> | undefined;
    function Bare() {
      result = useAnnounce();
      return null;
    }
    expect(() => render(<Bare />)).not.toThrow();
    expect(typeof result?.announce).toBe("function");
  });
});
