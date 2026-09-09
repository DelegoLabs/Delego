import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** Node MSW server for vitest (jsdom environment, no real network). */
export const server = setupServer(...handlers);
