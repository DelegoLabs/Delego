import { describe, expect, it } from "vitest";
import {
  barcodeSvgToDataUrl,
  isEmbeddableLabelUrl,
  returnAddressLines,
} from "./returnLabel";

describe("returnAddressLines", () => {
  it("splits on newlines and commas, trimming and dropping blanks", () => {
    expect(
      returnAddressLines("12 Warehouse Rd\n, Unit 4,\n\n Lagos ")
    ).toEqual(["12 Warehouse Rd", "Unit 4", "Lagos"]);
  });
});

describe("isEmbeddableLabelUrl", () => {
  it("allows http(s) and blob URLs", () => {
    expect(isEmbeddableLabelUrl("https://carrier.example/label.pdf")).toBe(true);
    expect(isEmbeddableLabelUrl("blob:https://app.example/xyz")).toBe(true);
  });

  it("rejects script-bearing and unparseable URLs", () => {
    expect(isEmbeddableLabelUrl("javascript:alert(1)")).toBe(false);
    expect(isEmbeddableLabelUrl("data:text/html,<script>1</script>")).toBe(false);
  });
});

describe("barcodeSvgToDataUrl", () => {
  const validSvg = '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>';

  it("encodes a self-contained SVG as a base64 data URL", () => {
    const url = barcodeSvgToDataUrl(validSvg);
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("rejects non-SVG values", () => {
    expect(barcodeSvgToDataUrl("<div>nope</div>")).toBeNull();
    expect(barcodeSvgToDataUrl("just text")).toBeNull();
  });

  it("rejects SVGs containing scripts or event handlers", () => {
    expect(
      barcodeSvgToDataUrl('<svg><script>alert(1)</script></svg>')
    ).toBeNull();
    expect(
      barcodeSvgToDataUrl('<svg onload="alert(1)"></svg>')
    ).toBeNull();
  });
});
