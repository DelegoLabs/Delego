/**
 * addressBook — local-first address book service (#587).
 *
 * Network-scoped: mainnet and testnet contacts are stored separately so a
 * testnet address can never be confused for a mainnet recipient.
 *
 * Storage schema per network:
 *   localStorage key: "delego_address_book_{networkId}"
 *   Value: JSON array of AddressEntry[]
 *
 * Near-miss detection:
 *   levenshteinDistance(a, b) — standard dynamic-programming implementation.
 *   findNearMisses(address, networkId) returns contacts whose stored address
 *   differs from the supplied address by ≥ 1 and ≤ NEAR_MISS_MAX_DISTANCE
 *   characters. A distance of exactly 0 means it's an exact match (safe).
 */

import type { NetworkId } from "../lib/networks";
import { downloadBlob } from "../lib/download";

export interface AddressEntry {
  id: string; // uuid-ish — Date.now() + random hex
  label: string;
  address: string;
  network: NetworkId;
  notes: string;
  /** Manual flag; can be supplemented by TOML/on-chain verification (future). */
  verified: boolean;
  createdAt: string; // ISO-8601
  updatedAt: string; // ISO-8601
}

export interface NearMissResult {
  entry: AddressEntry;
  /** Edit distance (1 = single substitution/insertion/deletion) */
  distance: number;
}

const STORAGE_KEY_PREFIX = "delego_address_book_";
/** Maximum Levenshtein distance to consider a "near miss". */
export const NEAR_MISS_MAX_DISTANCE = 3;

// ─── Persistence helpers ──────────────────────────────────────────────────────

function storageKey(networkId: NetworkId): string {
  return `${STORAGE_KEY_PREFIX}${networkId}`;
}

function loadEntries(networkId: NetworkId): AddressEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(networkId));
    if (!raw) return [];
    return JSON.parse(raw) as AddressEntry[];
  } catch {
    return [];
  }
}

function saveEntries(networkId: NetworkId, entries: AddressEntry[]): void {
  try {
    localStorage.setItem(storageKey(networkId), JSON.stringify(entries));
  } catch {
    // localStorage may be full — best effort.
  }
}

function makeId(): string {
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

// ─── CRUD API ─────────────────────────────────────────────────────────────────

/** Return all contacts for the given network, sorted by label. */
export function getAddressBook(networkId: NetworkId): AddressEntry[] {
  return loadEntries(networkId).sort((a, b) => a.label.localeCompare(b.label));
}

/** Add a new contact and return the created entry. */
export function addAddressEntry(
  networkId: NetworkId,
  data: Omit<AddressEntry, "id" | "network" | "createdAt" | "updatedAt">
): AddressEntry {
  const entries = loadEntries(networkId);
  const now = new Date().toISOString();
  const entry: AddressEntry = {
    id: makeId(),
    network: networkId,
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  entries.push(entry);
  saveEntries(networkId, entries);
  return entry;
}

/** Update an existing contact by id. Returns the updated entry or null if not found. */
export function updateAddressEntry(
  networkId: NetworkId,
  id: string,
  patch: Partial<Omit<AddressEntry, "id" | "network" | "createdAt">>
): AddressEntry | null {
  const entries = loadEntries(networkId);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  const updated: AddressEntry = {
    ...entries[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  entries[idx] = updated;
  saveEntries(networkId, entries);
  return updated;
}

/** Delete a contact by id. Returns true if found and removed. */
export function deleteAddressEntry(networkId: NetworkId, id: string): boolean {
  const entries = loadEntries(networkId);
  const filtered = entries.filter((e) => e.id !== id);
  if (filtered.length === entries.length) return false;
  saveEntries(networkId, filtered);
  return true;
}

/** Search contacts by label or address (case-insensitive substring). */
export function searchAddressBook(
  networkId: NetworkId,
  query: string
): AddressEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return getAddressBook(networkId);
  return getAddressBook(networkId).filter(
    (e) =>
      e.label.toLowerCase().includes(q) ||
      e.address.toLowerCase().includes(q) ||
      e.notes.toLowerCase().includes(q)
  );
}

// ─── Import / Export ──────────────────────────────────────────────────────────

/** Export the address book for a network as a downloadable JSON file. */
export function exportAddressBook(networkId: NetworkId): void {
  const entries = loadEntries(networkId);
  const blob = new Blob([JSON.stringify(entries, null, 2)], {
    type: "application/json",
  });
  downloadBlob(`delego-address-book-${networkId}-${Date.now()}.json`, blob);
}

/**
 * Import contacts from a JSON string.
 * Existing contacts with the same address are skipped (no duplicates).
 * Returns the number of entries imported.
 */
export function importAddressBook(networkId: NetworkId, json: string): number {
  let incoming: AddressEntry[];
  try {
    incoming = JSON.parse(json) as AddressEntry[];
  } catch {
    throw new Error("Invalid JSON");
  }

  if (!Array.isArray(incoming)) {
    throw new Error("Expected a JSON array of address entries");
  }

  const existing = loadEntries(networkId);
  const existingAddresses = new Set(existing.map((e) => e.address));
  const toAdd = incoming.filter((e) => !existingAddresses.has(e.address));
  const now = new Date().toISOString();

  const merged = [
    ...existing,
    ...toAdd.map((e) => ({
      ...e,
      id: makeId(),
      network: networkId,
      createdAt: now,
      updatedAt: now,
    })),
  ];

  saveEntries(networkId, merged);
  return toAdd.length;
}

// ─── Near-Miss Detection ──────────────────────────────────────────────────────

/**
 * Standard Levenshtein edit distance (dynamic programming, O(m×n) space-
 * optimised to two rows).
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Given a pasted address, return any saved contacts whose address differs from
 * the supplied address by 1–NEAR_MISS_MAX_DISTANCE characters.
 *
 * A distance of 0 means exact match (no warning needed).
 * Distance ≥ 1 means a potential impostor / typo.
 */
export function findNearMisses(
  address: string,
  networkId: NetworkId
): NearMissResult[] {
  const entries = loadEntries(networkId);
  const results: NearMissResult[] = [];

  for (const entry of entries) {
    const distance = levenshteinDistance(address, entry.address);
    if (distance >= 1 && distance <= NEAR_MISS_MAX_DISTANCE) {
      results.push({ entry, distance });
    }
  }

  return results.sort((a, b) => a.distance - b.distance);
}
