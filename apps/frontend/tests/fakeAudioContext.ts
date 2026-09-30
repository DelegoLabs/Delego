import { vi, type Mock } from "vitest";

/**
 * Minimal Web Audio API doubles for the live-chat chime tests (#811).
 *
 * jsdom implements no audio at all, so `AudioContext` — `createOscillator`,
 * `createGain`, `currentTime`, and the whole scheduling graph — is stubbed
 * here. The stubs record enough to assert *what* was synthesised (frequencies,
 * envelope shape, stop times) without ever making a sound, which is both
 * faster and the only way to verify the synthesis deterministically.
 */

export interface FakeAudioParam {
  value: number;
  setValueAtTime: Mock;
  exponentialRampToValueAtTime: Mock;
}

export interface FakeAudioNode {
  connect: Mock;
}

export interface FakeOscillatorNode extends FakeAudioNode {
  type: OscillatorType;
  frequency: FakeAudioParam;
  start: Mock;
  stop: Mock;
  /** Gain node this oscillator was connected to, if any. */
  envelope: FakeGainNode | null;
}

export interface FakeGainNode extends FakeAudioNode {
  gain: FakeAudioParam;
  /** What this node was connected to: another gain node or the destination. */
  connectedTo: FakeGainNode | FakeAudioDestination | null;
}

export interface FakeAudioDestination {
  readonly id: "destination";
}

export interface FakeAudioContext {
  currentTime: number;
  state: string;
  destination: FakeAudioDestination;
  resume: Mock;
  close: Mock;
  createGain: Mock;
  createOscillator: Mock;
  /** Gain nodes created, in creation order: [master, ...perToneEnvelopes]. */
  gains: FakeGainNode[];
  oscillators: FakeOscillatorNode[];
}

function createParam(initial: number): FakeAudioParam {
  return {
    value: initial,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

/** Builds a fresh fake context. `resumeResult` controls whether resume() rejects. */
export function createFakeAudioContext(
  options: { resumeResult?: "resolve" | "reject" } = {}
): FakeAudioContext {
  const gains: FakeGainNode[] = [];
  const oscillators: FakeOscillatorNode[] = [];
  const destination: FakeAudioDestination = { id: "destination" };

  const context: FakeAudioContext = {
    currentTime: 10,
    state: "running",
    destination,
    gains,
    oscillators,
    resume: vi.fn(() =>
      options.resumeResult === "reject"
        ? Promise.reject(new Error("autoplay blocked"))
        : Promise.resolve()
    ),
    close: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(() => {
      const node: FakeGainNode = {
        gain: createParam(1),
        connectedTo: null,
        connect: vi.fn(),
      };
      node.connect.mockImplementation(
        (target: FakeGainNode | FakeAudioDestination) => {
          node.connectedTo = target;
        }
      );
      gains.push(node);
      return node;
    }),
    createOscillator: vi.fn(() => {
      const node: FakeOscillatorNode = {
        type: "sine",
        frequency: createParam(440),
        start: vi.fn(),
        stop: vi.fn(),
        connect: vi.fn(),
        envelope: null,
      };
      node.connect.mockImplementation((target: FakeGainNode) => {
        node.envelope = target;
      });
      oscillators.push(node);
      return node;
    }),
  };

  return context;
}

/**
 * Installs `AudioContext` (plus the legacy `webkitAudioContext` alias) on
 * `window`, returning the fake and an uninstall function.
 *
 * The fake *is* the constructor, so `new AudioContext()` in lib/audioChime.ts
 * produces it — `as unknown as` is unavoidable without pulling in DOM lib
 * overloads that don't apply to a stub.
 */
export function installFakeAudioContext(
  options: { resumeResult?: "resolve" | "reject" } = {}
): {
  context: FakeAudioContext;
  uninstall: () => void;
} {
  const context = createFakeAudioContext(options);

  function FakeCtor(this: unknown) {
    return context;
  }

  const scope = window as unknown as Record<string, unknown>;
  const hadAudioContext = "AudioContext" in scope;
  const hadWebkit = "webkitAudioContext" in scope;
  const previousAudioContext = scope.AudioContext;
  const previousWebkit = scope.webkitAudioContext;

  scope.AudioContext = FakeCtor;
  scope.webkitAudioContext = FakeCtor;

  return {
    context,
    uninstall: () => {
      if (hadAudioContext) scope.AudioContext = previousAudioContext;
      else delete scope.AudioContext;
      if (hadWebkit) scope.webkitAudioContext = previousWebkit;
      else delete scope.webkitAudioContext;
    },
  };
}

/** Stubs `window.matchMedia` for one query; mirrors components/providers/ViewTransitions.test.tsx. */
export function mockMatchMedia(reducedMotion: boolean): () => void {
  const previous = window.matchMedia;
  const listeners = new Set<() => void>();

  window.matchMedia = vi.fn().mockImplementation((query: string) => {
    const mediaQueryList = {
      matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
      media: query,
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_event: string, listener: () => void) => {
        listeners.delete(listener);
      }),
      onchange: null,
      dispatchEvent: vi.fn(() => true),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    return mediaQueryList as unknown as MediaQueryList;
  });

  return () => {
    window.matchMedia = previous;
  };
}
