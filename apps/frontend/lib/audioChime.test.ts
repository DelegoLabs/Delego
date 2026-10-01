import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AGENT_MESSAGE_CHIME_TONES,
  clampChimeVolume,
  DEFAULT_CHIME_VOLUME,
  getAudioContextConstructor,
  isChimeSupported,
  MIN_CHIME_VOLUME,
  playChime,
  prefersReducedSound,
  resetSharedAudioContext,
  scheduleChime,
  type ChimeTone,
} from "./audioChime";
import {
  createFakeAudioContext,
  installFakeAudioContext,
  mockMatchMedia,
  type FakeAudioContext,
} from "../tests/fakeAudioContext";

let uninstallAudio: () => void;
let uninstallMatchMedia: () => void;

function install(options: Parameters<typeof installFakeAudioContext>[0] = {}) {
  const installed = installFakeAudioContext(options);
  uninstallAudio = installed.uninstall;
  return installed.context;
}

beforeEach(() => {
  resetSharedAudioContext();
  delete document.documentElement.dataset.reduceMotion;
  uninstallMatchMedia = mockMatchMedia(false);
});

afterEach(() => {
  uninstallAudio?.();
  uninstallAudio = undefined as unknown as () => void;
  uninstallMatchMedia();
  resetSharedAudioContext();
  delete document.documentElement.dataset.reduceMotion;
});

describe("audioChime — capability detection", () => {
  it("reports unsupported when the browser exposes no AudioContext", () => {
    delete (window as unknown as Record<string, unknown>).AudioContext;
    delete (window as unknown as Record<string, unknown>).webkitAudioContext;

    expect(getAudioContextConstructor()).toBeNull();
    expect(isChimeSupported()).toBe(false);
  });

  it("prefers the standard constructor over the legacy webkit alias", () => {
    const context = createFakeAudioContext();
    const Standard = function () {
      return context;
    };
    const Legacy = function () {
      return createFakeAudioContext();
    };
    const scope = window as unknown as Record<string, unknown>;
    scope.AudioContext = Standard;
    scope.webkitAudioContext = Legacy;

    expect(getAudioContextConstructor()).toBe(Standard as never);
    expect(isChimeSupported()).toBe(true);

    delete scope.AudioContext;
    delete scope.webkitAudioContext;
  });

  it("falls back to the webkit alias when there is no standard constructor", () => {
    const context = createFakeAudioContext();
    const Legacy = function () {
      return context;
    };
    const scope = window as unknown as Record<string, unknown>;
    scope.webkitAudioContext = Legacy;

    expect(getAudioContextConstructor()).toBe(Legacy as never);

    delete scope.webkitAudioContext;
  });
});

describe("audioChime — clampChimeVolume", () => {
  it("passes in-range volumes through unchanged", () => {
    expect(clampChimeVolume(0.5)).toBe(0.5);
    expect(clampChimeVolume(1)).toBe(1);
  });

  it("clamps above 1", () => {
    expect(clampChimeVolume(4)).toBe(1);
  });

  it("snaps near-zero up to the minimum rather than to silence", () => {
    expect(clampChimeVolume(0.001)).toBe(MIN_CHIME_VOLUME);
  });

  it("maps zero and negatives to silence so the caller can bail out", () => {
    expect(clampChimeVolume(0)).toBe(0);
    expect(clampChimeVolume(-3)).toBe(0);
  });

  it("falls back to the default for non-finite input", () => {
    expect(clampChimeVolume(Number.NaN)).toBe(DEFAULT_CHIME_VOLUME);
    expect(clampChimeVolume(Number.POSITIVE_INFINITY)).toBe(
      DEFAULT_CHIME_VOLUME
    );
  });
});

