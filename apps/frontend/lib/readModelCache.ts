/**
 * IndexedDB read-model cache (#619).
 *
 * Complements the service-worker runtime cache (`offlineCache.ts` / `sw.js`),
 * which stores opaque HTTP responses for the shell. This layer stores
 * structured query results (lists, detail objects) so the UI can hydrate
 * instantly from last-known-good on a flaky network, then revalidate.
 *
 * Design:
 * - Versioned per query-family. A family version bump drops that family's
 *   records (and an IndexedDB schema bump drops the whole store) so stale
 *   shapes never leak into the UI.
 * - TTL per family, displayed honestly by `StaleBadge`.
 * - Size-capped LRU at the *family* level: when the cap is exceeded, the
 *   least-recently-used family is evicted first.
 *
 * Persistence is IndexedDB with an in-memory index. When IDB is unavailable
 * (SSR, locked-down browsers, tests) the memory index still works for the
 * lifetime of the page.
 */

export type QueryFamily =
  | "delegations"
  | "orders"
  | "escrows"
  | "analytics"
  | "notifications";

export interface FamilyConfig {
  /** Bump to drop records written under a previous shape. */
  version: number;
  /** Freshness window in ms — past this the row is served as stale. */
  ttlMs: number;
  label: string;
}

/**
 * Per-family TTL + schema version. TTLs are the numbers shown on staleness
 * badges — keep them honest (don't advertise a 5-minute window if we evict
 * at 30s).
 */
export const FAMILY_CONFIG: Record<QueryFamily, FamilyConfig> = {
  delegations: { version: 1, ttlMs: 5 * 60_000, label: "Delegations" },
  orders: { version: 1, ttlMs: 60_000, label: "Orders" },
  escrows: { version: 1, ttlMs: 2 * 60_000, label: "Escrows" },
  analytics: { version: 1, ttlMs: 10 * 60_000, label: "Analytics" },
  notifications: { version: 1, ttlMs: 30_000, label: "Notifications" },
};

export const QUERY_FAMILIES = Object.keys(FAMILY_CONFIG) as QueryFamily[];

/** Default cap: 2 MiB of serialized payloads. */
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

export const READ_MODEL_DB_NAME = "delego_read_model_db";
export const READ_MODEL_STORE = "records";
/** Bump to drop every stored shape (tested in readModelCache.test.ts). */
export const READ_MODEL_DB_VERSION = 1;

export interface CacheRecord<T = unknown> {
  family: QueryFamily;
  key: string;
  version: number;
  payload: T;
  cachedAt: number;
  lastAccessAt: number;
  bytes: number;
}

export interface CacheStats {
  totalBytes: number;
  maxBytes: number;
  families: Array<{
    family: QueryFamily;
    label: string;
    version: number;
    ttlMs: number;
    keys: number;
    bytes: number;
    lastAccessAt: number | null;
    oldestCachedAt: number | null;
  }>;
}

export interface CacheStore {
  getAll(): CacheRecord[];
  set(record: CacheRecord): void;
  delete(family: QueryFamily, key: string): void;
  deleteFamily(family: QueryFamily): void;
  clear(): void;
}

function recordId(family: QueryFamily, key: string): string {
  return `${family}:${key}`;
}

/** JSON stringify that round-trips bigint as `{ $b: "123" }`. */
export function serializePayload(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    typeof v === "bigint" ? { $b: v.toString() } : v
  );
}

export function deserializePayload<T>(raw: string): T {
  return JSON.parse(raw, (_k, v) => {
    if (v && typeof v === "object" && typeof v.$b === "string") {
      return BigInt(v.$b);
    }
    return v;
  }) as T;
}

export function estimateBytes(payload: unknown): number {
  try {
    return new TextEncoder().encode(serializePayload(payload)).length;
  } catch {
    return 0;
  }
}

export function isRecordStale(
  record: CacheRecord,
  now: number,
  config: FamilyConfig = FAMILY_CONFIG[record.family]
): boolean {
  return now - record.cachedAt >= config.ttlMs;
}

/** In-memory store used by the engine and by tests. */
export class MemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, CacheRecord>();

  getAll(): CacheRecord[] {
    return [...this.map.values()];
  }

  set(record: CacheRecord): void {
    this.map.set(recordId(record.family, record.key), record);
  }

  delete(family: QueryFamily, key: string): void {
    this.map.delete(recordId(family, key));
  }

  deleteFamily(family: QueryFamily): void {
    for (const [id, record] of this.map) {
      if (record.family === family) this.map.delete(id);
    }
  }

  clear(): void {
    this.map.clear();
  }
}

