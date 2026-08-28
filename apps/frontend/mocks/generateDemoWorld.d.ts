export function generateDemoWorld(seed?: number): DemoWorld;
export function serializeDemoWorld(world: DemoWorld): string;
export const DEMO_WORLD_SEED: number;
export const DEMO_WORLD_NOW: string;
export const UI_STATE_COVERAGE: {
  entityStatuses: {
    delegations: string[];
    orders: string[];
    escrows: string[];
  };
  listMatrices: {
    empty: string[];
    error: string[];
    loading: string[];
  };
};

export interface DemoWorld {
  seed: number;
  generatedAt: string;
  agents: Array<Record<string, string>>;
  delegations: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  escrows: Array<Record<string, unknown>>;
  disputes: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  uiStateCoverage: typeof UI_STATE_COVERAGE;
}
