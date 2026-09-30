/**
 * Sentence segmentation for streamed agent text.
 *
 * Screen readers treat a live region that is rewritten on every streamed token
 * as a stream of interruptions: NVDA and JAWS stop what they are saying and
 * start again, so a long agent reply is heard as a dozen clipped fragments.
 * The fix is to never announce partial text. This module turns a growing
 * buffer of raw tokens into a list of *completed* sentences plus whatever
 * trailing text is not finished yet, leaving the caller to publish only the
 * completed ones.
 *
 * Pure and dependency-free so the boundary rules can be tested directly.
 */

/**
 * Words whose trailing period belongs to the word, not to the sentence.
 * Compared against the letters immediately preceding a `.`.
 */
const ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "st",
  "inc",
  "ltd",
  "co",
  "corp",
  "dept",
  "est",
  "no",
  "vs",
  "etc",
  "e.g",
  "i.e",
  "approx",
  "fig",
  "min",
  "max",
]);

/** Characters that can close a sentence. */
const TERMINATORS = ".!?…";

/** Quotes and brackets that belong to the sentence they follow. */
const TRAILING_CLOSERS = "\"'”’)]}»›";

/**
 * A reply with no terminal punctuation at all (a long list, a bare URL) would
 * otherwise buffer forever, so the remainder is force-split once it grows past
 * this many characters.
 */
const MAX_SENTENCE_LENGTH = 320;

const WORD_CHAR = /[A-Za-z.]/;
const LETTER = /[A-Za-z]/;
const DIGIT = /[0-9]/;
const LOWERCASE = /[a-z]/;

export interface SentenceSplit {
  /** Complete sentences, in the order they were produced. */
  sentences: string[];
  /** Trailing text that is not yet a complete sentence. */
  rest: string;
}

/**
 * Decides whether the terminator at `start` actually ends a sentence.
 *
 * Rejects the three cases that matter in practice: decimals ("3.5"), the
 * trailing period of an abbreviation or initial ("Dr.", "J."), and a period
 * followed by a lowercase word, which almost always continues the clause
 * rather than starting a new sentence.
 */
function isSentenceBoundary(
  buffer: string,
  start: number,
  end: number
): boolean {
  // `!`, `?` and `…` are unambiguous sentence endings.
  if (buffer[start] !== ".") return true;

  const remainder = buffer.slice(end);
  // Nothing has arrived after the period yet. The stream paused on a full
  // stop, which is the strongest signal that the sentence is complete.
  if (remainder.trim() === "") return true;

  const nextChar = remainder.trimStart()[0];

  // "The total is 3.5 XLM." must not split at the decimal point.
  const prevChar = buffer[start - 1];
  if (
    prevChar !== undefined &&
    DIGIT.test(prevChar) &&
    nextChar !== undefined &&
    DIGIT.test(nextChar)
  ) {
    return false;
  }

  // "...thanks. i dropped the receipt" — a lowercase word continues the clause.
  if (nextChar !== undefined && LOWERCASE.test(nextChar)) return false;

  // The abbreviation rule only applies when a letter actually precedes the
  // period. A period after a digit or a closing bracket ("S0.", "done).") is a
  // real sentence ending.
  const prev = buffer[start - 1];
  if (prev === undefined || !LETTER.test(prev)) return true;

  // Collect the word immediately before the period and treat it as an
  // abbreviation when it is a known abbreviation or a bare initial.
  let scan = start - 1;
  while (scan >= 0 && WORD_CHAR.test(buffer[scan])) scan -= 1;
  const word = buffer.slice(scan + 1, start).toLowerCase();
  if (word.length <= 1) return false;

  return !ABBREVIATIONS.has(word);
}

/**
 * Splits a buffer of streamed text into completed sentences and a remainder.
 *
 * Incremental and side-effect free: feed it the whole buffer on every token
 * and it will keep returning only the sentences that have newly completed.
 *
 * @example
 * segmentSentences("Order approved. Waiting on"); // { sentences: ["Order approved."], rest: "Waiting on" }
 */
export function segmentSentences(buffer: string): SentenceSplit {
  const sentences: string[] = [];
  let start = 0;
  let index = 0;

  while (index < buffer.length) {
    const char = buffer[index];

    // A newline is an unambiguous hard boundary in streamed output.
    if (char === "\n") {
      const sentence = buffer.slice(start, index).trim();
      if (sentence) sentences.push(sentence);
      index += 1;
      start = index;
      continue;
    }

    if (!TERMINATORS.includes(char)) {
      index += 1;
      continue;
    }

    // Collapse a run of terminators so "...", "?!" and "…" count as one.
    let end = index + 1;
    while (end < buffer.length && TERMINATORS.includes(buffer[end])) end += 1;

    if (!isSentenceBoundary(buffer, index, end)) {
      index = end;
      continue;
    }

    // Pull in any closing quote or bracket that belongs to this sentence.
    let closeEnd = end;
    while (
      closeEnd < buffer.length &&
      TRAILING_CLOSERS.includes(buffer[closeEnd])
    ) {
      closeEnd += 1;
    }

    const sentence = buffer.slice(start, closeEnd).trim();
    if (sentence) sentences.push(sentence);
    start = closeEnd;
    index = closeEnd;
  }

  let rest = buffer.slice(start);

  // Force-split a remainder that has grown too long to announce in one go.
  while (rest.trim().length > MAX_SENTENCE_LENGTH) {
    const space = rest.lastIndexOf(" ", MAX_SENTENCE_LENGTH);
    // `lastIndexOf` returns -1 when there is no space, which is truthy and
    // would slice from the end of the string, so guard explicitly.
    const cut = space > 0 ? space : MAX_SENTENCE_LENGTH;
    const chunk = rest.slice(0, cut).trim();
    if (!chunk) break;
    sentences.push(chunk);
    rest = rest.slice(cut);
  }

  // Left-trim the remainder: the space that follows a completed sentence is
  // separator, not content, and a whitespace-only remainder should read as
  // "nothing pending" rather than as literal spaces.
  return { sentences, rest: rest.replace(/^\s+/, "") };
}
