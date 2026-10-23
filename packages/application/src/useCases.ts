// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { profileNameOf, type SolidAccount } from "@solid-memo/domain/account";
import { deckPreferences } from "@solid-memo/domain/deckPace";
import { rebaseIri } from "@solid-memo/domain/instanceUpdate";
import { activeCards, DECK_FORMAT_VERSION, type Card, type Deck } from "@solid-memo/domain/deck";
import type { Instance, RegistrationTarget } from "@solid-memo/domain/instance";
import {
  deckGroupUrlOf,
  digestUrlOf,
  ensureTrailingSlash,
  instanceAddressOf,
} from "@solid-memo/domain/instanceLayout";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { studyDayOf } from "@solid-memo/domain/scheduling";
import { monthOfStudyDay, shiftStudyDay, type Answer } from "@solid-memo/domain/answer";
import { courseProgressOf, type CourseResults } from "@solid-memo/domain/course";
import { answersCsv } from "@solid-memo/domain/answerCsv";
import { statisticsOf, type Statistics } from "@solid-memo/domain/statistics";
import { firstTimedOf } from "@solid-memo/domain/studyTime";
import { calendarStartOf } from "@solid-memo/domain/studyPatterns";
import {
  cardAnswers,
  confusionsOf,
  deckAnswers,
  hardestCardsOf,
  lapseIndex,
  type Confusion,
  type HardestCards,
  type LapseIndex,
} from "@solid-memo/domain/cardHistory";
import {
  daysToClearOf,
  easeHistogram,
  FORECAST_DAYS,
  forecastOf,
  freshSchedule,
  intervalHistogram,
  leechesOf,
  overdueOf,
  scheduledStates,
  type Bin,
  type ForecastDay,
} from "@solid-memo/domain/scheduleInsight";
import { cardProgressOf, type CardProgress } from "@solid-memo/domain/cardProgress";
import type { EstablishedSession, Session } from "@solid-memo/domain/session";
import { isSecureUrl, validateWebId } from "@solid-memo/domain/webId";
import {
  decodeGuestMergeNote,
  encodeGuestMergeNote,
  guestDeckStamp,
  GUEST_INSTANCE_URL,
  GUEST_MERGE_STEPS,
  GUEST_ORIGIN,
  GUEST_SESSION,
  GUEST_TRANSFER_STEPS,
  GUEST_WEBID,
  graftOfGuestTree,
  guestMergeKey,
  guestMergePlan,
  isGuestUrl,
  mentionsGuest,
  mergedAnswer,
  mergedDeck,
  type GuestMergeOutcome,
  type GuestMergePlan,
  type GuestMergeProgress,
  type GuestMergeStep,
  type GuestStudy,
  type GuestTransferOutcome,
  type GuestTransferProgress,
  type GuestTransferStep,
} from "@solid-memo/domain/guest";
import type { WebIdDocument } from "@solid-memo/domain/webIdDocument";
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
  ContainerMove,
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
import { draftContainerOf, type ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { draftReleaseModel } from "@solid-memo/domain/release/draftModel";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { trialProblems } from "@solid-memo/domain/release/trial";
import { AppError } from "@solid-memo/domain/appError";
import { createInstanceCheckUseCases, type InstanceCheckUseCases } from "./instanceChecks";
import { createCardUseCases, type CardUseCases } from "./cards";
import { catalogOf, createInstanceUseCases, type InstanceUseCases } from "./instances";
import { createStudyUseCases, type StudyUseCases } from "./study";
import { createMistakeReportUseCases, type MistakeReportUseCases } from "./mistakeReports";
import { createLibraryUseCases, type LibraryUseCases } from "./library";
import { createCourseUseCases, type CourseUseCases } from "./courses";
import { createPreferenceUseCases, type PreferenceUseCases } from "./preferences";
import { createDeckUseCases, type DeckUseCases } from "./decks";
import { readNow, unsent } from "./writes";
import { stepReporter } from "./progress";
import { createPreferenceStore } from "./preferenceStore";
import { createAnswerStore, dueStatesOf } from "./answerStore";
import { createDigestStore, scheduleFrom } from "./digestStore";

export interface UseCases
  extends InstanceCheckUseCases,
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
  /** The session of a login or an earlier one; else a guest's, when a guest studied on this device; else null. */
  restoreSession(): Promise<EstablishedSession | null>;
  /**
   * Study as a guest, without logging in (docs/guest-mode.md): in a pod on
   * this device, with an instance named `instanceName` made in it when it
   * has none. The guest's session.
   */
  startGuest(instanceName: string): Promise<Session>;
  /** Delete everything the guest studied on this device. */
  discardGuest(): Promise<void>;
  /** What a guest studied on this device; null when no guest did. */
  findGuestStudy(): Promise<GuestStudy | null>;
  /**
   * Keep a guest's study in the pod the user logged in to (domain/guest.ts):
   * the guest's instance is copied into `containerUrl`, made the user's,
   * checked, and registered in their type index; then deleted from the
   * device. A failure before the registration deletes the copy and leaves
   * the guest's study as it was.
   */
  transferGuestStudy(
    session: Session,
    guestInstance: Instance,
    target: { containerUrl: string; registrationTarget: RegistrationTarget },
    onProgress?: (progress: GuestTransferProgress) => void,
  ): Promise<GuestTransferOutcome>;
  /**
   * What adding the guest's study to `target`, an instance the user has,
   * would add (domain/guest.ts GuestMergePlan): the guest's decks, each
   * with the target's decks from the same library release, and how many
   * drafts the guest wrote, which are copied too. Reads only.
   */
  planGuestMerge(guestInstance: Instance, target: Instance): Promise<GuestMergePlan>;
  /**
   * Keep a guest's study in an instance the user has (docs/guest-mode.md
   * "Adding to an instance"): the guest's study is read and checked, then
   * each of its decks (but those in `skip`, by URL) is added to `target`
   * as a new deck — its cards and review states, then its catalog entry,
   * then its answers — the guest's deck groups made around them, each of
   * the guest's drafts copied (copyReleaseDraft: under its name, or the
   * next one free, never over a draft the instance has), and,
   * once the guest's study is found unchanged since it was read, it is
   * deleted from the device. The target's preferences stay; the guest's
   * are not carried over. A failure leaves every deck added whole, and
   * the guest's study as it was; run again, a deck or draft already
   * added from this device, and unchanged since, is not added twice.
   */
  mergeGuestStudy(
    session: Session,
    guestInstance: Instance,
    target: Instance,
    options?: { skip?: readonly string[] },
    onProgress?: (progress: GuestMergeProgress) => void,
  ): Promise<GuestMergeOutcome>;
  /** Rejects, without any network request, unless the WebID is an https URL. */
  loginWithWebId(webId: string): Promise<void>;
  /** Log in at a chosen identity provider; rejects unless it is an https URL. */
  loginWithProvider(oidcIssuer: string): Promise<void>;
  logout(): Promise<void>;
  /** Subscribe to session expiry; returns an unsubscribe function. */
  onSessionExpired(listener: () => void): () => void;
  /**
   * The account behind a session: its Pod, discovered through the WebID
   * profile's storage link, its identity provider and its foaf:name.
   */
  discoverAccount(session: Session): Promise<SolidAccount>;
  viewWebIdDocument(session: Session): Promise<WebIdDocument>;
  /**
   * The partial copy of the guest's instance that a move into a new
   * folder (transferGuestStudy), cut off half-way by a closed tab, left
   * behind, as this browser noted it; null when there is none (any more).
   */
  findInterruptedGuestMove(instance: Instance): Promise<string | null>;
  /** Delete the partial copy an interrupted move left behind, and forget it. */
  removeInterruptedGuestMove(instance: Instance): Promise<void>;
  /**
   * The study statistics of the answers given in the last `months` study
   * months (12 by default), or, when `range` is given, in its last `range`
   * study days or the whole log ("all"), up to now: of every deck, or of
   * one. Answers still waiting to be added to the log are added first; a
   * month's document is read only when it changed since last read, as
   * loadAnswerLog reads it, which shares what is kept.
   */
  getStatistics(
    instanceUrl: string,
    now: Date,
    options?: StatisticsRange,
  ): Promise<StatisticsReport>;
  /**
   * Save the answers of the range getStatistics would read with the same
   * `options` (every column the log has, answersCsv) as a CSV file on the
   * learner's device, "solid-memo-answers-<study day>.csv": they are
   * handed to the browser to save and sent nowhere. Reads the months as
   * getStatistics does, sharing what is kept.
   */
  saveAnswers(instanceUrl: string, now: Date, options?: StatisticsRange): Promise<void>;
  /**
   * Every answer of the instance's log, of every month, answers still
   * waiting to be added to it added first. Each month's document is read
   * once a call, and only when it changed since it was last read (by its
   * version, kept in this page with the month's answers, for
   * getStatistics too).
   */
  loadAnswerLog(instanceUrl: string): Promise<Answer[]>;
  /**
   * What the Studio's schedule screen shows of a deck (domain/scheduleInsight.ts),
   * as of `now` with the instance's preferences `prefs`: the reviews of
   * the next FORECAST_DAYS study days, capped by the deck's pace (else
   * the preferences'), from the deck's schedule in the digest while it
   * was computed from the documents as they are, else from them (and the
   * digest is brought up to date); how its prompts' intervals and eases
   * are spread; and its lapses and leeches, from the answer log. Writes
   * nothing to the deck.
   */
  deckInsight(
    instanceUrl: string,
    deck: Deck,
    now: Date,
    prefs: StudyPreferences,
  ): Promise<DeckInsight>;
  /** The answers of one card of the deck (by its id), newest first, from the answer log. */
  cardAnswers(instanceUrl: string, deck: Deck, cardId: string): Promise<Answer[]>;
  /**
   * How far along each deck's prompts are now (cardProgressOf), how
   * their intervals and eases are spread, and the reviews of its next
   * FORECAST_DAYS study days (forecastOf, capped by the deck's pace, else
   * the preferences'), with what is overdue and how long the cap takes to
   * let through what it holds back; and, from the answers of the last
   * twelve study months, which of its cards in use were forgotten most
   * (hardestCardsOf) and which wrong options were chosen most
   * (confusionsOf): of every deck of the instance, or of the one given.
   * Reads each deck's cards and review states once, and keeps its
   * schedule in the digest while at it; the log's months as
   * getStatistics reads them, sharing what is kept.
   */
  getCardProgress(
    instanceUrl: string,
    now: Date,
    options?: { deck?: Deck },
  ): Promise<CardProgressReport>;
  /**
   * How each course of `courses` (the instance's decks that are copies of
   * a course, in the order given) has gone: its chapters completed, as
   * its deck says, and its graded course answers chapter by chapter
   * (courseProgressOf), from the answers of the last twelve study months,
   * which the log's months are read for as getStatistics reads them,
   * sharing what is kept. The outline is its release's, read once (the
   * library keeps it); a course whose outline cannot be read is left out.
   * Reads nothing for no course.
   */
  getCourseStatistics(
    instanceUrl: string,
    now: Date,
    courses: readonly Deck[],
  ): Promise<CourseStatistics[]>;
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

/** What the Studio's schedule screen shows of a deck (UseCases.deckInsight). */
export interface DeckInsight {
  /** The study day it is of. */
  today: string;
  /** The reviews a day the forecast is capped at: the deck's pace, else the instance's. */
  maxReviewsPerDay: number;
  /** The next FORECAST_DAYS study days, today's first. */
  forecast: ForecastDay[];
  /** The review states of the deck's cards in use, in the directions it studies. */
  scheduled: number;
  intervals: Bin[];
  eases: Bin[];
  /** How often each card was forgotten, by its IRI in the deck's cards document now. */
  lapses: LapseIndex;
  /** The deck's cards in use forgotten LEECH_LAPSES times or more, the most forgotten first. */
  leeches: { card: Card; lapses: number }[];
}

/**
 * Which answers of the log the statistics are of (UseCases.getStatistics):
 * those of the last `months` study months (12 by default), or, when
 * `range` is given, of its last `range` study days or the whole log
 * ("all"); of every deck, or of the one `deckUrl` names.
 */
export interface StatisticsRange {
  months?: number;
  range?: number | "all";
  deckUrl?: string;
}

/** The study statistics of a range of the answer log (UseCases.getStatistics). */
export interface StatisticsReport extends Statistics {
  /**
   * The study month ("YYYY-MM") the log begins with, when the range asked
   * for begins before it (always so for the whole log): the figures cover
   * only the months since. null when the log reaches back past the range,
   * or has no month.
   */
  coverage: string | null;
  /** The study month ("YYYY-MM") the log begins with; null for a log with no month. */
  logBegins: string | null;
  /** The hour the learner's study day begins (Preferences.dayBoundaryHour), where the hours of the day start. */
  dayBoundaryHour: number;
}

/** How one course has gone (UseCases.getCourseStatistics). */
export interface CourseStatistics extends CourseResults {
  /** The course's deck in the instance. */
  deck: Deck;
}

/** How far along decks' prompts are (UseCases.getCardProgress). */
export interface CardProgressReport {
  /** The study day it is: the forecasts' first. */
  today: string;
  /** Each deck's figures, as its own caps make them. */
  decks: DeckProgress[];
}

/** Where one deck's prompts stand, and its reviews to come (CardProgressReport). */
export interface DeckProgress {
  deck: Deck;
  /** Its prompts by stage. */
  progress: CardProgress;
  /** The reviews of its next FORECAST_DAYS study days (forecastOf). */
  forecast: ForecastDay[];
  /** How its scheduled prompts' intervals and eases are spread (intervalHistogram, easeHistogram). */
  intervals: Bin[];
  eases: Bin[];
  /** Its prompts due before today (overdueOf). */
  overdue: number;
  /** The study days after today its cap takes to let through the reviews it holds back (daysToClearOf); null: more than the forecast's. */
  daysToClear: number | null;
  /** The new prompts it introduces a day: its own cap, else the preferences'. */
  newCardsPerDay: number;
  /** Its prompts first reviewed today, which that cap counts (newCardsRunOutOf). */
  introducedToday: number;
  /** Its cards in use forgotten in reviews of the last twelve study months, the hardest first, and the reviews of those months. */
  hardest: HardestCards<Card>;
  /** Its multiple-choice answers of those months. */
  courseAnswers: number;
  /** The wrong options chosen in them, with their cards in use, the most chosen first. */
  confusions: Confusion<Card>[];
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
  /** Notes of a guest's study being moved or added to an instance; by default none is kept. */
  updateJournal?: UpdateJournal;
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
  writeFence?: WriteFence;
  /** Where each instance's digest is kept. */
  digestRepository: DigestRepository;
  /** Where each instance's answer log is kept; by default none is. */
  answerLog?: AnswerLog;
  /** Names the shapes documents are checked by; a receipt of other rules does not count. */
  ruleset?: string;
  /** The pod a guest studies in on this device; by default there is none. */
  guestPod?: GuestPod;
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

/**
 * Holds in this page what a guest's move another page runs copies, and
 * the copy, for as long as it runs (not as long as its journal entry,
 * which a failed move leaves). Two apps on one origin (the web app and
 * the Studio) thus never write to what the other is moving. Tells
 * whether a move of the URL runs elsewhere.
 */
function fenceMovesElsewhere(
  journal: UpdateJournal,
  fence: WriteFence,
): (sourceUrl: string) => boolean {
  const held = new Map<string, () => void>();
  journal.watch((sourceUrl, staging) => {
    held.get(sourceUrl)?.();
    held.delete(sourceUrl);
    if (staging === null) return;
    const releases = [sourceUrl, staging].map((url) => fence.hold(url));
    held.set(sourceUrl, () => {
      for (const release of releases) release();
    });
  });
  return (sourceUrl) => held.has(sourceUrl);
}

const NO_JOURNAL: UpdateJournal = {
  begin: () => undefined,
  end: () => undefined,
  staging: () => null,
  run: () => () => undefined,
  watch: () => undefined,
};
const NO_FENCE: WriteFence = { hold: () => () => undefined };
const nothing = async () => undefined;
const none = async (): Promise<never[]> => [];
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
const NO_GUEST_POD: GuestPod = {
  exists: async () => false,
  start: async () => {
    throw new AppError("noGuestPod");
  },
  discard: nothing,
};

/** The first study day of the month of `today` and of the `months - 1` before it. */
function firstDayOfMonths(today: string, months: number): string {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - months, 1)).toISOString().slice(0, 10);
}

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
  updateJournal = NO_JOURNAL,
  languagePreference,
  themePreference,
  palettePreference,
  customPalettePreference,
  paletteRepository,
  textSizePreference,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  writeFence = NO_FENCE,
  digestRepository,
  answerLog = NO_ANSWER_LOG,
  ruleset = "",
  guestPod = NO_GUEST_POD,
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
  const runsElsewhere = fenceMovesElsewhere(updateJournal, writeFence);

  /**
   * A deck's cards and review states as they are now, with its schedule:
   * the digest's while it is of these documents, else computed afresh and
   * kept.
   */
  async function scheduleNow(
    instanceUrl: string,
    deck: Deck,
    at: Date,
    prefs: Pick<StudyPreferences, "scheduler" | "dayBoundaryHour">,
  ) {
    const [digest, cards, reviews] = await Promise.all([
      digestStore.of(instanceUrl),
      readNow(deckRepository.readCardsSince(deck, undefined)),
      readNow(reviewStateRepository.readReviewStatesSince(deck, undefined)),
    ]);
    const versions = { cards: cards.version, reviews: reviews.version };
    const today = studyDayOf(at, prefs.dayBoundaryHour);
    let schedule = freshSchedule(digest.schedules[deck.url], versions, {
      direction: deck.direction,
      dayBoundaryHour: prefs.dayBoundaryHour,
      scheduler: prefs.scheduler,
      today,
    });
    if (schedule === null) {
      schedule = scheduleFrom(cards, deck, reviews, prefs, at);
      digestStore.recordSchedule(instanceUrl, deck, cards, reviews, schedule);
    }
    return { cards, reviews, schedule };
  }

  /**
   * The answers of a range of the log up to `at` (StatisticsRange), of
   * every deck or of one, answers still waiting to be added to it added
   * first; with the study day it ends on, the months the log lists, the
   * range's first study day and the first month it takes in (null for
   * the whole log). With `recent`, the answers of the activity
   * calendar's weeks come too, where the range begins after them
   * (statisticsOf's figures up to today), and the first answer read
   * with a recorded time, of every deck: since when the app records
   * times, though one deck's were recorded later.
   */
  async function rangeAnswers(
    instanceUrl: string,
    at: Date,
    { months = 12, range, deckUrl }: StatisticsRange,
    recent = false,
  ): Promise<{
    answers: Answer[];
    today: string;
    logged: readonly string[];
    first: string | null;
    firstMonth: string | null;
    firstTimed: Answer | undefined;
    dayBoundaryHour: number;
  }> {
    await answerStore.flush();
    const [prefs, logged] = await Promise.all([
      preferenceStore.get(instanceUrl),
      answerLog.months(instanceUrl),
    ]);
    const today = studyDayOf(at, prefs.dayBoundaryHour);
    // The range's first study day: of `range` days up to today, or the first
    // of this month and the `months - 1` before it; none for the whole log.
    const first =
      range === "all"
        ? null
        : range === undefined
          ? firstDayOfMonths(today, months)
          : shiftStudyDay(today, 1 - range);
    const firstMonth = first === null ? null : monthOfStudyDay(first);
    const calendarStart = calendarStartOf(today);
    const from = first === null || !recent || first <= calendarStart ? first : calendarStart;
    const fromMonth = from === null ? null : monthOfStudyDay(from);
    const read = await answerStore.readMonths(
      instanceUrl,
      logged,
      (logMonth) => fromMonth === null || logMonth >= fromMonth,
    );
    const answers = read.filter(
      (answer) =>
        (from === null || answer.studyDay >= from) &&
        (deckUrl === undefined || answer.deckUrl === deckUrl),
    );
    return {
      answers,
      today,
      logged,
      first,
      firstMonth,
      firstTimed: firstTimedOf(read),
      dayBoundaryHour: prefs.dayBoundaryHour,
    };
  }

  /**
   * Copy each resource (below `move.from`) to its place below `move.to`,
   * one by one; the version each was copied at, by resource.
   */
  async function copyResources(
    resources: readonly string[],
    move: ContainerMove,
    onCopied: () => void,
  ): Promise<Map<string, string>> {
    const versions = new Map<string, string>();
    for (const resource of resources) {
      const copy = rebaseIri(resource, move.from, move.to);
      versions.set(resource, await instanceCopier.copyResource(resource, copy, move));
      onCopied();
    }
    return versions;
  }

  /**
   * Throw unless the container still lists the same resources (`listed`
   * lists them as they were listed), each at the version it was copied at.
   */
  async function ensureUnchanged(
    listed: () => Promise<string[]>,
    resources: readonly string[],
    versions: ReadonlyMap<string, string>,
    onChecked: () => void,
  ): Promise<void> {
    if ((await listed()).join("\n") !== resources.join("\n")) {
      throw new AppError("instanceChangedDuringCopy");
    }
    onChecked();
    for (const resource of resources) {
      if (!(await instanceCopier.isUnchanged(resource, versions.get(resource)!))) {
        throw new AppError("resourceChangedDuringCopy", { url: resource });
      }
      onChecked();
    }
  }

  /**
   * Delete a copy that failed half-way, when one was made; whether nothing
   * is left of it. Whole: the copy's container was free when this app
   * created it, and nothing names it yet, so all it holds is this app's
   * copies, the originals left where they were. The journal's note goes
   * with it, but only one this run wrote (`begun`): a run that failed
   * before, at a target already taken, leaves the note of an earlier,
   * interrupted move, whose copy is still to remove.
   */
  async function removeCopy(
    source: string,
    target: string,
    { begun, created }: { begun: boolean; created: boolean },
  ): Promise<boolean> {
    let cleanedUp = !created;
    if (created) {
      cleanedUp = await instanceCopier.deleteRecursively(target).then(
        () => true,
        () => false,
      );
    }
    if (cleanedUp && begun) updateJournal.end(source);
    return cleanedUp;
  }

  /** The guest's instance, and the whole guest pod once it has no instance left. */
  async function removeGuestInstance(instance: Instance): Promise<void> {
    await instanceRepository.deleteInstance({ webId: GUEST_WEBID, instance });
    if ((await instanceRepository.listInstances(GUEST_WEBID)).length === 0)
      await guestPod.discard();
  }

  /**
   * Add a guest's deck to the instance as a new deck, whole: its cards
   * document, then its reviews document (each created only where nothing
   * is), then its catalog entry, the write that makes it a deck of the
   * instance. A failure before the entry deletes the documents it wrote
   * (and one whose write may have been made, its answer lost), which
   * nothing names, never one the pod refused to create; unless the entry
   * was written after all, its answer lost on the way: then the deck is
   * there, whole.
   */
  async function addGuestDeck(guest: Deck, instanceUrl: string): Promise<Deck> {
    const deck = mergedDeck(guest, instanceUrl, `deck-${newId()}`, DECK_FORMAT_VERSION);
    const [cards, states] = await Promise.all([
      deckRepository.listCards(guest),
      reviewStateRepository.listReviewStates(guest),
    ]);
    // A card is written by its fragment id, in this app's format, at the time it was made.
    const content = cards.map(({ url: _url, formatVersion: _formatVersion, ...card }) => card);
    if (mentionsGuest([deck, content, states]))
      throw new AppError("guestUrlsLeft", { url: deck.url });
    const written: string[] = [];
    const create = async (url: string, write: () => Promise<void>) => {
      try {
        await write();
      } catch (error) {
        if (!unsent(error)) written.push(url);
        throw error;
      }
      written.push(url);
    };
    try {
      // One PUT of the whole document: a PATCH of much text can be cut short (docs/testing.md).
      if (content.length > 0) {
        await create(deck.cardsDocumentUrl, () =>
          deckRepository.applyCardChanges(deck, { save: content, remove: [] }, { whole: true }),
        );
      }
      if (states.sm2.length + states.fsrs.length > 0) {
        await create(deck.reviewsDocumentUrl, () =>
          reviewStateRepository.createReviewStates(deck, states),
        );
      }
      return await deckRepository.addDeck(deck);
    } catch (error) {
      const entry = unsent(error)
        ? null
        : await deckRepository.readDeck(deck.url).catch(() => null);
      if (entry !== null) return entry;
      for (const url of written)
        await deckRepository.deleteDocument(deck, url).catch(() => undefined);
      throw error;
    }
  }

  /** Throw unless the guest's study conforms, none of it written by a newer version of this app. */
  async function ensureGuestStudyReadable(source: string): Promise<void> {
    const report = await checks.validateInstance(source);
    if (!report.conforms) throw new AppError("guestStudyInvalid", { count: report.violationCount });
    if (
      report.documents.some((document) =>
        document.subjects.some((subject) => subject.status === "newer"),
      )
    ) {
      throw new AppError("guestStudyTooNew");
    }
  }

  /**
   * The copy of a guest's deck or draft that a run from this device made
   * before (its journal note under `key`), when the note's stamp is `stamp`
   * and the copy is still among `existing`; otherwise a new copy, noted.
   */
  async function journaledGuestCopy<T extends { url: string }>(
    key: string,
    stamp: string,
    existing: readonly T[],
    copy: () => Promise<T>,
  ): Promise<T> {
    const note = decodeGuestMergeNote(updateJournal.staging(key));
    const before =
      note?.stamp === stamp ? existing.find((candidate) => candidate.url === note.url) : undefined;
    if (before !== undefined) return before;
    const made = await copy();
    updateJournal.begin(key, encodeGuestMergeNote({ url: made.url, stamp }));
    return made;
  }

  /**
   * Throw unless the guest's study still lists the same documents (`listed`
   * lists them as they were listed), each at the version it was read at.
   */
  async function ensureGuestStudyUnchanged(
    listed: () => Promise<string[]>,
    resources: readonly string[],
    versions: ReadonlyMap<string, string | null>,
    onChecked: () => void,
  ): Promise<void> {
    if ((await listed()).join("\n") !== resources.join("\n"))
      throw new AppError("guestStudyChanged");
    onChecked();
    for (const [url, version] of versions) {
      if ((await instanceCopier.versionOf(url)) !== version)
        throw new AppError("guestStudyChanged", { url });
      onChecked();
    }
  }

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
    async restoreSession() {
      const established = await sessionGateway.restore();
      if (established !== null) return established;
      return (await guestPod.exists()) ? { session: GUEST_SESSION, origin: "restored" } : null;
    },
    async startGuest(instanceName) {
      await guestPod.start();
      if ((await instanceRepository.listInstances(GUEST_WEBID)).length === 0) {
        await instances.createInstance(GUEST_SESSION, {
          containerUrl: GUEST_INSTANCE_URL,
          name: instanceName,
          registrationTarget: "private",
        });
      }
      return GUEST_SESSION;
    },
    discardGuest() {
      return guestPod.discard();
    },
    async findGuestStudy() {
      if (!(await guestPod.exists())) return null;
      const instances = await instanceRepository.listInstances(GUEST_WEBID);
      return {
        instances: await Promise.all(
          instances.map(async (instance) => ({
            instance,
            deckCount: (await deckRepository.listDecks(instance.url)).length,
          })),
        ),
      };
    },
    async transferGuestStudy(
      session,
      guestInstance,
      { containerUrl, registrationTarget },
      onProgress = () => undefined,
    ) {
      const source = ensureTrailingSlash(guestInstance.url);
      // As a request would send it, as a created instance's address is.
      const target = instanceAddressOf(containerUrl.trim());
      if (session.guest === true || !isGuestUrl(source) || isGuestUrl(target)) {
        throw new Error(
          "A guest's study moves from the guest's pod into the pod of a user who logged in.",
        );
      }
      const move = { from: source, to: target, renames: { [GUEST_WEBID]: session.webId } };
      const progress = stepReporter<GuestTransferStep>(
        "stage",
        GUEST_TRANSFER_STEPS.length,
        onProgress,
      );
      // The digest is what this device learned of the guest's pod's versions: the user's pod starts its own.
      const digest = digestUrlOf(source);
      const listed = async () =>
        (await instanceCopier.listResources(source)).filter((url) => url !== digest);
      // Answers still on their way to the guest's log go there first, to move with it.
      await answerStore.flush();
      let begun = false;
      let created = false;
      let instance: Instance;
      const release = writeFence.hold(source);
      const stopRunning = updateJournal.run(source);
      try {
        // Listing the guest's instance, making sure the target is free, creating it.
        progress.start(3);
        const resources = await listed();
        progress.stepped();
        await instanceCopier.ensureAbsent(target);
        progress.stepped();
        updateJournal.begin(source, target);
        begun = true;
        await instanceCopier.createContainer(target);
        created = true;
        progress.finished("copy", resources.length);
        const versions = await copyResources(resources, move, () => progress.stepped());
        // The catalog's publisher, named as the user's profile names them; then nothing may name the guest's pod.
        const documents = resources
          .filter((url) => !url.endsWith("/"))
          .map((url) => rebaseIri(url, source, target));
        progress.finished("adopt", documents.length + 1);
        const catalog = await deckRepository.readCatalog(target);
        if (catalog !== null) {
          await deckRepository.saveCatalog(target, {
            ...catalog,
            publisher: (await catalogOf(webIdDocumentRepository, session, catalog.title)).publisher,
          });
        }
        progress.stepped();
        for (const url of documents) {
          if (await instanceCopier.mentions(url, GUEST_ORIGIN))
            throw new AppError("guestUrlsLeft", { url });
          progress.stepped();
        }
        progress.finished("validate");
        const report = await checks.validateInstance(target, (count, of) =>
          progress.partly(count, of),
        );
        if (!report.conforms) {
          throw new AppError("movedCopyInvalid", { count: report.violationCount });
        }
        // Listing the guest's instance again, then each of its resources.
        progress.finished("verify", resources.length + 1);
        await ensureUnchanged(listed, resources, versions, () => progress.stepped());
        progress.finished("register");
        instance = await instanceRepository.attachInstance({
          webId: session.webId,
          instanceUrl: target,
          registrationTarget,
        });
      } catch (error) {
        const cleanedUp = await removeCopy(source, target, { begun, created });
        return {
          ok: false,
          step: progress.step(),
          error,
          cleanedUp,
          ...(cleanedUp ? {} : { leftoverUrl: target }),
        };
      } finally {
        stopRunning();
        release();
      }
      // The study is the user's now: what follows only tidies.
      progress.finished("tidy");
      updateJournal.end(source);
      const tidied = await (async () => {
        // The registrations of each class of its data let other apps find it; the instance works without, and Preferences adds them later.
        await instanceRepository
          .registerDataClasses({ webId: session.webId, instanceUrl: target, title: instance.name })
          .catch(() => undefined);
        await removeGuestInstance(guestInstance);
      })().then(
        () => true,
        () => false,
      );
      progress.finished();
      return { ok: true, instance, tidied };
    },
    async planGuestMerge(guestInstance, target) {
      const [guestDecks, targetDecks, drafts] = await Promise.all([
        deckRepository.listDecks(guestInstance.url),
        deckRepository.listDecks(target.url),
        releaseDraftRepository.list(guestInstance.url),
      ]);
      return guestMergePlan(guestDecks, targetDecks, drafts.length);
    },
    async mergeGuestStudy(
      session,
      guestInstance,
      target,
      { skip = [] } = {},
      onProgress = () => undefined,
    ) {
      const source = ensureTrailingSlash(guestInstance.url);
      const targetUrl = ensureTrailingSlash(target.url);
      if (session.guest === true || !isGuestUrl(source) || isGuestUrl(targetUrl)) {
        throw new Error(
          "A guest's study is added from the guest's pod to an instance of a user who logged in.",
        );
      }
      const progress = stepReporter<GuestMergeStep>("read", GUEST_MERGE_STEPS.length, onProgress);
      // The digest is what this device learned of the guest's pod's versions: it is not the guest's study.
      const digest = digestUrlOf(source);
      const listed = async () =>
        (await instanceCopier.listResources(source)).filter((url) => url !== digest);
      const versionsOf = async (resources: readonly string[]) =>
        new Map(
          await Promise.all(
            resources
              .filter((url) => !url.endsWith("/"))
              .map(async (url) => [url, await instanceCopier.versionOf(url)] as const),
          ),
        );
      // Answers still on their way to the guest's log go there first, to be added with it.
      await answerStore.flush();
      const added: Deck[] = [];
      const copied: ReleaseDraftSummary[] = [];
      const notes: string[] = [];
      const release = writeFence.hold(source);
      try {
        // What the guest's study holds, at what version, before any of it is read; then all of it, checked.
        progress.start(2);
        const resources = await listed();
        const versions = await versionsOf(resources);
        await ensureGuestStudyReadable(source);
        progress.stepped();
        const [decks, tree, months, targetDecks, targetTree, guestDrafts, targetDrafts] =
          await Promise.all([
            deckRepository.listDecks(source),
            deckRepository.readDeckTree(source),
            answerLog.months(source),
            deckRepository.listDecks(targetUrl),
            deckRepository.readDeckTree(targetUrl),
            releaseDraftRepository.list(source),
            releaseDraftRepository.list(targetUrl),
          ]);
        // Groups to make in an arrangement a newer version wrote could not be: refused before anything is written.
        if (targetTree.readOnly && tree.children.some((node) => node.kind === "group"))
          throw new AppError("deckTreeTooNew");
        const answers = (
          await Promise.all(months.map((month) => answerLog.readMonth(source, month)))
        ).flat();
        const chosen = decks.filter((deck) => !skip.includes(deck.url));

        // Each deck whole, one after another: its documents, its entry, then its answers.
        progress.finished("decks", chosen.length);
        const into = new Map<string, Deck>();
        for (const deck of chosen) {
          const key = guestMergeKey(deck.url, targetUrl);
          const stamp = guestDeckStamp(deck, (url) => versions.get(url) ?? "");
          // Added from this device before, its entry and documents unchanged since: there it is.
          const merged = await journaledGuestCopy(key, stamp, targetDecks, () =>
            addGuestDeck(deck, targetUrl),
          );
          notes.push(key);
          into.set(deck.url, merged);
          added.push(merged);
          await answerStore.appendAll(
            targetUrl,
            answers
              .filter((answer) => answer.deckUrl === deck.url)
              .map((answer) => mergedAnswer(answer, merged)),
          );
          progress.stepped();
        }

        // The guest's groups, new, around the decks added; each under the URL an earlier run gave it, if that run arranged the same.
        progress.finished("arrange");
        const arrangement = JSON.stringify(graftOfGuestTree(tree, into, (group) => group.url));
        const nodes = graftOfGuestTree(tree, into, (group) => {
          const key = guestMergeKey(group.url, targetUrl);
          const note = decodeGuestMergeNote(updateJournal.staging(key));
          const url = note?.stamp === arrangement ? note.url : deckGroupUrlOf(targetUrl, newId());
          updateJournal.begin(key, encodeGuestMergeNote({ url, stamp: arrangement }));
          notes.push(key);
          return url;
        });
        if (nodes.length > 0)
          await deckRepository.editDeckTree(targetUrl, { kind: "graft", nodes });

        // Each draft copied whole, under its name or the next free one; again only when its documents changed since.
        progress.finished("drafts", guestDrafts.length);
        for (const draft of guestDrafts) {
          const key = guestMergeKey(draft.url, targetUrl);
          const container = draftContainerOf(draft.url);
          const stamp = [...versions]
            .filter(([url]) => url.startsWith(container))
            .map(([url, version]) => `${url} ${version}`)
            .join("\n");
          // Copied from this device before, its documents unchanged since, and the copy still there: there it is.
          const copy = await journaledGuestCopy(key, stamp, targetDrafts, () =>
            drafts.copyReleaseDraft(draft.url, targetUrl),
          );
          notes.push(key);
          copied.push(copy);
          progress.stepped();
        }

        // Listing the guest's study again, then each of its documents: what was added is what it holds.
        progress.finished("verify", versions.size + 1);
        await ensureGuestStudyUnchanged(listed, resources, versions, () => progress.stepped());
      } catch (error) {
        return { ok: false, instance: target, step: progress.step(), error, added, copied };
      } finally {
        release();
      }
      // The study is in the instance now: what follows only tidies.
      progress.finished("tidy");
      const tidied = await removeGuestInstance(guestInstance).then(
        () => true,
        () => false,
      );
      // The notes would keep a deck from being added twice, while the guest's study is still here.
      if (tidied) for (const key of notes) updateJournal.end(key);
      progress.finished();
      return { ok: true, instance: target, added, tidied };
    },
    async loginWithWebId(webId) {
      const validation = validateWebId(webId);
      if (!validation.ok) {
        throw validation.error;
      }
      return sessionGateway.login(validation.webId);
    },
    async loginWithProvider(oidcIssuer) {
      if (!isSecureUrl(oidcIssuer)) {
        throw new AppError("providerNotHttps");
      }
      return sessionGateway.loginWithIssuer(oidcIssuer);
    },
    logout() {
      return sessionGateway.logout();
    },
    onSessionExpired(listener) {
      return sessionGateway.onSessionExpired(listener);
    },
    async discoverAccount(session) {
      const [storages, oidcIssuer, name] = await Promise.all([
        storageGateway.discoverStorages(session.webId),
        // A guest logs in nowhere; their WebID is not on the network to be asked.
        session.guest === true
          ? undefined
          : sessionGateway.discoverOidcIssuer(session.webId).catch(() => undefined),
        webIdDocumentRepository
          .fetchWebIdDocument(session.webId)
          .then((document) => profileNameOf(document, session.webId))
          .catch(() => undefined),
      ]);
      return { webId: session.webId, name, podUrl: storages[0]?.url, oidcIssuer };
    },
    viewWebIdDocument(session) {
      return webIdDocumentRepository.fetchWebIdDocument(session.webId);
    },
    async findInterruptedGuestMove(instance) {
      const source = ensureTrailingSlash(instance.url);
      // Only a guest's study moves; a note on another instance is an earlier version's, and its folder is left alone.
      if (!isGuestUrl(source)) return null;
      const staging = updateJournal.staging(source);
      // A move another page runs is not interrupted, however long it takes.
      if (staging === null || runsElsewhere(source)) return null;
      const gone = await instanceCopier.ensureAbsent(staging).then(
        () => true,
        () => false,
      );
      if (gone) updateJournal.end(source);
      return gone ? null : staging;
    },
    async removeInterruptedGuestMove(instance) {
      const source = ensureTrailingSlash(instance.url);
      if (!isGuestUrl(source)) return;
      // The copy of a move another page runs is that move's to remove.
      if (runsElsewhere(source)) throw new AppError("guestStudyBeingMoved", { container: source });
      const staging = updateJournal.staging(source);
      // Made whole by that move, at a URL it found free, and named nowhere: deleted whole.
      if (staging !== null) await instanceCopier.deleteRecursively(staging);
      updateJournal.end(source);
    },
    async getStatistics(instanceUrl, at, options = {}) {
      const { answers, today, logged, first, firstMonth, firstTimed, dayBoundaryHour } =
        await rangeAnswers(instanceUrl, at, options, true);
      const begins = logged[0];
      return {
        ...statisticsOf(answers, today, first ?? undefined, firstTimed),
        coverage:
          begins !== undefined && (firstMonth === null || begins > firstMonth) ? begins : null,
        logBegins: begins ?? null,
        dayBoundaryHour,
      };
    },
    async saveAnswers(instanceUrl, at, options = {}) {
      const { answers, today } = await rangeAnswers(instanceUrl, at, options);
      fileExchange.save(`solid-memo-answers-${today}.csv`, "text/csv", answersCsv(answers));
    },
    loadAnswerLog: answerStore.loadAll,
    async deckInsight(instanceUrl, deck, at, prefs) {
      const today = studyDayOf(at, prefs.dayBoundaryHour);
      const [{ cards, reviews, schedule }, answers] = await Promise.all([
        scheduleNow(instanceUrl, deck, at, prefs),
        answerStore.loadAll(instanceUrl),
      ]);
      const { maxReviewsPerDay } = deckPreferences(prefs, deck);
      const states = scheduledStates(cards.value, deck.direction, reviews.value.sm2);
      const due = scheduledStates(cards.value, deck.direction, dueStatesOf(reviews.value, prefs));
      const lapses = lapseIndex(deckAnswers(answers, deck));
      const live = new Map(activeCards(cards.value).map((card) => [card.url, card]));
      return {
        today,
        maxReviewsPerDay,
        forecast: forecastOf(schedule, { today, days: FORECAST_DAYS, maxReviewsPerDay }),
        scheduled: states.length,
        intervals: intervalHistogram(due),
        eases: easeHistogram(states),
        lapses,
        leeches: leechesOf(lapses).flatMap(({ cardUrl, lapses }) => {
          const card = live.get(cardUrl);
          return card === undefined ? [] : [{ card, lapses }];
        }),
      };
    },
    async getCardProgress(instanceUrl, at, { deck } = {}) {
      const [prefs, decks] = await Promise.all([
        preferenceStore.get(instanceUrl),
        deck === undefined ? deckRepository.listDecks(instanceUrl) : [deck],
      ]);
      const today = studyDayOf(at, prefs.dayBoundaryHour);
      // The answers of the statistics' twelve study months, by deck: whole
      // months, read beside the decks' cards. Only what is hard needs them,
      // so a log that cannot be read leaves that empty, not the cards' progress.
      const firstMonth = monthOfStudyDay(firstDayOfMonths(today, 12));
      const logged = (async () => {
        await answerStore.flush();
        const byDeck = new Map<string, Answer[]>();
        for (const answer of await answerStore.readMonths(
          instanceUrl,
          await answerLog.months(instanceUrl),
          (month) => month >= firstMonth,
        )) {
          const answers = byDeck.get(answer.deckUrl);
          if (answers === undefined) byDeck.set(answer.deckUrl, [answer]);
          else answers.push(answer);
        }
        return byDeck;
      })().catch(() => new Map<string, Answer[]>());
      const progress = await Promise.all(
        decks.map(async (one) => {
          const [{ cards, reviews, schedule }, byDeck] = await Promise.all([
            scheduleNow(instanceUrl, one, at, prefs),
            logged,
          ]);
          const { maxReviewsPerDay, newCardsPerDay } = deckPreferences(prefs, one);
          const states = scheduledStates(cards.value, one.direction, reviews.value.sm2);
          const due = dueStatesOf(reviews.value, prefs);
          const forecast = forecastOf(schedule, { today, days: FORECAST_DAYS, maxReviewsPerDay });
          const answers = deckAnswers(byDeck.get(one.url) ?? [], one);
          const live = activeCards(cards.value);
          return {
            deck: one,
            progress: cardProgressOf({
              cards: cards.value,
              direction: one.direction,
              reviews: reviews.value.sm2,
              due,
            }),
            forecast,
            intervals: intervalHistogram(scheduledStates(cards.value, one.direction, due)),
            eases: easeHistogram(states),
            overdue: overdueOf(schedule.dueByDay, today),
            daysToClear: daysToClearOf(forecast),
            newCardsPerDay,
            introducedToday: schedule.studyDay === today ? schedule.introducedOnDay : 0,
            hardest: hardestCardsOf(answers, live),
            courseAnswers: answers.filter((answer) => answer.mode === "multiple-choice").length,
            confusions: confusionsOf(answers, live),
          };
        }),
      );
      return { today, decks: progress };
    },
    async cardAnswers(instanceUrl, deck, cardId) {
      return cardAnswers(
        deckAnswers(await answerStore.loadAll(instanceUrl), deck),
        `${deck.cardsDocumentUrl}#${cardId}`,
      );
    },
    async getCourseStatistics(instanceUrl, at, courses) {
      if (courses.length === 0) return [];
      await answerStore.flush();
      const [prefs, logged] = await Promise.all([
        preferenceStore.get(instanceUrl),
        answerLog.months(instanceUrl),
      ]);
      const firstMonth = monthOfStudyDay(
        firstDayOfMonths(studyDayOf(at, prefs.dayBoundaryHour), 12),
      );
      const answers = await answerStore.readMonths(
        instanceUrl,
        logged,
        (month) => month >= firstMonth,
      );
      const results = await Promise.all(
        courses.map(async (deck): Promise<CourseStatistics[]> => {
          if (deck.sourceUrl === undefined)
            throw new Error("A course's deck names the release it was copied from");
          const outline = await deckLibrary.fetchCourseOutline(deck.sourceUrl).catch(() => null);
          if (outline === null) return [];
          return [
            {
              deck,
              ...courseProgressOf(
                outline,
                deck.completedChapters ?? [],
                deckAnswers(answers, deck),
              ),
            },
          ];
        }),
      );
      return results.flat();
    },
    async openTrial(draft, instanceUrl) {
      const problems = trialProblems(draftReleaseModel(draft));
      if (problems.length > 0) return { ok: false, problems };
      const prefs = await preferenceStore.get(instanceUrl);
      return { ok: true, trial: await startTrial(trialSandbox(draft), draft, prefs) };
    },
  };
}
