import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { NetworkProvider } from "../../hooks/useNetwork";
import { server } from "../../mocks/server";
import {
  DEFAULT_MAX_FEE_CAP_STROOPS,
  MAX_FEE_CAP_STORAGE_KEY,
} from "../../lib/maxFeeCap";
import { MaxFeeCapCard } from "./MaxFeeCapCard";

const TESTNET_FEE_STATS_URL = "https://horizon-testnet.stellar.org/fee_stats";

function renderCard() {
  return render(<MaxFeeCapCard />, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <NetworkProvider>{children}</NetworkProvider>
    ),
  });
}

describe("MaxFeeCapCard", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("shows the default limit when nothing is stored", async () => {
    renderCard();

    await waitFor(() => {
      expect(
        screen.getByLabelText(/max fee limit in xlm/i)
      ).toHaveValue("0.01");
    });
    expect(screen.getByText("Current limit")).toBeInTheDocument();
  });

  it("persists a new limit", async () => {
    renderCard();
    const input = await screen.findByLabelText(/max fee limit in xlm/i);

    fireEvent.change(input, { target: { value: "0.25" } });
    fireEvent.click(screen.getByRole("button", { name: /save limit/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem(MAX_FEE_CAP_STORAGE_KEY)).toBe(
        "2500000"
      );
    });
    expect(screen.getByText(/max fee limit updated/i)).toBeInTheDocument();
  });

  it("rejects a limit of zero and keeps the stored preference", async () => {
    window.localStorage.setItem(MAX_FEE_CAP_STORAGE_KEY, "250000");
    renderCard();
    const input = await screen.findByLabelText(/max fee limit in xlm/i);

    await waitFor(() => {
      expect(input).toHaveValue("0.025");
    });

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: /save limit/i }));

    expect(screen.getByText(/at least 1 stroop/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(MAX_FEE_CAP_STORAGE_KEY)).toBe(
      "250000"
    );
  });

  it("resets the limit back to the default", async () => {
    window.localStorage.setItem(MAX_FEE_CAP_STORAGE_KEY, "250000");
    renderCard();
    await screen.findByLabelText(/max fee limit in xlm/i);

    fireEvent.click(screen.getByRole("button", { name: /reset to default/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem(MAX_FEE_CAP_STORAGE_KEY)).toBe(
        DEFAULT_MAX_FEE_CAP_STROOPS
      );
    });
  });

  it("reports the live recommended fee and the network status", async () => {
    server.use(
      http.get(TESTNET_FEE_STATS_URL, () =>
        HttpResponse.json({
          last_ledger_base_fee: "250000",
          max_fee: { p50: "250000", p95: "500000" },
        })
      )
    );
    renderCard();

    await waitFor(() => {
      expect(screen.getByText(/congested/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Recommended fee now")).toBeInTheDocument();
    expect(screen.getByText(/500,000 stroops/)).toBeInTheDocument();
  });

  it("says so when live network fees are unavailable", async () => {
    server.use(
      http.get(TESTNET_FEE_STATS_URL, () => new HttpResponse(null, { status: 503 }))
    );
    renderCard();

    await waitFor(() => {
      expect(
        screen.getByText(/live network fees are unavailable/i)
      ).toBeInTheDocument();
    });
  });

  it("does not warn the user about a normal network", async () => {
    renderCard();

    await waitFor(() => {
      expect(screen.getByText("Normal")).toBeInTheDocument();
    });
  });
});
