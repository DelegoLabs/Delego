import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SafeExternalLink,
  resolveSafeExternalHref,
} from "../SafeExternalLink";

describe("resolveSafeExternalHref", () => {
  it("keeps https links as-is", () => {
    expect(resolveSafeExternalHref("https://stellar.org/docs")).toBe(
      "https://stellar.org/docs"
    );
  });

  it("upgrades http links to https", () => {
    expect(resolveSafeExternalHref("http://stellar.org/docs")).toBe(
      "https://stellar.org/docs"
    );
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/123",
  ])("rejects dangerous protocol %s", (href) => {
    expect(resolveSafeExternalHref(href)).toBeNull();
    expect(resolveSafeExternalHref(href, false)).toBeNull();
  });

  it("rejects relative and malformed URLs", () => {
    expect(resolveSafeExternalHref("/settings")).toBeNull();
    expect(resolveSafeExternalHref("not a url")).toBeNull();
    expect(resolveSafeExternalHref("")).toBeNull();
  });

  it("rejects non-https schemes only while validating", () => {
    expect(resolveSafeExternalHref("mailto:help@delego.io")).toBeNull();
    expect(resolveSafeExternalHref("mailto:help@delego.io", false)).toBe(
      "mailto:help@delego.io"
    );
  });
});

describe("SafeExternalLink", () => {
  it("renders a new-tab link with noopener noreferrer and an external icon", () => {
    render(<SafeExternalLink href="https://stellar.expert" label="Explorer" />);
    const link = screen.getByRole("link", { name: /explorer/i });
    expect(link).toHaveAttribute("href", "https://stellar.expert/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByTestId("external-link-icon")).toBeInTheDocument();
  });

  it("renders the upgraded https URL for http input", () => {
    render(<SafeExternalLink href="http://stellar.expert/tx/1" label="Tx" />);
    expect(screen.getByRole("link", { name: /tx/i })).toHaveAttribute(
      "href",
      "https://stellar.expert/tx/1"
    );
  });

  it.each(["javascript:alert(document.cookie)", "data:text/html,<b>x</b>"])(
    "disables %s instead of rendering an anchor",
    (href) => {
      const { container } = render(
        <SafeExternalLink href={href} label="Click me" />
      );
      expect(container.querySelector("a")).toBeNull();
      const blocked = screen.getByTestId("safe-external-link-blocked");
      expect(blocked).toHaveTextContent("Click me");
      expect(blocked).toHaveAttribute("aria-disabled", "true");
      expect(screen.queryByTestId("external-link-icon")).toBeNull();
    }
  );

  it("still blocks dangerous protocols when validation is turned off", () => {
    const { container } = render(
      <SafeExternalLink
        href="javascript:void(0)"
        label="Nope"
        validateProtocol={false}
      />
    );
    expect(container.querySelector("a")).toBeNull();
  });
});
