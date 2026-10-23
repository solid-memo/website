// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type {
  AnswerLog,
  DigestRepository,
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
} from "../ports";
import { AppError } from "@solid-memo/domain/appError";
import { DEFAULT_PALETTE } from "@solid-memo/domain/palette";
import { DEFAULT_TEXT_SIZE } from "@solid-memo/domain/textSize";

const nothing = async () => undefined;
const none = async (): Promise<never[]> => [];

const NO_LANGUAGE_PREFERENCE: LanguagePreference = { chosen: () => null, choose: () => undefined };

const NO_THEME_PREFERENCE: ThemePreference = { chosen: () => "system", choose: () => undefined };

const NO_PALETTE_PREFERENCE: PalettePreference = {
  chosen: () => DEFAULT_PALETTE,
  choose: () => undefined,
};

const NO_CUSTOM_PALETTE_PREFERENCE: CustomPalettePreference = {
  chosen: () => null,
  choose: () => undefined,
};

const NO_PALETTES: PaletteRepository = {
  listPalettes: none,
  savePalette: async () => {
    throw new Error("This app keeps no palettes.");
  },
};

const NO_TEXT_SIZE_PREFERENCE: TextSizePreference = {
  chosen: () => DEFAULT_TEXT_SIZE,
  choose: () => undefined,
};

const NO_DECK_ARCHIVE: DeckArchive = {
  exportDeck: async () => {
    throw new Error("This app keeps no deck archive.");
  },
  readDeckFile: async () => {
    throw new Error("This app keeps no deck archive.");
  },
};

const NO_FILE_EXCHANGE: FileExchange = { save: () => undefined, open: async () => null };

const NO_DIGESTS: DigestRepository = {
  readDigest: async () => null,
  updateDigest: async () => undefined,
};

const NO_ANSWER_LOG: AnswerLog = {
  append: nothing,
  appendAll: nothing,
  months: none,
  readMonth: none,
  // Never asked: a log without months has none to read.
  readMonthSince: nothing as unknown as AnswerLog["readMonthSince"],
  removeDay: nothing,
  removeAnswer: nothing,
};

const NO_JOURNAL: UpdateJournal = {
  begin: () => undefined,
  end: () => undefined,
  staging: () => null,
  run: () => () => undefined,
  watch: () => undefined,
};

const NO_FENCE: WriteFence = { hold: () => () => undefined };

const NO_GUEST_POD: GuestPod = {
  exists: async () => false,
  start: async () => {
    throw new AppError("noGuestPod");
  },
  discard: nothing,
};

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

const noTrials = (): never => {
  throw new Error("This app plays no trials.");
};

const NO_INSTANCE_GRAPH: InstanceGraphReader = {
  readDocument: async () => {
    throw new Error("This app reads no instance as a graph.");
  },
};

/**
 * A port that keeps nothing and does nothing, or refuses, for each port
 * a test has no use for: a test spreads NO_PORTS, then gives the ports
 * it is about. The app and the trial wire each port, or a "none" of
 * their own, so a missing one is a type error (packages/composition/).
 */
export const NO_PORTS = {
  releaseDraftRepository: NO_DRAFTS,
  releasePublisher: NO_RELEASES,
  trialSandbox: noTrials,
  instanceGraphReader: NO_INSTANCE_GRAPH,
  updateJournal: NO_JOURNAL,
  writeFence: NO_FENCE,
  guestPod: NO_GUEST_POD,
  answerLog: NO_ANSWER_LOG,
  digestRepository: NO_DIGESTS,
  deckArchive: NO_DECK_ARCHIVE,
  fileExchange: NO_FILE_EXCHANGE,
  languagePreference: NO_LANGUAGE_PREFERENCE,
  themePreference: NO_THEME_PREFERENCE,
  palettePreference: NO_PALETTE_PREFERENCE,
  customPalettePreference: NO_CUSTOM_PALETTE_PREFERENCE,
  paletteRepository: NO_PALETTES,
  textSizePreference: NO_TEXT_SIZE_PREFERENCE,
};
