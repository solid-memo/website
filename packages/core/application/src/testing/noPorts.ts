// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { UpdateJournal, LogoutChannel, FileExchange } from "../ports/device";
import type { DeckArchive, ReleaseDraftRepository, ReleasePublisher } from "../ports/library";
import type {
  AnswerLog,
  DigestRepository,
  GuestPod,
  PaletteRepository,
  WriteFence,
  InstanceGraphReader,
} from "../ports/pod";
import { AppError } from "@solid-memo/domain/appError";
import { UNKEPT_STORE } from "../deviceValues";

const nothing = async () => undefined;
const none = async (): Promise<never[]> => [];

const NO_PALETTES: PaletteRepository = {
  listPalettes: none,
  savePalette: async () => {
    throw new Error("This app keeps no palettes.");
  },
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

const NO_LOGOUT_CHANNEL: LogoutChannel = {
  announce: () => undefined,
  listen: () => () => undefined,
};

const NO_JOURNAL: UpdateJournal = {
  begin: () => undefined,
  end: () => undefined,
  sources: () => [],
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
  documentCountOf: () => {
    throw new Error("This app keeps no drafts.");
  },
  refuseTooManyInAll: nothing,
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
  logoutChannel: NO_LOGOUT_CHANNEL,
  writeFence: NO_FENCE,
  guestPod: NO_GUEST_POD,
  answerLog: NO_ANSWER_LOG,
  digestRepository: NO_DIGESTS,
  deckArchive: NO_DECK_ARCHIVE,
  fileExchange: NO_FILE_EXCHANGE,
  paletteRepository: NO_PALETTES,
  deviceStore: UNKEPT_STORE,
  tabStore: UNKEPT_STORE,
  /** No one signed in. */
  webId: (): string | undefined => undefined,
};
