import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";

import { ChatAudioSettingsCard } from "./ChatAudioSettingsCard";
import { AudioNotificationsProvider } from "../../hooks/useAudioNotifications";
import { resetSharedAudioContext } from "../../lib/audioChime";
import {
  AUDIO_NOTIFICATION_STORAGE_KEY,
  MIN_AUDIO_NOTIFICATION_VOLUME,
} from "../../lib/audioNotification";
import enMessages from "../../messages/en.json";
import deMessages from "../../messages/de.json";
import {
  installFakeAudioContext,
  mockMatchMedia,
} from "../../tests/fakeAudioContext";

const playChimeSpy = vi.hoisted(() => vi.fn(() => true));

vi.mock("../../lib/audioChime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/audioChime")>();
  return { ...actual, playChime: playChimeSpy };
});

let uninstallAudio: (() => void) | undefined;
let uninstallMatchMedia: (() => void) | undefined;

function renderCard(messages: AbstractIntlMessages = enMessages) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AudioNotificationsProvider>
        <ChatAudioSettingsCard />
      </AudioNotificationsProvider>
    </NextIntlClientProvider>
  );
}

/** Sets the range input directly — userEvent's typing helpers don't apply to `<input type="range">`. */
function setVolume(value: number) {
  fireEvent.change(
    screen.getByRole("slider", { name: /volume|Volume|Lautstärke/i }),
    {
      target: { value: String(value) },
    }
  );
}

function readStoredPreferences() {
  return JSON.parse(
    window.localStorage.getItem(AUDIO_NOTIFICATION_STORAGE_KEY) ?? "{}"
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetSharedAudioContext();
  playChimeSpy.mockClear();
  playChimeSpy.mockReturnValue(true);
  delete document.documentElement.dataset.reduceMotion;
  const installed = installFakeAudioContext();
  uninstallAudio = installed.uninstall;
  uninstallMatchMedia = mockMatchMedia(false);
});

afterEach(() => {
  uninstallAudio?.();
  uninstallMatchMedia?.();
  uninstallAudio = undefined;
  uninstallMatchMedia = undefined;
  window.localStorage.clear();
  resetSharedAudioContext();
  delete document.documentElement.dataset.reduceMotion;
});

describe("ChatAudioSettingsCard — rendering", () => {
  it("renders as a labelled region with the toggle and controls", () => {
    renderCard();

    expect(
      screen.getByRole("region", { name: "Chat sound preferences" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /Play a chime for new agent messages/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Volume" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Play test chime/i })
    ).toBeInTheDocument();
  });

  it("explains that the chime is off by default", () => {
    renderCard();

    expect(screen.getByText(/Off by default/i)).toBeInTheDocument();
  });

  it("defaults to muted at a mid-low volume", async () => {
    renderCard();

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Play a chime/i })
      ).not.toBeChecked()
    );
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0.4");
  });

  it("disables the volume slider while the chime is muted", async () => {
    renderCard();

    expect(screen.getByRole("slider", { name: "Volume" })).toBeDisabled();
  });
});

describe("ChatAudioSettingsCard — persistence", () => {
  it("enabling the chime persists the opt-in", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("checkbox", { name: /Play a chime/i }));

    expect(
      screen.getByRole("checkbox", { name: /Play a chime/i })
    ).toBeChecked();
    await waitFor(() =>
      expect(readStoredPreferences()).toEqual({
        soundEnabled: true,
        volume: 0.4,
      })
    );
  });

  it("enabling the chime re-enables the volume slider", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("checkbox", { name: /Play a chime/i }));

    expect(screen.getByRole("slider", { name: "Volume" })).toBeEnabled();
  });

  it("changing the volume persists without clearing the opt-in", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("checkbox", { name: /Play a chime/i }));
    await waitFor(() =>
      expect(readStoredPreferences()).toMatchObject({ soundEnabled: true })
    );

    setVolume(0.8);

    await waitFor(() => expect(readStoredPreferences().volume).toBe(0.8));
    expect(readStoredPreferences().soundEnabled).toBe(true);
  });

  it("never persists a volume below the minimum", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("checkbox", { name: /Play a chime/i }));
    setVolume(0);

    await waitFor(() =>
      expect(readStoredPreferences().volume).toBe(MIN_AUDIO_NOTIFICATION_VOLUME)
    );
  });

  it("restores a persisted selection on mount", async () => {
    window.localStorage.setItem(
      AUDIO_NOTIFICATION_STORAGE_KEY,
      JSON.stringify({ soundEnabled: true, volume: 0.65 })
    );

    renderCard();

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: /Play a chime/i })
      ).toBeChecked()
    );
    expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0.65");
  });
});

