/**
 * Code 128 barcode encoder (#1009) — the symbology FedEx, DHL and USPS print
 * on shipping labels. Pure and dependency-free so the same bar pattern feeds
 * both the on-screen SVG preview and the jsPDF label.
 *
 * Uses Code Set B for printable ASCII and switches to Code Set C (two digits
 * per symbol) for digit runs, which is how carrier tracking numbers — mostly
 * long digit strings — stay short enough to scan reliably.
 */

/**
 * Bar/space module widths for symbol values 0–106 (106 = stop, which has a
 * trailing 2-module termination bar). Each symbol is bar, space, bar, space,
 * bar, space[, bar] and spans 11 modules (stop: 13).
 */
export const CODE128_PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const START_B = 104;
const START_C = 105;
const CODE_B = 100; // switch to set B (from C)
const CODE_C = 99; // switch to set C (from B)
const STOP = 106;

export interface Code128Encoding {
  /** Symbol values including start, checksum and stop. */
  values: number[];
  /** Concatenated module widths, alternating bar/space starting with a bar. */
  widths: number[];
  /** Total width in modules, excluding quiet zones. */
  totalModules: number;
}

export class Code128Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Code128Error";
  }
}

/** Code 128 B covers ASCII 32–126 (no control characters). */
export function isCode128Encodable(text: string): boolean {
  return text.length > 0 && /^[\x20-\x7e]+$/.test(text);
}

function digitRunLength(text: string, from: number): number {
  let n = 0;
  while (from + n < text.length && /\d/.test(text[from + n]!)) n += 1;
  return n;
}

/** Converts `text` into Code 128 symbol values (start → data → checksum → stop). */
export function encodeCode128Values(text: string): number[] {
  if (!isCode128Encodable(text)) {
    throw new Code128Error(
      "Barcode text must be non-empty printable ASCII (letters, digits, symbols)."
    );
  }

  const values: number[] = [];
  let i = 0;
  // Start in C when the data opens with ≥4 digits (or is entirely an even
  // digit run) — otherwise B.
  const leading = digitRunLength(text, 0);
  let set: "B" | "C" =
    leading >= 4 || (leading === text.length && leading % 2 === 0) ? "C" : "B";
  values.push(set === "C" ? START_C : START_B);

  while (i < text.length) {
    if (set === "C") {
      const run = digitRunLength(text, i);
      if (run >= 2) {
        values.push(Number(text.slice(i, i + 2)));
        i += 2;
        continue;
      }
      values.push(CODE_B);
      set = "B";
      continue;
    }

    // Set B: switch to C for a digit run worth packing — ≥4 digits at the end,
    // or ≥6 in the middle (an odd run keeps its first digit in B).
    const run = digitRunLength(text, i);
    const atEnd = i + run === text.length;
    if (run >= 6 || (atEnd && run >= 4)) {
      if (run % 2 === 1) {
        values.push(text.charCodeAt(i) - 32);
        i += 1;
      }
      values.push(CODE_C);
      set = "C";
      continue;
    }
    values.push(text.charCodeAt(i) - 32);
    i += 1;
  }

  let checksum = values[0]!;
  for (let k = 1; k < values.length; k += 1) checksum += values[k]! * k;
  values.push(checksum % 103, STOP);
  return values;
}

export function encodeCode128(text: string): Code128Encoding {
  const values = encodeCode128Values(text);
  const widths = values.flatMap((v) =>
    [...CODE128_PATTERNS[v]!].map((d) => Number(d))
  );
  return {
    values,
    widths,
    totalModules: widths.reduce((sum, w) => sum + w, 0),
  };
}

export interface BarRect {
  /** Left edge in modules (quiet zone included). */
  x: number;
  width: number;
}

/** Quiet zone each side, in modules — the spec minimum is 10. */
export const CODE128_QUIET_ZONE = 10;

/** Bar rectangles (in module units) ready to draw to SVG, canvas or PDF. */
export function code128Bars(encoding: Code128Encoding): BarRect[] {
  const bars: BarRect[] = [];
  let x = CODE128_QUIET_ZONE;
  encoding.widths.forEach((w, index) => {
    if (index % 2 === 0) bars.push({ x, width: w });
    x += w;
  });
  return bars;
}
