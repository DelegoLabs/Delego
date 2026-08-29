/**
 * localApprovalNotes — client-side fallback store for approve-with-note
 * (#573) when the backend doesn't accept `approvalNote` on the approve
 * payload (`useApprovalNoteCapability` resolves `false`, or a submit
 * attempt is rejected). The note itself is never destructive or
 * synced automatically — it's a plain local annotation keyed by order id,
 * displayed with a "not synced" indicator until the backend adds support.
 */

const STORAGE_KEY = "delego_local_approval_notes";

type NoteMap = Record<string, string>;

function loadAll(): NoteMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as NoteMap;
  } catch {
    return {};
  }
}

function saveAll(notes: NoteMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // Best effort — localStorage may be full or unavailable.
  }
}

/** Record a local-only approval note for `orderId`. */
export function setLocalApprovalNote(orderId: string, note: string): void {
  const notes = loadAll();
  notes[orderId] = note;
  saveAll(notes);
}

/** Read back the local-only approval note for `orderId`, if any. */
export function getLocalApprovalNote(orderId: string): string | null {
  return loadAll()[orderId] ?? null;
}

/** Remove the local-only approval note for `orderId` (e.g. once the backend confirms support and the note is synced). */
export function clearLocalApprovalNote(orderId: string): void {
  const notes = loadAll();
  delete notes[orderId];
  saveAll(notes);
}
