// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import { describe, expect, it, vi } from "vitest";
import { createUseCases } from "./useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { DEFAULT_PREFERENCES } from "@solid-memo/domain/preferences";
import type { Palette } from "@solid-memo/domain/palette";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import type { TextSize } from "@solid-memo/domain/textSize";
import type { ThemeChoice } from "@solid-memo/domain/theme";
import { memoryFromSm2, nextMemory } from "@solid-memo/domain/fsrs";
import type { SwitchProgress } from "@solid-memo/domain/schedulerSwitch";
import type { ReviewState } from "@solid-memo/domain/review";
import type { Locale } from "@solid-memo/domain/locale";
import { sm2s, instance, deck, card, makeDeps, memoryLog } from "./testing/fakePorts";

describe("preferences", () => {
  const noon = new Date(2026, 8, 21, 12, 0);
  const setup = () => {
    const deps = makeDeps();
    const { log, byMonth } = memoryLog();
    let id = 0;
    const useCases = createUseCases({
      ...deps,
      answerLog: log,
      newId: () => `id${++id}-0000-0000`,
    });
    return { deps, log, byMonth, useCases };
  };

  describe("language", () => {
    it("speaks the chosen language, and keeps a new choice", () => {
      let chosen: Locale | null = "sv";
      const languagePreference = {
        chosen: () => chosen,
        choose: vi.fn((locale: Locale) => {
          chosen = locale;
        }),
      };
      const useCases = createUseCases({ ...makeDeps(), languagePreference });
      expect(useCases.language(["en-US"])).toBe("sv");
      useCases.chooseLanguage("en");
      expect(languagePreference.choose).toHaveBeenCalledWith("en");
      expect(useCases.language(["sv-SE"])).toBe("en");
    });

    it("speaks the browser's language when none is kept", () => {
      const useCases = createUseCases(makeDeps());
      useCases.chooseLanguage("en");
      expect(useCases.language(["sv-SE"])).toBe("sv");
    });
  });
  describe("palette", () => {
    const INSTANCE = "https://pod.example/solid-memo/main/";
    const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
    /** A palette this version does not know: a later version's. */
    const LATER_PALETTE = `${SM}sepiaPalette`;

    function devicePreference(initial: Palette = "standard") {
      let chosen = initial;
      return {
        chosen: () => chosen,
        choose: vi.fn((palette: Palette) => {
          chosen = palette;
        }),
      };
    }

    function stored(palette: string) {
      return { preferences: { ...DEFAULT_PREFERENCES, palette }, formatVersion: 6 };
    }

    it("shows the chosen palette, and keeps a new choice on this device", async () => {
      const palettePreference = devicePreference("high-contrast");
      const deps = makeDeps();
      const useCases = createUseCases({ ...deps, palettePreference });
      expect(useCases.paletteChoice()).toBe("high-contrast");
      await useCases.choosePalette("standard", null);
      expect(palettePreference.choose).toHaveBeenCalledWith("standard");
      expect(useCases.paletteChoice()).toBe("standard");
      expect(deps.preferencesRepository.getPreferences).not.toHaveBeenCalled();
    });

    it("shows the standard palette when none is kept", async () => {
      const useCases = createUseCases(makeDeps());
      await useCases.choosePalette("high-contrast", null);
      expect(useCases.paletteChoice()).toBe("standard");
    });

    it("reads an instance's palette, and keeps it on this device for the first paint", async () => {
      const palettePreference = devicePreference();
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(
        stored(`${SM}parchmentPalette`),
      );
      const useCases = createUseCases({ ...deps, palettePreference });
      await expect(useCases.instancePalette(INSTANCE)).resolves.toEqual({
        palette: "parchment",
        custom: null,
      });
      expect(useCases.paletteChoice()).toBe("parchment");
    });

    it("shows an instance's palette this version does not know as Standard", async () => {
      const palettePreference = devicePreference("high-contrast");
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored(LATER_PALETTE));
      const useCases = createUseCases({ ...deps, palettePreference });
      await expect(useCases.instancePalette(INSTANCE)).resolves.toEqual({
        palette: "standard",
        custom: null,
      });
      expect(useCases.paletteChoice()).toBe("standard");
    });

    it("has no instance palette before the instance's first preferences, and leaves the device's", async () => {
      const palettePreference = devicePreference("parchment");
      const useCases = createUseCases({ ...makeDeps(), palettePreference });
      await expect(useCases.instancePalette(INSTANCE)).resolves.toBeNull();
      expect(palettePreference.choose).not.toHaveBeenCalled();
    });

    it("keeps a choice in the instance's preferences once it has them", async () => {
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(
        stored(`${SM}standardPalette`),
      );
      const useCases = createUseCases(deps);
      await useCases.choosePalette("color-vision", INSTANCE);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledExactlyOnceWith(INSTANCE, {
        ...DEFAULT_PREFERENCES,
        palette: `${SM}colorVisionPalette`,
      });
    });

    it("writes nothing before the instance's first preferences, when they already say it, or for Standard over a palette this version does not know", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await useCases.choosePalette("parchment", INSTANCE);
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(
        stored(`${SM}parchmentPalette`),
      );
      await useCases.choosePalette("parchment", INSTANCE);
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored(LATER_PALETTE));
      await useCases.choosePalette("standard", INSTANCE);
      expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
    });

    it("writes one choice after another, a theme's among them", async () => {
      const deps = makeDeps();
      let preferences = { ...DEFAULT_PREFERENCES };
      vi.mocked(deps.preferencesRepository.getPreferences).mockImplementation(async () => ({
        preferences,
        formatVersion: 6,
      }));
      vi.mocked(deps.preferencesRepository.savePreferences).mockImplementation(async (_, saved) => {
        preferences = saved;
      });
      const useCases = createUseCases(deps);
      await Promise.all([
        useCases.chooseTheme("dark", INSTANCE),
        useCases.choosePalette("high-contrast", INSTANCE),
        useCases.chooseTextSize("largest", INSTANCE),
      ]);
      expect(preferences).toEqual({
        ...DEFAULT_PREFERENCES,
        theme: "dark",
        palette: `${SM}highContrastPalette`,
        textSize: "largest",
      });
    });

    it("reads the preferences afresh after a choice is written, not with a read begun before it", async () => {
      const deps = makeDeps();
      let stored = {
        preferences: { ...DEFAULT_PREFERENCES, palette: `${SM}standardPalette` },
        formatVersion: 6,
      };
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      // The first read is held until the choice is written; every other is answered at once.
      vi.mocked(deps.preferencesRepository.getPreferences)
        .mockImplementationOnce(async () => {
          const then = stored;
          await held;
          return then;
        })
        .mockImplementation(async () => stored);
      vi.mocked(deps.preferencesRepository.savePreferences).mockImplementation(async (_, saved) => {
        stored = { preferences: saved, formatVersion: 6 };
      });
      const useCases = createUseCases(deps);
      const before = useCases.instancePalette(INSTANCE);
      await useCases.choosePalette("parchment", INSTANCE);
      const after = useCases.instancePalette(INSTANCE);
      release();
      await expect(before).resolves.toEqual({ palette: "standard", custom: null });
      await expect(after).resolves.toEqual({ palette: "parchment", custom: null });
    });

    it("keeps the palette of saved preferences on this device, and a stored one this version does not know while Standard is shown", async () => {
      const palettePreference = devicePreference("parchment");
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored(LATER_PALETTE));
      const useCases = createUseCases({ ...deps, palettePreference });
      await useCases.savePreferences(INSTANCE, {
        ...DEFAULT_PREFERENCES,
        palette: `${SM}standardPalette`,
      });
      expect(useCases.paletteChoice()).toBe("standard");
      expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(INSTANCE, {
        ...DEFAULT_PREFERENCES,
        palette: LATER_PALETTE,
      });
      await useCases.savePreferences(INSTANCE, {
        ...DEFAULT_PREFERENCES,
        palette: `${SM}highContrastPalette`,
      });
      expect(useCases.paletteChoice()).toBe("high-contrast");
      expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(INSTANCE, {
        ...DEFAULT_PREFERENCES,
        palette: `${SM}highContrastPalette`,
      });
    });

    describe("of the user's own", () => {
      const READING: CustomPalette = {
        url: `${INSTANCE}palettes.ttl#palette-reading`,
        title: { en: "Reading" },
        basedOn: "parchment",
        light: { "--text": "#2b2118" },
        dark: {},
      };

      function deviceCopy(initial: CustomPalette | null = null) {
        let chosen = initial;
        return {
          chosen: () => chosen,
          choose: vi.fn((palette: CustomPalette | null) => {
            chosen = palette;
          }),
        };
      }

      function paletteRepository(palettes: CustomPalette[] = [READING]) {
        return {
          listPalettes: vi.fn(async () => palettes),
          savePalette: vi.fn(async () => undefined),
        };
      }

      it("shows the one an instance's preferences name, over its base, and keeps it on this device", async () => {
        const deps = makeDeps();
        vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored(READING.url));
        const palettePreference = devicePreference();
        const customPalettePreference = deviceCopy();
        const palettes = paletteRepository();
        const useCases = createUseCases({
          ...deps,
          palettePreference,
          customPalettePreference,
          paletteRepository: palettes,
        });
        await expect(useCases.instancePalette(INSTANCE)).resolves.toEqual({
          palette: "parchment",
          custom: READING,
        });
        expect(palettes.listPalettes).toHaveBeenCalledWith(INSTANCE);
        expect(useCases.paletteChoice()).toBe("parchment");
        expect(useCases.customPaletteChoice()).toEqual(READING);
      });

      it("shows one the palettes document no longer has as Standard, and forgets the device's copy", async () => {
        const deps = makeDeps();
        vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(
          stored(`${INSTANCE}palettes.ttl#palette-gone`),
        );
        const customPalettePreference = deviceCopy(READING);
        const useCases = createUseCases({
          ...deps,
          customPalettePreference,
          paletteRepository: paletteRepository(),
        });
        await expect(useCases.instancePalette(INSTANCE)).resolves.toEqual({
          palette: "standard",
          custom: null,
        });
        expect(useCases.customPaletteChoice()).toBeNull();
      });

      it("shows one whose text is unreadable as its base, keeping it named, and forgets the device's copy", async () => {
        const unreadable: CustomPalette = { ...READING, dark: { "--text": "#26221b" } };
        const deps = makeDeps();
        vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored(READING.url));
        const useCases = createUseCases({
          ...deps,
          palettePreference: devicePreference(),
          customPalettePreference: deviceCopy(READING),
          paletteRepository: paletteRepository([unreadable]),
        });
        await expect(useCases.instancePalette(INSTANCE)).resolves.toEqual({
          palette: "parchment",
          custom: null,
        });
        expect(useCases.paletteChoice()).toBe("parchment");
        expect(useCases.customPaletteChoice()).toBeNull();
        expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
      });

      it("forgets a device's copy whose text is unreadable", () => {
        const customPalettePreference = deviceCopy({ ...READING, light: { "--text": "#fbf3db" } });
        const useCases = createUseCases({ ...makeDeps(), customPalettePreference });
        expect(useCases.customPaletteChoice()).toBeNull();
        expect(customPalettePreference.choose).toHaveBeenCalledWith(null);
        expect(customPalettePreference.chosen()).toBeNull();
      });

      it("reads no document but the instance's own palettes for the palette its preferences name", async () => {
        const deps = makeDeps();
        vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(
          stored("https://evil.example/palettes.ttl#palette-reading"),
        );
        const palettes = paletteRepository();
        const useCases = createUseCases({ ...deps, paletteRepository: palettes });
        await expect(useCases.instancePalette(INSTANCE)).resolves.toEqual({
          palette: "standard",
          custom: null,
        });
        expect(palettes.listPalettes).not.toHaveBeenCalled();
      });

      it("is chosen on this device and in the instance's preferences by its address", async () => {
        const deps = makeDeps();
        let preferences = { ...DEFAULT_PREFERENCES };
        vi.mocked(deps.preferencesRepository.getPreferences).mockImplementation(async () => ({
          preferences,
          formatVersion: 6,
        }));
        vi.mocked(deps.preferencesRepository.savePreferences).mockImplementation(
          async (_, saved) => {
            preferences = saved;
          },
        );
        const palettePreference = devicePreference();
        const customPalettePreference = deviceCopy();
        const useCases = createUseCases({ ...deps, palettePreference, customPalettePreference });
        await useCases.chooseCustomPalette(READING, INSTANCE);
        expect(useCases.paletteChoice()).toBe("parchment");
        expect(useCases.customPaletteChoice()).toEqual(READING);
        expect(preferences.palette).toBe(READING.url);
        // Already chosen: nothing to write.
        await useCases.chooseCustomPalette(READING, INSTANCE);
        expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledTimes(1);
        // A built-in palette replaces it, Standard too, on the device and in the preferences.
        await useCases.choosePalette("standard", INSTANCE);
        expect(useCases.customPaletteChoice()).toBeNull();
        expect(preferences.palette).toBe(`${SM}standardPalette`);
      });

      it("stays through a save of the preferences that shows it, and is replaced by one that shows another", async () => {
        const deps = makeDeps();
        vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored(READING.url));
        const palettePreference = devicePreference("parchment");
        const customPalettePreference = deviceCopy(READING);
        const useCases = createUseCases({ ...deps, palettePreference, customPalettePreference });
        await useCases.savePreferences(INSTANCE, { ...DEFAULT_PREFERENCES, palette: READING.url });
        expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(INSTANCE, {
          ...DEFAULT_PREFERENCES,
          palette: READING.url,
        });
        // The device keeps it as it was chosen.
        expect(useCases.customPaletteChoice()).toEqual(READING);
        expect(useCases.paletteChoice()).toBe("parchment");
        await useCases.savePreferences(INSTANCE, {
          ...DEFAULT_PREFERENCES,
          palette: `${SM}standardPalette`,
        });
        expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(INSTANCE, {
          ...DEFAULT_PREFERENCES,
          palette: `${SM}standardPalette`,
        });
        expect(useCases.customPaletteChoice()).toBeNull();
      });

      it("is what the instance's first preferences take when this device shows it", async () => {
        const deps = makeDeps();
        const useCases = createUseCases({
          ...deps,
          palettePreference: devicePreference("parchment"),
          customPalettePreference: deviceCopy(READING),
        });
        await useCases.dismissSchedulerInvitation(INSTANCE);
        expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledWith(
          INSTANCE,
          expect.objectContaining({ palette: READING.url }),
        );
        // Another instance's own palette is not this one's: its base is taken.
        await useCases.dismissSchedulerInvitation("https://pod.example/solid-memo/other/");
        expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(
          "https://pod.example/solid-memo/other/",
          expect.objectContaining({ palette: `${SM}parchmentPalette` }),
        );
      });

      it("are listed, and saved, a new one at a subject of its own", async () => {
        const palettes = paletteRepository();
        const useCases = createUseCases({
          ...makeDeps(),
          paletteRepository: palettes,
          newId: () => "n1",
        });
        await expect(useCases.listPalettes(INSTANCE)).resolves.toEqual([READING]);
        const { url: _, ...draft } = READING;
        await expect(useCases.savePalette(INSTANCE, { ...draft, url: null })).resolves.toEqual({
          ...READING,
          url: `${INSTANCE}palettes.ttl#palette-n1`,
        });
        expect(palettes.savePalette).toHaveBeenCalledWith(INSTANCE, {
          ...READING,
          url: `${INSTANCE}palettes.ttl#palette-n1`,
        });
      });

      it("keeps the device's copy of the palette it shows up to date as it is saved", async () => {
        const customPalettePreference = deviceCopy(READING);
        const useCases = createUseCases({
          ...makeDeps(),
          customPalettePreference,
          paletteRepository: paletteRepository(),
        });
        const edited = { ...READING, light: { "--text": "#000000" } };
        await useCases.savePalette(INSTANCE, edited);
        expect(useCases.customPaletteChoice()).toEqual(edited);
        await useCases.savePalette(INSTANCE, { ...edited, url: null });
        expect(useCases.customPaletteChoice()).toEqual(edited);
      });

      it("refuses one with no name, unreadable text, or colors below their contrast unless used anyway", async () => {
        const palettes = paletteRepository();
        const useCases = createUseCases({ ...makeDeps(), paletteRepository: palettes });
        const code = (promise: Promise<unknown>) =>
          promise.then(
            () => "saved",
            (error: unknown) => (error instanceof AppError ? error.code : String(error)),
          );
        await expect(
          code(useCases.savePalette(INSTANCE, { ...READING, title: { en: " " } })),
        ).resolves.toBe("paletteNameEmpty");
        await expect(
          code(useCases.savePalette(INSTANCE, { ...READING, light: { "--text": "#f0e8d0" } })),
        ).resolves.toBe("paletteUnreadable");
        const low = { ...READING, light: { "--text-muted": "#9a9080" } };
        await expect(code(useCases.savePalette(INSTANCE, low))).resolves.toBe("paletteContrastLow");
        expect(palettes.savePalette).not.toHaveBeenCalled();
        await expect(code(useCases.savePalette(INSTANCE, low, { useAnyway: true }))).resolves.toBe(
          "saved",
        );
        // An address elsewhere is no palette of the instance's.
        await expect(
          code(useCases.savePalette(INSTANCE, { ...READING, url: "https://evil.example/p.ttl#x" })),
        ).resolves.toContain("Not a palette of");
      });

      it("are none, and none saved, without a palettes document", async () => {
        const useCases = createUseCases(makeDeps());
        await expect(useCases.listPalettes(INSTANCE)).resolves.toEqual([]);
        await expect(useCases.savePalette(INSTANCE, READING)).rejects.toThrow(
          "This app keeps no palettes.",
        );
        expect(useCases.customPaletteChoice()).toBeNull();
      });
    });
  });
  it("saves the preferences once a choice of how the app is shown is written, failed or not", async () => {
    const INSTANCE = "https://pod.example/solid-memo/main/";
    const deps = makeDeps();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: DEFAULT_PREFERENCES,
      formatVersion: 6,
    });
    let fail: (error: Error) => void = () => undefined;
    vi.mocked(deps.preferencesRepository.savePreferences).mockImplementationOnce(
      () => new Promise((_, reject) => (fail = reject)),
    );
    const useCases = createUseCases(deps);
    const chosen = useCases.chooseTextSize("large", INSTANCE);
    const saved = useCases.savePreferences(INSTANCE, { ...DEFAULT_PREFERENCES, newCardsPerDay: 9 });
    await vi.waitFor(() =>
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledOnce(),
    );
    fail(new Error("412"));
    await expect(chosen).rejects.toThrow("412");
    await saved;
    expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(INSTANCE, {
      ...DEFAULT_PREFERENCES,
      newCardsPerDay: 9,
    });
  });
  it("switches the scheduler and dismisses the invitation once a choice of how the app is shown is written", async () => {
    const INSTANCE = "https://pod.example/solid-memo/main/";
    const deps = makeDeps();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: DEFAULT_PREFERENCES,
      formatVersion: 6,
    });
    let written: () => void = () => undefined;
    vi.mocked(deps.preferencesRepository.savePreferences).mockImplementationOnce(
      () => new Promise<void>((resolve) => (written = resolve)),
    );
    const useCases = createUseCases(deps);
    const chosen = useCases.chooseTextSize("large", INSTANCE);
    const switched = useCases.switchScheduler(INSTANCE, DEFAULT_PREFERENCES);
    const dismissed = useCases.dismissSchedulerInvitation(INSTANCE);
    await vi.waitFor(() =>
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledOnce(),
    );
    // Neither has read the preferences it would save over before the choice is written.
    expect(deps.preferencesRepository.getPreferences).toHaveBeenCalledOnce();
    written();
    await Promise.all([chosen, switched, dismissed]);
    expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledTimes(3);
  });
  describe("text size", () => {
    const INSTANCE = "https://pod.example/solid-memo/main/";

    function devicePreference(initial: TextSize = "default") {
      let chosen = initial;
      return {
        chosen: () => chosen,
        choose: vi.fn((size: TextSize) => {
          chosen = size;
        }),
      };
    }

    function stored(textSize: TextSize) {
      return { preferences: { ...DEFAULT_PREFERENCES, textSize }, formatVersion: 6 };
    }

    it("shows the chosen size, and keeps a new choice on this device", async () => {
      const textSizePreference = devicePreference("large");
      const deps = makeDeps();
      const useCases = createUseCases({ ...deps, textSizePreference });
      expect(useCases.textSizeChoice()).toBe("large");
      await useCases.chooseTextSize("largest", null);
      expect(textSizePreference.choose).toHaveBeenCalledWith("largest");
      expect(useCases.textSizeChoice()).toBe("largest");
      expect(deps.preferencesRepository.getPreferences).not.toHaveBeenCalled();
    });

    it("shows the browser's own size when none is kept", async () => {
      const useCases = createUseCases(makeDeps());
      await useCases.chooseTextSize("larger", null);
      expect(useCases.textSizeChoice()).toBe("default");
    });

    it("reads an instance's text size, and keeps it on this device for the first paint", async () => {
      const textSizePreference = devicePreference();
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored("larger"));
      const useCases = createUseCases({ ...deps, textSizePreference });
      await expect(useCases.instanceTextSize(INSTANCE)).resolves.toBe("larger");
      expect(useCases.textSizeChoice()).toBe("larger");
    });

    it("has no instance text size before the instance's first preferences, and leaves the device's", async () => {
      const textSizePreference = devicePreference("large");
      const useCases = createUseCases({ ...makeDeps(), textSizePreference });
      await expect(useCases.instanceTextSize(INSTANCE)).resolves.toBeNull();
      expect(textSizePreference.choose).not.toHaveBeenCalled();
    });

    it("keeps a choice in the instance's preferences once it has them, and writes nothing when they already say it", async () => {
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored("default"));
      const useCases = createUseCases(deps);
      await useCases.chooseTextSize("large", INSTANCE);
      await useCases.chooseTextSize("default", INSTANCE);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledExactlyOnceWith(INSTANCE, {
        ...DEFAULT_PREFERENCES,
        textSize: "large",
      });
    });

    it("keeps the text size of saved preferences on this device too", async () => {
      const textSizePreference = devicePreference();
      const useCases = createUseCases({ ...makeDeps(), textSizePreference });
      await useCases.savePreferences(INSTANCE, { ...DEFAULT_PREFERENCES, textSize: "largest" });
      expect(useCases.textSizeChoice()).toBe("largest");
    });
  });
  describe("theme", () => {
    const INSTANCE = "https://pod.example/solid-memo/main/";

    function devicePreference(initial: ThemeChoice = "system") {
      let chosen = initial;
      return {
        chosen: () => chosen,
        choose: vi.fn((choice: ThemeChoice) => {
          chosen = choice;
        }),
      };
    }

    function stored(theme: ThemeChoice) {
      return { preferences: { ...DEFAULT_PREFERENCES, theme }, formatVersion: 4 };
    }

    it("keeps the theme chosen on this device", async () => {
      const themePreference = devicePreference("dark");
      const deps = makeDeps();
      const useCases = createUseCases({ ...deps, themePreference });
      expect(useCases.themeChoice()).toBe("dark");
      await useCases.chooseTheme("light", null);
      expect(useCases.themeChoice()).toBe("light");
      expect(deps.preferencesRepository.getPreferences).not.toHaveBeenCalled();
    });

    it("follows the browser when nothing is kept", async () => {
      const useCases = createUseCases(makeDeps());
      await useCases.chooseTheme("dark", null);
      expect(useCases.themeChoice()).toBe("system");
    });

    it("reads an instance's theme, and keeps it on this device for the first paint", async () => {
      const themePreference = devicePreference("light");
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored("dark"));
      const useCases = createUseCases({ ...deps, themePreference });
      await expect(useCases.instanceTheme(INSTANCE)).resolves.toBe("dark");
      expect(useCases.themeChoice()).toBe("dark");
    });

    it("has no instance theme before the instance's first preferences, and leaves the device's", async () => {
      const themePreference = devicePreference("light");
      const useCases = createUseCases({ ...makeDeps(), themePreference });
      await expect(useCases.instanceTheme(INSTANCE)).resolves.toBeNull();
      expect(themePreference.choose).not.toHaveBeenCalled();
    });

    it("keeps a choice in the instance's preferences once it has them", async () => {
      const deps = makeDeps();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored("system"));
      const useCases = createUseCases(deps);
      await useCases.chooseTheme("dark", INSTANCE);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledExactlyOnceWith(INSTANCE, {
        ...DEFAULT_PREFERENCES,
        theme: "dark",
      });
    });

    it("keeps a choice on this device alone before the instance's first preferences, or when they already say it", async () => {
      const deps = makeDeps();
      const useCases = createUseCases(deps);
      await useCases.chooseTheme("dark", INSTANCE);
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue(stored("dark"));
      await useCases.chooseTheme("dark", INSTANCE);
      expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
    });

    it("writes one choice after another, a failed one not stopping the next", async () => {
      const deps = makeDeps();
      let theme: ThemeChoice = "system";
      vi.mocked(deps.preferencesRepository.getPreferences).mockImplementation(async () =>
        stored(theme),
      );
      vi.mocked(deps.preferencesRepository.savePreferences)
        .mockRejectedValueOnce(new Error("412"))
        .mockImplementation(async (_, preferences) => {
          theme = preferences.theme;
        });
      const useCases = createUseCases(deps);
      const first = useCases.chooseTheme("dark", INSTANCE);
      const second = useCases.chooseTheme("light", INSTANCE);
      await expect(first).rejects.toThrow("412");
      await second;
      expect(theme).toBe("light");
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledTimes(2);
    });

    it("keeps the theme of saved preferences on this device too", async () => {
      const themePreference = devicePreference();
      const useCases = createUseCases({ ...makeDeps(), themePreference });
      await useCases.savePreferences(INSTANCE, { ...DEFAULT_PREFERENCES, theme: "light" });
      expect(useCases.themeChoice()).toBe("light");
    });
  });
  it("dismissSchedulerInvitation keeps the stored preferences, but for the invitation", async () => {
    const deps = makeDeps();
    const stored = { ...DEFAULT_PREFERENCES, newCardsPerDay: 9, theme: "light" as const };
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: stored,
      formatVersion: 4,
    });
    const useCases = createUseCases(deps);
    await useCases.dismissSchedulerInvitation(instance.url);
    expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledWith(instance.url, {
      ...stored,
      schedulerInvitationDismissed: true,
    });
  });
  it("dismissSchedulerInvitation saves the defaults, SM-2's, with this device's appearance when none are stored", async () => {
    const deps = makeDeps();
    const useCases = createUseCases({
      ...deps,
      themePreference: { chosen: () => "dark", choose: vi.fn() },
      palettePreference: { chosen: () => "parchment", choose: vi.fn() },
      textSizePreference: { chosen: () => "large", choose: vi.fn() },
    });
    await useCases.dismissSchedulerInvitation(instance.url);
    expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledWith(instance.url, {
      ...DEFAULT_PREFERENCES,
      theme: "dark",
      palette: "https://solid-memo.com/ns/vocab/v1.ttl#parchmentPalette",
      textSize: "large",
      schedulerInvitationDismissed: true,
    });
  });
  it("dismissSchedulerInvitation writes nothing when it was dismissed already", async () => {
    const deps = makeDeps();
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: { ...DEFAULT_PREFERENCES, schedulerInvitationDismissed: true },
      formatVersion: 5,
    });
    await createUseCases(deps).dismissSchedulerInvitation(instance.url);
    expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
  });
  it("getPreferences overlays defaults when nothing is stored", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    await expect(useCases.getPreferences(instance.url)).resolves.toEqual({
      newCardsPerDay: 5,
      maxReviewsPerDay: 200,
      dayBoundaryHour: 4,
      answerScale: "sm2",
      developerMode: false,
      invalidDataPolicy: "block-subject" as const,
      theme: "system" as const,
      scheduler: "sm2" as const,
      desiredRetention: 0.9,
      schedulerInvitationDismissed: false,
      palette: "https://solid-memo.com/ns/vocab/v1.ttl#standardPalette",
      textSize: "default" as const,
    });
  });
  it("getPreferences shares one read between concurrent callers, but never caches", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);

    await Promise.all([
      useCases.getPreferences(instance.url),
      useCases.getPreferences(instance.url),
      useCases.getStudyQueue(instance.url, deck, new Date()),
    ]);
    expect(deps.preferencesRepository.getPreferences).toHaveBeenCalledOnce();

    await useCases.getPreferences(instance.url);
    expect(deps.preferencesRepository.getPreferences).toHaveBeenCalledTimes(2);
  });
  it("getPreferences does not share reads across instances, nor keep a failed one", async () => {
    const deps = makeDeps();
    vi.mocked(deps.preferencesRepository.getPreferences).mockRejectedValueOnce(
      new Error("preferences unreachable"),
    );
    const useCases = createUseCases(deps);

    await expect(useCases.getPreferences(instance.url)).rejects.toThrow("preferences unreachable");
    await expect(
      useCases.getPreferences("https://alice.example/solid-memo/other/"),
    ).resolves.toEqual(expect.objectContaining({ dayBoundaryHour: 4 }));
    await expect(useCases.getPreferences(instance.url)).resolves.toBeDefined();
    expect(deps.preferencesRepository.getPreferences).toHaveBeenCalledTimes(3);
  });
  it("getPreferences returns stored preferences unchanged", async () => {
    const deps = makeDeps();
    const stored = {
      newCardsPerDay: 5,
      maxReviewsPerDay: 50,
      dayBoundaryHour: 0,
      answerScale: "minimal" as const,
      developerMode: true,
      invalidDataPolicy: "block-instance" as const,
      theme: "system" as const,
      scheduler: "sm2" as const,
      desiredRetention: 0.9,
      schedulerInvitationDismissed: false,
      palette: DEFAULT_PREFERENCES.palette,
      textSize: "default" as const,
    };
    vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
      preferences: stored,
      formatVersion: 2,
    });
    const useCases = createUseCases(deps);
    await expect(useCases.getPreferences(instance.url)).resolves.toEqual(stored);
  });
  it("savePreferences delegates to the repository", async () => {
    const deps = makeDeps();
    const useCases = createUseCases(deps);
    const preferences = {
      newCardsPerDay: 5,
      maxReviewsPerDay: 50,
      dayBoundaryHour: 0,
      answerScale: "minimal" as const,
      developerMode: true,
      invalidDataPolicy: "block-instance" as const,
      theme: "system" as const,
      scheduler: "sm2" as const,
      desiredRetention: 0.9,
      schedulerInvitationDismissed: false,
      palette: DEFAULT_PREFERENCES.palette,
      textSize: "default" as const,
    };
    await useCases.savePreferences(instance.url, preferences);
    expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledWith(
      instance.url,
      preferences,
    );
  });
  describe("switchScheduler", () => {
    const second: Deck = {
      ...deck,
      id: "deck-2",
      url: `${instance.url}catalog.ttl#deck-2`,
      reviewsDocumentUrl: `${instance.url}reviews/deck-2.ttl`,
    };
    const moved: ReviewState = {
      cardId: "card-9",
      direction: "front-to-back",
      easeFactor: 2.36,
      intervalDays: 14,
      repetitions: 3,
      due: "2026-10-01",
      firstReviewedAt: "2026-08-01T10:00:00.000Z",
      lastReviewedAt: "2026-09-17T10:00:00.000Z",
      formatVersion: 2,
    };
    const fsrsPrefs = {
      ...DEFAULT_PREFERENCES,
      scheduler: "fsrs6" as const,
      theme: "dark" as const,
    };

    /** card-1 studied once at noon, its answer still to be logged; card-9 moved in with its progress, without answers. */
    async function studied() {
      const made = setup();
      const { state } = await made.useCases.recordReview(
        instance.url,
        deck,
        { card, direction: "front-to-back" },
        4,
        noon,
      );
      vi.mocked(made.deps.deckRepository.listDecks).mockResolvedValue([deck, second]);
      vi.mocked(made.deps.reviewStateRepository.listReviewStates).mockImplementation(async (of) =>
        sm2s(of.url === deck.url ? [state, moved] : []),
      );
      vi.mocked(made.deps.reviewStateRepository.writeFsrsStates).mockClear();
      return { ...made, state };
    }

    it("to FSRS-6 replays or estimates each deck's states in one write each, then saves the preferences and the schedules", async () => {
      const { deps, useCases, state } = await studied();
      const progress: SwitchProgress[] = [];
      const outcome = await useCases.switchScheduler(instance.url, fsrsPrefs, (p) =>
        progress.push(p),
      );

      expect(outcome).toEqual({ switched: true, decks: 2, replayed: 1, estimated: 1, failed: [] });
      const writes = vi.mocked(deps.reviewStateRepository.writeFsrsStates).mock.calls;
      expect(writes.map(([written]) => written)).toEqual([deck, second]);
      const made = writes[0]![1](sm2s([state, moved]));
      expect(made).toEqual([
        expect.objectContaining({
          cardId: card.id,
          due: state.due,
          lastReviewedAt: state.lastReviewedAt,
        }),
        expect.objectContaining({ ...memoryFromSm2(moved), cardId: "card-9", due: moved.due }),
      ]);
      // The answer given at noon replays: a Good first rating.
      expect(made[0]!.stability).toBe(nextMemory(null, 3, 0).stability);
      // The preferences last, then each deck's schedule from its documents.
      const saved = vi.mocked(deps.preferencesRepository.savePreferences);
      expect(saved).toHaveBeenCalledExactlyOnceWith(instance.url, fsrsPrefs);
      const savedAt = saved.mock.invocationCallOrder[0]!;
      for (const order of vi.mocked(deps.reviewStateRepository.writeFsrsStates).mock
        .invocationCallOrder)
        expect(order).toBeLessThan(savedAt);
      const refreshed = vi.mocked(deps.reviewStateRepository.readReviewStatesSince);
      expect(refreshed.mock.calls.map(([of]) => of)).toEqual([deck, second]);
      expect(refreshed.mock.invocationCallOrder[0]).toBeGreaterThan(savedAt);
      expect(progress.map(({ step, done, part }) => [step, done, part])).toEqual([
        ["read", 0, undefined],
        ["decks", 1, { done: 0, total: 2 }],
        ["decks", 1, { done: 1, total: 2 }],
        ["preferences", 2, undefined],
        ["preferences", 3, undefined],
      ]);
    });

    it("to FSRS-6 leaves SM-2 in charge when a deck cannot be written, naming it, and goes on with the others", async () => {
      const { deps, useCases } = await studied();
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([second, deck]);
      const offline = new Error("offline");
      vi.mocked(deps.reviewStateRepository.writeFsrsStates).mockRejectedValueOnce(offline);

      const outcome = await useCases.switchScheduler(instance.url, fsrsPrefs);

      expect(outcome).toEqual({
        switched: false,
        decks: 1,
        replayed: 1,
        estimated: 1,
        failed: [{ url: second.url, title: second.title, error: offline }],
      });
      expect(deps.preferencesRepository.savePreferences).not.toHaveBeenCalled();
    });

    it("to FSRS-6 is done though a deck's schedule cannot be brought up to date", async () => {
      const { deps, useCases } = await studied();
      vi.mocked(deps.deckRepository.readCardsSince).mockRejectedValue(new Error("offline"));
      await expect(useCases.switchScheduler(instance.url, fsrsPrefs)).resolves.toMatchObject({
        switched: true,
        failed: [],
      });
    });

    it("to FSRS-6 with no decks only saves the preferences", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.deckRepository.listDecks).mockResolvedValue([]);
      const progress: SwitchProgress[] = [];
      await expect(
        useCases.switchScheduler(instance.url, fsrsPrefs, (p) => progress.push(p)),
      ).resolves.toMatchObject({ switched: true, decks: 0 });
      expect(progress.map(({ part }) => part)).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledOnce();
    });

    it("to SM-2 saves the preferences alone: SM-2's states are up to date", async () => {
      const { deps, log, useCases } = await studied();
      vi.mocked(log.months).mockClear();
      const outcome = await useCases.switchScheduler(instance.url, DEFAULT_PREFERENCES);
      expect(outcome).toEqual({ switched: true, decks: 0, replayed: 0, estimated: 0, failed: [] });
      expect(deps.reviewStateRepository.writeFsrsStates).not.toHaveBeenCalled();
      expect(log.months).not.toHaveBeenCalled();
      expect(deps.preferencesRepository.savePreferences).toHaveBeenCalledWith(
        instance.url,
        DEFAULT_PREFERENCES,
      );
    });

    it("savePreferences keeps the stored scheduler, SM-2 when none is stored", async () => {
      const { deps, useCases } = setup();
      await useCases.savePreferences(instance.url, fsrsPrefs);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(instance.url, {
        ...fsrsPrefs,
        scheduler: "sm2",
      });
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
        preferences: fsrsPrefs,
        formatVersion: 5,
      });
      await useCases.savePreferences(instance.url, DEFAULT_PREFERENCES);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(instance.url, {
        ...DEFAULT_PREFERENCES,
        scheduler: "fsrs6",
      });
    });

    it("keeps a stored Not now through a save or a switch made from preferences read before it", async () => {
      const { deps, useCases } = setup();
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
        preferences: { ...DEFAULT_PREFERENCES, schedulerInvitationDismissed: true },
        formatVersion: 5,
      });
      const read = { ...DEFAULT_PREFERENCES, newCardsPerDay: 7 };
      await useCases.savePreferences(instance.url, read);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(instance.url, {
        ...read,
        schedulerInvitationDismissed: true,
      });
      await useCases.switchScheduler(instance.url, read);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(instance.url, {
        ...read,
        schedulerInvitationDismissed: true,
      });
    });

    it("keeps a stored palette this version does not know through a switch that shows Standard", async () => {
      const { deps, useCases } = setup();
      const own = "https://pod.example/solid-memo/main/palettes.ttl#mine";
      vi.mocked(deps.preferencesRepository.getPreferences).mockResolvedValue({
        preferences: { ...DEFAULT_PREFERENCES, palette: own },
        formatVersion: 6,
      });
      await useCases.switchScheduler(instance.url, DEFAULT_PREFERENCES);
      expect(deps.preferencesRepository.savePreferences).toHaveBeenLastCalledWith(instance.url, {
        ...DEFAULT_PREFERENCES,
        palette: own,
      });
    });
  });
});
