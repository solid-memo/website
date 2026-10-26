// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { pickLocale, type Locale } from "@solid-memo/domain/locale";
import {
  checkPalette,
  isReadable,
  paletteVerdict,
  type CustomPalette,
  type PaletteDraft,
  type ShownPalette,
} from "@solid-memo/domain/customPalette";
import type { Palette } from "@solid-memo/domain/palette";
import type { TextSize } from "@solid-memo/domain/textSize";
import type { ThemeChoice } from "@solid-memo/domain/theme";
import { isPaletteOf, isSameUrl, paletteUrlOf } from "@solid-memo/domain/instanceLayout";
import type { Instance } from "@solid-memo/domain/instance";
import {
  DEFAULT_PREFERENCES,
  keptPalette,
  shownPalette,
  skipsConnectedScreen,
  type StudyPreferences,
} from "@solid-memo/domain/preferences";
import type { Session } from "@solid-memo/domain/session";
import {
  SWITCH_STEPS,
  switchedStates,
  type SwitchOutcome,
  type SwitchProgress,
  type SwitchStep,
} from "@solid-memo/domain/schedulerSwitch";
import type {
  DeckRepository,
  InstanceRepository,
  PreferencesRepository,
  ReviewStateRepository,
  LanguagePreference,
  CustomPalettePreference,
  PalettePreference,
  PaletteRepository,
  TextSizePreference,
  ThemePreference,
} from "./ports";
import { AppError } from "@solid-memo/domain/appError";
import { stepReporter } from "./progress";
import { again } from "./writes";
import type { PreferenceStore } from "./preferenceStore";
import type { AnswerStore } from "./answerStore";
import type { DigestStore } from "./digestStore";

/** What logging in needs to know about the Connected screen. */
export interface ConnectedScreenChoice {
  /** The learner's instances, where "Don't show this screen after logging in" is saved. */
  readonly instances: readonly Instance[];
  /** Whether every instance says to skip the screen (skipsConnectedScreen). */
  readonly skipped: boolean;
}

