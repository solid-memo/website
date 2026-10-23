// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { conceptOfPalette } from "@solid-memo/domain/concepts";
import { isPaletteOf } from "@solid-memo/domain/instanceLayout";
import {
  DEFAULT_PREFERENCES,
  shownPalette,
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

/**
 * An instance's preferences as the use cases share them: read once for
 * callers that ask at once, and the choices of how the app is shown (a
 * theme, a palette, a text size) written into them one after another,
 * and kept on this device for the next visit's first paint.
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
  const preferenceReads = new Map<string, Promise<StoredPreferences | null>>();
  /** An instance's stored preferences, one read for callers that ask at once. */
  function readStoredPreferences(instanceUrl: string): Promise<StoredPreferences | null> {
    const inFlight = preferenceReads.get(instanceUrl);
    if (inFlight !== undefined) return inFlight;
    const read = preferencesRepository
      .getPreferences(instanceUrl)
      .finally(() => preferenceReads.delete(instanceUrl));
    preferenceReads.set(instanceUrl, read);
    return read;
  }
  function getPreferences(instanceUrl: string): Promise<StudyPreferences> {
    return readStoredPreferences(instanceUrl).then(
      (stored) => stored?.preferences ?? DEFAULT_PREFERENCES,
    );
  }
  /**
   * Each instance's writes of a theme, a palette or a text size, one
   * after another, so a later choice is never overwritten by an earlier,
   * nor refused for a version an earlier one changed.
   */
  const appearanceWrites = new Map<string, Promise<void>>();
  /**
   * Write a choice of how the app is shown into an instance's
   * preferences, once the earlier ones are written: `changed` gives the
   * preferences with the choice in them, or null when they already hold
   * it. Nothing is written while the instance has no preferences.
   */
  function writeAppearance(
    instanceUrl: string,
    changed: (preferences: StudyPreferences) => StudyPreferences | null,
  ): Promise<void> {
    const previous = appearanceWrites.get(instanceUrl) ?? Promise.resolve();
    const write = previous
      .catch(() => undefined)
      .then(async () => {
        const stored = await preferencesRepository.getPreferences(instanceUrl);
        const next = stored === null ? null : changed(stored.preferences);
        if (next === null) return;
        await preferencesRepository.savePreferences(instanceUrl, next);
        // A read begun before the write holds what it replaced: the next read is made afresh.
        preferenceReads.delete(instanceUrl);
      });
    appearanceWrites.set(instanceUrl, write);
    return write;
  }
  /** Once the appearance writes made so far are done, failed ones too: what a save of all the preferences waits for. */
  function afterAppearanceWrites(instanceUrl: string): Promise<void> {
    return (appearanceWrites.get(instanceUrl) ?? Promise.resolve()).catch(() => undefined);
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
    writeAppearance,
    afterAppearanceWrites,
    keepAppearance,
    withDeviceAppearance,
  };
}

export type PreferenceStore = ReturnType<typeof createPreferenceStore>;
