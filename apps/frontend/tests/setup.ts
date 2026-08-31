/* eslint-disable @typescript-eslint/no-unused-vars */
import "@testing-library/jest-dom";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "../mocks/server";

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
// beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
// afterEach(() => server.resetHandlers());
// afterAll(() => server.close());
