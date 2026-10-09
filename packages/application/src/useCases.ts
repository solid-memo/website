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
  UPDATE_STEPS,
  type UpdateOutcome,
  type UpdateProgress,
  type UpdateStep,
} from "@solid-memo/domain/instanceUpdate";
import {
  backupFolderOf,
  backupsContainerOf,
  restoreActionOf,
  withVersionUpdated,
  type Backup,
  type BackupRestore,
} from "@solid-memo/domain/backup";
import {
  DECK_FORMAT_VERSION,
  validateCardContent,
  type Card,
  type CardContent,
  type Deck,
  type DeckDirection,
  type Prompt,
  type StudyDirection,
} from "@solid-memo/domain/deck";
import type {
  DataClassRegistrations,
  Instance,
  InstanceDeletion,
  InstanceMeta,
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
  isAbandoned,
  sameCardChanges,
  sameCards,
  sameReviewStates,
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
  isInstanceOutdated,
  isOutdated,
  isPreferencesOutdated,
  isReviewStateOutdated,
  planMigration,
  upgradeCard,
  upgradeReviewState,
  type MigrationPlan,
} from "@solid-memo/domain/migration";
import type { DeckGroup, DeckTree, DeckTreeEdit } from "@solid-memo/domain/deckTree";
import {
  catalogUrlOf,
  deckGroupUrlOf,
  digestUrlOf,
  documentsInUse,
  ensureTrailingSlash,
  historyUrlOf,
  instanceDocumentUrls,
  instanceUrlOfDeck,
  metaUrlOf,
  preferencesUrlOf,
} from "@solid-memo/domain/instanceLayout";
import { failingSubjectUrls, summarize, type DocumentReport, type ValidationReport } from "@solid-memo/domain/validation";
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
  DocumentBackups,
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
  /**
   * What adding the guest's study to `target`, an instance the user has,
   * would add (domain/guest.ts GuestMergePlan): the guest's decks, each
   * with the target's decks from the same library release. Reads only.
   */
  planGuestMerge(guestInstance: Instance, target: Instance): Promise<GuestMergePlan>;
  /**
   * Keep a guest's study in an instance the user has (docs/guest-mode.md
   * "Adding to an instance"): the guest's study is read and checked, then
   * each of its decks (but those in `skip`, by URL) is added to `target`
   * as a new deck — its cards and review states, then its catalog entry,
   * then its answers — the guest's deck groups made around them, and,
   * once the guest's study is found unchanged since it was read, it is
   * deleted from the device. The target's preferences stay; the guest's
   * are not carried over. A failure leaves every deck added whole, and
   * the guest's study as it was; run again, a deck already added from
   * this device, and unchanged since, is not added twice.
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
  /**
   * Permanently delete an instance: all its decks and cards, and every
   * other document Solid Memo wrote there, then its registrations. Its
   * folder goes too unless it holds what another app put there, which is
   * kept, and the result says so.
   */
  deleteInstance(session: Session, instance: Instance): Promise<InstanceDeletion>;
  /**
   * The registrations of the instance's data, one per class, that belong
   * in the user's type indexes, and whether each is there
   * (docs/data-model.md "Discovery chain"): what lets other apps find
   * each kind of it. Reads only.
   */
  dataClassRegistrations(session: Session, instance: Instance): Promise<DataClassRegistrations>;
  /**
   * Add the registrations dataClassRegistrations finds missing, titled
   * with the instance's name. Only on the user's say (or with a new
   * instance, a format update, a guest's study kept as a new instance;
   * adding one to an instance registers nothing): never on opening an
   * instance, where it would add back what the user, or another app,
   * removed.
   */
  registerDataClasses(session: Session, instance: Instance): Promise<void>;
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
   * the deck's cards document — and its reviews document, when cards with
   * review states are removed — is backed up, found unchanged since it
   * was read, written in place (only while still as backed up) and read
   * back; then the deck's catalog entry is moved to the new release in
   * one conditional write, and the backup deleted. A failure after a
   * write puts back each document still as the upgrade left it. Refuses
   * (deckChangedSinceOffer) when the deck's cards no longer call for the
   * changes the user agreed to.
   */
  applyLibraryUpgrade(
    deck: Deck,
    plan: LibraryUpgradePlan,
    onProgress?: (progress: DeckUpgradeProgress) => void,
  ): Promise<DeckUpgradeOutcome>;
  /**
   * Tidy away what an upgrade of the deck by an earlier version of the
   * app, cut off half-way (a closed tab), left behind — its new documents
   * before it switched the deck's entry over, the old ones after — never
   * what the deck uses. Whether there was any to tidy.
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
   * Bring the instance up to this app's formats in place
   * (docs/migrations.md): back up every document it will change, then
   * write each, one write per document, only while it is still as backed
   * up, then check the instance. Every document keeps its address. Only
   * ever run after the user has agreed to the plan; it reads afresh what
   * to change. A document changed meanwhile stops it, and what it updated
   * stays updated; run again, it updates what is still outdated. Once
   * the update succeeded, the registrations of the instance's data that
   * are missing are added (registerDataClasses); a failure there leaves
   * the update done.
   */
  updateInstance(
    session: Session,
    instance: Instance,
    onProgress?: (progress: UpdateProgress) => void,
  ): Promise<UpdateOutcome>;
  /**
   * What an update cut off half-way (a closed tab) left behind, as this
   * browser noted it: its backup, made whole (`backedUp`, kept with the
   * instance's other backups), or a partial one to remove (not
   * `backedUp`); null when none.
   */
  findInterruptedUpdate(instance: Instance): Promise<{ folder: string; backedUp: boolean } | null>;
  /** Delete the partial backup an interrupted update left behind (never a whole one), and forget the update. */
  removeInterruptedUpdate(instance: Instance): Promise<void>;
  /** The backups the instance's updates made, newest first. */
  listBackups(instance: Instance): Promise<Backup[]>;
  /**
   * Put back each document of the backup still as its update left it
   * (deleting one the update created), keeping every one changed since;
   * the backup is deleted after, unless it kept one. Throws noBackup when
   * the backup is gone.
   */
  restoreBackup(instance: Instance, backup: Backup): Promise<BackupRestore>;
  /** Delete the backup (its folder kept when it holds what another app put there). */
  deleteBackup(backup: Backup): Promise<InstanceDeletion>;
  /**
   * The copy of the whole instance an update by an earlier version of the
   * app left as its backup, at another address; null when there is none
   * (any more).
   */
  readLegacyBackup(instance: Instance): Promise<{ url: string; replacedAt?: string } | null>;
  /**
   * Switch back to the earlier version's backup, then delete the updated
   * instance's data (its folder kept when it holds what another app put
   * there). Returns the backup, and what the deletion kept.
   */
  restoreLegacyBackup(session: Session, instance: Instance): Promise<{ instance: Instance } & InstanceDeletion>;
  /**
   * Delete the earlier version's backup's data (its folder kept when it
   * holds what another app put there), and forget it.
   */
  deleteLegacyBackup(instance: Instance): Promise<InstanceDeletion>;
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
  /** The backups the format update and the library upgrade make of what they change. */
  documentBackups: DocumentBackups;
  /** A note of updates in progress; by default none is kept. */
  updateJournal?: UpdateJournal;
  /** The language the user chose; by default none is kept. */
  languagePreference?: LanguagePreference;
  /** The theme the user chose; by default none is kept. */
  themePreference?: ThemePreference;
  /** The clock; injected for tests. */
  now?: () => Date;
  /** Fresh identifiers (a backup's folder, a deck group); injected for tests. */
  newId?: () => string;
  /** Keeps what an update changes read-only to anything else in the tab while it runs. */
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
const NO_FENCE: WriteFence = { hold: () => () => undefined, pass: () => () => undefined };
const NO_DIGESTS: DigestRepository = { readDigest: async () => null, updateDigest: async () => undefined };
const nothing = async () => undefined;
const none = async (): Promise<never[]> => [];
const NO_ANSWER_LOG: AnswerLog = { append: nothing, appendAll: nothing, months: none, readMonth: none, removeDay: nothing };
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
  documentBackups,
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
   * The documents the format update brings up to this app's formats, as
   * the instance is now, in the order it writes them: its meta document,
   * its preferences, each deck's cards and review states, and last its
   * catalogue (written when missing), which lists the decks as DCAT
   * datasets, which outdated entries are not. A document listed twice (two
   * decks sharing one) is one item, whose writes follow each other. Each
   * write reads the document afresh and writes it in place (unknown
   * triples survive),
   * each subject from the model the chain brought up to date, so content
   * does not change, only its version; whether it wrote anything (a
   * document brought up to date meanwhile is not written).
   */
  async function updateWork(session: Session, instanceUrl: string): Promise<{ document: string; write: () => Promise<boolean> }[]> {
    const [meta, stored, catalog, decks] = await Promise.all([
      instanceRepository.readMeta(instanceUrl),
      preferencesRepository.getPreferences(instanceUrl),
      deckRepository.readCatalog(instanceUrl),
      deckRepository.listDecks(instanceUrl),
    ]);
    const work: { document: string; write: () => Promise<boolean> }[] = [];
    const add = (document: string, write: () => Promise<boolean>) => {
      const item = work.find((candidate) => candidate.document === document);
      if (item === undefined) {
        work.push({ document, write });
        return;
      }
      // Another app may point two decks at one document: it is backed up once, and each deck's part
      // written in turn, the first write held to the version backed up, the next to what it read.
      const first = item.write;
      item.write = async () => {
        const wrote = await first();
        return (await write()) || wrote;
      };
    };
    if (meta !== null && isInstanceOutdated(meta)) {
      add(metaUrlOf(instanceUrl), async () => {
        const now = await instanceRepository.readMeta(instanceUrl);
        if (now === null || !isInstanceOutdated(now)) return false;
        await instanceRepository.saveMeta(instanceUrl, now);
        return true;
      });
    }
    if (stored !== null && isPreferencesOutdated(stored)) {
      add(preferencesUrlOf(instanceUrl), async () => {
        const now = await preferencesRepository.getPreferences(instanceUrl);
        if (now === null || !isPreferencesOutdated(now)) return false;
        await preferencesRepository.savePreferences(instanceUrl, now.preferences);
        return true;
      });
    }
    for (const deck of decks) {
      const [cards, reviews] = await Promise.all([
        deckRepository.listCards(deck),
        reviewStateRepository.listReviewStates(deck),
      ]);
      if (cards.some(isOutdated)) {
        add(deck.cardsDocumentUrl, async () => {
          const outdated = (await deckRepository.listCards(deck)).filter(isOutdated);
          if (outdated.length === 0) return false;
          await deckRepository.saveCards(deck, outdated.map(upgradeCard));
          return true;
        });
      }
      if (reviews.some(isReviewStateOutdated)) {
        add(deck.reviewsDocumentUrl, async () => {
          const outdated = (await reviewStateRepository.listReviewStates(deck)).filter(isReviewStateOutdated);
          if (outdated.length === 0) return false;
          await reviewStateRepository.applyReviewChanges(deck, { save: outdated.map(upgradeReviewState), remove: [] });
          return true;
        });
      }
    }
    if (catalog === null || decks.some(isDeckOutdated)) {
      add(catalogUrlOf(instanceUrl), async () => {
        const [catalogNow, decksNow] = await Promise.all([
          deckRepository.readCatalog(instanceUrl),
          deckRepository.listDecks(instanceUrl),
        ]);
        return deckRepository.saveDecks(
          instanceUrl,
          decksNow.filter(isDeckOutdated),
          catalogNow === null ? await catalogOf(session, meta?.name ?? instanceUrl) : null,
        );
      });
    }
    return work;
  }

  /**
   * Put back each document of the backup still as its update left it,
   * last written first, and keep every one changed since (one that
   * changes between the check and the write is kept too: the write is
   * conditional).
   */
  async function putBack(backup: Backup): Promise<{ restored: string[]; kept: string[] }> {
    const restored: string[] = [];
    const kept: string[] = [];
    for (const entry of [...backup.entries].reverse()) {
      const current = await documentBackups.versionOf(entry.document);
      const action = restoreActionOf(entry, current);
      if (action === "asItWas") continue;
      if (action === "keep") {
        kept.push(entry.document);
        continue;
      }
      try {
        await documentBackups.putBack(entry, current as string);
        restored.push(entry.document);
      } catch (error) {
        if (!(error instanceof AppError && error.code === "changedElsewhere")) throw error;
        kept.push(entry.document);
      }
    }
    return { restored, kept };
  }

  /**
   * Refuse to restore a backup that is not one of the instance's own as an
   * update made it — its folder in the instance's backups/, every copy in
   * that folder, every document in the instance (not its backups) or one
   * the catalog names for a deck, made for the instance or (naming the
   * release it was at) for one of its decks — as anyone who may write in the instance could leave a manifest
   * naming any document (backupNotOurs). And a deck's backup holds an
   * older release's cards: it is restored only while the deck's entry
   * still names that release (deckBackupOutdated).
   */
  async function ensureRestorable(instance: Instance, backup: Backup): Promise<void> {
    const instanceUrl = ensureTrailingSlash(instance.url);
    const backups = backupsContainerOf(instanceUrl);
    const decks = await deckRepository.listDecks(instanceUrl);
    const deckDocuments = new Set(decks.flatMap((deck) => [deck.cardsDocumentUrl, deck.reviewsDocumentUrl]));
    const inside = (url: string, folder: string) => url.startsWith(folder) && url !== folder;
    const ours =
      inside(backup.url, backups) &&
      (backup.of === instanceUrl || backup.release !== undefined) &&
      backup.entries.every(
        ({ document, copy }) =>
          (copy === undefined || inside(copy, backup.url)) &&
          ((inside(document, instanceUrl) && !document.startsWith(backups)) || deckDocuments.has(document)),
      );
    if (!ours) throw new AppError("backupNotOurs", { instance: instance.name });
    if (backup.release !== undefined && decks.find((deck) => deck.url === backup.of)?.sourceUrl !== backup.release) {
      throw new AppError("deckBackupOutdated");
    }
  }

  /**
   * Whether a write's failure says it was never made: the pod refused it
   * (412, the document changed or was created elsewhere), or this app did
   * before sending it. Any other failure, an answer lost on the way, may
   * follow a write the pod made.
   */
  function unsent(error: unknown): boolean {
    return (
      error instanceof AppError &&
      ["changedElsewhere", "createdElsewhere", "writtenByNewerApp", "instanceBeingUpdated", "deckBeingUpgraded"].includes(
        error.code,
      )
    );
  }

  /**
   * Delete a backup the update that made it no longer needs (it changed
   * nothing), or what was written of it in its folder; whether nothing is
   * left of it.
   */
  async function discardBackup(folder: string, backup: Backup | null): Promise<boolean> {
    return (async () => {
      const made = backup ?? (await documentBackups.read(folder));
      return made === null || (await documentBackups.remove(made)).keptFolder === null;
    })().catch(() => false);
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
   * Whether the backup an instance replaces is gone: its meta document,
   * deleted last of all it holds, is no longer there. A folder that is
   * still there, kept for what another app put in it, is no backup. When
   * the pod cannot say, the backup is taken to be there.
   */
  async function backupGone(backupUrl: string): Promise<boolean> {
    return instanceRepository.readMeta(backupUrl).then(
      (backup) => backup === null,
      () => false,
    );
  }

  /** Clear what an instance's meta says it replaces. */
  async function forgetBackup(instanceUrl: string, meta: InstanceMeta): Promise<void> {
    const { replaces: _replaces, replacedAt: _replacedAt, ...rest } = meta;
    await instanceRepository.saveMeta(instanceUrl, rest);
  }

  /**
   * Delete a copy that failed half-way, when one was made; whether nothing
   * is left of it. Whole: the copy's container was free when this app
   * created it, and nothing names it yet, so all it holds is this app's
   * copies, the originals left where they were.
   */
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
    const [cards, states] = await Promise.all([deckRepository.listCards(guest), reviewStateRepository.listReviewStates(guest)]);
    // A card is written by its fragment id, in this app's format, at the time it was made.
    const content = cards.map(({ url: _url, formatVersion: _formatVersion, ...card }) => card);
    if (mentionsGuest([deck, content, states])) throw new AppError("guestUrlsLeft", { url: deck.url });
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
        await create(deck.cardsDocumentUrl, () => deckRepository.applyCardChanges(deck, { save: content, remove: [] }, { whole: true }));
      }
      if (states.length > 0) {
        await create(deck.reviewsDocumentUrl, () => reviewStateRepository.createReviewStates(deck, states));
      }
      return await deckRepository.addDeck(deck);
    } catch (error) {
      const entry = unsent(error) ? null : await deckRepository.readDeck(deck.url).catch(() => null);
      if (entry !== null) return entry;
      for (const url of written) await deckRepository.deleteDocument(url).catch(() => undefined);
      throw error;
    }
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

  /**
   * A new catalogue for an instance: published by the session's owner,
   * named as their profile names them (the WebID when it does not say).
   */
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
        const versions = await copyResources(resources, move, () => progress.stepped());
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
      const [guestDecks, targetDecks] = await Promise.all([
        deckRepository.listDecks(guestInstance.url),
        deckRepository.listDecks(target.url),
      ]);
      return guestMergePlan(guestDecks, targetDecks);
    },
    async mergeGuestStudy(session, guestInstance, target, { skip = [] } = {}, onProgress = () => undefined) {
      const source = ensureTrailingSlash(guestInstance.url);
      const targetUrl = ensureTrailingSlash(target.url);
      if (session.guest === true || !isGuestUrl(source) || isGuestUrl(targetUrl)) {
        throw new Error("A guest's study is added from the guest's pod to an instance of a user who logged in.");
      }
      const progress = stepReporter<GuestMergeStep>("read", GUEST_MERGE_STEPS.length, onProgress);
      // The digest is what this device learned of the guest's pod's versions: it is not the guest's study.
      const digest = digestUrlOf(source);
      const listed = async () => (await instanceCopier.listResources(source)).filter((url) => url !== digest);
      const versionsOf = async (resources: readonly string[]) =>
        new Map(
          await Promise.all(
            resources
              .filter((url) => !url.endsWith("/"))
              .map(async (url) => [url, await documentBackups.versionOf(url)] as const),
          ),
        );
      // Answers still on their way to the guest's log go there first, to be added with it.
      await logAnswers();
      const added: Deck[] = [];
      const notes: string[] = [];
      const release = writeFence.hold(source);
      try {
        // What the guest's study holds, at what version, before any of it is read; then all of it, checked.
        progress.start(2);
        const resources = await listed();
        const versions = await versionsOf(resources);
        const report = await validateInstance(source);
        if (!report.conforms) throw new AppError("guestStudyInvalid", { count: report.violationCount });
        if (report.documents.some((document) => document.subjects.some((subject) => subject.status === "newer"))) {
          throw new AppError("guestStudyTooNew");
        }
        progress.stepped();
        const [decks, tree, months, targetDecks, targetTree] = await Promise.all([
          deckRepository.listDecks(source),
          deckRepository.readDeckTree(source),
          answerLog.months(source),
          deckRepository.listDecks(targetUrl),
          deckRepository.readDeckTree(targetUrl),
        ]);
        // Groups to make in an arrangement a newer version wrote could not be: refused before anything is written.
        if (targetTree.readOnly && tree.children.some((node) => node.kind === "group")) throw new AppError("deckTreeTooNew");
        const answers = (await Promise.all(months.map((month) => answerLog.readMonth(source, month)))).flat();
        const chosen = decks.filter((deck) => !skip.includes(deck.url));

        // Each deck whole, one after another: its documents, its entry, then its answers.
        progress.finished("decks", chosen.length);
        const into = new Map<string, Deck>();
        for (const deck of chosen) {
          const key = guestMergeKey(deck.url, targetUrl);
          const stamp = guestDeckStamp(deck, (url) => versions.get(url) ?? "");
          const note = decodeGuestMergeNote(updateJournal.staging(key));
          // Added from this device before, its entry and documents unchanged since: there it is.
          let merged = note?.stamp === stamp ? targetDecks.find((candidate) => candidate.url === note.url) : undefined;
          if (merged === undefined) {
            merged = await addGuestDeck(deck, targetUrl);
            updateJournal.begin(key, encodeGuestMergeNote({ url: merged.url, stamp }));
          }
          notes.push(key);
          into.set(deck.url, merged);
          added.push(merged);
          await answerLog.appendAll(
            targetUrl,
            answers.filter((answer) => answer.deckUrl === deck.url).map((answer) => mergedAnswer(answer, merged)),
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
        if (nodes.length > 0) await deckRepository.editDeckTree(targetUrl, { kind: "graft", nodes });

        // Listing the guest's study again, then each of its documents: what was added is what it holds.
        progress.finished("verify", versions.size + 1);
        if ((await listed()).join("\n") !== resources.join("\n")) throw new AppError("guestStudyChanged");
        progress.stepped();
        for (const [url, version] of versions) {
          if ((await documentBackups.versionOf(url)) !== version) throw new AppError("guestStudyChanged", { url });
          progress.stepped();
        }
      } catch (error) {
        return { ok: false, instance: target, step: progress.step(), error, added };
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
    dataClassRegistrations(session, instance) {
      return instanceRepository.readDataClassRegistrations({ webId: session.webId, instanceUrl: instance.url });
    },
    registerDataClasses(session, instance) {
      return instanceRepository.registerDataClasses({
        webId: session.webId,
        instanceUrl: instance.url,
        title: instance.name,
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
      const progress = stepReporter<DeckUpgradeStep>("read", DECK_UPGRADE_STEPS.length, onProgress);
      const instanceUrl = instanceUrlOfDeck(offered.url);
      const folder = backupFolderOf(instanceUrl, now(), newId());
      let backup: Backup | null = null;
      let releaseUrl: string | null = null;
      const written: string[] = [];
      // The documents the upgrade changes are read-only in this tab until
      // it is over, but for its own writes: a review or edit made meanwhile
      // would be lost.
      const releases = [writeFence.hold(offered.cardsDocumentUrl), writeFence.pass(folder)];
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
        // The review states change only when some are dropped; else the deck's reviews document is not touched.
        const reviews =
          removed.size === 0 ? null : await readNow(reviewStateRepository.readReviewStatesSince(deck, undefined));
        const dropped = (reviews?.value ?? []).filter((state) => removed.has(state.cardId));
        if (dropped.length > 0) releases.push(writeFence.hold(deck.reviewsDocumentUrl));
        const documents = [deck.cardsDocumentUrl, ...(dropped.length > 0 ? [deck.reviewsDocumentUrl] : [])];

        // Each document copied into the backup, then each found as it was read: the plan is of the deck as read.
        progress.finished("backup", documents.length * 2);
        backup = await documentBackups.create(
          { folder, of: deck.url, createdAt: now().toISOString(), instanceUrl, documents, release: deck.sourceUrl },
          () => progress.stepped(),
        );
        const cardsNow = await deckRepository.readCardsSince(deck, cards.version ?? undefined);
        if (!cardsNow.unchanged && !sameCards(cards.value, cardsNow.value)) {
          throw new AppError("deckChangedDuringUpgrade", { url: deck.cardsDocumentUrl });
        }
        progress.stepped();
        if (dropped.length > 0) {
          const reviewsNow = await reviewStateRepository.readReviewStatesSince(deck, reviews!.version ?? undefined);
          if (!reviewsNow.unchanged && !sameReviewStates(reviews!.value, reviewsNow.value)) {
            throw new AppError("deckChangedDuringUpgrade", { url: deck.reviewsDocumentUrl });
          }
        }

        // Each document written in place, only while it is still as it was backed up.
        progress.finished("write", documents.length);
        const writeTo = async (document: string, write: () => Promise<void>) => {
          const entry = backup!.entries.find((candidate) => candidate.document === document)!;
          const release = writeFence.pass(document, entry.versionBackedUp);
          try {
            await write();
          } catch (error) {
            // A write whose answer was lost may have been made: putting back finds out.
            if (!unsent(error)) written.push(document);
            throw error;
          } finally {
            release();
          }
          written.push(document);
          const version = await documentBackups.versionOf(document);
          if (version !== null) {
            backup = withVersionUpdated(backup!, document, version);
            await documentBackups.noteUpdated(backup, document, version);
          }
          progress.stepped();
        };
        // One PUT of the whole document: a PATCH of much text can be cut short (docs/testing.md).
        await writeTo(deck.cardsDocumentUrl, () =>
          deckRepository.applyCardChanges(deck, { save: upgradedCards(plan), remove: [...removed] }, { whole: true }),
        );
        if (dropped.length > 0) {
          await writeTo(deck.reviewsDocumentUrl, () =>
            reviewStateRepository.applyReviewChanges(deck, { save: [], remove: dropped }),
          );
        }

        // Each document, read back.
        progress.finished("check", dropped.length > 0 ? 2 : undefined);
        const writtenCards = await readNow(deckRepository.readCardsSince(deck, undefined));
        if (!sameCards(upgradedCardList(cards.value, plan), writtenCards.value)) {
          throw new AppError("upgradedCardsDiffer", { url: deck.cardsDocumentUrl });
        }
        if (dropped.length > 0) {
          progress.stepped();
          const writtenStates = await readNow(reviewStateRepository.readReviewStatesSince(deck, undefined));
          const keptStates = reviews!.value.filter((state) => !removed.has(state.cardId));
          if (!sameReviewStates(keptStates, writtenStates.value)) {
            throw new AppError("upgradedReviewsDiffer", { url: deck.reviewsDocumentUrl });
          }
        }

        // The deck's entry, moved to the new release: the upgrade's last write.
        progress.finished("entry");
        releaseUrl = plan.releaseUrl;
        const upgraded = await deckRepository.upgradeDeckEntry(deck, applyLibraryUpgrade(deck, plan));
        releaseAll();

        progress.finished("tidy");
        const tidied = await discardBackup(folder, backup);
        progress.finished();
        return { ok: true, deck: upgraded, tidied };
      } catch (error) {
        releaseAll();
        const step = progress.step();
        if (releaseUrl !== null) {
          // A write of the entry whose answer was lost may have been made: the entry says.
          const deck = await deckRepository.readDeck(offered.url).catch(() => null);
          if (deck?.sourceUrl === releaseUrl) return { ok: true, deck, tidied: await discardBackup(folder, backup) };
        }
        if (written.length === 0) {
          await discardBackup(folder, backup);
          return { ok: false, step, error, asItWas: true };
        }
        // Each document the upgrade wrote is put back, unless it changed since; then the backup stays.
        const ownWrites = { ...backup!, entries: backup!.entries.filter((entry) => written.includes(entry.document)) };
        const undone = await putBack(ownWrites).catch(() => null);
        const asItWas = undone !== null && undone.kept.length === 0;
        if (asItWas) await discardBackup(folder, backup);
        return { ok: false, step, error, asItWas };
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
      const instanceUrl = ensureTrailingSlash(instance.url);
      const progress = stepReporter<UpdateStep>("stage", UPDATE_STEPS.length, onProgress);
      const partly = (count: number, of: number) => progress.partly(count, of);
      const folder = backupFolderOf(instanceUrl, now(), newId());
      let backup: Backup | null = null;
      const updated: string[] = [];
      // Documents whose write failed without saying it was not made.
      const attempted: string[] = [];
      // From here until the update is over, nothing else in this tab writes to the
      // instance; the update's own writes pass, the backup's and each document's.
      const releases = [writeFence.hold(instanceUrl), writeFence.pass(folder)];
      try {
        progress.start();
        const work = await updateWork(session, instanceUrl);
        if (work.length === 0) {
          // Brought up to date meanwhile, in another tab or app: nothing to back up or write.
          progress.finished("validate");
          progress.finished();
          return { ok: true };
        }
        // What already fails in the documents to be written is not the update's doing (a deck set aside, say):
        // the check after it counts only what fails anew.
        const failingBefore = failingSubjectUrls(
          summarize(instanceUrl, await Promise.all(work.map((item) => shapeValidator.validateDocument(item.document)))),
        );
        updateJournal.begin(instanceUrl, folder);
        progress.finished("backup", work.length);
        backup = await documentBackups.create(
          {
            folder,
            of: instanceUrl,
            createdAt: now().toISOString(),
            instanceUrl,
            documents: work.map((item) => item.document),
          },
          () => progress.stepped(),
        );
        progress.finished("upgrade", work.length);
        for (const item of work) {
          const entry = backup.entries.find((candidate) => candidate.document === item.document)!;
          // Written only while it is as it was backed up: a change made since, elsewhere, stops the update.
          const release = writeFence.pass(item.document, entry.versionBackedUp);
          const wrote = await item.write().then(
            (wrote) => {
              release();
              return wrote;
            },
            (error: unknown) => {
              release();
              // A write whose answer was lost may have been made: its backup is kept.
              if (!unsent(error)) attempted.push(item.document);
              throw error;
            },
          );
          if (wrote) {
            updated.push(item.document);
            const version = await documentBackups.versionOf(item.document);
            if (version !== null) await documentBackups.noteUpdated(backup, item.document, version);
          }
          progress.stepped();
        }
        progress.finished("validate");
        const report = await validateInstance(instanceUrl, partly);
        const failing = failingSubjectUrls(
          summarize(instanceUrl, report.documents.filter((document) => updated.includes(document.url))),
        );
        const failingAnew = [...failing].filter((subject) => !failingBefore.has(subject));
        if (failingAnew.length > 0) {
          throw new AppError("updatedInstanceInvalid", { count: failingAnew.length });
        }
        // A backup of documents of which none changed (each was brought up to date meanwhile) is not needed.
        const kept = updated.length > 0 || !(await discardBackup(folder, backup));
        // Other apps find each kind of the instance's data by its class; the instance works without.
        await instanceRepository
          .registerDataClasses({ webId: session.webId, instanceUrl, title: instance.name })
          .catch(() => undefined);
        progress.finished();
        updateJournal.end(instanceUrl);
        return { ok: true, ...(kept ? { backupUrl: folder } : {}) };
      } catch (error) {
        // A backup of documents of which none changed is not needed.
        const kept = updated.length + attempted.length > 0 || !(await discardBackup(folder, backup));
        updateJournal.end(instanceUrl);
        return { ok: false, step: progress.step(), error, updated, ...(kept ? { backupUrl: folder } : {}) };
      } finally {
        for (const release of releases) release();
      }
    },
    async findInterruptedUpdate(instance) {
      const source = ensureTrailingSlash(instance.url);
      const folder = updateJournal.staging(source);
      if (folder === null) return null;
      if ((await documentBackups.read(folder)) !== null) return { folder, backedUp: true };
      const gone = await instanceCopier.ensureAbsent(folder).then(
        () => true,
        () => false,
      );
      if (gone) updateJournal.end(source);
      return gone ? null : { folder, backedUp: false };
    },
    async removeInterruptedUpdate(instance) {
      const source = ensureTrailingSlash(instance.url);
      const folder = updateJournal.staging(source);
      // A backup without its manifest (or a copy an earlier version made) was made whole by
      // the update and nothing names it; a whole backup stays, with the instance's others.
      if (folder !== null && (await documentBackups.read(folder)) === null) await instanceCopier.deleteRecursively(folder);
      updateJournal.end(source);
    },
    listBackups(instance) {
      return documentBackups.list(instance.url);
    },
    async restoreBackup(instance, offered) {
      const backup = await documentBackups.read(offered.url);
      if (backup === null) throw new AppError("noBackup", { instance: instance.name });
      await ensureRestorable(instance, backup);
      const { restored, kept } = await putBack(backup);
      const removed = kept.length === 0 && (await discardBackup(backup.url, backup));
      return { restored, kept, removed };
    },
    deleteBackup(backup) {
      return documentBackups.remove(backup);
    },
    async readLegacyBackup(instance) {
      const meta = await instanceRepository.readMeta(instance.url);
      if (meta?.replaces === undefined) return null;
      if (await backupGone(meta.replaces)) {
        await forgetBackup(instance.url, meta);
        return null;
      }
      return { url: meta.replaces, ...(meta.replacedAt === undefined ? {} : { replacedAt: meta.replacedAt }) };
    },
    async restoreLegacyBackup(session, instance) {
      const meta = await instanceRepository.readMeta(instance.url);
      if (meta?.replaces === undefined) throw new AppError("noBackup", { instance: instance.name });
      // Never switch to a backup that is no longer whole: the deletion below would leave nothing.
      if ((await instanceRepository.readMeta(meta.replaces)) === null) {
        await forgetBackup(instance.url, meta);
        throw new AppError("noBackup", { instance: instance.name });
      }
      await instanceRepository.switchInstance({
        webId: session.webId,
        from: instance.url,
        to: meta.replaces,
        title: instance.name,
      });
      // The updated instance has been the one in use since the update: what else is in it now is not ours.
      const { keptFolder } = await instanceRepository.deleteInstanceData(instance.url);
      return { instance: { url: meta.replaces, name: instance.name }, keptFolder };
    },
    async deleteLegacyBackup(instance) {
      const meta = await instanceRepository.readMeta(instance.url);
      if (meta?.replaces === undefined) return { keptFolder: null };
      // Forgotten first: a deletion cut off half-way must not leave a backup that can still be restored.
      await forgetBackup(instance.url, meta);
      // The backup is the folder as it was, where other apps may have put files, and may still.
      return instanceRepository.deleteInstanceData(meta.replaces);
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
