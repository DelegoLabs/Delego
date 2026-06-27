import { SagaConcurrencyError, type SagaRecord, type SagaStore } from "./types.js";

function clone(record: SagaRecord): SagaRecord {
  return {
    ...record,
    completedSteps: [...record.completedSteps],
    context: structuredClone(record.context),
    claimExpiresAt: record.claimExpiresAt ? new Date(record.claimExpiresAt) : null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
  };
}

/** Non-durable SagaStore — used in unit tests and local development without Postgres. */
export class InMemorySagaStore implements SagaStore {
  private readonly records = new Map<string, SagaRecord>();

  async createIfNotExists(record: SagaRecord): Promise<SagaRecord> {
    const existing = this.records.get(record.sagaId);
    if (existing) return clone(existing);
    const stored = clone({ ...record, version: 0 });
    this.records.set(record.sagaId, stored);
    return clone(stored);
  }

  async get(sagaId: string): Promise<SagaRecord | null> {
    const record = this.records.get(sagaId);
    return record ? clone(record) : null;
  }

  async save(record: SagaRecord): Promise<SagaRecord> {
    const existing = this.records.get(record.sagaId);
    if (!existing || existing.version !== record.version) {
      throw new SagaConcurrencyError(record.sagaId);
    }
    const updated = clone({ ...record, version: record.version + 1 });
    this.records.set(record.sagaId, updated);
    return clone(updated);
  }

  async listIncomplete(): Promise<SagaRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.status === "running" || record.status === "compensating")
      .map(clone);
  }
}
