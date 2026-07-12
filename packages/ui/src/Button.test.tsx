import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
    const { container } = render(<Button variant="secondary">Secondary</Button>);
    const button = container.querySelector("button");
    expect(button?.style.background).toBe("rgb(229, 231, 235)");
  });

  it("renders ghost variant with transparent background", () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    const button = container.querySelector("button");
    expect(button?.style.background).toBe("transparent");
  });

  it("spreads additional props", () => {
    render(<Button data-testid="my-btn">Styled</Button>);
    expect(screen.getByTestId("my-btn")).toBeDefined();
  });
});