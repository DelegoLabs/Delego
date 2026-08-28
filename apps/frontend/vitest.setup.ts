import "@testing-library/jest-dom/vitest";

/** jsdom has no ResizeObserver; @tanstack/react-virtual constructs one on mount. */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub;
}

/**
 * jsdom never performs real layout, so offsetWidth/offsetHeight are always 0. @tanstack/react-virtual
 * reads the scroll container's offsetHeight synchronously on mount to size its viewport — without a
 * nonzero stub here, it computes an empty visible range and renders no rows at all.
 */
Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  value: 480,
});
Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  value: 800,
});
