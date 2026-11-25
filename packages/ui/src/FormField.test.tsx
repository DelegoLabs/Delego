import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { FormField } from "./FormField.js";

describe("FormField", () => {
  it("renders label and input", () => {
    render(<FormField label="Email" inputProps={{ type: "email" }} />);
    expect(screen.getByLabelText("Email")).toBeDefined();
  });

  it("renders required indicator when required", () => {
    const { container } = render(
      <FormField label="Name" required inputProps={{ type: "text" }} />,
    );
    const requiredSpan = container.querySelector('[aria-label="required"]');
    expect(requiredSpan).toBeDefined();
  });

  it("renders hint text when provided", () => {
    render(
      <FormField
        label="Password"
        hint="Minimum 8 characters"
        inputProps={{ type: "password" }}
      />,
    );
    expect(screen.getByText("Minimum 8 characters")).toBeDefined();
  });

  it("renders error message with alert role", () => {
    render(
      <FormField
        label="Email"
        error="Email is invalid"
        inputProps={{ type: "email" }}
      />,
    );
    const errorAlert = screen.getByRole("alert");
    expect(errorAlert).toBeDefined();
    expect(errorAlert.textContent).toBe("Email is invalid");
  });

  describe("Accessibility", () => {
    it("has no accessibility violations in default state", async () => {
      const { container } = render(
        <FormField
          label="Username"
          hint="Choose a unique username"
          inputProps={{ type: "text" }}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations in error state", async () => {
      const { container } = render(
        <FormField
          label="Email address"
          error="Please enter a valid email"
          required
          inputProps={{ type: "email" }}
        />
      );
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("connects label to input with htmlFor", () => {
      render(
        <FormField
          label="Username"
          inputProps={{ id: "user-input", type: "text" }}
        />,
      );
      const label = screen.getByText("Username");
      expect(label.getAttribute("for")).toBe("user-input");
    });

    it("generates unique IDs when not provided", () => {
      const { container } = render(
        <>
          <FormField label="First" inputProps={{ type: "text" }} />
          <FormField label="Second" inputProps={{ type: "text" }} />
        </>,
      );
      const inputs = container.querySelectorAll("input");
      expect(inputs[0].id).not.toBe(inputs[1].id);
    });

    it("keeps its generated ID stable during hydration", async () => {
      const element = <FormField label="Hydrated field" />;
      const container = document.createElement("div");
      container.innerHTML = renderToString(element);
      const serverId = container.querySelector("input")?.id;
      const recoverableErrors: Error[] = [];

      let root: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, element, {
          onRecoverableError: (error) => recoverableErrors.push(error),
        });
      });

      expect(container.querySelector("input")?.id).toBe(serverId);
      expect(recoverableErrors).toHaveLength(0);

      await act(async () => root.unmount());
    });

    it("connects aria-describedby to hint when present", () => {
      const { container } = render(
        <FormField
          label="Amount"
          hint="In XLM"
          inputProps={{ type: "number" }}
        />,
      );
      const input = container.querySelector("input");
      expect(input?.getAttribute("aria-describedby")).toContain("hint");
    });

    it("connects aria-describedby to error when present", () => {
      const { container } = render(
        <FormField
          label="Email"
          error="Invalid format"
          inputProps={{ type: "email" }}
        />,
      );
      const input = container.querySelector("input");
      expect(input?.getAttribute("aria-describedby")).toContain("error");
    });

    it("sets aria-invalid when error exists", () => {
      const { container } = render(
        <FormField
          label="Email"
          error="Invalid format"
          inputProps={{ type: "email" }}
        />,
      );
      const input = container.querySelector("input");
      expect(input?.getAttribute("aria-invalid")).toBe("true");
    });

    it("displays required indicator with proper styling", () => {
      const { container } = render(
        <FormField
          label="Required Field"
          required
          inputProps={{ type: "text" }}
        />,
      );
      const requiredSpan = container.querySelector(
        '[aria-label="required"]',
      ) as HTMLElement;
      expect(requiredSpan?.style.color).toBe("rgb(220, 38, 38)");
    });
  });
});

