/**
 * Typed re-export of the deterministic demo world (#631).
 * Implementation lives in generateDemoWorld.mjs so `pnpm seed:demo` can
 * import it from Node without a TypeScript loader.
 */
export {
  DEMO_WORLD_NOW,
  DEMO_WORLD_SEED,
  generateDemoWorld,
  serializeDemoWorld,
  UI_STATE_COVERAGE,
} from "./generateDemoWorld.mjs";