export interface PreferenceUseCases {
  /**
   * The language to speak: the one the user chose, else the first of the
   * browser's `preferred` languages the app speaks, else English.
   */
  language(preferred: readonly string[]): Locale;
  /** Speak this language from now on, on this device. */
  chooseLanguage(locale: Locale): void;
  /** The theme chosen on this device; "system" when none was. */
  themeChoice(): ThemeChoice;
  /**
   * The theme an instance's preferences hold, kept on this device too
   * for the next visit's first paint; null when the instance has no
   * preferences yet.
   */
  instanceTheme(instanceUrl: string): Promise<ThemeChoice | null>;
  /**
   * Show this theme from now on: on this device, and in the instance's
   * preferences when there is an instance open and it has preferences
   * (until its first preferences are saved, the device keeps it alone).
   */
  chooseTheme(choice: ThemeChoice, instanceUrl: string | null): Promise<void>;
  /** The palette chosen on this device; "standard" when none was. */
  paletteChoice(): Palette;
  /**
   * The palette of the user's own shown on this device, as kept for the
   * first paint; null when a built-in one is. One whose text is not
   * readable on the background or a surface (checkPalette), which any
   * script of the site may have written there, is forgotten, and its
   * base shown.
   */
  customPaletteChoice(): CustomPalette | null;
  /**
   * The palette an instance's preferences are shown in: one of the
   * user's own when they name a palette of the instance's palettes
   * document (and no other document is read for it), over its base;
   * else a built-in one, Standard for one this version does not know.
   * A palette of one's own whose text is not readable on the background
   * or a surface (checkPalette), as another app may have written it, is
   * shown as its base, and the preferences keep naming it. Kept on this
   * device too for the next visit's first paint; null when the instance
   * has no preferences yet.
   */
  instancePalette(instanceUrl: string): Promise<ShownPalette | null>;
  /**
   * Show the app in this palette from now on: on this device, and in the
   * instance's preferences as chooseTheme keeps a theme. Preferences
   * whose palette this version does not know keep it while Standard is
   * shown; one of the user's own is replaced.
   */
  choosePalette(palette: Palette, instanceUrl: string | null): Promise<void>;
  /**
   * Show the app in a palette of the user's own from now on: on this
   * device, and in the instance's preferences, which name it by its
   * address, as chooseTheme keeps a theme.
   */
  chooseCustomPalette(palette: CustomPalette, instanceUrl: string): Promise<void>;
  /** The palettes the user designed in an instance (docs/theme.md, Palettes of one's own). */
  listPalettes(instanceUrl: string): Promise<CustomPalette[]>;
  /**
   * Save a palette the user designed in the instance's palettes
   * document, a new one (no address yet) at a new subject; the palette
   * as saved. Refused before anything is written when it has no name
   * (paletteNameEmpty), when its text is not readable on the background
   * or a surface (paletteUnreadable, checkPalette), and when a pair is
   * below the contrast it needs (paletteContrastLow), unless `useAnyway`.
   * When the palette is the one this device shows, the device's copy is
   * kept up to date.
   */
  savePalette(
    instanceUrl: string,
    palette: PaletteDraft,
    options?: { useAnyway?: boolean },
  ): Promise<CustomPalette>;
  /** The text size chosen on this device; "default" when none was. */
  textSizeChoice(): TextSize;
  /**
   * The text size an instance's preferences hold, kept on this device
   * too for the next visit's first paint; null when the instance has no
   * preferences yet.
   */
  instanceTextSize(instanceUrl: string): Promise<TextSize | null>;
  /**
   * Show the text at this size from now on: on this device, and in the
   * instance's preferences as chooseTheme keeps a theme.
   */
  chooseTextSize(size: TextSize, instanceUrl: string | null): Promise<void>;
  /**
   * The stored preferences; the defaults when none are stored, SM-2's
   * among them (DEFAULT_PREFERENCES): an instance with none was made
   * before a new one stated its own, and studies by SM-2.
   */
  getPreferences(instanceUrl: string): Promise<StudyPreferences>;
  /**
   * Save the preferences, but for the scheduler: the stored one stays
   * (SM-2 when none is stored), as only switchScheduler can change it,
   * with what changing it takes. A stored "Not now" to the invitation
   * to switch to FSRS-6 stays too, though the preferences given were
   * read before it, and so does a stored palette this version does not
   * know while the preferences given show Standard. The theme, the
   * palette and the text size are kept on this device too. The save
   * waits for a choice of theme, palette or text size still being
   * written to the instance.
   */
  savePreferences(instanceUrl: string, preferences: StudyPreferences): Promise<void>;
  /**
   * Save the preferences with the scheduler they name (docs/srs.md,
   * "Switching the scheduler"). To SM-2 the preferences are all there is
   * to save: SM-2's states are kept up to date whichever scheduler sets
   * the due days. To FSRS-6, first the answer log is read whole, once,
   * and each deck's FSRS-6 states written (writeFsrsStates), one deck
   * after another, each in ONE write made of its states as they are
   * then: replayed from a prompt's answers when the log holds its whole
   * history, else estimated from its SM-2 state (switchedStates), each
   * due when SM-2 has it due. A deck that cannot be written now is left
   * as it is, named with why, and the others go on. Only once every deck
   * is written are the preferences saved (a stored "Not now" to the
   * invitation and a palette this version does not know kept, as
   * savePreferences keeps them), so until then SM-2 sets the due
   * days and the switch can be run again; then each deck's schedule in
   * the digest is brought up to date (a failure there leaves the switch
   * done).
   */
  switchScheduler(
    instanceUrl: string,
    preferences: StudyPreferences,
    onProgress?: (progress: SwitchProgress) => void,
  ): Promise<SwitchOutcome>;
  /**
   * Remember in the preferences that the learner answered "Not now" to
   * the invitation to switch to FSRS-6, so the deck list does not show
   * it again. The rest stays as stored; with none stored, the defaults
   * with the theme, the palette and the text size this device shows are
   * saved with it.
   */
  dismissSchedulerInvitation(instanceUrl: string): Promise<void>;
  /**
   * Whether logging in skips the Connected screen: the learner's
   * instances listed, and each one's preferences read. An instance whose
   * preferences cannot be read says to show it. Rejects when the
   * instances cannot be listed.
   */
  connectedScreenChoice(session: Session): Promise<ConnectedScreenChoice>;
  /**
   * Skip the Connected screen from now on, in every instance's
   * preferences (markConnectedScreen), each in its turn after the
   * instance's other writes of its preferences, and again when it changed
   * meanwhile. An instance with no preferences gets new ones (the
   * defaults, shown as this device shows the app) only when its meta
   * document reads, so nothing is made at an address where no instance
   * is. Rejects with the first failure once all are done; an instance not
   * saved keeps showing the screen.
   */
  skipConnectedScreen(instances: readonly Instance[]): Promise<void>;
  /** Whether logging in shows the Connected screen, as this instance's preferences say. */
  connectedScreenShown(instanceUrl: string): Promise<boolean>;
  /**
   * Show or skip the Connected screen after logging in, as this
   * instance's preferences say, in its turn after the instance's other
   * writes of its preferences. Preferences with none stored are made
   * (the defaults, shown as this device shows the app) to skip it.
   */
  chooseConnectedScreen(instanceUrl: string, shown: boolean): Promise<void>;
}

