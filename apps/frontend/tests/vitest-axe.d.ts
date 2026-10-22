import type { AxeMatchers } from "vitest-axe/matchers";

// vitest-axe@0.1.0's "extend-expect" types target the pre-1.0 global `Vi`
// namespace; Vitest 2 reads matcher types from the "vitest" module instead.
declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-interface
  interface Assertion<T = any> extends AxeMatchers {}
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
