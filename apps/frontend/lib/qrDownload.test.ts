import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatSafeFilename, generateQrSvgString, downloadQrCode } from "./qrDownload";

describe("qrDownload module", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("formatSafeFilename", () => {
    it("sanitizes special characters into safe underscore separators", () => {
      const filename = formatSafeFilename("order/123#abc!", "png");
      expect(filename).toBe("order_123_abc.png");
    });

    it("falls back to default checkout_qr if input is empty or invalid", () => {
      const filename = formatSafeFilename("   ", "svg");
      expect(filename).toBe("checkout_qr.svg");
    });
  });

  describe("generateQrSvgString", () => {
    it("generates valid SVG string containing xml/svg element", async () => {
      const uri = "web+stellar:pay?destination=GABC1234567890&amount=10";
      const svg = await generateQrSvgString(uri, 200);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    });

    it("throws error if URI is missing", async () => {
      await expect(generateQrSvgString("")).rejects.toThrow(/SEP-0007 URI is required/);
    });
  });

  describe("downloadQrCode", () => {
    it("creates temporary download link for SVG and revokes URL", async () => {
      const createObjectURLMock = vi.fn().mockReturnValue("blob:http://localhost/fake-blob");
      const revokeObjectURLMock = vi.fn();
      vi.stubGlobal("URL", {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      });

      const clickMock = vi.fn();
      const appendChildMock = vi.spyOn(document.body, "appendChild").mockImplementation(() => null as any);
      const removeChildMock = vi.spyOn(document.body, "removeChild").mockImplementation(() => null as any);

      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        if (tagName === "a") {
          return {
            href: "",
            download: "",
            click: clickMock,
          } as any;
        }
        return document.createElement(tagName);
      });

      await downloadQrCode("web+stellar:pay?destination=GABC", {
        format: "svg",
        sizePx: 300,
        fileName: "order-992",
      });

      expect(createObjectURLMock).toHaveBeenCalled();
      expect(clickMock).toHaveBeenCalled();
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:http://localhost/fake-blob");

      appendChildMock.mockRestore();
      removeChildMock.mockRestore();
    });
  });
});