export interface ReadModelCacheOptions {
  store?: CacheStore;
  maxBytes?: number;
  now?: () => number;
  persist?: (records: CacheRecord[]) => Promise<void> | void;
}

/**
 * Size-capped, versioned, family-LRU cache. Pure enough to unit-test without
 * IndexedDB; the module singleton below wires IDB persistence for the app.
 */
export class ReadModelCache {
  private readonly store: CacheStore;
  private readonly maxBytes: number;
  private readonly now: () => number;
  private readonly persist?: (records: CacheRecord[]) => Promise<void> | void;

  constructor(options: ReadModelCacheOptions = {}) {
    this.store = options.store ?? new MemoryCacheStore();
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.now = options.now ?? Date.now;
    this.persist = options.persist;
  }

  /** Drop records whose family version no longer matches (shape migration). */
  migrate(): number {
    let dropped = 0;
    for (const record of this.store.getAll()) {
      const expected = FAMILY_CONFIG[record.family];
      if (!expected || record.version !== expected.version) {
        this.store.delete(record.family, record.key);
        dropped += 1;
      }
    }
    return dropped;
  }

  get<T>(family: QueryFamily, key: string): CacheRecord<T> | null {
    const record = this.store
      .getAll()
      .find((r) => r.family === family && r.key === key);
    if (!record) return null;
    if (record.version !== FAMILY_CONFIG[family].version) {
      this.store.delete(family, key);
      this.flush();
      return null;
    }
    record.lastAccessAt = this.now();
    this.store.set(record);
    this.flush();
    return record as CacheRecord<T>;
  }

  set<T>(family: QueryFamily, key: string, payload: T): CacheRecord<T> {
    const now = this.now();
    const record: CacheRecord<T> = {
      family,
      key,
      version: FAMILY_CONFIG[family].version,
      payload,
      cachedAt: now,
      lastAccessAt: now,
      bytes: estimateBytes(payload),
    };
    this.store.set(record as CacheRecord);
    this.enforceCap();
    this.flush();
    return record;
  }

  delete(family: QueryFamily, key: string): void {
    this.store.delete(family, key);
    this.flush();
  }

  clear(): void {
    this.store.clear();
    this.flush();
  }

  /**
   * Evict least-recently-used *families* until under the byte cap.
   * A family is as recently used as its hottest key.
   */
  enforceCap(): QueryFamily[] {
    const evicted: QueryFamily[] = [];
    while (this.totalBytes() > this.maxBytes) {
      const victim = this.lruFamily();
      if (!victim) break;
      this.store.deleteFamily(victim);
      evicted.push(victim);
    }
    return evicted;
  }

  stats(): CacheStats {
    const records = this.store.getAll();
    const families = QUERY_FAMILIES.map((family) => {
      const rows = records.filter((r) => r.family === family);
      return {
        family,
        label: FAMILY_CONFIG[family].label,
        version: FAMILY_CONFIG[family].version,
        ttlMs: FAMILY_CONFIG[family].ttlMs,
        keys: rows.length,
        bytes: rows.reduce((sum, r) => sum + r.bytes, 0),
        lastAccessAt: rows.reduce<number | null>(
          (max, r) => (max === null || r.lastAccessAt > max ? r.lastAccessAt : max),
          null
        ),
        oldestCachedAt: rows.reduce<number | null>(
          (min, r) => (min === null || r.cachedAt < min ? r.cachedAt : min),
          null
        ),
      };
    });
    return {
      totalBytes: records.reduce((sum, r) => sum + r.bytes, 0),
      maxBytes: this.maxBytes,
      families,
    };
  }

  totalBytes(): number {
    return this.store.getAll().reduce((sum, r) => sum + r.bytes, 0);
  }

  private lruFamily(): QueryFamily | null {
    const records = this.store.getAll();
    if (records.length === 0) return null;
    const hottest = new Map<QueryFamily, number>();
    for (const record of records) {
      const prev = hottest.get(record.family) ?? 0;
      if (record.lastAccessAt >= prev) hottest.set(record.family, record.lastAccessAt);
    }
    let oldest: QueryFamily | null = null;
    let oldestAt = Infinity;
    for (const [family, at] of hottest) {
      if (at < oldestAt) {
        oldest = family;
        oldestAt = at;
      }
    }
    return oldest;
  }

