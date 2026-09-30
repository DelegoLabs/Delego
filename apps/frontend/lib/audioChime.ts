/**
 * Web Audio chime synthesis for live-chat notifications (#811).
 *
 * The "audio ping" for incoming buyer-agent messages is *synthesised* rather
 * than shipped as an audio file: it keeps the bundle free of a new binary
 * asset, lets the volume preference scale the signal in real time (no gain
 * round-trip through an `<audio>` element), and — because every oscillator is
 * given an explicit stop time — guarantees nothing keeps playing after the
 * tone finishes.
 *
 * The recipe is deliberately soft: two pure sine partials a fourth apart with
 * a fast attack and a long exponential decay, at a low master volume. Nothing
 * here is a "reward" chime — it must be ignorable.
 *
 * Accessibility: `prefersReducedSound()` treats a system reduce-motion
 * preference (and the in-app reduce-motion override from
 * hooks/useAccessibility.ts, which mirrors it onto `html[data-reduce-motion]`)
 * as a request for no unsolicited audio. There is no standardised
 * "reduce sound" media query, so reduced motion is the closest signal every
 * platform actually exposes; see docs/frontend-a11y.md.
 */

/**
 * The subset of `AudioContext` this module needs.
 *
 * Declared structurally rather than as `Pick<AudioContext, ...>` so a test stub
 * (see tests/fakeAudioContext.ts) satisfies it without `as any`; a real
 * `AudioContext` still satisfies it unchanged.
 */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  createGain(): ChimeGainNode;
  createOscillator(): ChimeOscillatorNode;
  /** Present on real contexts; suspended until the first user gesture. */
  resume?(): Promise<void>;
}

/** The `AudioParam` operations the envelope uses. */
export interface ChimeAudioParam {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

/** An audio node that can be wired onwards. */
export interface ChimeAudioNode {
  connect(destination: unknown): unknown;
}

export interface ChimeGainNode extends ChimeAudioNode {
  gain: ChimeAudioParam;
}

export interface ChimeOscillatorNode extends ChimeAudioNode {
  type: OscillatorType;
  frequency: ChimeAudioParam;
  start(when?: number): void;
  stop(when?: number): void;
}

/**
 * A single partial of the chime.
 *
 * `startOffsetSeconds` staggers the partials into a soft two-note "ping"
 * instead of one undifferentiated beep; `gain` is the tone's own level
 * relative to the master volume.
 */
export interface ChimeTone {
  /** Oscillator frequency in Hz. */
  frequency: number;
  /** Delay from the start of the chime, in seconds. */
  startOffsetSeconds: number;
  /** How long the tone sounds, in seconds. */
  durationSeconds: number;
  /** Tone level, 0–1, applied on top of the caller-supplied volume. */
  gain: number;
}

/**
 * The buyer-agent "message arrived" chime: a soft E5 that settles up a
 * perfect fourth to A5. Both partials are pure sines at under 0.3 of the
 * master gain so the sum stays well below a single full-volume tone.
 */
export const AGENT_MESSAGE_CHIME_TONES: readonly ChimeTone[] = [
  {
    frequency: 659.25,
    startOffsetSeconds: 0,
    durationSeconds: 0.32,
    gain: 0.3,
  },
  {
    frequency: 880,
    startOffsetSeconds: 0.09,
    durationSeconds: 0.42,
    gain: 0.22,
  },
];

/** Shortest sensible attack/release ramp, in seconds. Keeps ramps non-zero so `exponentialRampToValueAtTime` is valid. */
const RAMP_SECONDS = 0.015;

/** Master gain applied before the caller's volume, so even volume 1 stays gentle. */
const MASTER_GAIN = 0.6;

/**
 * The default chime volume: audible but unobtrusive in a shared space. Kept
 * deliberately low because this fires on *every* incoming agent message.
 */
export const DEFAULT_CHIME_VOLUME = 0.4;

/** Lower bound used when clamping; `0` would disable the chime entirely. */
export const MIN_CHIME_VOLUME = 0.05;

type AudioContextConstructor = new () => AudioContext;

/**
 * Resolves the browser's `AudioContext`, including the legacy
 * `webkitAudioContext` prefix still shipped by some Safari versions.
 * Returns `null` when the platform has no Web Audio support at all.
 */
export function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    AudioContext?: AudioContextConstructor;
    webkitAudioContext?: AudioContextConstructor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

/** Whether this browser can play a synthesised chime at all. */
export function isChimeSupported(): boolean {
  return getAudioContextConstructor() !== null;
}

/** Clamps a raw volume into the playable range used by the chime. */
export function clampChimeVolume(volume: number): number {
  if (!Number.isFinite(volume)) return DEFAULT_CHIME_VOLUME;
  if (volume <= 0) return 0;
  return Math.min(1, Math.max(MIN_CHIME_VOLUME, volume));
}

/**
 * Whether the visitor has asked for less unsolicited stimulus.
 *
 * Checks, in order:
 *  1. the in-app reduce-motion override (`html[data-reduce-motion]`), which
 *     hooks/useAccessibility.ts keeps in sync with the user's choice, and
 *  2. the OS-level `prefers-reduced-motion: reduce` media query.
 *
 * `"system"` and an absent attribute both defer to the media query; `"off"`
 * is an explicit opt-in to audio and wins over the OS setting.
 */
export function prefersReducedSound(): boolean {
  if (typeof document === "undefined") return false;

  const mode = document.documentElement.dataset?.reduceMotion;
  if (mode === "on") return true;
  if (mode === "off") return false;

  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Schedules every tone on `context` and wires them to the destination.
 *
 * Exported separately from {@link playChime} so the synthesis can be tested
 * against a stub context without touching the shared-context bookkeeping.
 * Returns the number of tones actually scheduled.
 */
export function scheduleChime(
  context: AudioContextLike,
  tones: readonly ChimeTone[],
  volume: number,
  startAtSeconds: number = context.currentTime
): number {
  const master = context.createGain();
  master.gain.value = clampChimeVolume(volume) * MASTER_GAIN;
  master.connect(context.destination);

  let scheduled = 0;
  for (const tone of tones) {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = tone.frequency;

    const envelope = context.createGain();
    const toneStart = startAtSeconds + Math.max(0, tone.startOffsetSeconds);
    const attackEnd = toneStart + RAMP_SECONDS;
    const toneEnd = Math.max(attackEnd, toneStart + tone.durationSeconds);

    // Ramp from (near) silence so the onset doesn't click, then decay
    // exponentially — the shape that reads as a chime rather than a beep.
    envelope.gain.setValueAtTime(0.0001, toneStart);
    envelope.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, tone.gain),
      attackEnd
    );
    envelope.gain.exponentialRampToValueAtTime(0.0001, toneEnd);

    oscillator.connect(envelope);
    envelope.connect(master);

    oscillator.start(toneStart);
    oscillator.stop(toneEnd);
    scheduled += 1;
  }