describe("audioChime — prefersReducedSound", () => {
  it("is false when neither the override nor the OS asks for reduced motion", () => {
    expect(prefersReducedSound()).toBe(false);
  });

  it("is true when the OS reports prefers-reduced-motion: reduce", () => {
    uninstallMatchMedia();
    uninstallMatchMedia = mockMatchMedia(true);
    expect(prefersReducedSound()).toBe(true);
  });

  it("honours the in-app reduce-motion override set to 'on'", () => {
    document.documentElement.dataset.reduceMotion = "on";
    expect(prefersReducedSound()).toBe(true);
  });

  it("lets the in-app 'off' override win over the OS setting", () => {
    uninstallMatchMedia();
    uninstallMatchMedia = mockMatchMedia(true);
    document.documentElement.dataset.reduceMotion = "off";
    expect(prefersReducedSound()).toBe(false);
  });

  it("defers to the OS setting while the override is 'system'", () => {
    uninstallMatchMedia();
    uninstallMatchMedia = mockMatchMedia(true);
    document.documentElement.dataset.reduceMotion = "system";
    expect(prefersReducedSound()).toBe(true);
  });

  it("survives a matchMedia implementation that throws", () => {
    const previous = window.matchMedia;
    window.matchMedia = (() => {
      throw new Error("unsupported");
    }) as typeof window.matchMedia;

    expect(prefersReducedSound()).toBe(false);

    window.matchMedia = previous;
  });
});

describe("audioChime — scheduleChime", () => {
  let context: FakeAudioContext;

  beforeEach(() => {
    context = createFakeAudioContext();
  });

  it("schedules one oscillator per tone, each a sine", () => {
    const scheduled = scheduleChime(context, AGENT_MESSAGE_CHIME_TONES, 0.5);

    expect(scheduled).toBe(AGENT_MESSAGE_CHIME_TONES.length);
    expect(context.oscillators).toHaveLength(AGENT_MESSAGE_CHIME_TONES.length);
    expect(context.oscillators.every((o) => o.type === "sine")).toBe(true);
  });

  it("uses the documented frequencies for the agent chime", () => {
    scheduleChime(context, AGENT_MESSAGE_CHIME_TONES, 0.5);
    expect(context.oscillators.map((o) => o.frequency.value)).toEqual([
      659.25, 880,
    ]);
  });

  it("stamps each oscillator at context.currentTime plus its own offset", () => {
    scheduleChime(context, AGENT_MESSAGE_CHIME_TONES, 0.5);

    AGENT_MESSAGE_CHIME_TONES.forEach((tone, index) => {
      expect(context.oscillators[index].start).toHaveBeenCalledWith(
        context.currentTime + tone.startOffsetSeconds
      );
    });
  });

  it("stops every oscillator so nothing keeps playing after the tone ends", () => {
    scheduleChime(context, AGENT_MESSAGE_CHIME_TONES, 0.5);

    AGENT_MESSAGE_CHIME_TONES.forEach((tone, index) => {
      const expectedStop =
        context.currentTime + tone.startOffsetSeconds + tone.durationSeconds;
      expect(context.oscillators[index].stop).toHaveBeenCalledWith(
        expect.closeTo(expectedStop, 5)
      );
    });
  });

  it("honours an explicit start time", () => {
    scheduleChime(
      context,
      [
        {
          frequency: 440,
          startOffsetSeconds: 0,
          durationSeconds: 0.2,
          gain: 0.3,
        },
      ],
      0.5,
      99
    );

    expect(context.oscillators[0].start).toHaveBeenCalledWith(99);
    expect(context.oscillators[0].stop).toHaveBeenCalledWith(99.2);
  });

  it("clamps a negative offset to zero rather than scheduling in the past", () => {
    scheduleChime(
      context,
      [
        {
          frequency: 440,
          startOffsetSeconds: -1,
          durationSeconds: 0.2,
          gain: 0.3,
        },
      ],
      0.5
    );

    expect(context.oscillators[0].start).toHaveBeenCalledWith(
      context.currentTime
    );
  });

  it("routes every tone through a master gain into the destination", () => {
    scheduleChime(context, AGENT_MESSAGE_CHIME_TONES, 0.5);

    const master = context.gains[0];
    expect(master.connectedTo).toBe(context.destination);
    for (const oscillator of context.oscillators) {
      expect(oscillator.envelope).not.toBeNull();
      expect(oscillator.envelope?.connectedTo).toBe(master);
    }
  });

  it("scales the master gain by the requested volume", () => {
    scheduleChime(context, AGENT_MESSAGE_CHIME_TONES, 0.5);
    const quiet = context.gains[0].gain.value;

    const loud = createFakeAudioContext();
    scheduleChime(loud, AGENT_MESSAGE_CHIME_TONES, 1);
    const louder = loud.gains[0].gain.value;

    expect(quiet).toBeGreaterThan(0);
    expect(louder).toBeGreaterThan(quiet);
  });

  it("ramps each envelope up from near-silence and back down", () => {
    scheduleChime(context, AGENT_MESSAGE_CHIME_TONES, 0.5);

    for (const oscillator of context.oscillators) {
      const envelope = oscillator.envelope!.gain;
      expect(envelope.setValueAtTime).toHaveBeenCalledWith(
        0.0001,
        expect.any(Number)
      );
      expect(envelope.exponentialRampToValueAtTime).toHaveBeenCalledTimes(2);
      // Never ramps to or from exactly 0: exponential ramps are undefined there.
      for (const call of envelope.exponentialRampToValueAtTime.mock.calls) {
        expect(call[0]).toBeGreaterThan(0);
      }
    }
  });

  it("returns 0 and creates nothing for an empty tone list", () => {
    expect(scheduleChime(context, [], 0.5)).toBe(0);
    expect(context.oscillators).toHaveLength(0);
  });

  it("keeps a zero-gain tone inaudible rather than throwing", () => {
    const tones: ChimeTone[] = [
      { frequency: 440, startOffsetSeconds: 0, durationSeconds: 0.2, gain: 0 },
    ];

    expect(() => scheduleChime(context, tones, 0.5)).not.toThrow();
    expect(
      context.oscillators[0].envelope!.gain.exponentialRampToValueAtTime
    ).toHaveBeenCalledWith(0.0001, expect.any(Number));
  });
});

