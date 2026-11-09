import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SafeStorefrontDescription } from "./SafeStorefrontDescription";

describe("SafeStorefrontDescription (Issue #1026)", () => {
  it("renders safe HTML formatting correctly", () => {
    const dirtyHtml =
      "<p>Welcome to <b>Delego</b> store! <i>Fast</i> shipping.</p>";
    render(<SafeStorefrontDescription dirtyHtml={dirtyHtml} />);

    const container = screen.getByTestId("safe-storefront-description");
    expect(container).toBeDefined();
    expect(container.innerHTML).toBe(dirtyHtml);
  });

  it("applies containerClassName prop to the wrapper div", () => {
    const dirtyHtml = "<p>Store description</p>";
    render(
      <SafeStorefrontDescription
        dirtyHtml={dirtyHtml}
        containerClassName="storefront-desc-custom-class"
      />
    );

    const container = screen.getByTestId("safe-storefront-description");
    expect(container.className).toBe("storefront-desc-custom-class");
  });

  it("neutralizes script execution vectors from merchant HTML", () => {
    const maliciousHtml =
      '<p>Real store</p><script>window.__hacked = true; alert("XSS")</script>';
    render(<SafeStorefrontDescription dirtyHtml={maliciousHtml} />);

    const container = screen.getByTestId("safe-storefront-description");
    expect(container.innerHTML).not.toContain("<script>");
    expect(container.innerHTML).not.toContain("alert");
    expect(container.innerHTML).toContain("<p>Real store</p>");
  });

  it("strips malicious event handlers and images with onerror", () => {
    const maliciousHtml =
      '<p>Our products <img src="x" onerror="document.location=\'http://attacker.com\'" /></p>';
    render(<SafeStorefrontDescription dirtyHtml={maliciousHtml} />);

    const container = screen.getByTestId("safe-storefront-description");
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.innerHTML).not.toContain("<img");
    expect(container.innerHTML).toBe("<p>Our products </p>");
  });

  it("returns null when dirtyHtml is empty or sanitizes to nothing", () => {
    const { container: emptyContainer } = render(
      <SafeStorefrontDescription dirtyHtml="" />
    );
    expect(emptyContainer.firstChild).toBeNull();

    const { container: scriptOnlyContainer } = render(
      <SafeStorefrontDescription dirtyHtml="<script>alert(1)</script>" />
    );
    expect(scriptOnlyContainer.firstChild).toBeNull();
  });

  it("respects allowedTags override prop", () => {
    const mixedHtml = "<p>Paragraph with <b>bold</b> and <i>italic</i></p>";
    render(
      <SafeStorefrontDescription
        dirtyHtml={mixedHtml}
        allowedTags={["p", "b"]}
      />
    );

    const container = screen.getByTestId("safe-storefront-description");
    expect(container.innerHTML).toContain("<b>bold</b>");
    expect(container.innerHTML).not.toContain("<i>");
  });
});
