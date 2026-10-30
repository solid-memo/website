// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  DeckLibrary,
  DeckRepository,
  InstanceRepository,
  PreferencesRepository,
  ReviewStateRepository,
  SessionGateway,
  StorageGateway,
  WebIdDocumentRepository,
  ShapeValidator,
  AnswerLog,
  DigestRepository,
  RepairRepository,
  InstanceCopier,
  GuestPod,
  LanguagePreference,
  CustomPalettePreference,
  PalettePreference,
  PaletteRepository,
  SeenHighlights,
  TextSizePreference,
  ThemePreference,
  UpdateJournal,
  WriteFence,
  DeckArchive,
  FileExchange,
  ReleaseDraftRepository,
  ReleasePublisher,
  InstanceGraphReader,
} from "./ports";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { createPreferenceStore } from "./preferenceStore";
import { createAnswerStore } from "./answerStore";
import { createDigestStore } from "./digestStore";
import { createSessionUseCases, type SessionUseCases } from "./session";
import { createInstanceUseCases, type InstanceUseCases } from "./instances";
import { createPreferenceUseCases, type PreferenceUseCases } from "./preferences";
import { createDeckUseCases, type DeckUseCases } from "./decks";
import { createCardUseCases, type CardUseCases } from "./cards";
import { createLibraryUseCases, type LibraryUseCases } from "./library";
import { createMistakeReportUseCases, type MistakeReportUseCases } from "./mistakeReports";
import { createWhatsNewUseCases, type WhatsNewUseCases } from "./whatsNew";
import { createCourseUseCases, type CourseUseCases } from "./courses";
import { createStudyUseCases, type StudyUseCases } from "./study";
import { createStatisticsUseCases, type StatisticsUseCases } from "./statistics";
import { createInstanceCheckUseCases, type InstanceCheckUseCases } from "./instanceChecks";
import { createReleaseDraftUseCases, type ReleaseDraftUseCases } from "./releaseDrafts";
import {
  createReleasePublishingUseCases,
  type ReleasePublishingUseCases,
} from "./releasePublishing";
import { createInstanceGraphUseCases, type InstanceGraphUseCases } from "./instanceGraph";
import { createTrialOpeningUseCases, type TrialOpeningUseCases, type TrialSandbox } from "./trial";

/**
 * Every use case the app and the Studio call: the intersection of the
 * slices, each a feature's use cases made by a factory of its own module
 * from only the ports it uses. A screen that needs few of them may take
 * a slice's interface instead, as the trial's screens do (TrialUseCases).
 */
export interface UseCases
  extends SessionUseCases,
    InstanceUseCases,
    PreferenceUseCases,
    DeckUseCases,
    CardUseCases,
    LibraryUseCases,
    MistakeReportUseCases,
    WhatsNewUseCases,
    CourseUseCases,
    StudyUseCases,
    StatisticsUseCases,
    InstanceCheckUseCases,
    ReleaseDraftUseCases,
    ReleasePublishingUseCases,
    InstanceGraphUseCases,
    TrialOpeningUseCases {}

/**
 * Every port the use cases are given, each required: the composition
 * root wires each one, or a "none" it means (packages/composition/), so
 * a port it forgets is a type error. Only the clock, fresh ids, the
 * random source and the ruleset have defaults.
 */
export interface Dependencies {
  sessionGateway: SessionGateway;
  /** Uniform [0, 1) source; defaults to Math.random. Injected for tests. */
  random?: () => number;
  webIdDocumentRepository: WebIdDocumentRepository;
  storageGateway: StorageGateway;
  instanceRepository: InstanceRepository;
  deckRepository: DeckRepository;
  deckLibrary: DeckLibrary;
  preferencesRepository: PreferencesRepository;
  reviewStateRepository: ReviewStateRepository;
  shapeValidator: ShapeValidator;
  repairRepository: RepairRepository;
  instanceCopier: InstanceCopier;
  /** Notes of a guest's study being moved or added to an instance, kept on this device. */
  updateJournal: UpdateJournal;
  /** The language the user chose, kept on this device. */
  languagePreference: LanguagePreference;
  /** The theme the user chose, kept on this device. */
  themePreference: ThemePreference;
  /** The palette the user chose, kept on this device. */
  palettePreference: PalettePreference;
  /** A copy of the user's own palette being shown, kept on this device. */
  customPalettePreference: CustomPalettePreference;
  /** The palettes the user designed, in each instance. */
  paletteRepository: PaletteRepository;
  /** The text size the user chose, kept on this device. */
  textSizePreference: TextSizePreference;
  /** The highlights of new versions this browser has shown, kept on this device. */
  seenHighlights: SeenHighlights;
  /** The clock; injected for tests. */
  now?: () => Date;
  /** Fresh identifiers (a deck group, an answer, a guest's deck); injected for tests. */
  newId?: () => string;
  /** Keeps a guest's study read-only to anything else in the tab while it moves. */
  writeFence: WriteFence;
  /** Where each instance's digest is kept. */
  digestRepository: DigestRepository;
  /** Where each instance's answer log is kept. */
  answerLog: AnswerLog;
  /** Names the shapes documents are checked by; a receipt of other rules does not count. */
  ruleset?: string;
  /** The pod a guest studies in on this device. */
  guestPod: GuestPod;
  /** Decks as files, exported and read. */
  deckArchive: DeckArchive;
  /** Files on the user's device, saved and opened. */
  fileExchange: FileExchange;
  /** The drafts of releases in each instance. */
  releaseDraftRepository: ReleaseDraftRepository;
  /** Where releases are published from each instance. */
  releasePublisher: ReleasePublisher;
  /** A new sandbox to test-play a draft in, each one empty. */
  trialSandbox: (draft: ReleaseDraft) => TrialSandbox;
  /** Each instance's documents as statements, for its graph. */
  instanceGraphReader: InstanceGraphReader;
}

