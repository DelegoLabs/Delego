import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../mocks/server";

// Polyfill BigInt.prototype.toJSON for MSW and test JSON serialization
if (typeof BigInt !== "undefined" && !("toJSON" in BigInt.prototype)) {
  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function (this: bigint) {
      return this.toString();
    },
    configurable: true,
    writable: true,
  });
}

// Minimal Canvas 2D context mock used by jsdom/axe/qr libraries in tests
if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: function (type: string) {
      if (type === "2d") {
        return {
          fillRect: () => {},
          clearRect: () => {},
          getImageData: (_x: number, _y: number, w: number, h: number) => ({
            data: new Uint8ClampedArray(w * h * 4),
          }),
          putImageData: () => {},
          createImageData: () => ({ data: [] }),
          setTransform: () => {},
          drawImage: () => {},
          save: () => {},
          fillText: () => {},
          measureText: () => ({ width: 0 }),
          restore: () => {},
          beginPath: () => {},
          closePath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          arc: () => {},
          stroke: () => {},
        };
      }
      return null;
    },
  });
}

// Polyfill Blob.prototype.text for jsdom
if (typeof Blob !== "undefined" && typeof Blob.prototype.text !== "function") {
  Blob.prototype.text = function (this: Blob) {
    const symbols = Object.getOwnPropertySymbols(this);
    for (const sym of symbols) {
      const impl = (this as unknown as Record<symbol, unknown>)[sym] as
        | { _buffer?: Buffer }
        | undefined;
      if (impl && impl._buffer) {
        return Promise.resolve(impl._buffer.toString("utf-8"));
      }
    }
    if (typeof FileReader !== "undefined") {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(this);
      });
    }
    return Promise.resolve("");
  };
}

// On Node 22.4+/24+, globalThis.localStorage/sessionStorage are native, but
// without a valid `--localstorage-file` they resolve to a non-functional
// stub (getItem/setItem/clear all undefined). Vitest's jsdom environment
// only copies jsdom's real, working Storage implementation onto a global
// key when that key isn't already present on `global` — since the broken
// native stub is already there, it silently wins, and any test relying on
// localStorage/sessionStorage breaks with e.g.
// "localStorage.clear is not a function". Re-point both at jsdom's real
// implementation, exposed by Vitest as `globalThis.jsdom.window`.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    if (typeof globalThis[key]?.getItem === "function") continue;
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: jsdomWindow[key],
    });
  }
}

/**
 * Guarantee a spec-compliant `window.localStorage` (with `.clear()`,
 * `.key()`, etc.), independent of whatever race decided its value.
 *
 * Node 25+ ships an experimental global `localStorage` that lazily
 * materializes the first time anything reads `globalThis.localStorage`.
 * Because jsdom's `window` *is* `globalThis` in this environment, that can
 * shadow jsdom's real `window.localStorage` (a spec-compliant `Storage`
 * instance) with Node's bare object — which supports get/set but not
 * `.clear()`. This isn't specific to any one dependency or import order:
 * a plain `node -e` with zero imports already shows a non-`undefined`
 * `globalThis.localStorage` under Node 25, and on this repo's Node
 * version this was already breaking ~40 pre-existing test suites (any
 * test calling `.clear()`, confirmed via a clean-checkout run) before
 * this fix. Rather than depend on import order, replace it outright with
 * a minimal in-memory Storage polyfill whenever the current
 * implementation is missing `.clear()`.
 */
if (
  typeof window !== "undefined" &&
  typeof window.localStorage?.clear !== "function"
) {
  const store = new Map<string, string>();
  const storagePolyfill: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    value: storagePolyfill,
    configurable: true,
    writable: true,
  });
}

/**
 * Global MSW server lifecycle for every vitest run (FE-045). Individual test
 * files layer scenario handlers on top with `server.use(...)` and MSW resets
 * to these defaults in `afterEach` via `resetHandlers`.
 */
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

export { server } from "../mocks/server";
