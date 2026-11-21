import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { config as middlewareConfig } from "../middleware";

/**
 * Favicon assets (#1096): browsers request /favicon.ico on every route, which
 * 404'd because public/ had none. public/favicon.ico covers that request and
 * app/icon.svg is the scalable brand mark Next.js links from <head>.
 */
const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file));

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parseIco(buf: Buffer) {
  const reserved = buf.readUInt16LE(0);
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  const entries = Array.from({ length: count }, (_, i) => {
    const base = 6 + i * 16;
    const size = buf.readUInt8(base) || 256;
    const bytes = buf.readUInt32LE(base + 8);
    const offset = buf.readUInt32LE(base + 12);
    return { size, bytes, offset, data: buf.subarray(offset, offset + bytes) };
  });
  return { reserved, type, entries };
}

describe("public/favicon.ico", () => {
  const ico = parseIco(read("public/favicon.ico"));

  it("is a valid ICO container", () => {
    expect(ico.reserved).toBe(0);
    expect(ico.type).toBe(1);
  });

  it("contains 16, 32 and 48px images", () => {
    expect(ico.entries.map((e) => e.size)).toEqual([16, 32, 48]);
  });

  it("embeds a PNG for every entry, within the file bounds", () => {
    const file = read("public/favicon.ico");
    for (const entry of ico.entries) {
      expect(entry.offset + entry.bytes).toBeLessThanOrEqual(file.length);
      expect(entry.data.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    }
  });
});

describe("app/icon.svg", () => {
  const svg = read("app/icon.svg").toString("utf8");

  it("is a square SVG with a viewBox so it scales to any size", () => {
    expect(svg).toMatch(/<svg[^>]+viewBox="0 0 512 512"/);
  });

  it("uses the same brand colour as the PWA manifest", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest").toString("utf8"));
    expect(svg.toLowerCase()).toContain(manifest.theme_color.toLowerCase());
  });
});

describe("middleware matcher", () => {
  it("serves /favicon.ico as a static file without running middleware", () => {
    const pattern = new RegExp(`^${middlewareConfig.matcher[0]}$`);
    expect(pattern.test("/favicon.ico")).toBe(false);
    expect(pattern.test("/orders")).toBe(true);
  });
});