/**
 * The preferences to save, but for the answer to the invitation to
 * switch to FSRS-6: "Not now", once stored, holds for good, though the
 * screen that saves them read them before it was answered (in another
 * tab, or on another device). No form asks it, so it is not a form's to
 * take back.
 */
function withInvitationAnswer(
  preferences: StudyPreferences,
  stored: StudyPreferences,
): StudyPreferences {
  return {
    ...preferences,
    schedulerInvitationDismissed:
      stored.schedulerInvitationDismissed || preferences.schedulerInvitationDismissed,
  };
}

/**
 * The user's preferences (docs/theme.md, docs/srs.md): how the app is
 * shown, kept on this device and in the instance's preferences (the
 * language on this device alone), the palettes the user designs, and how
 * the instance studies, the scheduler switched with what switching takes.
 */
export function createPreferenceUseCases({
  languagePreference,
  themePreference,
  palettePreference,
  customPalettePreference,
  textSizePreference,
  paletteRepository,
  preferencesRepository,
  instanceRepository,
  deckRepository,
  reviewStateRepository,
  preferenceStore,
  answerStore,
  digestStore,
  newId,
}: {
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
  palettePreference: PalettePreference;
  customPalettePreference: CustomPalettePreference;
  textSizePreference: TextSizePreference;
  paletteRepository: PaletteRepository;
  preferencesRepository: PreferencesRepository;
  instanceRepository: Pick<InstanceRepository, "listInstances" | "readMeta">;
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  preferenceStore: PreferenceStore;
  answerStore: Pick<AnswerStore, "loadAll">;
  digestStore: Pick<DigestStore, "refresh">;
  newId: () => string;
}): PreferenceUseCases {
  /**
   * The palette saved preferences keep: one of the user's own of the
   * instance as it is, else as keptPalette has it, against what the
   * preferences held (`stored`).
   */
  function savedPalette(
    instanceUrl: string,
    stored: StudyPreferences,
    preferences: StudyPreferences,
  ): string {
    const isOwn = (iri: string) => isPaletteOf(instanceUrl, iri);
    return isOwn(preferences.palette)
      ? preferences.palette
      : keptPalette(stored, shownPalette(preferences), isOwn);
  }

  /**
   * Set whether logging in skips the Connected screen in an instance's
   * preferences, again while they keep changing elsewhere, and once more
   * when new ones were made elsewhere first: then only the choice is
   * written on them.
   */
  async function marking(
    instanceUrl: string,
    skipped: boolean,
    created: StudyPreferences | null,
  ): Promise<"written" | "unchanged" | "none"> {
    const mark = () =>
      again(() => preferencesRepository.markConnectedScreen(instanceUrl, skipped, created));
    try {
      return await mark();
    } catch (error) {
      if (!(error instanceof AppError && error.code === "createdElsewhere")) throw error;
      return mark();
    }
  }

  /** The defaults, shown as this device shows the app: what an instance with no preferences is given. */
  function created(instanceUrl: string): StudyPreferences {
    return preferenceStore.withDeviceAppearance(DEFAULT_PREFERENCES, instanceUrl);
  }

  return {
    language(preferred) {
      return pickLocale(languagePreference.chosen(), preferred);
    },
    chooseLanguage(locale) {
      languagePreference.choose(locale);
    },
    themeChoice() {
      return themePreference.chosen();
    },
    async instanceTheme(instanceUrl) {
      const stored = await preferenceStore.stored(instanceUrl);
      if (stored === null) return null;
      themePreference.choose(stored.preferences.theme);
      return stored.preferences.theme;
    },
    chooseTheme(choice, instanceUrl) {
      themePreference.choose(choice);
      if (instanceUrl === null) return Promise.resolve();
      return preferenceStore.writeAppearance(instanceUrl, (preferences) =>
        preferences.theme === choice ? null : { ...preferences, theme: choice },
      );
    },
    paletteChoice() {
      return palettePreference.chosen();
    },
    customPaletteChoice() {
      const custom = customPalettePreference.chosen();
      if (custom === null || isReadable(custom)) return custom;
      customPalettePreference.choose(null);
      return null;
    },
    async instancePalette(instanceUrl) {
      const stored = await preferenceStore.stored(instanceUrl);
      if (stored === null) return null;
      const iri = stored.preferences.palette;
      // Only the instance's own palettes document is read: the preferences are data, and may name any address.
      const own = isPaletteOf(instanceUrl, iri)
        ? ((await paletteRepository.listPalettes(instanceUrl)).find((listed) =>
            isSameUrl(listed.url, iri),
          ) ?? null)
        : null;
      const custom = own !== null && isReadable(own) ? own : null;
      const palette = own?.basedOn ?? shownPalette(stored.preferences);
      palettePreference.choose(palette);
      customPalettePreference.choose(custom);
      return { palette, custom };
    },
    choosePalette(palette, instanceUrl) {
      palettePreference.choose(palette);
      customPalettePreference.choose(null);
      if (instanceUrl === null) return Promise.resolve();
      return preferenceStore.writeAppearance(instanceUrl, (preferences) => {
        const kept = keptPalette(preferences, palette, (iri) => isPaletteOf(instanceUrl, iri));
        return kept === preferences.palette ? null : { ...preferences, palette: kept };
      });
    },
    chooseCustomPalette(palette, instanceUrl) {
      palettePreference.choose(palette.basedOn);
      customPalettePreference.choose(palette);
      return preferenceStore.writeAppearance(instanceUrl, (preferences) =>
        preferences.palette === palette.url ? null : { ...preferences, palette: palette.url },
      );
    },
    listPalettes(instanceUrl) {
      return paletteRepository.listPalettes(instanceUrl);
    },
    async savePalette(instanceUrl, draft, { useAnyway = false } = {}) {
      if (Object.values(draft.title).every((name) => name.trim() === ""))
        throw new AppError("paletteNameEmpty");
      if (draft.url !== null && !isPaletteOf(instanceUrl, draft.url))
        throw new Error(`Not a palette of ${instanceUrl}: ${draft.url}`);
      const palette: CustomPalette = {
        ...draft,
        url: draft.url ?? paletteUrlOf(instanceUrl, newId()),
      };
      const verdict = paletteVerdict(checkPalette(palette));
      if (verdict === "refused") throw new AppError("paletteUnreadable");
      if (verdict === "low" && !useAnyway) throw new AppError("paletteContrastLow");
      await paletteRepository.savePalette(instanceUrl, palette);
      if (customPalettePreference.chosen()?.url === palette.url)
        customPalettePreference.choose(palette);
      return palette;
    },
    textSizeChoice() {
      return textSizePreference.chosen();
    },
    async instanceTextSize(instanceUrl) {
      const stored = await preferenceStore.stored(instanceUrl);
      if (stored === null) return null;
      textSizePreference.choose(stored.preferences.textSize);
      return stored.preferences.textSize;
    },
    chooseTextSize(size, instanceUrl) {
      textSizePreference.choose(size);
      if (instanceUrl === null) return Promise.resolve();
      return preferenceStore.writeAppearance(instanceUrl, (preferences) =>
        preferences.textSize === size ? null : { ...preferences, textSize: size },
      );
    },
    getPreferences: preferenceStore.get,
    async savePreferences(instanceUrl, preferences) {
      preferenceStore.keepAppearance(instanceUrl, preferences);
      // Read after a choice still being written, so the save is not refused for the version it made.
      await preferenceStore.afterAppearanceWrites(instanceUrl);
      const stored = await preferenceStore.get(instanceUrl);
      await preferencesRepository.savePreferences(instanceUrl, {
        ...withInvitationAnswer(preferences, stored),
        scheduler: stored.scheduler,
        palette: savedPalette(instanceUrl, stored, preferences),
      });
    },
    async switchScheduler(instanceUrl, preferences, onProgress = () => undefined) {
      const progress = stepReporter<SwitchStep>("read", SWITCH_STEPS.length, onProgress);
      progress.start();
      // Switching to SM-2 writes no deck: its states are up to date already.
      const [answers, listed] =
        preferences.scheduler === "fsrs6"
          ? await Promise.all([
              answerStore.loadAll(instanceUrl),
              deckRepository.listDecks(instanceUrl),
            ])
          : [[], []];
      progress.finished("decks", listed.length > 0 ? listed.length : undefined);
      const outcome: SwitchOutcome = {
        switched: false,
        decks: 0,
        replayed: 0,
        estimated: 0,
        failed: [],
      };
      for (const deck of listed) {
        // Each deck on its own: one that cannot be written now is left as it is, and the others go on.
        try {
          // Made of the states as written, again when the document changed meanwhile: the last one counts.
          let made = { replayed: 0, estimated: 0 };
          await reviewStateRepository.writeFsrsStates(deck, ({ sm2 }) => {
            const switched = switchedStates(deck.url, sm2, answers);
            made = switched;
            return switched.fsrs;
          });
          outcome.decks += 1;
          outcome.replayed += made.replayed;
          outcome.estimated += made.estimated;
        } catch (error) {
          outcome.failed.push({ url: deck.url, title: deck.title, error });
        }
        progress.stepped();
      }
      progress.finished("preferences");
      // Saved last, and only once every deck is written: until then SM-2 sets the due days.
      if (outcome.failed.length === 0) {
        preferenceStore.keepAppearance(instanceUrl, preferences);
        await preferenceStore.afterAppearanceWrites(instanceUrl);
        const stored = await preferenceStore.get(instanceUrl);
        await preferencesRepository.savePreferences(instanceUrl, {
          ...withInvitationAnswer(preferences, stored),
          palette: savedPalette(instanceUrl, stored, preferences),
        });
        outcome.switched = true;
        await Promise.all(
          listed.map((deck) => digestStore.refresh(instanceUrl, deck).catch(() => undefined)),
        );
      }
      progress.finished();
      return outcome;
    },
    async dismissSchedulerInvitation(instanceUrl) {
      await preferenceStore.afterAppearanceWrites(instanceUrl);
      const stored = await preferencesRepository.getPreferences(instanceUrl);
      const preferences =
        stored?.preferences ??
        preferenceStore.withDeviceAppearance(DEFAULT_PREFERENCES, instanceUrl);
      if (preferences.schedulerInvitationDismissed) return;
      await preferencesRepository.savePreferences(instanceUrl, {
        ...preferences,
        schedulerInvitationDismissed: true,
      });
    },
    async connectedScreenChoice(session) {
      const instances = await instanceRepository.listInstances(session.webId);
      const skipped = await Promise.all(
        instances.map((instance) =>
          preferencesRepository.connectedScreenSkipped(instance.url).catch(() => false),
        ),
      );
      return { instances, skipped: skipsConnectedScreen(skipped) };
    },
    async skipConnectedScreen(instances) {
      const results = await Promise.allSettled(
        instances.map((instance) =>
          preferenceStore.inTurn(instance.url, async () => {
            if ((await marking(instance.url, true, null)) !== "none") return;
            // No preferences: made only where the instance's meta document says an instance is.
            if ((await instanceRepository.readMeta(instance.url)) === null) return;
            await marking(instance.url, true, created(instance.url));
          }),
        ),
      );
      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failed !== undefined) throw failed.reason;
    },
    async connectedScreenShown(instanceUrl) {
      return !(await preferencesRepository.connectedScreenSkipped(instanceUrl));
    },
    chooseConnectedScreen(instanceUrl, shown) {
      return preferenceStore.inTurn(instanceUrl, async () => {
        await marking(instanceUrl, !shown, shown ? null : created(instanceUrl));
      });
    },
  };
}
