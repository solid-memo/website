// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ShapeValidator } from "./ports/checks";
import type { UpdateJournal, LogoutChannel, FileExchange, DeviceStore } from "./ports/device";
import type {
  DeckLibrary,
  DeckArchive,
  ReleaseDraftRepository,
  ReleasePublisher,
} from "./ports/library";
import type {
  DeckRepository,
  InstanceRepository,
  PreferencesRepository,
  ReviewStateRepository,
  AnswerLog,
  DigestRepository,
  InstanceCopier,
  GuestPod,
  PaletteRepository,
  WriteFence,
  InstanceGraphReader,
  PodWaits,
} from "./ports/pod";
import type { SessionGateway, StorageGateway, WebIdDocumentRepository } from "./ports/session";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { createPreferenceStore } from "./preferenceStore";
import { createAnswerStore } from "./answerStore";
import { createDigestStore } from "./digestStore";
import { createReadScope } from "./readScope";
import { createSessionUseCases, type SessionUseCases } from "./session";
import { createInstanceUseCases, type InstanceUseCases } from "./instances";
import { createPreferenceUseCases, type PreferenceUseCases } from "./preferences";
import { createDeckUseCases, type DeckUseCases } from "./decks";
import { createDeckPauseUseCases, type DeckPauseUseCases } from "./deckPauses";
import { createCardUseCases, type CardUseCases } from "./cards";
import { createLibraryUseCases, withLinkedReleasesChecked, type LibraryUseCases } from "./library";
import { createMistakeReportUseCases, type MistakeReportUseCases } from "./mistakeReports";
import { createWhatsNewUseCases, type WhatsNewUseCases } from "./whatsNew";
import { createPodWaitUseCases, type PodWaitUseCases } from "./podWaits";
import { deviceChoices } from "./deviceChoices";
import { createDeviceValueUseCases, type DeviceValueUseCases } from "./deviceValues";
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
import { inTurns, READS_AT_ONCE } from "./atOnce";
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
    DeckPauseUseCases,
    CardUseCases,
    LibraryUseCases,
    MistakeReportUseCases,
    WhatsNewUseCases,
    PodWaitUseCases,
    DeviceValueUseCases,
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
  /**
   * The WebID of whoever is signed in, asked at each call; none when no
   * one is (a guest): whose storages a document read for an instance
   * must be in to be read as the user (ReadScope).
   */
  webId: () => string | undefined;
  webIdDocumentRepository: WebIdDocumentRepository;
  storageGateway: StorageGateway;
  instanceRepository: InstanceRepository;
  deckRepository: DeckRepository;
  deckLibrary: DeckLibrary;
  preferencesRepository: PreferencesRepository;
  reviewStateRepository: ReviewStateRepository;
  shapeValidator: ShapeValidator;
  instanceCopier: InstanceCopier;
  /** Notes of a guest's study being moved or added to an instance, kept on this device. */
  updateJournal: UpdateJournal;
  logoutChannel: LogoutChannel;
  /** The palettes the user designed, in each instance. */
  paletteRepository: PaletteRepository;
  /**
   * The values kept on this device: the choices of the use cases
   * (deviceChoices: the language, how the app is shown, the highlights
   * seen) and the screens' values.
   */
  deviceStore: DeviceStore;
  /** The values the screens keep for the tab's life. */
  tabStore: DeviceStore;
  /** The clock; injected for tests. */
  now?: () => Date;
  /** Fresh identifiers (a deck group, an answer, a guest's deck); injected for tests. */
  newId?: () => string;
  /** Keeps a guest's study read-only to anything else in the tab while it moves. */
  writeFence: WriteFence;
  /** The waits servers asked of the app, for the learner to be told of them. */
  podWaits: PodWaits;
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
  webId,
  webIdDocumentRepository,
  storageGateway,
  instanceRepository,
  deckRepository,
  deckLibrary: library,
  preferencesRepository,
  reviewStateRepository,
  shapeValidator,
  instanceCopier,
  updateJournal,
  logoutChannel,
  paletteRepository,
  deviceStore,
  tabStore,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  writeFence,
  podWaits,
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
  // A release added from a link is checked on its first read in the page, by whichever slice reads it.
  const deckLibrary = withLinkedReleasesChecked(library);
  const { seenHighlights, ...preferenceChoices } = deviceChoices(deviceStore);
  const preferenceStore = createPreferenceStore({ preferencesRepository, ...preferenceChoices });
  const answerStore = createAnswerStore({
    answerLog,
    reviewStateRepository,
    preferenceStore,
    newId,
    now,
  });
  // Whose a document is, for whoever is signed in: one read for an instance is read as the user only when it is the instance's.
  const readScope = createReadScope({ storageGateway, webId });
  const digestStore = createDigestStore({
    digestRepository,
    deckRepository,
    reviewStateRepository,
    shapeValidator,
    ruleset,
    preferenceStore,
    answerStore,
    readScope,
    webId,
    now,
  });
  const drafts = createReleaseDraftUseCases({
    releaseDraftRepository,
    deckRepository,
    deckLibrary,
    shapeValidator,
    fileExchange,
    readScope,
    releasePublisher,
    now,
  });
  const instances = createInstanceUseCases({
    webId,
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
    answerStore,
    shapeValidator,
    deckLibrary,
    digestStore,
    readScope,
    ruleset,
  });
  // Whole decks' cards read for a list of decks, the Studio's deck table's and the copies' plans, a few at a time.
  const cardsTurn = inTurns(READS_AT_ONCE);
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
      logoutChannel,
      webId,
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
      ...preferenceChoices,
      paletteRepository,
      preferencesRepository,
      instanceRepository,
      deckRepository,
      reviewStateRepository,
      preferenceStore,
      answerStore,
      digestStore,
      newId,
      now,
    }),
    ...createDeckUseCases({ deckRepository, newId }),
    ...createDeckPauseUseCases({ deckRepository, reviewStateRepository, preferenceStore }),
    ...createCardUseCases({
      deckRepository,
      reviewStateRepository,
      deckLibrary,
      deckArchive,
      fileExchange,
      digestStore,
      readScope,
      cardsTurn,
      newId,
      now,
    }),
    ...createLibraryUseCases({
      deckLibrary,
      deckRepository,
      reviewStateRepository,
      courses,
      cardsTurn,
    }),
    ...createMistakeReportUseCases({ deckLibrary }),
    ...createWhatsNewUseCases({ seenHighlights }),
    ...createPodWaitUseCases({ podWaits }),
    ...createDeviceValueUseCases({ deviceStore, tabStore }),
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
      shapeValidator,
      deckLibrary,
      fileExchange,
      readScope,
      now,
    }),
    ...createInstanceGraphUseCases({
      instanceGraphReader,
      storageGateway,
      deckRepository,
      answerStore,
      releaseDraftRepository,
      releasePublisher,
    }),
    ...createTrialOpeningUseCases({ trialSandbox, preferenceStore }),
  };
}
