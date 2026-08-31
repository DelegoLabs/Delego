import { getLocalApprovalNote } from "../../lib/localApprovalNotes";

export interface ApprovalNoteDisplayProps {
  /** Server-persisted note, if any (`order.approvalNote`). */
  note?: string | null;
  /** Order id — used to look up a local-only fallback note when `note` is absent. */
  orderId: string;
}

/**
 * Renders an approval note wherever decisions render (history/timeline,
 * drawer), with a visually distinct "note" treatment. Always rendered as a
 * plain text node — never `dangerouslySetInnerHTML` — so arbitrary note
 * content can't inject markup.
 *
 * Falls back to a local-only note (#573 graceful degradation) when the
 * order carries none from the server, flagging it as not yet synced.
 */
export function ApprovalNoteDisplay({ note, orderId }: ApprovalNoteDisplayProps) {
  const serverNote = note?.trim();
  const localNote = !serverNote ? getLocalApprovalNote(orderId) : null;
  const displayNote = serverNote || localNote;

  if (!displayNote) return null;

  return (
    <p
      className={`approval-note-display${localNote ? " approval-note-display-unsynced" : ""}`}
      data-testid={`approval-note-${orderId}`}
    >
      {displayNote}
      {localNote && (
        <span className="approval-note-unsynced-hint">
          Saved on this device only — not yet synced to the server.
        </span>
      )}
    </p>
  );
}
