/**
 * Buyer-agent chat message shape and completion helpers (#811).
 *
 * The live-chat surface does not exist yet (see docs/grant-deliverables.md,
 * milestone M3 "Buyer Agent + Purchase Flow" — still Pending), so this module
 * deliberately owns only the *vocabulary* a live chat needs: who authored a
 * message, and whether the agent has finished generating it. The audio ping
 * (hooks/useBuyerAgentMessagePing.ts) and any future chat view therefore agree
 * on what "the agent just finished a reply" means, instead of each inventing
 * its own predicate.
 */

/** Who authored a chat message. */
export type BuyerAgentMessageAuthor = "user" | "agent";

/**
 * A proposal card rendered inline in the chat transcript instead of (or
 * alongside) a text body — the "agent finished generating something you can
 * approve" case called out in #811.
 */
export interface BuyerAgentProposalCard {
  title: string;
  /** Pre-formatted display string, e.g. "US$42.00" */
  total: string;
  currency: string;
}

/** One message in a buyer-agent chat transcript. */
export interface BuyerAgentMessage {
  /** Stable, unique within a conversation. Used to de-duplicate pings. */
  id: string;
  author: BuyerAgentMessageAuthor;
  /** Plain-text body. May be empty for a card-only message. */
  body: string;
  /** ISO 8601 timestamp. */
  sentAt: string;
  /**
   * True while the agent is still generating this message.
   *
   * The live stream appends the message immediately with `pending: true` and
   * flips it to `false` (or drops the field) on the terminal frame — the
   * moment a chime should fire. Absent means "already complete".
   */
  pending?: boolean;
  /** Present when the agent generated an actionable proposal rather than prose. */
  proposalCard?: BuyerAgentProposalCard | null;
}

/** True when the message was authored by the agent (not the user). */
export function isAgentMessage(message: BuyerAgentMessage): boolean {
  return message.author === "agent";
}

/** True when the agent authored the message and is done generating it. */
export function isCompletedAgentMessage(message: BuyerAgentMessage): boolean {
  return isAgentMessage(message) && message.pending !== true;
}

/**
 * Every completed agent message in a transcript, in the order given.
 *
 * A live chat re-renders the whole transcript as it streams, so this is the
 * "what has the agent finished saying" view used both for pinging and for
 * de-duplication.
 */
export function selectCompletedAgentMessages(
  messages: readonly BuyerAgentMessage[]
): BuyerAgentMessage[] {
  return messages.filter(isCompletedAgentMessage);
}

/**
 * Ids of completed agent messages, for cheap change detection between
 * renders without allocating the message objects themselves.
 */
export function completedAgentMessageIds(
  messages: readonly BuyerAgentMessage[]
): string[] {
  return selectCompletedAgentMessages(messages).map((message) => message.id);
}
