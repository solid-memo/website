import { profileNameOf, type SolidAccount } from "@solid-memo/domain/account";
import { defaultCatalogDescription, type Catalog } from "@solid-memo/domain/catalog";
import { withAbout, type DeckAbout } from "@solid-memo/domain/deckAbout";
import type { LangTexts } from "@solid-memo/domain/keywords";
import { deckPreferences, withPace, type DeckPace } from "@solid-memo/domain/deckPace";
import { isCopyOf } from "@solid-memo/domain/library";
import { pickLocale, type Locale } from "@solid-memo/domain/locale";
import type { ThemeChoice } from "@solid-memo/domain/theme";
import { planRepair, type Repair, type RepairPlan } from "@solid-memo/domain/repair";
import {
  rebaseIri,
  stagingUrlOf,
  UPDATE_STEP_LABELS,
  type UpdateOutcome,
  type UpdateProgress,
  type UpdateStep,
} from "@solid-memo/domain/instanceUpdate";
import {
  validateCardContent,
  type Card,
  type CardContent,
  type Deck,
  type DeckDirection,
  type Prompt,
  type StudyDirection,
} from "@solid-memo/domain/deck";
import type {
  Instance,
  RegistrationOptions,
  RegistrationTarget,
} from "@solid-memo/domain/instance";
import type { LibraryCard, LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import {
  applyLibraryUpgrade,
  planLibraryUpgrade,
  withReleaseLanguages,
  upgradedCards,
  type LibraryUpgradePlan,
} from "@solid-memo/domain/libraryUpgrade";
import {
  DECK_UPGRADE_STEPS,
  decodeDeckUpgradeNote,
  encodeDeckUpgradeNote,
  isAbandoned,
  sameCardChanges,
  sameCards,
  sameReviewStates,
  stagedDocumentUrl,
  upgradedCardList,
  type DeckUpgradeNote,
  type DeckUpgradeOutcome,
  type DeckUpgradeProgress,
  type DeckUpgradeStep,
  type StepPart,
} from "@solid-memo/domain/deckUpgrade";
import { tidiedStated, type LangText } from "@solid-memo/domain/langText";
import { canonicalTag } from "@solid-memo/domain/languageTag";
import { unlikeRelease, withStatedLanguages, type StatedLanguages } from "@solid-memo/domain/deckLanguages";
import {
  isDeckOutdated,
  isOutdated,
  isPreferencesOutdated,
  isReviewStateOutdated,
  planMigration,
  upgradeCard,
  upgradeDeck,
  upgradeReviewState,
  type MigrationPlan,
} from "@solid-memo/domain/migration";
import type { DeckGroup, DeckTree, DeckTreeEdit } from "@solid-memo/domain/deckTree";
import {
  deckGroupUrlOf,
  digestUrlOf,
  documentsInUse,
  ensureTrailingSlash,
  historyUrlOf,
  instanceDocumentUrls,
  instanceUrlOfDeck,
} from "@solid-memo/domain/instanceLayout";
import { summarize, type DocumentReport, type ValidationReport } from "@solid-memo/domain/validation";
import {
  emptyDigest,
  scheduleOf,
  studyCountsOf,
  withReceipt,
  withSchedule,
  type DocumentReceipt,
  type InstanceDigest,
} from "@solid-memo/domain/studyDigest";
import {
  DEFAULT_PREFERENCES,
  type StoredPreferences,
  type StudyPreferences,
} from "@solid-memo/domain/preferences";
import {
  REVIEW_STATE_FORMAT_VERSION,
  type ReviewQuality,
  type ReviewState,
} from "@solid-memo/domain/review";
import {
  buildStudyQueue,
  nextDueDate,
  resetStudyDay,
  snapshotBeforeReview,
  studyDayOf,
  type StudyQueue,
} from "@solid-memo/domain/scheduling";
import { answerIdOf, type Answer, type AnswerMode } from "@solid-memo/domain/answer";
import {
  courseAnswerEffect,
  courseProgress,
  type CourseAnswerEffect,
  type CourseOutline,
  type CourseProgress,
} from "@solid-memo/domain/course";
import { statisticsOf, type Statistics } from "@solid-memo/domain/statistics";
import type { EstablishedSession, Session } from "@solid-memo/domain/session";
import { applySm2, INITIAL_SM2_STATE } from "@solid-memo/domain/sm2";
import type { Storage } from "@solid-memo/domain/storage";
import { isSecureUrl, validateWebId } from "@solid-memo/domain/webId";
import {
  GUEST_INSTANCE_URL,
  GUEST_ORIGIN,
  GUEST_SESSION,
  GUEST_TRANSFER_STEPS,
  GUEST_WEBID,
  isGuestUrl,
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
  ThemePreference,
  UpdateJournal,
  WriteFence,
  Since,
} from "./ports";
import { AppError } from "@solid-memo/domain/appError";

export interface UseCases {
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
  /** Rejects, without any network request, unless the WebID is an https URL. */
  loginWithWebId(webId: string): Promise<void>;
  /** Log in at a chosen identity provider; rejects unless it is an https URL. */
  loginWithProvider(oidcIssuer: string): Promise<void>;
  logout(): Promise<void>;
  /** Subscribe to session expiry; returns an unsubscribe function. */
  onSessionExpired(listener: () => void): () => void;
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
  /**
   * The account behind a session: its Pod, discovered through the WebID
   * profile's storage link, its identity provider and its foaf:name.
   */
  discoverAccount(session: Session): Promise<SolidAccount>;
  viewWebIdDocument(session: Session): Promise<WebIdDocument>;
  /**
   * Developer tool: every document of the instance checked against
   * Solid Memo's shapes (docs/validation.md). Reads only.
   */
  validateInstance(instanceUrl: string): Promise<ValidationReport>;
  /**
   * The check made when an instance is opened: validateInstance, but a
   * document still at the version the instance's digest says conformed
   * is not checked (nor downloaded) again.
   */
  checkInstance(instanceUrl: string): Promise<ValidationReport>;
  /** What the app can repair of what a check found, and what it leaves to the user. */
  planRepair(report: ValidationReport): RepairPlan;
  /** Apply repairs (the planned ones, or removals the user chose). */
  applyRepairs(repairs: readonly Repair[]): Promise<void>;
  listStorages(session: Session): Promise<Storage[]>;
  addManualStorage(url: string): Promise<Storage>;
  listInstances(session: Session): Promise<Instance[]>;
  getRegistrationOptions(session: Session): Promise<RegistrationOptions>;
  createInstance(
    session: Session,
    args: {
      containerUrl: string;
      name: string;
      registrationTarget: RegistrationTarget;
    },
  ): Promise<Instance>;
  attachInstanceByUrl(
    session: Session,
    instanceUrl: string,
    registrationTarget: RegistrationTarget,
  ): Promise<Instance>;
  /** Permanently delete an instance and all its decks and cards. */
  deleteInstance(session: Session, instance: Instance): Promise<void>;
  listDecks(instanceUrl: string): Promise<Deck[]>;
  /**
   * A new deck by `title`: its name in every language it is given in,
   * each under the language the user stated, the tag lower case (see
   * tidiedStated). The same words in several languages are saved as
   * given: they are the name in each of those languages.
   */
  createDeck(instanceUrl: string, title: LangText): Promise<Deck>;
  /**
   * Rename the deck: `title` is its name in every language it is to have,
   * a language left out or cleared removed, as createDeck.
   */
  renameDeck(deck: Deck, title: LangText): Promise<Deck>;
  /** The instance's decks as the user arranged them into groups (domain/deckTree.ts). */
  listDeckTree(instanceUrl: string): Promise<DeckTree>;
  /**
   * A new group's identity, before anything is written (a `combine` edit
   * writes it): a fresh URL in the instance's catalog document, and its
   * name as entered, tidied as a deck's (see createDeck). Synchronous, so
   * the screen can show the group, and the edit naming it, at once.
   */
  newDeckGroup(instanceUrl: string, title: LangText): DeckGroup;
  /**
   * Make one edit of the arrangement (DeckRepository.editDeckTree); a
   * rename's name is tidied as a deck's. Returns the tree as written.
   */
  editDeckTree(instanceUrl: string, edit: DeckTreeEdit): Promise<DeckTree>;
  /**
   * Change how the deck is studied. Review state is kept: a card's
   * front→back state waits, unused, while the deck is studied back→front.
   */
  setDeckDirection(deck: Deck, direction: DeckDirection): Promise<Deck>;
  /**
   * Replace what a deck says about itself: its description, in every
   * language it is to have, as createDeck's title, topics and keywords,
   * each language's under the language the user stated (see withAbout):
   * a tag that names no language is refused (textLanguageInvalid), as
   * are new untagged keywords (textNeedsLanguage).
   */
  describeDeck(deck: Deck, about: DeckAbout): Promise<Deck>;
  /**
   * Set the deck's own daily limits; a limit left out follows the
   * instance's preferences again.
   */
  setDeckPace(deck: Deck, pace: DeckPace): Promise<Deck>;
  removeDeck(deck: Deck): Promise<void>;
  /** The ready-made decks the app offers for import. */
  listLibraryDecks(): Promise<LibraryDeck[]>;
  /** Copy a library deck, cards included, into an instance as a new deck. */
  importLibraryDeck(instanceUrl: string, deck: LibraryDeck): Promise<Deck>;
  /** A library deck's cards, to look through before importing it. */
  listLibraryCards(deck: LibraryDeck): Promise<LibraryCard[]>;
  /**
   * What upgrading an imported deck to its library deck's current
   * release would do; null for a deck not from the library, or when
   * there is nothing (safe) to offer. Reads the library's index and the
   * two releases, and the copy's cards; writes nothing.
   */
  planLibraryUpgrade(deck: Deck): Promise<LibraryUpgradePlan | null>;
  /**
   * Give an imported deck the languages its own release states its title
   * and description in and the copy lacks, where the copy's English is
   * the release's, and save it; null when that adds nothing (or the deck
   * is not from the library). Nothing the user wrote changes.
   */
  addReleaseLanguages(deck: Deck): Promise<Deck | null>;
  /**
   * The library release an imported deck was copied from, as it is in
   * the library; null for a deck not from the library. The forms leave a
   * text that is still the release's as it is (see sameText). Writes nothing.
   */
  deckRelease(deck: Deck): Promise<LibraryDeckContent | null>;
  /**
   * Apply the upgrade the user agreed to, safely (domain/deckUpgrade.ts):
   * the upgraded cards — and the review states, when cards with some are
   * removed — are written into new documents, read back, and the deck's
   * catalog entry is switched over to them in one conditional write once
   * the originals are found unchanged; the originals are deleted then. A
   * failure before the switch deletes the new documents and leaves the
   * deck as it was. Refuses (deckChangedSinceOffer) when the deck's cards
   * no longer call for the changes the user agreed to.
   */
  applyLibraryUpgrade(
    deck: Deck,
    plan: LibraryUpgradePlan,
    onProgress?: (progress: DeckUpgradeProgress) => void,
  ): Promise<DeckUpgradeOutcome>;
  /**
   * Tidy away what an upgrade of the deck cut off half-way (a closed tab)
   * left behind — the new documents before its switch, the old ones after
   * it — never what the deck uses. Whether there was any to tidy.
   */
  tidyInterruptedDeckUpgrade(deck: Deck): Promise<boolean>;
  listCards(deck: Deck): Promise<Card[]>;
  /**
   * Rejects, without any pod write, unless each side has text or an
   * http(s) image URL, and every text states its language
   * (validateCardContent).
   */
  addCard(deck: Deck, content: CardContent): Promise<Card>;
  /** Same validation as addCard; a side's untagged text may stay as `card` has it, untouched. */
  updateCard(deck: Deck, card: Card, content: CardContent): Promise<Card>;
  removeCard(deck: Deck, card: Card): Promise<void>;
  /**
   * Say which language the deck's untagged ("") fronts, and its untagged
   * backs, are in: each such side's text is kept, under that language.
   * A side that states its language is never touched, nor is a card still
   * as its library release has it (unlikeRelease), which a later release
   * would no longer update once changed. One conditional write of the
   * cards document (changedElsewhere when it changed since it was read);
   * none when nothing is to change. Rejects a tag that is no language
   * code (textLanguageInvalid) before any write. How many cards changed.
   */
  stateCardLanguages(deck: Deck, languages: StatedLanguages): Promise<number>;
  /**
   * What bringing the instance's cards up to this app's format would
   * touch — reads every deck's cards, writes nothing. Empty when there is
   * nothing to migrate.
   */
  planMigration(instanceUrl: string): Promise<MigrationPlan>;
  /**
   * Rewrite every outdated deck entry and card in the instance in the
   * current format, one write per document (cards are re-read first, so
   * an edit made since the plan is never overwritten). Resolves to what
   * was migrated. Only ever run after the user has agreed to the plan.
   */
  /**
   * Bring the instance up to this app's formats without writing it
   * (docs/migrations.md): copy it into a new sibling container, update
   * and validate the copy, check the original did not change meanwhile,
   * then switch the type index registrations over. The original stays as
   * the backup; a failure before the switch deletes the copy.
   */
  updateInstance(
    session: Session,
    instance: Instance,
    onProgress?: (progress: UpdateProgress) => void,
  ): Promise<UpdateOutcome>;
  /** The partial copy an update cut off half-way left behind; null when none. */
  findInterruptedUpdate(instance: Instance): Promise<string | null>;
  /** Delete the partial copy an interrupted update left behind. */
  removeInterruptedUpdate(instance: Instance): Promise<void>;
  /** The instance an update replaced, kept as a backup; null when there is none (any more). */
  readBackup(instance: Instance): Promise<{ url: string; replacedAt?: string } | null>;
  /** Switch back to the backup, then delete the updated instance. Returns the backup. */
  restoreBackup(session: Session, instance: Instance): Promise<Instance>;
  /** Delete the backup, and forget it. */
  deleteBackup(instance: Instance): Promise<void>;
  /** Stored preferences overlaid on the defaults. */
  getPreferences(instanceUrl: string): Promise<StudyPreferences>;
  savePreferences(
    instanceUrl: string,
    preferences: StudyPreferences,
  ): Promise<void>;
  /** Today's due and new cards for a deck, respecting the daily caps. */
  getStudyQueue(
    instanceUrl: string,
    deck: Deck,
    now: Date,
  ): Promise<StudyQueue>;
  /**
   * How many prompts today's queue would hold, as getStudyQueue counts
   * them; from the deck's schedule in the instance's digest when neither
   * of its documents changed since, else from its documents (and the
   * digest is brought up to date).
   */
  getStudyCounts(instanceUrl: string, deck: Deck, now: Date): Promise<{ dueCount: number; newCount: number }>;
  /** Keep the deck's schedule in the digest, as of now: when a study session ends. */
  refreshStudyDigest(instanceUrl: string, deck: Deck): Promise<void>;
  /**
   * Apply one SM-2 review: load the prompt's state (or start fresh),
   * transition it, persist it, and return the new state.
   */
  recordReview(
    instanceUrl: string,
    deck: Deck,
    prompt: Prompt,
    quality: ReviewQuality,
    now: Date,
  ): Promise<ReviewState>;
  /**
   * Undo the current study day for a deck: cards reviewed today go back
   * to how they were before, cards introduced today become new again.
   * Resolves to the number of cards reset.
   */
  resetStudyDay(instanceUrl: string, deck: Deck, now: Date): Promise<number>;
  /**
   * The study statistics of the answers given in the last `months` study
   * months (12 by default), up to now: of every deck, or of one. Answers
   * still waiting to be added to the log are added first.
   */
  getStatistics(instanceUrl: string, now: Date, options?: { months?: number; deckUrl?: string }): Promise<Statistics>;
  /**
   * Start a course (a library deck whose release is a course, see
   * docs/courses.md): the instance's deck of it, a copy of the current
   * release with its title, description, authors and the rest, but no
   * cards — a card joins it when its question is first answered
   * (answerCourseQuestion). The copy the instance already has, of any
   * release (isCopyOf), when it has one: a course is started once.
   */
  startCourse(instanceUrl: string, course: LibraryDeck): Promise<Deck>;
  /**
   * A course as the learner has it: the deck's catalog entry as it is
   * now, the release it was copied from (its outline and cards) and the
   * learner's progress through it. Throws deckGone when the deck is gone;
   * a deck that is no library copy is a mistake of the caller (a plain
   * Error). Writes nothing.
   */
  getCourse(deck: Deck): Promise<Course>;
  /**
   * Answer one of a course's multiple-choice questions (domain/course.ts
   * choicesOf): what the answer does to the card's schedule follows
   * courseAnswerEffect. A card introduced is first written into the deck,
   * as its release has it (distractors and fragment id included), then
   * graded; a review is graded as in study; either way the answer is
   * logged as a multiple-choice one, naming the wrong option chosen. No
   * daily limit applies: the learner reached the card. Writes nothing
   * when the answer is practice ("none").
   */
  answerCourseQuestion(
    instanceUrl: string,
    deck: Deck,
    card: LibraryCard,
    choice: CourseChoice,
    now: Date,
  ): Promise<CourseAnswer>;
  /**
   * Note a chapter of the deck's course completed (its final review
   * passed), unlocking the next (DeckRepository.completeChapter). The
   * deck as its entry says then.
   */
  completeChapter(deck: Deck, chapterUrl: string): Promise<Deck>;
}

/** A course as the learner has it (UseCases.getCourse). */
export interface Course {
  /** The course's deck in the instance, as its catalog entry says now. */
  deck: Deck;
  /** The release the deck was copied from: the course's content. */
  release: LibraryDeckContent;
  /** The release's chapters and steps. */
  outline: CourseOutline;
  /** The release's cards (the questions, with their distractors) by id. */
  cards: Readonly<Record<string, LibraryCard>>;
  /** The cards the learner has answered: those with review state in the deck. */
  answeredCardIds: string[];
  progress: CourseProgress;
}

/** The option a learner chose: right or wrong, and which wrong one (a distractor's id). */
export interface CourseChoice {
  correct: boolean;
  distractorId?: string;
}

/** What answering a course question did (UseCases.answerCourseQuestion). */
export interface CourseAnswer {
  /**
   * "introduce": the card joined the deck ("Added to your deck"), graded;
   * "review": it was graded; "none": nothing was written.
   */
  effect: CourseAnswerEffect["kind"];
  /** The card's review state after the answer; null for a card that has none. */
  state: ReviewState | null;
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
  /** A note of updates in progress; by default none is kept. */
  updateJournal?: UpdateJournal;
  /** The language the user chose; by default none is kept. */
  languagePreference?: LanguagePreference;
  /** The theme the user chose; by default none is kept. */
  themePreference?: ThemePreference;
  /** The clock; injected for tests. */
  now?: () => Date;
  /** Fresh identifiers (the UUID of an update's copy); injected for tests. */
  newId?: () => string;
  /** Keeps the instance an update copies read-only while it runs. */
  writeFence?: WriteFence;
  /** Where each instance's digest is kept; by default none is. */
  digestRepository?: DigestRepository;
  /** Where each instance's answer log is kept; by default none is. */
  answerLog?: AnswerLog;
  /** Names the shapes documents are checked by; a receipt of other rules does not count. */
  ruleset?: string;
  /** The pod a guest studies in on this device; by default there is none. */
  guestPod?: GuestPod;
}

/** A read made without a known version, which always comes with the contents. */
async function readNow<T>(read: Promise<Since<T>>): Promise<{ value: T; version: string | null }> {
  const since = await read;
  if (since.unchanged) throw new Error("A read without a version came back unchanged.");
  return since;
}

const NO_LANGUAGE_PREFERENCE: LanguagePreference = { chosen: () => null, choose: () => undefined };
const NO_THEME_PREFERENCE: ThemePreference = { chosen: () => "system", choose: () => undefined };
const NO_JOURNAL: UpdateJournal = { begin: () => undefined, end: () => undefined, staging: () => null };
const NO_FENCE: WriteFence = { hold: () => () => undefined };
const NO_DIGESTS: DigestRepository = { readDigest: async () => null, updateDigest: async () => undefined };
const nothing = async () => undefined;
const none = async (): Promise<never[]> => [];
const NO_ANSWER_LOG: AnswerLog = { append: nothing, months: none, readMonth: none, removeDay: nothing };
const NO_GUEST_POD: GuestPod = {
  exists: async () => false,
  start: async () => {
    throw new AppError("noGuestPod");
  },
  discard: nothing,
};

/**
 * A deck's name as entered (see tidiedStated). The app requires a name
 * before it saves, so a name with no text left is a mistake in the app:
 * a plain Error.
 */
function deckTitle(title: LangText): LangText {
  const tidied = tidiedStated(title);
  if (Object.keys(tidied).length === 0) throw new Error("A deck needs a name");
  return tidied;
}

/** A deck group's name as entered, tidied as a deck's: the app requires one before it saves. */
function groupTitle(title: LangText): LangText {
  const tidied = tidiedStated(title);
  if (Object.keys(tidied).length === 0) throw new Error("A deck group needs a name");
  return tidied;
}

/**
 * A deck's keywords as entered, under the canonical form of the language
 * tag each language was given ("SV-se" → "sv-se", "iw" → "he"; lists of
 * one language merged); a tag that names no language is refused
 * (textLanguageInvalid). Only the tags the user states in this edit are
 * checked: a tag the deck already has (in any case) is kept as stored,
 * even one the app would not accept from the user ("und", "en-x-…") or
 * would re-tag ("iw"), so data another app wrote is not changed or
 * refused without the user touching it. Untagged keywords ("") are left
 * for withAbout, which keeps them only as the deck has them (see
 * tidiedKeywords).
 */
function deckKeywords(keywords: LangTexts, deck: Deck): LangTexts {
  const stored = new Set(Object.keys(deck.keywords ?? {}).map((tag) => tag.toLowerCase()));
  const canonical: Record<string, string[]> = {};
  for (const [tag, list] of Object.entries(keywords)) {
    const stated = tag === "" || stored.has(tag.toLowerCase()) ? tag : canonicalTag(tag);
    if (stated === null) throw new AppError("textLanguageInvalid", { tag });
    canonical[stated] = [...(canonical[stated] ?? []), ...list];
  }
  return canonical;
}

/**
 * The progress of an update through its `total` steps, reported as it
 * goes: the step it is on, the steps finished and, for a step with more
 * than one unit of work (documents, decks, writes), how far into it.
 */
function stepReporter<Step extends string>(
  first: Step,
  total: number,
  onProgress: (progress: { step: Step; done: number; total: number; part?: StepPart }) => void,
) {
  let step = first;
  let done = 0;
  let part: StepPart | undefined;
  const report = () => onProgress({ step, done, total, ...(part === undefined ? {} : { part: { ...part } }) });
  const enter = (next: Step, parts: number | undefined) => {
    step = next;
    part = parts === undefined ? undefined : { done: 0, total: parts };
    report();
  };
  return {
    step: () => step,
    /** Under way, at the first step, of `parts` units of work when it has more than one. */
    start(parts?: number) {
      enter(first, parts);
    },
    /** The step is finished: on to `next` (the same, after the last), of `parts` units of work. */
    finished(next: Step = step, parts?: number) {
      done += 1;
      enter(next, parts);
    },
    /** `count` of the step's `of` units done; not reported once all are, the step's finish is. */
    partly(count: number, of = part!.total) {
      part = { done: count, total: of };
      if (count < of) report();
    },
    /** One more of the step's units done. */
    stepped() {
      this.partly(part!.done + 1);
    },
  };
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
  languagePreference = NO_LANGUAGE_PREFERENCE,
  themePreference = NO_THEME_PREFERENCE,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  writeFence = NO_FENCE,
  digestRepository = NO_DIGESTS,
  answerLog = NO_ANSWER_LOG,
  ruleset = "",
  guestPod = NO_GUEST_POD,
}: Dependencies): UseCases {
  /**
   * Normalized card content, or a throw naming what is missing; `saved`
   * the card edited, if any, whose untagged sides may stay as they are.
   */
  function validContent(content: CardContent, saved?: CardContent): CardContent {
    const validation = validateCardContent(content, saved);
    if (!validation.ok) {
      throw validation.error;
    }
    return validation.content;
  }

  /**
   * What upgrading the deck to its library deck's current release would
   * do, of its cards as `cards` reads them; null when nothing (safe).
   */
  async function planUpgrade(deck: Deck, cards: () => Promise<Card[]>): Promise<LibraryUpgradePlan | null> {
    if (deck.sourceUrl === undefined) return null;
    const series = (await deckLibrary.listLibraryDecks()).find((libraryDeck) => isCopyOf(deck, libraryDeck));
    if (series === undefined) return null;
    // The index tells a copy of the current release, or of no older one,
    // without reading a release (thousands of cards) or the copy's cards.
    const copied = series.releases.find((release) => release.url === deck.sourceUrl);
    if (series.url === deck.sourceUrl || (copied !== undefined && Number(series.version) <= Number(copied.version))) {
      return null;
    }
    const [from, to, copy] = await Promise.all([
      deckLibrary.fetchLibraryDeck(deck.sourceUrl),
      deckLibrary.fetchLibraryDeck(series.url),
      cards(),
    ]);
    return planLibraryUpgrade({
      deck,
      cards: copy,
      from,
      to,
      releases: series.releases,
      // A course's deck holds only the cards the learner reached: an upgrade adds none.
      course: series.isCourse === true || from.isCourse === true,
    });
  }

  /**
   * Settle an upgrade that is over, or was cut off: the side the deck's
   * catalog entry does not point at is deleted — the new documents
   * before the switch, the old ones after it (all of them when the deck
   * is gone) — and the note is forgotten. Never deletes a document any
   * deck of the catalog uses: another app may have pointed a second deck
   * at the same one.
   */
  async function settleUpgrade(
    deckUrl: string,
    note: DeckUpgradeNote,
    onDeleted: (count: number, of: number) => void = () => undefined,
  ): Promise<{ switched: boolean; deck: Deck | null }> {
    const decks = await deckRepository.listDecks(instanceUrlOfDeck(deckUrl));
    const deck = decks.find((candidate) => candidate.url === deckUrl) ?? null;
    const switched = deck?.cardsDocumentUrl === note.cards.to;
    const moves = [note.cards, ...(note.reviews === undefined ? [] : [note.reviews])];
    const losers =
      deck === null
        ? moves.flatMap((move) => [move.from, move.to])
        : moves.map((move) => (switched ? move.from : move.to));
    const used = documentsInUse(decks);
    const deleting = losers.filter((url) => !used.has(url));
    onDeleted(0, deleting.length);
    for (const [index, url] of deleting.entries()) {
      await deckRepository.deleteDocument(url);
      onDeleted(index + 1, deleting.length);
    }
    updateJournal.end(deckUrl);
    return { switched, deck };
  }

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
    return readStoredPreferences(instanceUrl).then((stored) => stored?.preferences ?? DEFAULT_PREFERENCES);
  }

  /** Each instance's theme writes, one after another, so a later choice is never overwritten by an earlier. */
  const themeWrites = new Map<string, Promise<void>>();


  /**
   * A new catalogue for an instance: published by the session's owner,
   * named as their profile names them (the WebID when it does not say).
   */
  /**
   * Bring an instance's documents up to this app's formats, in place: its
   * meta document (saying what it replaces, for an updated copy), its
   * preferences, every deck's entry, cards and review states, and last
   * its catalogue (written when missing), one write per document. Only ever
   * run on the copy an update makes (see updateInstance).
   */
  async function upgradeInPlace(
    session: Session,
    instanceUrl: string,
    replacing: { replaces: string; replacedAt: string },
    onDone: (count: number, of: number) => void,
  ): Promise<void> {
    const decks = await deckRepository.listDecks(instanceUrl);
    // The documents brought up to date, one by one: meta, preferences, each deck's three, the catalogue.
    const of = 3 + decks.length * 3;
    let count = 0;
    const updated = () => onDone(++count, of);
    onDone(count, of);
    const meta = await instanceRepository.readMeta(instanceUrl);
    if (meta !== null) await instanceRepository.saveMeta(instanceUrl, { ...meta, ...replacing });
    updated();
    const stored = await preferencesRepository.getPreferences(instanceUrl);
    if (stored !== null && isPreferencesOutdated(stored)) {
      await preferencesRepository.savePreferences(instanceUrl, stored.preferences);
    }
    updated();
    for (const deck of decks) {
      if (isDeckOutdated(deck)) await deckRepository.saveDeck(upgradeDeck(deck));
      updated();
      const cards = (await deckRepository.listCards(deck)).filter(isOutdated);
      if (cards.length > 0) await deckRepository.saveCards(deck, cards.map(upgradeCard));
      updated();
      const reviews = (await reviewStateRepository.listReviewStates(deck)).filter(isReviewStateOutdated);
      if (reviews.length > 0) {
        await reviewStateRepository.applyReviewChanges(deck, {
          save: reviews.map(upgradeReviewState),
          remove: [],
        });
      }
      updated();
    }
    // Last: the catalogue lists the decks as DCAT datasets, which they are only once updated.
    if ((await deckRepository.readCatalog(instanceUrl)) === null) {
      await deckRepository.saveCatalog(instanceUrl, await catalogOf(session, meta?.name ?? instanceUrl));
    }
    updated();
  }

  /**
   * Each instance's digest as this page knows it: read once, then kept up
   * to date with what the page learns, which is written back in the
   * background (a failed write only means the next visit learns it again).
   */
  const digests = new Map<string, Promise<InstanceDigest>>();

  function digestOf(instanceUrl: string): Promise<InstanceDigest> {
    let digest = digests.get(instanceUrl);
    if (digest === undefined) {
      digest = digestRepository.readDigest(instanceUrl).then(
        (stored) => stored ?? emptyDigest(),
        () => emptyDigest(),
      );
      digests.set(instanceUrl, digest);
    }
    return digest;
  }

  function remember(instanceUrl: string, change: (digest: InstanceDigest) => InstanceDigest): void {
    void digestOf(instanceUrl).then((digest) => {
      digests.set(instanceUrl, Promise.resolve(change(digest)));
      return digestRepository
        .updateDigest(instanceUrl, (stored) => change(stored ?? emptyDigest()))
        .catch(() => undefined);
    });
  }

  function noting(document: string, version: string, facts: Pick<DocumentReceipt, "conformedTo" | "latestFormat">) {
    return (digest: InstanceDigest) => withReceipt(digest, document, version, facts);
  }

  async function studyCountsAndSchedule(instanceUrl: string, deck: Deck, now: Date) {
    const [prefs, digest] = await Promise.all([getPreferences(instanceUrl), digestOf(instanceUrl)]);
    const studyPrefs = deckPreferences(prefs, deck);
    const kept = digest.schedules[deck.url];
    const [cardsSince, reviewsSince] = await Promise.all([
      deckRepository.readCardsSince(deck, kept?.cardsVersion),
      reviewStateRepository.readReviewStatesSince(deck, kept?.reviewsVersion),
    ]);
    if (kept !== undefined && cardsSince.unchanged && reviewsSince.unchanged) {
      const counts = studyCountsOf(kept.schedule, { direction: deck.direction, prefs: studyPrefs, now });
      if (counts !== null) return counts;
    }
    const [cards, reviews] = await Promise.all([
      cardsSince.unchanged ? deckRepository.readCardsSince(deck, undefined) : cardsSince,
      reviewsSince.unchanged ? reviewStateRepository.readReviewStatesSince(deck, undefined) : reviewsSince,
    ]);
    // A read without a version to compare is never "unchanged".
    if (cards.unchanged || reviews.unchanged) throw new Error("A read without a version to compare came back unchanged.");
    noteSchedule(instanceUrl, deck, cards, reviews, prefs.dayBoundaryHour, now);
    const queue = buildStudyQueue({
      cards: cards.value,
      direction: deck.direction,
      reviews: reviews.value,
      prefs: studyPrefs,
      now,
      random,
    });
    return { dueCount: queue.due.length, newCount: queue.newPrompts.length };
  }

  function noteSchedule(
    instanceUrl: string,
    deck: Deck,
    cards: { value: Card[]; version: string | null },
    reviews: { value: ReviewState[]; version: string | null },
    dayBoundaryHour: number,
    now: Date,
  ): void {
    const { version: cardsVersion } = cards;
    const { version: reviewsVersion } = reviews;
    if (cardsVersion === null || reviewsVersion === null) return;
    const schedule = scheduleOf({
      cards: cards.value,
      direction: deck.direction,
      reviews: reviews.value,
      dayBoundaryHour,
      now,
    });
    remember(instanceUrl, (digest) => {
      let next = withSchedule(digest, { deck: deck.url, cardsVersion, reviewsVersion, schedule });
      if (!cards.value.some(isOutdated)) next = withReceipt(next, deck.cardsDocumentUrl, cardsVersion, { latestFormat: true });
      if (!reviews.value.some(isReviewStateOutdated)) {
        next = withReceipt(next, deck.reviewsDocumentUrl, reviewsVersion, { latestFormat: true });
      }
      return next;
    });
  }

  async function checkInstance(instanceUrl: string): Promise<ValidationReport> {
    const [decks, digest] = await Promise.all([deckRepository.listDecks(instanceUrl), digestOf(instanceUrl)]);
    const documents = await Promise.all(
      instanceDocumentUrls(instanceUrl, decks).map(async (url): Promise<DocumentReport> => {
        const receipt = digest.receipts[url];
        const since = await shapeValidator.validateDocumentSince(
          url,
          receipt?.conformedTo === ruleset ? receipt.version : undefined,
        );
        if (since.unchanged) return { url, status: "checked", subjects: [] };
        if (since.version !== null && summarize(instanceUrl, [since.value]).conforms) {
          remember(instanceUrl, noting(url, since.version, { conformedTo: ruleset }));
        }
        return since.value;
      }),
    );
    return summarize(instanceUrl, documents);
  }

  /** Every document of the instance, its answer log's too: not checked on every visit, being large and growing. */
  async function validateInstance(
    instanceUrl: string,
    onChecked: (count: number, of: number) => void = () => undefined,
  ): Promise<ValidationReport> {
    const [decks, months] = await Promise.all([deckRepository.listDecks(instanceUrl), answerLog.months(instanceUrl)]);
    const urls = [...instanceDocumentUrls(instanceUrl, decks), ...months.map((month) => historyUrlOf(instanceUrl, month))];
    let checked = 0;
    onChecked(checked, urls.length);
    const documents = await Promise.all(
      urls.map(async (url) => {
        const document = await shapeValidator.validateDocument(url);
        onChecked(++checked, urls.length);
        return document;
      }),
    );
    return summarize(instanceUrl, documents);
  }

  /**
   * Answers given but not yet in the log, oldest first. An answer is
   * added after its review is saved, without holding up study; one that
   * fails to be added waits here, and the ones after it with it, until
   * the next answer, the end of the session or the statistics try again.
   */
  const unlogged: { instanceUrl: string; answer: Answer }[] = [];
  let logging: Promise<void> = Promise.resolve();

  function logAnswers(): Promise<void> {
    logging = logging.then(async () => {
      while (unlogged.length > 0) {
        const [next] = unlogged;
        try {
          await answerLog.append(next!.instanceUrl, next!.answer);
        } catch {
          return;
        }
        unlogged.shift();
      }
    });
    return logging;
  }

  /**
   * Apply one grade to a prompt of the deck: transition its state (or the
   * initial one) by SM-2, persist it, and queue its answer for the log,
   * saying how it was given (`how`; a study session says nothing: recall).
   * The instance's preferences and the prompt's current state are read
   * unless `known` brings them.
   */
  async function applyGrade(
    instanceUrl: string,
    deck: Deck,
    prompt: { cardId: string; cardUrl: string; direction: StudyDirection },
    quality: ReviewQuality,
    now: Date,
    how: { mode?: AnswerMode; chosenDistractor?: string } = {},
    known?: { prefs: StudyPreferences; current: ReviewState | null },
  ): Promise<ReviewState> {
    const key = { cardId: prompt.cardId, direction: prompt.direction };
    const [prefs, current] =
      known === undefined
        ? await Promise.all([getPreferences(instanceUrl), reviewStateRepository.getReviewState(deck, key)])
        : [known.prefs, known.current];
    const next = applySm2(current ?? INITIAL_SM2_STATE, quality);
    const previous = snapshotBeforeReview(
      current,
      now,
      prefs.dayBoundaryHour,
    );
    const state: ReviewState = {
      ...key,
      ...next,
      due: nextDueDate(now, next.intervalDays, prefs.dayBoundaryHour),
      firstReviewedAt: current?.firstReviewedAt ?? now.toISOString(),
      lastReviewedAt: now.toISOString(),
      formatVersion: REVIEW_STATE_FORMAT_VERSION,
      ...(previous === undefined ? {} : { previous }),
    };
    await reviewStateRepository.saveReviewState(deck, state);
    unlogged.push({
      instanceUrl,
      answer: {
        id: answerIdOf(state.lastReviewedAt, newId().slice(0, 8)),
        deckUrl: deck.url,
        cardUrl: prompt.cardUrl,
        direction: prompt.direction,
        grade: quality,
        answeredAt: state.lastReviewedAt,
        studyDay: studyDayOf(now, prefs.dayBoundaryHour),
        ...(current === null ? {} : { priorIntervalDays: current.intervalDays }),
        nextIntervalDays: next.intervalDays,
        ...(how.mode === undefined ? {} : { mode: how.mode }),
        ...(how.chosenDistractor === undefined ? {} : { chosenDistractor: how.chosenDistractor }),
      },
    });
    void logAnswers();
    return state;
  }

  /**
   * Copy each resource (below `move.from`) to its place below `move.to`,
   * one by one, the copy's own access control too when `withAccess`; the
   * version each was copied at, by resource.
   */
  async function copyResources(
    resources: readonly string[],
    move: ContainerMove,
    withAccess: boolean,
    onCopied: () => void,
  ): Promise<Map<string, string>> {
    const versions = new Map<string, string>();
    for (const resource of resources) {
      const copy = rebaseIri(resource, move.from, move.to);
      versions.set(resource, await instanceCopier.copyResource(resource, copy, move));
      if (withAccess) await instanceCopier.copyAccessControl(resource, copy, move);
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

  /** Delete a copy that failed half-way, when one was made; whether nothing is left of it. */
  async function removeCopy(source: string, target: string, created: boolean): Promise<boolean> {
    let cleanedUp = !created;
    if (created) {
      cleanedUp = await instanceCopier.deleteRecursively(target).then(
        () => true,
        () => false,
      );
    }
    if (cleanedUp) updateJournal.end(source);
    return cleanedUp;
  }

  /** The guest's instance, and the whole guest pod once it has no instance left. */
  async function removeGuestInstance(instance: Instance): Promise<void> {
    await instanceRepository.deleteInstance({ webId: GUEST_WEBID, instance });
    if ((await instanceRepository.listInstances(GUEST_WEBID)).length === 0) await guestPod.discard();
  }

  async function createInstance(
    session: Session,
    { containerUrl, name, registrationTarget }: { containerUrl: string; name: string; registrationTarget: RegistrationTarget },
  ): Promise<Instance> {
    const instance = await instanceRepository.createInstance({
      webId: session.webId,
      containerUrl: containerUrl.trim(),
      name: name.trim(),
      registrationTarget,
    });
    await deckRepository.saveCatalog(instance.url, await catalogOf(session, instance.name));
    return instance;
  }

  async function catalogOf(session: Session, title: string): Promise<Catalog> {
    const name = await webIdDocumentRepository
      .fetchWebIdDocument(session.webId)
      .then((document) => profileNameOf(document, session.webId))
      .catch(() => undefined);
    return {
      title,
      description: defaultCatalogDescription(title),
      publisher: { webId: session.webId, name: name ?? session.webId },
    };
  }
  return {
    async restoreSession() {
      const established = await sessionGateway.restore();
      if (established !== null) return established;
      return (await guestPod.exists()) ? { session: GUEST_SESSION, origin: "restored" } : null;
    },
    async startGuest(instanceName) {
      await guestPod.start();
      if ((await instanceRepository.listInstances(GUEST_WEBID)).length === 0) {
        await createInstance(GUEST_SESSION, {
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
    async transferGuestStudy(session, guestInstance, { containerUrl, registrationTarget }, onProgress = () => undefined) {
      const source = ensureTrailingSlash(guestInstance.url);
      const target = ensureTrailingSlash(containerUrl.trim());
      if (session.guest === true || !isGuestUrl(source) || isGuestUrl(target)) {
        throw new Error("A guest's study moves from the guest's pod into the pod of a user who logged in.");
      }
      const move = { from: source, to: target, renames: { [GUEST_WEBID]: session.webId } };
      const progress = stepReporter<GuestTransferStep>("stage", GUEST_TRANSFER_STEPS.length, onProgress);
      // The digest is what this device learned of the guest's pod's versions: the user's pod starts its own.
      const digest = digestUrlOf(source);
      const listed = async () => (await instanceCopier.listResources(source)).filter((url) => url !== digest);
      // Answers still on their way to the guest's log go there first, to move with it.
      await logAnswers();
      let created = false;
      let instance: Instance;
      const release = writeFence.hold(source);
      try {
        // Listing the guest's instance, making sure the target is free, creating it.
        progress.start(3);
        const resources = await listed();
        progress.stepped();
        await instanceCopier.ensureAbsent(target);
        progress.stepped();
        updateJournal.begin(source, target);
        await instanceCopier.createContainer(target);
        created = true;
        progress.finished("copy", resources.length);
        const versions = await copyResources(resources, move, false, () => progress.stepped());
        // The catalogue's publisher, named as the user's profile names them; then nothing may name the guest's pod.
        const documents = resources.filter((url) => !url.endsWith("/")).map((url) => rebaseIri(url, source, target));
        progress.finished("adopt", documents.length + 1);
        const catalog = await deckRepository.readCatalog(target);
        if (catalog !== null) {
          await deckRepository.saveCatalog(target, { ...catalog, publisher: (await catalogOf(session, catalog.title)).publisher });
        }
        progress.stepped();
        for (const url of documents) {
          if (await instanceCopier.mentions(url, GUEST_ORIGIN)) throw new AppError("guestUrlsLeft", { url });
          progress.stepped();
        }
        progress.finished("validate");
        const report = await validateInstance(target, (count, of) => progress.partly(count, of));
        if (!report.conforms) {
          throw new AppError("movedCopyInvalid", { count: report.violationCount });
        }
        // Listing the guest's instance again, then each of its resources.
        progress.finished("verify", resources.length + 1);
        await ensureUnchanged(listed, resources, versions, () => progress.stepped());
        progress.finished("register");
        instance = await instanceRepository.attachInstance({ webId: session.webId, instanceUrl: target, registrationTarget });
      } catch (error) {
        const cleanedUp = await removeCopy(source, target, created);
        return {
          ok: false,
          step: progress.step(),
          error,
          cleanedUp,
          ...(cleanedUp ? {} : { leftoverUrl: target }),
        };
      } finally {
        release();
      }
      // The study is the user's now: what follows only tidies.
      progress.finished("tidy");
      updateJournal.end(source);
      const tidied = await (async () => {
        // The catalogue's registration lets other apps find it; the instance works without.
        await instanceRepository.registerCatalog({ webId: session.webId, instanceUrl: target, title: instance.name });
        await removeGuestInstance(guestInstance);
      })().then(
        () => true,
        () => false,
      );
      progress.finished();
      return { ok: true, instance, tidied };
    },
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
      const stored = await readStoredPreferences(instanceUrl);
      if (stored === null) return null;
      themePreference.choose(stored.preferences.theme);
      return stored.preferences.theme;
    },
    chooseTheme(choice, instanceUrl) {
      themePreference.choose(choice);
      if (instanceUrl === null) return Promise.resolve();
      const previous = themeWrites.get(instanceUrl) ?? Promise.resolve();
      const write = previous
        .catch(() => undefined)
        .then(async () => {
          const stored = await preferencesRepository.getPreferences(instanceUrl);
          if (stored === null || stored.preferences.theme === choice) return;
          await preferencesRepository.savePreferences(instanceUrl, { ...stored.preferences, theme: choice });
        });
      themeWrites.set(instanceUrl, write);
      return write;
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
    planRepair(report) {
      return planRepair(report);
    },
    applyRepairs(repairs) {
      return repairRepository.applyRepairs(repairs);
    },
    validateInstance: (instanceUrl) => validateInstance(instanceUrl),
    checkInstance,
    viewWebIdDocument(session) {
      return webIdDocumentRepository.fetchWebIdDocument(session.webId);
    },
    listStorages(session) {
      return storageGateway.discoverStorages(session.webId);
    },
    addManualStorage(url) {
      return storageGateway.probeStorage(url.trim());
    },
    listInstances(session) {
      return instanceRepository.listInstances(session.webId);
    },
    getRegistrationOptions(session) {
      return instanceRepository.getRegistrationOptions(session.webId);
    },
    createInstance,
    attachInstanceByUrl(session, instanceUrl, registrationTarget) {
      return instanceRepository.attachInstance({
        webId: session.webId,
        instanceUrl: instanceUrl.trim(),
        registrationTarget,
      });
    },
    deleteInstance(session, instance) {
      return instanceRepository.deleteInstance({
        webId: session.webId,
        instance,
      });
    },
    listDecks(instanceUrl) {
      return deckRepository.listDecks(instanceUrl);
    },
    async createDeck(instanceUrl, title) {
      return deckRepository.createDeck(instanceUrl, deckTitle(title));
    },
    async renameDeck(deck, title) {
      return deckRepository.renameDeck(deck, deckTitle(title));
    },
    listDeckTree(instanceUrl) {
      return deckRepository.readDeckTree(instanceUrl);
    },
    newDeckGroup(instanceUrl, title) {
      return { url: deckGroupUrlOf(instanceUrl, newId()), title: groupTitle(title) };
    },
    async editDeckTree(instanceUrl, edit) {
      return deckRepository.editDeckTree(
        instanceUrl,
        edit.kind === "rename" ? { ...edit, title: groupTitle(edit.title) } : edit,
      );
    },
    setDeckDirection(deck, direction) {
      return deckRepository.saveDeck({ ...deck, direction });
    },
    async describeDeck(deck, about) {
      return deckRepository.saveDeck(withAbout(deck, { ...about, keywords: deckKeywords(about.keywords, deck) }));
    },
    async setDeckPace(deck, pace) {
      return deckRepository.saveDeck(withPace(deck, pace));
    },
    removeDeck(deck) {
      return deckRepository.removeDeck(deck);
    },
    listLibraryDecks() {
      return deckLibrary.listLibraryDecks();
    },
    async importLibraryDeck(instanceUrl, deck) {
      const content = await deckLibrary.fetchLibraryDeck(deck.url);
      return deckRepository.importDeck(instanceUrl, content);
    },
    async listLibraryCards(deck) {
      return (await deckLibrary.fetchLibraryDeck(deck.url)).cards;
    },
    planLibraryUpgrade(deck) {
      return planUpgrade(deck, () => deckRepository.listCards(deck));
    },
    async deckRelease(deck) {
      return deck.sourceUrl === undefined ? null : deckLibrary.fetchLibraryDeck(deck.sourceUrl);
    },
    async addReleaseLanguages(deck) {
      if (deck.sourceUrl === undefined) return null;
      const updated = withReleaseLanguages(deck, await deckLibrary.fetchLibraryDeck(deck.sourceUrl));
      return updated === null ? null : deckRepository.saveDeck(updated);
    },
    async applyLibraryUpgrade(offered, offeredPlan, onProgress = () => undefined) {
      const uuid = newId();
      const progress = stepReporter<DeckUpgradeStep>("read", DECK_UPGRADE_STEPS.length, onProgress);
      let note: DeckUpgradeNote | null = null;
      // The documents the upgrade replaces are read-only in this tab until
      // it is over: a review or edit made meanwhile would be lost.
      const releases = [writeFence.hold(offered.cardsDocumentUrl)];
      const releaseAll = () => {
        for (const release of releases.splice(0)) release();
      };
      try {
        // The deck, its cards, the releases (to plan again), and its review states when cards go.
        progress.start(3);
        const deck = await deckRepository.readDeck(offered.url);
        if (deck === null) throw new AppError("deckGone", { deck: offered.title });
        if (deck.cardsDocumentUrl !== offered.cardsDocumentUrl) throw new AppError("deckChangedSinceOffer");
        progress.stepped();
        const cards = await readNow(deckRepository.readCardsSince(deck, undefined));
        progress.stepped();
        const plan = await planUpgrade(deck, async () => cards.value);
        if (plan === null || !sameCardChanges(plan, offeredPlan)) throw new AppError("deckChangedSinceOffer");
        const removed = new Set(plan.remove.map((card) => card.id));
        progress.partly(3, removed.size === 0 ? 3 : 4);
        // The review states move only when some are dropped; else the deck keeps its reviews document.
        const reviews =
          removed.size === 0 ? null : await readNow(reviewStateRepository.readReviewStatesSince(deck, undefined));
        const movesReviews = reviews !== null && reviews.value.some((state) => removed.has(state.cardId));
        if (movesReviews) releases.push(writeFence.hold(deck.reviewsDocumentUrl));
        note = {
          startedAt: now().toISOString(),
          cards: { from: deck.cardsDocumentUrl, to: stagedDocumentUrl(deck.cardsDocumentUrl, deck.id, uuid) },
          ...(movesReviews
            ? { reviews: { from: deck.reviewsDocumentUrl, to: stagedDocumentUrl(deck.reviewsDocumentUrl, deck.id, uuid) } }
            : {}),
        };
        const staged: Deck = {
          ...applyLibraryUpgrade(deck, plan),
          cardsDocumentUrl: note.cards.to,
          reviewsDocumentUrl: note.reviews?.to ?? deck.reviewsDocumentUrl,
        };

        // Each new document, and who may access it.
        progress.finished("write", note.reviews === undefined ? 2 : 4);
        updateJournal.begin(deck.url, encodeDeckUpgradeNote(note));
        await deckRepository.stageCardChanges(deck, note.cards.to, {
          save: upgradedCards(plan),
          remove: [...removed],
        });
        progress.stepped();
        // A document shared on its own (its own access control) stays shared as it was.
        await instanceCopier.copyAccessControl(note.cards.from, note.cards.to, note.cards);
        progress.stepped();
        const keptStates = (reviews?.value ?? []).filter((state) => !removed.has(state.cardId));
        if (note.reviews !== undefined) {
          await reviewStateRepository.stageReviewChanges(
            deck,
            note.reviews.to,
            reviews!.value.filter((state) => removed.has(state.cardId)),
          );
          progress.stepped();
          await instanceCopier.copyAccessControl(note.reviews.from, note.reviews.to, note.reviews);
        }

        // Each new document, read back.
        progress.finished("check", note.reviews === undefined ? undefined : 2);
        const written = await readNow(deckRepository.readCardsSince(staged, undefined));
        if (!sameCards(upgradedCardList(cards.value, plan), written.value)) {
          throw new AppError("upgradedCardsDiffer", { url: note.cards.to });
        }
        if (note.reviews !== undefined) {
          progress.stepped();
          const writtenStates = await readNow(reviewStateRepository.readReviewStatesSince(staged, undefined));
          if (!sameReviewStates(keptStates, writtenStates.value)) {
            throw new AppError("upgradedReviewsDiffer", { url: note.reviews.to });
          }
        }

        // Each original, read again.
        progress.finished("verify", note.reviews === undefined ? undefined : 2);
        const cardsNow = await deckRepository.readCardsSince(deck, cards.version ?? undefined);
        if (!cardsNow.unchanged && !sameCards(cards.value, cardsNow.value)) {
          throw new AppError("deckChangedDuringUpgrade", { url: deck.cardsDocumentUrl });
        }
        if (note.reviews !== undefined) {
          progress.stepped();
          const reviewsNow = await reviewStateRepository.readReviewStatesSince(deck, reviews!.version ?? undefined);
          if (!reviewsNow.unchanged && !sameReviewStates(reviews!.value, reviewsNow.value)) {
            throw new AppError("deckChangedDuringUpgrade", { url: deck.reviewsDocumentUrl });
          }
        }

        progress.finished("switch");
        const switched = await deckRepository.switchDeck(deck, staged);
        // The old documents are no longer the deck's: what is left is to delete them.
        releaseAll();

        progress.finished("tidy");
        const tidied = await settleUpgrade(deck.url, note, (count, of) => progress.partly(count, of)).then(
          () => true,
          () => false,
        );
        progress.finished();
        return { ok: true, deck: switched, tidied };
      } catch (error) {
        releaseAll();
        const step = progress.step();
        if (note === null) return { ok: false, step, error, cleanedUp: true };
        // A switch whose answer was lost may have happened: the deck says which side won.
        const settled = await settleUpgrade(offered.url, note).catch(() => null);
        if (settled?.switched === true) return { ok: true, deck: settled.deck!, tidied: true };
        return { ok: false, step, error, cleanedUp: settled !== null };
      } finally {
        releaseAll();
      }
    },
    async tidyInterruptedDeckUpgrade(deck) {
      const note = decodeDeckUpgradeNote(updateJournal.staging(deck.url));
      if (note === null || !isAbandoned(note, now())) return false;
      await settleUpgrade(deck.url, note);
      return true;
    },
    listCards(deck) {
      return deckRepository.listCards(deck);
    },
    async addCard(deck, content) {
      return deckRepository.addCard(deck, validContent(content));
    },
    async updateCard(deck, card, content) {
      return deckRepository.updateCard(deck, card, validContent(content, card));
    },
    removeCard(deck, card) {
      return deckRepository.removeCard(deck, card);
    },
    async stateCardLanguages(deck, languages) {
      const stated: StatedLanguages = {};
      for (const side of ["front", "back"] as const) {
        const tag = languages[side];
        if (tag === undefined) continue;
        const canonical = canonicalTag(tag);
        if (canonical === null) throw new AppError("textLanguageInvalid", { tag });
        stated[side] = canonical;
      }
      if (Object.keys(stated).length === 0) return 0;
      const [cards, release] = await Promise.all([
        deckRepository.listCards(deck),
        deck.sourceUrl === undefined ? null : deckLibrary.fetchLibraryDeck(deck.sourceUrl),
      ]);
      const ids = unlikeRelease(cards, release?.cards)
        .filter((card) => withStatedLanguages(card, stated) !== null)
        .map((card) => card.id);
      return ids.length === 0 ? 0 : deckRepository.stateCardLanguages(deck, ids, stated);
    },
    async planMigration(instanceUrl) {
      const [instance, preferences, catalog, decks, digest] = await Promise.all([
        instanceRepository.readMeta(instanceUrl),
        preferencesRepository.getPreferences(instanceUrl),
        deckRepository.readCatalog(instanceUrl),
        deckRepository.listDecks(instanceUrl),
        digestOf(instanceUrl),
      ]);
      // A document still at a version with nothing outdated in it is not read again. Reads
      // only: the digest's format notes are written by the deck list (getStudyCounts).
      const latestVersion = (url: string) => {
        const receipt = digest.receipts[url];
        return receipt?.latestFormat === true ? receipt.version : undefined;
      };
      const entries = await Promise.all(
        decks.map(async (deck) => {
          const [cards, reviews] = await Promise.all([
            deckRepository.readCardsSince(deck, latestVersion(deck.cardsDocumentUrl)),
            reviewStateRepository.readReviewStatesSince(deck, latestVersion(deck.reviewsDocumentUrl)),
          ]);
          return {
            deck,
            cards: cards.unchanged ? [] : cards.value,
            reviews: reviews.unchanged ? [] : reviews.value,
          };
        }),
      );
      return planMigration({ instance, preferences, catalog, entries });
    },
    async updateInstance(session, instance, onProgress = () => undefined) {
      const source = ensureTrailingSlash(instance.url);
      const target = stagingUrlOf(source, newId());
      const move = { from: source, to: target };
      const progress = stepReporter<UpdateStep>("stage", Object.keys(UPDATE_STEP_LABELS).length, onProgress);
      const partly = (count: number, of: number) => progress.partly(count, of);
      let created = false;
      // The original is read-only from here until the update is over: a
      // write aimed at it by mistake fails instead of changing it.
      const release = writeFence.hold(source);
      try {
        // Listing the original, making sure the copy's container is free, creating it.
        progress.start(3);
        const resources = await instanceCopier.listResources(source);
        progress.stepped();
        await instanceCopier.ensureAbsent(target);
        progress.stepped();
        updateJournal.begin(source, target);
        await instanceCopier.createContainer(target);
        created = true;
        progress.finished("access");
        await instanceCopier.copyAccessControl(source, target, move);
        progress.finished("copy", resources.length);
        const versions = await copyResources(resources, move, true, () => progress.stepped());
        progress.finished("upgrade");
        await upgradeInPlace(session, target, { replaces: source, replacedAt: now().toISOString() }, partly);
        progress.finished("validate");
        const report = await validateInstance(target, partly);
        if (!report.conforms) {
          throw new AppError("updatedCopyInvalid", { count: report.violationCount });
        }
        // Listing the original again, then each of its documents.
        progress.finished("verify", resources.length + 1);
        await ensureUnchanged(() => instanceCopier.listResources(source), resources, versions, () => progress.stepped());
        progress.finished("switch");
        await instanceRepository.switchInstance({ webId: session.webId, from: source, to: target, title: instance.name });
        progress.finished();
        updateJournal.end(source);
        return { ok: true, instanceUrl: target, backupUrl: source };
      } catch (error) {
        const cleanedUp = await removeCopy(source, target, created);
        return {
          ok: false,
          step: progress.step(),
          error,
          cleanedUp,
          ...(cleanedUp ? {} : { leftoverUrl: target }),
        };
      } finally {
        release();
      }
    },
    async findInterruptedUpdate(instance) {
      const staging = updateJournal.staging(ensureTrailingSlash(instance.url));
      if (staging === null) return null;
      const gone = await instanceCopier.ensureAbsent(staging).then(
        () => true,
        () => false,
      );
      if (gone) updateJournal.end(ensureTrailingSlash(instance.url));
      return gone ? null : staging;
    },
    async removeInterruptedUpdate(instance) {
      const source = ensureTrailingSlash(instance.url);
      const staging = updateJournal.staging(source);
      if (staging !== null) await instanceCopier.deleteRecursively(staging);
      updateJournal.end(source);
    },
    async readBackup(instance) {
      const meta = await instanceRepository.readMeta(instance.url);
      if (meta?.replaces === undefined) return null;
      const gone = await instanceCopier.ensureAbsent(meta.replaces).then(
        () => true,
        () => false,
      );
      if (gone) {
        const { replaces: _replaces, replacedAt: _replacedAt, ...rest } = meta;
        await instanceRepository.saveMeta(instance.url, rest);
        return null;
      }
      return { url: meta.replaces, ...(meta.replacedAt === undefined ? {} : { replacedAt: meta.replacedAt }) };
    },
    async restoreBackup(session, instance) {
      const meta = await instanceRepository.readMeta(instance.url);
      if (meta?.replaces === undefined) throw new AppError("noBackup", { instance: instance.name });
      await instanceRepository.switchInstance({
        webId: session.webId,
        from: instance.url,
        to: meta.replaces,
        title: instance.name,
      });
      await instanceCopier.deleteRecursively(instance.url);
      return { url: meta.replaces, name: instance.name };
    },
    async deleteBackup(instance) {
      const meta = await instanceRepository.readMeta(instance.url);
      if (meta?.replaces === undefined) return;
      await instanceCopier.deleteRecursively(meta.replaces);
      const { replaces: _replaces, replacedAt: _replacedAt, ...rest } = meta;
      await instanceRepository.saveMeta(instance.url, rest);
    },
    getPreferences,
    savePreferences(instanceUrl, preferences) {
      themePreference.choose(preferences.theme);
      return preferencesRepository.savePreferences(instanceUrl, preferences);
    },
    async getStudyQueue(instanceUrl, deck, now) {
      const [cards, reviews, prefs] = await Promise.all([
        deckRepository.listCards(deck),
        reviewStateRepository.listReviewStates(deck),
        getPreferences(instanceUrl),
      ]);
      return buildStudyQueue({
        cards,
        direction: deck.direction,
        reviews,
        prefs: deckPreferences(prefs, deck),
        now,
        random,
      });
    },
    getStudyCounts(instanceUrl, deck, now) {
      return studyCountsAndSchedule(instanceUrl, deck, now);
    },
    async refreshStudyDigest(instanceUrl, deck) {
      await logAnswers();
      const [prefs, cards, reviews] = await Promise.all([
        getPreferences(instanceUrl),
        deckRepository.readCardsSince(deck, undefined),
        reviewStateRepository.readReviewStatesSince(deck, undefined),
      ]);
      if (cards.unchanged || reviews.unchanged) return;
      noteSchedule(instanceUrl, deck, cards, reviews, prefs.dayBoundaryHour, now());
      // The session changed the reviews document: check it now (it is small), not at the next visit.
      const checked = await shapeValidator.validateDocumentSince(deck.reviewsDocumentUrl, undefined);
      if (!checked.unchanged && checked.version !== null && summarize(instanceUrl, [checked.value]).conforms) {
        remember(instanceUrl, noting(deck.reviewsDocumentUrl, checked.version, { conformedTo: ruleset }));
      }
    },
    recordReview(instanceUrl, deck, prompt, quality, now) {
      return applyGrade(
        instanceUrl,
        deck,
        { cardId: prompt.card.id, cardUrl: prompt.card.url, direction: prompt.direction },
        quality,
        now,
      );
    },
    async resetStudyDay(instanceUrl, deck, now) {
      const [prefs, reviews] = await Promise.all([
        getPreferences(instanceUrl),
        reviewStateRepository.listReviewStates(deck),
      ]);
      const reset = resetStudyDay(reviews, now, prefs.dayBoundaryHour);
      const count = reset.restore.length + reset.remove.length;
      if (count > 0) {
        await reviewStateRepository.applyReviewChanges(deck, {
          save: reset.restore,
          remove: reset.remove,
        });
        // The day never happened: its answers leave the log too, those still on their way first.
        await logAnswers();
        await answerLog.removeDay(instanceUrl, deck.url, studyDayOf(now, prefs.dayBoundaryHour));
      }
      return count;
    },
    async getStatistics(instanceUrl, at, { months = 12, deckUrl } = {}) {
      await logAnswers();
      const [prefs, logged] = await Promise.all([getPreferences(instanceUrl), answerLog.months(instanceUrl)]);
      const today = studyDayOf(at, prefs.dayBoundaryHour);
      // The first of the months asked for: this one and the `months - 1` before it.
      const [year, month] = today.split("-").map(Number);
      const first = new Date(Date.UTC(year!, month! - months, 1)).toISOString().slice(0, 7);
      const read = await Promise.all(
        logged.filter((logMonth) => logMonth >= first).map((logMonth) => answerLog.readMonth(instanceUrl, logMonth)),
      );
      const answers = read.flat().filter((answer) => deckUrl === undefined || answer.deckUrl === deckUrl);
      return statisticsOf(answers, today);
    },
    async startCourse(instanceUrl, course) {
      const started = (await deckRepository.listDecks(instanceUrl)).find((deck) => isCopyOf(deck, course));
      if (started !== undefined) return started;
      const release = await deckLibrary.fetchLibraryDeck(course.url);
      return deckRepository.importDeck(instanceUrl, { ...release, cards: [] });
    },
    async getCourse(offered) {
      const deck = await deckRepository.readDeck(offered.url);
      if (deck === null) throw new AppError("deckGone", { deck: offered.title });
      if (deck.sourceUrl === undefined) throw new Error("A course's deck names the release it was copied from");
      const [release, outline, reviews] = await Promise.all([
        deckLibrary.fetchLibraryDeck(deck.sourceUrl),
        deckLibrary.fetchCourseOutline(deck.sourceUrl),
        reviewStateRepository.listReviewStates(deck),
      ]);
      // A course asks front to back: a card is answered once it has that state.
      const answeredCardIds = reviews.filter((state) => state.direction === "front-to-back").map((state) => state.cardId);
      return {
        deck,
        release,
        outline,
        cards: Object.fromEntries(release.cards.map((card) => [card.id, card])),
        answeredCardIds,
        progress: courseProgress(outline, answeredCardIds, deck.completedChapters ?? []),
      };
    },
    async answerCourseQuestion(instanceUrl, deck, card, choice, now) {
      const prompt = { cardId: card.id, cardUrl: `${deck.cardsDocumentUrl}#${card.id}`, direction: "front-to-back" as const };
      const [prefs, current] = await Promise.all([
        getPreferences(instanceUrl),
        reviewStateRepository.getReviewState(deck, { cardId: card.id, direction: prompt.direction }),
      ]);
      const effect = courseAnswerEffect(current, choice.correct, now, prefs.dayBoundaryHour);
      if (effect.kind === "none") return { effect: "none", state: current };
      // The card joins the deck before its first state, so no state is ever without its card.
      if (effect.kind === "introduce") await deckRepository.applyCardChanges(deck, { save: [card], remove: [] });
      const chosen = choice.correct || choice.distractorId === undefined ? undefined : `${deck.cardsDocumentUrl}#${choice.distractorId}`;
      const state = await applyGrade(
        instanceUrl,
        deck,
        prompt,
        effect.grade,
        now,
        { mode: "multiple-choice", ...(chosen === undefined ? {} : { chosenDistractor: chosen }) },
        { prefs, current },
      );
      return { effect: effect.kind, state };
    },
    completeChapter(deck, chapterUrl) {
      return deckRepository.completeChapter(deck, chapterUrl);
    },
  };
}
