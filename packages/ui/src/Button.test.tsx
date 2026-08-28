import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Button } from "./Button.js";

describe("Button", () => {
  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeDefined();
  });

  it("renders primary by default with blue background", () => {
    const { container } = render(<Button>Default</Button>);
    const button = container.querySelector("button");
    expect(button?.style.background).toBe("rgb(37, 99, 235)");
  });

  it("renders secondary variant with grey background", () => {
    const { container } = render(
      <Button variant="secondary">Secondary</Button>,
    );
    const button = container.querySelector("button");
    expect(button?.style.background).toBe("rgb(229, 231, 235)");
  });

  it("renders ghost variant with transparent background", () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    const button = container.querySelector("button");
    expect(button?.style.background).toBe("transparent");
  });

  it("renders destructive variant with red background", () => {
    const { container } = render(
      <Button variant="destructive">Reject</Button>,
    );
    const button = container.querySelector("button");
    expect(button?.style.background).toBe("rgb(220, 38, 38)");
  });

  it("spreads additional props", () => {
    render(<Button data-testid="my-btn">Styled</Button>);
    expect(screen.getByTestId("my-btn")).toBeDefined();
  });

  describe("Accessibility", () => {
    it("has no accessibility violations", async () => {
      const { container } = render(<Button>Click Button</Button>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations across variants and states", async () => {
      const { container } = render(
        <>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button ariaLabel="Close dialog">X</Button>
        </>
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("renders with proper button type", () => {
      const { container } = render(<Button>Click Button</Button>);
      const button = container.querySelector("button");
      expect(button?.getAttribute("type")).toBe("button");
    });

    it("supports custom aria-label", () => {
      render(<Button ariaLabel="Delete item">X</Button>);
      const button = screen.getByRole("button", { name: /delete item/i });
      expect(button).toBeDefined();
    });

    it("is keyboard accessible as button element", () => {
      const { container } = render(<Button>Keyboard Test</Button>);
      const button = container.querySelector("button");
      expect(button?.tagName).toBe("BUTTON");
    });

    it("is disabled when disabled prop is set", () => {
      const { container } = render(<Button disabled>Disabled Button</Button>);
      const button = container.querySelector("button");
      expect(button?.disabled).toBe(true);
    });

    it("has smooth transition for interactions", () => {
      const { container } = render(<Button>Hover me</Button>);
      const button = container.querySelector("button");
      expect(button?.style.transition).toBe("all 0.2s ease-in-out");
    });
  });
});