describe("audioChime — playChime", () => {
  it("schedules the agent chime and reports success", () => {
    const context = install();

    expect(playChime(0.5)).toBe(true);
    expect(context.oscillators).toHaveLength(AGENT_MESSAGE_CHIME_TONES.length);
    expect(context.resume).toHaveBeenCalled();
  });

  it("reuses a single context across calls instead of creating a new one", () => {
    const context = install();

    playChime(0.5);
    playChime(0.5);

    expect(context.createOscillator).toHaveBeenCalledTimes(
      AGENT_MESSAGE_CHIME_TONES.length * 2
    );
    expect(context.createGain).toHaveBeenCalledTimes(
      (AGENT_MESSAGE_CHIME_TONES.length + 1) * 2
    );
  });

  it("skips playback when the browser has no Web Audio support", () => {
    delete (window as unknown as Record<string, unknown>).AudioContext;
    delete (window as unknown as Record<string, unknown>).webkitAudioContext;

    expect(playChime(0.5)).toBe(false);
  });

  it("skips playback when the volume is muted", () => {
    const context = install();

    expect(playChime(0)).toBe(false);
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("skips playback when reduced motion is requested", () => {
    const context = install();
    document.documentElement.dataset.reduceMotion = "on";

    expect(playChime(0.5)).toBe(false);
    expect(context.createOscillator).not.toHaveBeenCalled();
  });

  it("survives an autoplay-blocked resume without throwing", async () => {
    const context = install({ resumeResult: "reject" });

    expect(playChime(0.5)).toBe(true);
    await Promise.resolve();
    expect(context.oscillators).toHaveLength(AGENT_MESSAGE_CHIME_TONES.length);
  });

  it("returns false instead of throwing when the context constructor blows up", () => {
    const scope = window as unknown as Record<string, unknown>;
    scope.AudioContext = function Broken() {
      throw new Error("no audio hardware");
    };

    expect(playChime(0.5)).toBe(false);

    delete scope.AudioContext;
  });

  it("returns false instead of throwing when scheduling fails", () => {
    const context = install();
    context.createOscillator.mockImplementation(() => {
      throw new Error("node limit reached");
    });

    expect(playChime(0.5)).toBe(false);
  });

  it("uses the default tone recipe and volume when called with no arguments", () => {
    const context = install();

    expect(playChime()).toBe(true);
    expect(context.gains[0].gain.value).toBeCloseTo(
      DEFAULT_CHIME_VOLUME * 0.6,
      5
    );
  });

  it("accepts a custom tone recipe", () => {
    const context = install();
    const tones: ChimeTone[] = [
      {
        frequency: 1000,
        startOffsetSeconds: 0,
        durationSeconds: 0.1,
        gain: 0.2,
      },
    ];

    expect(playChime(0.5, tones)).toBe(true);
    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0].frequency.value).toBe(1000);
  });
});
