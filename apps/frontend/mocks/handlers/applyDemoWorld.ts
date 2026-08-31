import type { Delegation, Dispute, Escrow, Order } from "@delegolabs/types";
import { generateDemoWorld } from "../generateDemoWorld.mjs";
import { seedDelegations } from "./delegations";
import { seedOrders } from "./orders";
import { seedEscrows } from "./escrows";
import { seedDisputes } from "./disputes";

/**
 * Load the deterministic demo world into the in-memory MSW stores (#631).
 * Used by `pnpm seed:demo --mock` (via NEXT_PUBLIC_SEED_DEMO) and by tests
 * to prove the snapshot is consumable by the existing handler suite.
 */
export function applyDemoWorld(world = generateDemoWorld()) {
  seedDelegations(world.delegations as Delegation[]);
  seedOrders(world.orders as unknown as Order[]);
  seedEscrows(world.escrows as unknown as Escrow[]);
  seedDisputes(world.disputes as Dispute[]);
  return world;
}
