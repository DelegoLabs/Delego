import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Card } from "./Card.js";

describe("Card", () => {
  it("renders children", () => {
    render(
      <Card>
        <p>Test content</p>
      </Card>,
    );
    expect(screen.getByText("Test content")).toBeDefined();
  });

  it("renders with title when provided", () => {
    render(
      <Card title="My Card">
        <p>Content</p>
      </Card>,
    );
    expect(screen.getByText("My Card")).toBeDefined();
  });

  it("titles the card as an h3 by default", () => {
    render(
      <Card title="My Card">
        <p>Content</p>
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 3, name: "My Card" })).toBeDefined();
  });

  it("honours titleLevel so a card under an h1 does not skip a level", () => {
    // Lighthouse gates accessibility at 0.95 and `heading-order` is one of the
    // audits that scored it down: an h1 followed by the default h3 skips h2.
    render(
      <Card title="Delegations" titleLevel={2}>
        <p>Content</p>
      </Card>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Delegations" })).toBeDefined();
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });

  it("gives the title the id its aria-labelled region points at", () => {
    render(
      <Card title="Orders" titleLevel={2} id="orders-card">
        <p>Content</p>
      </Card>,
    );
    expect(document.getElementById("orders-card-title")?.tagName).toBe("H2");
  });

  it("applies custom styles", () => {
    const { container } = render(
      <Card style={{ backgroundColor: "red" }}>Content</Card>,
    );
    const card = container.querySelector("div");
    expect(card?.style.backgroundColor).toBe("red");
  });

  describe("Accessibility", () => {
    it("has no accessibility violations", async () => {
      const { container } = render(
        <Card title="Delegation details" ariaLabel="Delegation details">
          <p>Card body text</p>
        </Card>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations with custom aria attributes", async () => {
      const { container } = render(
        <Card aria-expanded="true" ariaLabel="Expanded card">
          <p>Expanded details</p>
        </Card>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("renders with region role", () => {
      const { container } = render(<Card>Content</Card>);
      const card = container.querySelector("[role='region']");
      expect(card).toBeDefined();
    });

    it("supports custom aria-label", () => {
      const { container } = render(
        <Card ariaLabel="Delegation details">Content</Card>,
      );
      const card = container.querySelector("[aria-label='Delegation details']");
      expect(card).toBeDefined();
    });

    it("supports aria-describedby", () => {
      const { container } = render(
        <Card ariaDescribedBy="description-123">Content</Card>,
      );
      const card = container.querySelector(
        "[aria-describedby='description-123']",
      );
      expect(card).toBeDefined();
    });

    it("generates unique IDs for cards", () => {
      const { container } = render(
        <>
          <Card>Card 1</Card>
          <Card>Card 2</Card>
        </>,
      );
      const cards = container.querySelectorAll("[role='region']");
      expect(cards.length).toBe(2);
      expect(cards[0].id).not.toBe(cards[1].id);
    });

    it("connects title to card with ID", () => {
      render(<Card title="Card Title">Content</Card>);
      const title = screen.getByText("Card Title");
      expect(title.id).toMatch(/^card-.*-title$/);
    });

    it("spreads additional aria attributes", () => {
      const { container } = render(<Card aria-expanded="true">Content</Card>);
      const card = container.querySelector("[aria-expanded='true']");
      expect(card).toBeDefined();
    });
  });
});

