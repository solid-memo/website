// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { conceptOfPalette } from "@solid-memo/domain/concepts";
import { isPaletteOf } from "@solid-memo/domain/instanceLayout";
import {
  DEFAULT_PREFERENCES,
  shownPalette,
  type PreferencesRead,
  type StoredPreferences,
  type StudyPreferences,
} from "@solid-memo/domain/preferences";
import type {
  PreferencesRepository,
  CustomPalettePreference,
  PalettePreference,
  TextSizePreference,
  ThemePreference,
} from "./ports";

/** Stored preferences that fit their shape; null for none, and for ones that do not. */
function fitting(read: PreferencesRead): StoredPreferences | null {
  return read === "misfit" ? null : read;
}

/**
 * An instance's preferences as the use cases share them: read once for
 * callers that ask at once, and written one after another: the choices
 * of how the app is shown (a theme, a palette, a text size), kept on
 * this device too for the next visit's first paint, and whether logging
 * in skips the Connected screen.
 */
export function createPreferenceStore({
  preferencesRepository,
  themePreference,
  palettePreference,
  customPalettePreference,
  textSizePreference,
}: {
  preferencesRepository: PreferencesRepository;
  themePreference: ThemePreference;
  palettePreference: PalettePreference;
  customPalettePreference: CustomPalettePreference;
  textSizePreference: TextSizePreference;
}) {
  const preferenceReads = new Map<string, Promise<PreferencesRead>>();
  /**
   * An instance's stored preferences as read ("misfit" when they do not
   * fit their shape), one read for callers that ask at once.
   */
  function readPreferences(instanceUrl: string): Promise<PreferencesRead> {
    const inFlight = preferenceReads.get(instanceUrl);
    if (inFlight !== undefined) return inFlight;
    const read = preferencesRepository
      .getPreferences(instanceUrl)
      .finally(() => preferenceReads.delete(instanceUrl));
    preferenceReads.set(instanceUrl, read);
    return read;
  }
  /** An instance's stored preferences; null when there are none, or they do not fit their shape. */
  function readStoredPreferences(instanceUrl: string): Promise<StoredPreferences | null> {
    return readPreferences(instanceUrl).then(fitting);
  }
  /**
   * An instance's preferences: the defaults when none are stored, and
   * while the stored ones do not fit their shape, which are kept as they
   * are (a save replaces them only when the user says to).
   */
  function getPreferences(instanceUrl: string): Promise<StudyPreferences> {
    return readStoredPreferences(instanceUrl).then(
      (stored) => stored?.preferences ?? DEFAULT_PREFERENCES,
    );
  }
  /** Whether an instance's stored preferences do not fit their shape. */
  function isMisfit(instanceUrl: string): Promise<boolean> {
    return readPreferences(instanceUrl).then((read) => read === "misfit");
  }
  /**
   * Each instance's writes of its preferences, one after another: the
   * choices of how the app is shown (a theme, a palette, a text size) and
   * whether logging in skips the Connected screen. So a later choice is
   * never overwritten by an earlier, nor refused for a version an
   * earlier one changed.
   */
  const writes = new Map<string, Promise<void>>();
  /**
   * Make a write of an instance's preferences once the ones queued before
   * it are done, failed ones too. The next read is made afresh.
   */
  function inTurn(instanceUrl: string, write: () => Promise<void>): Promise<void> {
    const previous = writes.get(instanceUrl) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(write)
      // A read begun before the write holds what it replaced.
      .finally(() => preferenceReads.delete(instanceUrl));
    writes.set(instanceUrl, next);
    return next;
  }
  /**
   * Write a choice of how the app is shown into an instance's
   * preferences, in its turn (inTurn): `changed` gives the preferences
   * with the choice in them, or null when they already hold it. Nothing
   * is written while the instance has no preferences, nor while the
   * ones stored do not fit their shape.
   */
  function writeAppearance(
    instanceUrl: string,
    changed: (preferences: StudyPreferences) => StudyPreferences | null,
  ): Promise<void> {
    return inTurn(instanceUrl, async () => {
      const stored = fitting(await preferencesRepository.getPreferences(instanceUrl));
      const next = stored === null ? null : changed(stored.preferences);
      if (next === null) return;
      await preferencesRepository.savePreferences(instanceUrl, next);
    });
  }
  /**
   * Once every write of the instance's preferences queued so far is done,
   * failed ones too: what a save of all the preferences waits for.
   */
  function afterAppearanceWrites(instanceUrl: string): Promise<void> {
    return (writes.get(instanceUrl) ?? Promise.resolve()).catch(() => undefined);
  }
  /**
   * Keep on this device how saved preferences show the app, for the next
   * visit's first paint. A palette of the user's own, which the device
   * keeps as it was chosen, is left as it is.
   */
  function keepAppearance(instanceUrl: string, preferences: StudyPreferences) {
    themePreference.choose(preferences.theme);
    if (!isPaletteOf(instanceUrl, preferences.palette)) {
      palettePreference.choose(shownPalette(preferences));
      customPalettePreference.choose(null);
    }
    textSizePreference.choose(preferences.textSize);
  }
  /**
   * The preferences of an instance made now, or saved for the first
   * time: shown as this device shows the app, its palette of the user's
   * own among them when it is one of that instance's.
   */
  function withDeviceAppearance(
    preferences: StudyPreferences,
    instanceUrl: string | null = null,
  ): StudyPreferences {
    const custom = customPalettePreference.chosen();
    return {
      ...preferences,
      theme: themePreference.chosen(),
      palette:
        custom !== null && instanceUrl !== null && isPaletteOf(instanceUrl, custom.url)
          ? custom.url
          : conceptOfPalette(palettePreference.chosen()),
      textSize: textSizePreference.chosen(),
    };
  }

  return {
    stored: readStoredPreferences,
    get: getPreferences,
    isMisfit,
    inTurn,
    writeAppearance,
    afterAppearanceWrites,
    keepAppearance,
    withDeviceAppearance,
  };
}

export type PreferenceStore = ReturnType<typeof createPreferenceStore>;