  private flush(): void {
    if (!this.persist) return;
    void Promise.resolve(this.persist(this.store.getAll())).catch(() => {
      // Persistence is best-effort — a quota error must not break reads.
    });
  }
}

/* -------------------------------------------------------------------------- */
/* App singleton + IndexedDB adapter                                          */
/* -------------------------------------------------------------------------- */

function openReadModelDb(version = READ_MODEL_DB_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not supported"));
      return;
    }
    const request = indexedDB.open(READ_MODEL_DB_NAME, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Drop-and-recreate: any schema bump discards stale shapes safely.
      if (db.objectStoreNames.contains(READ_MODEL_STORE)) {
        db.deleteObjectStore(READ_MODEL_STORE);
      }
      db.createObjectStore(READ_MODEL_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

interface PersistedRecord {
  id: string;
  family: QueryFamily;
  key: string;
  version: number;
  payloadJson: string;
  cachedAt: number;
  lastAccessAt: number;
  bytes: number;
}

function toPersisted(record: CacheRecord): PersistedRecord {
  return {
    id: recordId(record.family, record.key),
    family: record.family,
    key: record.key,
    version: record.version,
    payloadJson: serializePayload(record.payload),
    cachedAt: record.cachedAt,
    lastAccessAt: record.lastAccessAt,
    bytes: record.bytes,
  };
}

function fromPersisted(row: PersistedRecord): CacheRecord {
  return {
    family: row.family,
    key: row.key,
    version: row.version,
    payload: deserializePayload(row.payloadJson),
    cachedAt: row.cachedAt,
    lastAccessAt: row.lastAccessAt,
    bytes: row.bytes,
  };
}

async function loadFromIdb(): Promise<CacheRecord[]> {
  try {
    const db = await openReadModelDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(READ_MODEL_STORE, "readonly");
      const req = tx.objectStore(READ_MODEL_STORE).getAll();
      req.onsuccess = () => {
        const rows = (req.result as PersistedRecord[]) ?? [];
        resolve(rows.map(fromPersisted));
        db.close();
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    return [];
  }
}

async function saveToIdb(records: CacheRecord[]): Promise<void> {
  const db = await openReadModelDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(READ_MODEL_STORE, "readwrite");
    const store = tx.objectStore(READ_MODEL_STORE);
    store.clear();
    for (const record of records) {
      store.put(toPersisted(record));
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

const memoryStore = new MemoryCacheStore();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

export const readModelCache = new ReadModelCache({
  store: memoryStore,
  persist: (records) => {
    if (typeof indexedDB === "undefined") return;
    return saveToIdb(records);
  },
});

/** Load IDB into memory once per page. Safe to call repeatedly. */
export function hydrateReadModelCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = loadFromIdb().then((records) => {
    memoryStore.clear();
    for (const record of records) memoryStore.set(record);
    readModelCache.migrate();
    hydrated = true;
  });
  return hydratePromise;
}

/** Test-only: wipe the in-memory index without waiting on IDB. */
export function resetReadModelCacheForTests(): void {
  memoryStore.clear();
  hydrated = true;
  hydratePromise = null;
}

export async function peekReadModel<T>(
  family: QueryFamily,
  key: string
): Promise<CacheRecord<T> | null> {
  await hydrateReadModelCache();
  return readModelCache.get<T>(family, key);
}

export async function writeReadModel<T>(
  family: QueryFamily,
  key: string,
  payload: T
): Promise<CacheRecord<T>> {
  await hydrateReadModelCache();
  return readModelCache.set(family, key, payload);
}

export async function clearReadModel(): Promise<void> {
  await hydrateReadModelCache();
  readModelCache.clear();
}

export async function getReadModelStats(): Promise<CacheStats> {
  await hydrateReadModelCache();
  return readModelCache.stats();
}

/**
 * Open the DB at `toVersion` to exercise the upgrade path. Used by the
 * migration test; not part of the app API.
 */
export async function openReadModelDbForUpgrade(toVersion: number): Promise<IDBDatabase> {
  return openReadModelDb(toVersion);
}