/**
 * The use cases over the ports given: the stores the slices share (the
 * preferences, the answers on their way to the log and read from it, and
 * the digest), made once, then each slice over the ports it uses, and the
 * stores and slices it builds on.
 */
export function createUseCases({
  sessionGateway,
  random = Math.random,
  webIdDocumentRepository,
  storageGateway,
  instanceRepository,
  deckRepository,
  deckLibrary,
  preferencesRepository,
  reviewStateRepository,
  shapeValidator,
  repairRepository,
  instanceCopier,
  updateJournal,
  languagePreference,
  themePreference,
  palettePreference,
  customPalettePreference,
  paletteRepository,
  textSizePreference,
  seenHighlights,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  writeFence,
  digestRepository,
  answerLog,
  ruleset = "",
  guestPod,
  deckArchive,
  fileExchange,
  releaseDraftRepository,
  releasePublisher,
  trialSandbox,
  instanceGraphReader,
}: Dependencies): UseCases {
  const preferenceStore = createPreferenceStore({
    preferencesRepository,
    themePreference,
    palettePreference,
    customPalettePreference,
    textSizePreference,
  });
  const answerStore = createAnswerStore({
    answerLog,
    reviewStateRepository,
    preferenceStore,
    newId,
  });
  const digestStore = createDigestStore({
    digestRepository,
    deckRepository,
    reviewStateRepository,
    shapeValidator,
    ruleset,
    preferenceStore,
    answerStore,
    now,
  });
  const drafts = createReleaseDraftUseCases({
    releaseDraftRepository,
    deckRepository,
    deckLibrary,
    shapeValidator,
    fileExchange,
    now,
  });
  const instances = createInstanceUseCases({
    storageGateway,
    instanceRepository,
    deckRepository,
    preferencesRepository,
    reviewStateRepository,
    webIdDocumentRepository,
    preferenceStore,
    digestStore,
  });
  const checks = createInstanceCheckUseCases({
    deckRepository,
    releaseDraftRepository,
    answerLog,
    shapeValidator,
    repairRepository,
    deckLibrary,
    digestStore,
    ruleset,
  });
  const courses = createCourseUseCases({
    deckLibrary,
    deckRepository,
    reviewStateRepository,
    preferenceStore,
    answerStore,
  });
  return {
    ...createSessionUseCases({
      sessionGateway,
      storageGateway,
      webIdDocumentRepository,
      guestPod,
      instanceRepository,
      deckRepository,
      reviewStateRepository,
      instanceCopier,
      updateJournal,
      writeFence,
      releaseDraftRepository,
      answerLog,
      answerStore,
      instances,
      checks,
      drafts,
      newId,
    }),
    ...instances,
    ...createPreferenceUseCases({
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
    }),
    ...createDeckUseCases({ deckRepository, newId }),
    ...createCardUseCases({
      deckRepository,
      reviewStateRepository,
      deckLibrary,
      deckArchive,
      fileExchange,
      digestStore,
      newId,
      now,
    }),
    ...createLibraryUseCases({
      deckLibrary,
      deckRepository,
      reviewStateRepository,
      courses,
    }),
    ...createMistakeReportUseCases({ deckLibrary }),
    ...createWhatsNewUseCases({ seenHighlights }),
    ...courses,
    ...createStudyUseCases({
      deckRepository,
      reviewStateRepository,
      preferenceStore,
      digestStore,
      answerStore,
      random,
    }),
    ...createStatisticsUseCases({
      answerLog,
      deckRepository,
      reviewStateRepository,
      deckLibrary,
      fileExchange,
      preferenceStore,
      answerStore,
      digestStore,
    }),
    ...checks,
    ...drafts,
    ...createReleasePublishingUseCases({
      drafts,
      releaseDraftRepository,
      releasePublisher,
      deckLibrary,
      fileExchange,
      storageGateway,
      now,
    }),
    ...createInstanceGraphUseCases({
      instanceGraphReader,
      storageGateway,
      deckRepository,
      answerLog,
      releaseDraftRepository,
      releasePublisher,
    }),
    ...createTrialOpeningUseCases({ trialSandbox, preferenceStore }),
  };
}