describe("ChatAudioSettingsCard — suppression copy", () => {
  it("tells the visitor to turn the chime on while it is muted", () => {
    renderCard();

    expect(
      screen.getByText(/Turn the chime on to hear it/i)
    ).toBeInTheDocument();
  });

  it("drops the muted hint once the chime is enabled", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("checkbox", { name: /Play a chime/i }));

    await waitFor(() =>
      expect(screen.queryByText(/Turn the chime on to hear it/i)).toBeNull()
    );
  });

  it("explains a reduced-motion suppression instead of looking broken", async () => {
    uninstallMatchMedia?.();
    uninstallMatchMedia = mockMatchMedia(true);
    window.localStorage.setItem(
      AUDIO_NOTIFICATION_STORAGE_KEY,
      JSON.stringify({ soundEnabled: true, volume: 0.4 })
    );

    renderCard();

    expect(
      await screen.findByText(/your device is set to reduce motion/i)
    ).toBeInTheDocument();
  });

  it("explains an unsupported browser", async () => {
    uninstallAudio?.();
    uninstallAudio = undefined;
    delete (window as unknown as Record<string, unknown>).AudioContext;
    window.localStorage.setItem(
      AUDIO_NOTIFICATION_STORAGE_KEY,
      JSON.stringify({ soundEnabled: true, volume: 0.4 })
    );

    renderCard();

    expect(
      await screen.findByText(/can't play synthesised audio/i)
    ).toBeInTheDocument();
  });
});

describe("ChatAudioSettingsCard — test chime", () => {
  it("plays a preview at the selected volume while muted", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("button", { name: /Play test chime/i }));

    expect(playChimeSpy).toHaveBeenCalledWith(0.4);
  });

  it("previews at the volume picked in the slider", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.click(screen.getByRole("checkbox", { name: /Play a chime/i }));
    setVolume(0.7);

    await waitFor(() =>
      expect(screen.getByRole("slider", { name: "Volume" })).toHaveValue("0.7")
    );
    await user.click(screen.getByRole("button", { name: /Play test chime/i }));

    expect(playChimeSpy).toHaveBeenLastCalledWith(0.7);
  });

  it("stays silent under reduced motion", async () => {
    const user = userEvent.setup();
    uninstallMatchMedia?.();
    uninstallMatchMedia = mockMatchMedia(true);
    renderCard();

    await user.click(screen.getByRole("button", { name: /Play test chime/i }));

    expect(playChimeSpy).not.toHaveBeenCalled();
  });
});

describe("ChatAudioSettingsCard — accessibility", () => {
  it("associates the volume slider with its label and exposes a value text", () => {
    renderCard();

    const slider = screen.getByRole("slider", { name: "Volume" });
    expect(slider).toHaveAttribute("aria-valuetext", "40%");
    expect(slider).toHaveAttribute(
      "aria-labelledby",
      screen.getByText("Volume").id
    );
  });

  it("puts the toggle first in the tab order", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.tab();

    expect(
      screen.getByRole("checkbox", { name: /Play a chime/i })
    ).toHaveFocus();
  });
});

describe("ChatAudioSettingsCard — localisation", () => {
  it("renders German copy for the de locale", () => {
    renderCard(deMessages);

    expect(
      screen.getByRole("region", { name: "Chat-Ton-Einstellungen" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /Signalton für neue Agentennachrichten abspielen/i,
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("slider", { name: "Lautstärke" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Testton abspielen/i })
    ).toBeInTheDocument();
  });
});