  return scheduled;
}

let sharedContext: AudioContextLike | null = null;

/**
 * Returns the process-wide `AudioContext`, creating it on first use.
 *
 * Browsers cap the number of live contexts and Chrome starts them suspended
 * until a user gesture, so a single lazily-created instance is reused (and
 * resumed) rather than one per notification.
 */
function getSharedContext(): AudioContextLike | null {
  if (sharedContext) return sharedContext;
  const Context = getAudioContextConstructor();
  if (!Context) return null;
  try {
    sharedContext = new Context();
  } catch {
    sharedContext = null;
  }
  return sharedContext;
}

/** Test seam: drops the cached context so the next play re-resolves it. */
export function resetSharedAudioContext(): void {
  sharedContext = null;
}

/**
 * Plays the buyer-agent chime once.
 *
 * Returns `true` when the tones were actually scheduled, `false` when the
 * chime was skipped — unsupported browser, zero volume, or a visitor who has
 * asked for reduced motion. The user's mute preference is applied by the
 * caller (hooks/useAudioNotifications.tsx) so the settings preview can bypass
 * it. Never throws: an unsolicited notification must not be able to break the
 * surface that triggered it.
 */
export function playChime(
  volume: number = DEFAULT_CHIME_VOLUME,
  tones: readonly ChimeTone[] = AGENT_MESSAGE_CHIME_TONES
): boolean {
  const clamped = clampChimeVolume(volume);
  if (clamped <= 0) return false;
  if (prefersReducedSound()) return false;

  const context = getSharedContext();
  if (!context) return false;

  try {
    if (typeof context.resume === "function") {
      const resumed = context.resume();
      // Autoplay policies make this reject until the first user gesture;
      // that is expected, and the scheduled tones still fire once resumed.
      if (resumed && typeof resumed.catch === "function")
        resumed.catch(() => {});
    }
    return scheduleChime(context, tones, clamped) > 0;
  } catch {
    return false;
  }
}
