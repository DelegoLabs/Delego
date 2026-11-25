import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "vitest-axe";
import { server } from "../../tests/setup";
import type { DirectoryMerchant } from "../../lib/merchantDirectory";
import { MerchantDirectory } from "./MerchantDirectory";

const merchants: DirectoryMerchant[] = [
  {
    id: "acme",
    name: "Acme Groceries",
    category: "Food",
    verificationTier: "verified",
    reputationScore: 90,
    totalOrdersCompleted: 100,
  },
  {
    id: "bolt",
    name: "Bolt Electronics",
    category: "Electronics",
    verificationTier: "gold",
    reputationScore: 95,
    totalOrdersCompleted: 20,
  },
  {
    id: "cafe",
    name: "Corner Cafe",
    category: "Food",
    verificationTier: "pro",
    reputationScore: 75,
    totalOrdersCompleted: 4,
  },
  { id: "new?store", name: "New Store" },
];
const endpoint = "https://api.example.com/merchants/directory";
afterEach(cleanup);

async function loadDirectory(data = merchants) {
  server.use(http.get(endpoint, () => HttpResponse.json(data)));
  const result = render(<MerchantDirectory />);
  await screen.findByText(
    `${data.length} ${data.length === 1 ? "merchant" : "merchants"} found`
  );
  return result;
}

describe("Merchant Directory", () => {
  it("shows loading, shared badges, encoded links, and honest missing metadata", async () => {
    server.use(
      http.get(endpoint, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(merchants);
      })
    );
    render(<MerchantDirectory />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading merchants");
    await screen.findByText("4 merchants found");
    expect(screen.getByTestId("verification-badge-gold")).toHaveTextContent(
      "Top Rated"
    );
    expect(
      screen.getByRole("img", {
        name: /Reputation score 90\/100, derived from 100/,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Visit New Store" })
    ).toHaveAttribute("href", "/store/new%3Fstore");
    const card = screen.getByRole("link", { name: "New Store" }).closest("li")!;
    expect(within(card).getByText("Not verified")).toBeInTheDocument();
    expect(
      within(card).getByText("Reputation not published")
    ).toBeInTheDocument();
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
  });

  it("combines search, category, tier, and inclusive score filters, then clears them", async () => {
    await loadDirectory();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Search merchants"), "  ACME  ");
    await user.selectOptions(screen.getByLabelText("Category"), "Food");
    await user.selectOptions(
      screen.getByLabelText("Verification tier"),
      "verified"
    );
    await user.selectOptions(screen.getByLabelText("Minimum reputation"), "90");
    expect(screen.getByRole("status")).toHaveTextContent("1 merchant found");
    expect(
      screen.getByRole("link", { name: "Visit Acme Groceries" })
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByLabelText("Verification tier"),
      "gold"
    );
    expect(
      screen.getByText(/No merchants match your filters/)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveTextContent("4 merchants found");
    expect(screen.getByLabelText("Search merchants")).toHaveValue("");
    expect(screen.getByLabelText("Category")).toHaveValue("");
    expect(screen.getByLabelText("Verification tier")).toHaveValue("all");
    expect(screen.getByLabelText("Minimum reputation")).toHaveValue("");
  });

  it("filters every tier and excludes unpublished scores from minimum-score results", async () => {
    await loadDirectory();
    const user = userEvent.setup();
    for (const [tier, name] of [
      ["verified", "Acme Groceries"],
      ["gold", "Bolt Electronics"],
      ["pro", "Corner Cafe"],
      ["unverified", "New Store"],
    ]) {
      await user.selectOptions(
        screen.getByLabelText("Verification tier"),
        tier
      );
      expect(screen.getByRole("status")).toHaveTextContent("1 merchant found");
      expect(
        screen.getByRole("link", { name: `Visit ${name}` })
      ).toBeInTheDocument();
    }
    await user.selectOptions(screen.getByLabelText("Minimum reputation"), "50");
    expect(screen.getByRole("status")).toHaveTextContent("0 merchants found");
    await user.selectOptions(screen.getByLabelText("Verification tier"), "all");
    expect(screen.getByRole("status")).toHaveTextContent("3 merchants found");
  });

  it("distinguishes an empty directory from no matches", async () => {
    await loadDirectory([]);
    expect(screen.getByText(/No merchants are listed yet/)).toBeInTheDocument();
  });

  it("shows API errors instead of an empty directory", async () => {
    server.use(
      http.get(endpoint, () => new HttpResponse(null, { status: 503 }))
    );
    render(<MerchantDirectory />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to load merchants"
    );
    expect(
      screen.queryByText(/No merchants are listed/)
    ).not.toBeInTheDocument();
  });

  it("does not invent an order count for a published reputation score", async () => {
    await loadDirectory([{ id: "new", name: "New Store", reputationScore: 0 }]);
    expect(screen.getByText("Reputation: 0/100")).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /derived from/ })
    ).not.toBeInTheDocument();
  });

  it("has accessible controls and cards", async () => {
    const { container } = await loadDirectory();
    expect(await axe(container)).toHaveNoViolations();
  });
});
