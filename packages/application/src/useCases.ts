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
import { createInstanceGraphUseCases, type InstanceGraphUseCases } from "./instanceGraph";
import { createReleaseDraftUseCases, type ReleaseDraftUseCases } from "./releaseDrafts";
import {
  createReleasePublishingUseCases,
  type ReleasePublishingUseCases,
} from "./releasePublishing";
import { startTrial, type TrialOpening, type TrialSandbox } from "./trial";
import { draftReleaseModel } from "@solid-memo/domain/release/draftModel";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { trialProblems } from "@solid-memo/domain/release/trial";
import { createInstanceCheckUseCases, type InstanceCheckUseCases } from "./instanceChecks";
import { createCardUseCases, type CardUseCases } from "./cards";
import { createInstanceUseCases, type InstanceUseCases } from "./instances";
import { createStudyUseCases, type StudyUseCases } from "./study";
import { createMistakeReportUseCases, type MistakeReportUseCases } from "./mistakeReports";
import { createLibraryUseCases, type LibraryUseCases } from "./library";
import { createCourseUseCases, type CourseUseCases } from "./courses";
import { createPreferenceUseCases, type PreferenceUseCases } from "./preferences";
import { createDeckUseCases, type DeckUseCases } from "./decks";
import { createPreferenceStore } from "./preferenceStore";
import { createAnswerStore } from "./answerStore";
import { createDigestStore } from "./digestStore";
import { createStatisticsUseCases, type StatisticsUseCases } from "./statistics";
import { createSessionUseCases, type SessionUseCases } from "./session";

export interface UseCases
  extends SessionUseCases,
    StatisticsUseCases,
    InstanceCheckUseCases,
    CardUseCases,
    InstanceUseCases,
    StudyUseCases,
    MistakeReportUseCases,
    LibraryUseCases,
    CourseUseCases,
    PreferenceUseCases,
    DeckUseCases,
    ReleaseDraftUseCases,
    ReleasePublishingUseCases,
    InstanceGraphUseCases {
  /**
   * Test-play the draft (docs/studio.md, The trial), for the user of the
   * instance at `instanceUrl`: in a new sandbox of its own (trial.ts),
   * kept in memory, as a learner with the instance's answer scale and
   * study day. The trial, with the use cases to play it with; or, for a
   * draft that cannot be played, the problems that keep it from it
   * (trialProblems), with nothing made.
   */
  openTrial(draft: ReleaseDraft, instanceUrl: string): Promise<TrialOpening>;
}

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
  /** The drafts of releases in each instance; by default there are none. */
  releaseDraftRepository?: ReleaseDraftRepository;
  /** Where releases are published from each instance; by default none is. */
  releasePublisher?: ReleasePublisher;
  /** A new sandbox to test-play a draft in, each one empty; by default there is none. */
  trialSandbox?: (draft: ReleaseDraft) => TrialSandbox;
  /** Each instance's documents as statements, for its graph; by default none is read. */
  instanceGraphReader?: InstanceGraphReader;
}

const none = async (): Promise<never[]> => [];
const noDrafts = async () => {
  throw new Error("This app keeps no drafts.");
};
const NO_DRAFTS: ReleaseDraftRepository = {
  list: none,
  documents: none,
  create: noDrafts,
  read: noDrafts,
  applyChanges: noDrafts,
  assemble: noDrafts,
  readRelease: noDrafts,
  readLinked: noDrafts,
  parseRelease: noDrafts,
  delete: noDrafts,
};
const NO_RELEASES: ReleasePublisher = {
  publish: noDrafts,
  makePublic: noDrafts,
  isPublic: noDrafts,
  listPublished: none,
};
const NO_INSTANCE_GRAPH: InstanceGraphReader = {
  readDocument: async () => {
    throw new Error("This app reads no instance as a graph.");
  },
};
const noTrials = (): never => {
  throw new Error("This app plays no trials.");
};
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
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  writeFence,
  digestRepository,
  answerLog,
  ruleset = "",
  guestPod,
  deckArchive,
  fileExchange,
  releaseDraftRepository = NO_DRAFTS,
  releasePublisher = NO_RELEASES,
  trialSandbox = noTrials,
  instanceGraphReader = NO_INSTANCE_GRAPH,
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
    ...drafts,
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
    ...instances,
    ...createStudyUseCases({
      deckRepository,
      reviewStateRepository,
      preferenceStore,
      digestStore,
      answerStore,
      random,
    }),
    ...createMistakeReportUseCases({ deckLibrary }),
    ...createLibraryUseCases({
      deckLibrary,
      deckRepository,
      reviewStateRepository,
      shapeValidator,
      courses,
    }),
    ...courses,
    ...createPreferenceUseCases({
      languagePreference,
      themePreference,
      palettePreference,
      customPalettePreference,
      textSizePreference,
      paletteRepository,
      preferencesRepository,
      deckRepository,
      reviewStateRepository,
      preferenceStore,
      answerStore,
      digestStore,
      newId,
    }),
    ...createDeckUseCases({ deckRepository, newId }),
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
    async openTrial(draft, instanceUrl) {
      const problems = trialProblems(draftReleaseModel(draft));
      if (problems.length > 0) return { ok: false, problems };
      const prefs = await preferenceStore.get(instanceUrl);
      return { ok: true, trial: await startTrial(trialSandbox(draft), draft, prefs) };
    },
  };
}
