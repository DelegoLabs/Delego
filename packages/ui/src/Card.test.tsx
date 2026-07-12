import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "./Card.js";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Content</Card>);
    expect(screen.getByText("Content")).toBeDefined();
  });

  it("renders title when provided", () => {
    render(<Card title="My Card">Body</Card>);
    expect(screen.getByText("My Card")).toBeDefined();
  });

  it("does not render title when omitted", () => {
    const { container } = render(<Card>Body</Card>);
    expect(container.querySelector(".card-title")).toBeNull();
  });
});