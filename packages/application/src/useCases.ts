// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { profileNameOf, type SolidAccount } from "@solid-memo/domain/account";
import {
  defaultCatalogDescription,
  describedCatalog,
  renamedCatalog,
  type Catalog,
  type CatalogAbout,
} from "@solid-memo/domain/catalog";
import { withAbout, type DeckAbout } from "@solid-memo/domain/deckAbout";
import { withProvenance, type DeckProvenance } from "@solid-memo/domain/deckProvenance";
import type { LangTexts } from "@solid-memo/domain/keywords";
import { shown } from "@solid-memo/domain/langText";
import { withCardLanguage } from "@solid-memo/domain/deckCardLanguage";
import { deckPreferences, withPace, type DeckPace } from "@solid-memo/domain/deckPace";
import {
  isCopyOf,
  libraryCopiesOf,
  newestRelease,
  offersNewerRelease,
  releaseHost,
  releaseUrlOf,
  type LibraryCopy,
} from "@solid-memo/domain/library";
import { pickLocale, type Locale } from "@solid-memo/domain/locale";
import {
  checkPalette,
  isReadable,
  paletteVerdict,
  type CustomPalette,
  type PaletteDraft,
  type ShownPalette,
} from "@solid-memo/domain/customPalette";
import { DEFAULT_PALETTE, type Palette } from "@solid-memo/domain/palette";
import { DEFAULT_TEXT_SIZE, type TextSize } from "@solid-memo/domain/textSize";
import type { ThemeChoice } from "@solid-memo/domain/theme";
import { planRepair, type Repair, type RepairPlan } from "@solid-memo/domain/repair";
import {
  rebaseIri,
  UPDATE_STEPS,
  type UpdateDocument,
  type UpdateFailure,
  type UpdateOutcome,
  type UpdateProgress,
  type UpdateStep,
} from "@solid-memo/domain/instanceUpdate";
import {
  activeCards,
  DECK_FORMAT_VERSION,
  validateCardContent,
  type Card,
  type CardContent,
  type Deck,
  type DeckDirection,
  type Prompt,
  type StudyDirection,
} from "@solid-memo/domain/deck";
import {
  instanceName,
  type DataClassRegistrations,
  type Instance,
  type InstanceDeletion,
  type KeptDocuments,
  type RegistrationOptions,
  type RegistrationTarget,
} from "@solid-memo/domain/instance";
import type { LibraryCard, LibraryDeck, LibraryDeckContent } from "@solid-memo/domain/library";
import type { ReportPlace } from "@solid-memo/domain/mistakeReport";
import {
  applyLibraryUpgrade,
  planLibraryUpgrade,
  withReleaseLanguages,
  upgradedCards,
  type LibraryUpgradePlan,
} from "@solid-memo/domain/libraryUpgrade";
import {
  DECK_UPGRADE_STEPS,
  sameCardChanges,
  type DeckUpgradeOutcome,
  type DeckUpgradeProgress,
  type DeckUpgradeStep,
} from "@solid-memo/domain/deckUpgrade";
import { tidiedStated, type LangText } from "@solid-memo/domain/langText";
import { canonicalTag } from "@solid-memo/domain/languageTag";
import {
  unlikeRelease,
  withStatedLanguages,
  type StatedLanguages,
} from "@solid-memo/domain/deckLanguages";
import {
  planCardEdit,
  planUndo,
  sameCardEditPlan,
  type CardChanges,
  type CardEdit,
  type CardEditPlan,
} from "@solid-memo/domain/cardBulk";
import { planMigration, type MigrationPlan } from "@solid-memo/domain/migration";
import type { DeckGroup, DeckTree, DeckTreeEdit } from "@solid-memo/domain/deckTree";
import {
  catalogUrlOf,
  deckGroupUrlOf,
  digestUrlOf,
  ensureTrailingSlash,
  historyUrlOf,
  instanceAddressOf,
  instanceDocumentUrls,
  isPaletteOf,
  isSameUrl,
  metaUrlOf,
  paletteUrlOf,
  preferencesUrlOf,
} from "@solid-memo/domain/instanceLayout";
import {
  summarize,
  withUnclaimed,
  type DocumentReport,
  type UnclaimedDeck,
  type ValidationReport,
} from "@solid-memo/domain/validation";
import { deckHealth, type DeckHealth, type DeckTextCheck } from "@solid-memo/domain/deckHealth";
import type { MarkdownFinding } from "@solid-memo/domain/release/problems";
import { ABSENT_VERSION, studyCountsOf, type InstanceDigest } from "@solid-memo/domain/studyDigest";
import {
  DEFAULT_PREFERENCES,
  keptPalette,
  NEW_INSTANCE_PREFERENCES,
  shownPalette,
  type StudyPreferences,
} from "@solid-memo/domain/preferences";
import type {
  FsrsState,
  ReviewKey,
  ReviewQuality,
  ReviewState,
  ReviewStates,
} from "@solid-memo/domain/review";
import { isStudyDay, rescheduleStates, resetStates } from "@solid-memo/domain/reviewStateEdits";
import {
  planCardTransfer,
  type CardTransferPlan,
  type TransferOptions,
} from "@solid-memo/domain/cardTransfer";
import {
  DECK_FILE_ACCEPT,
  DECK_FILE_TYPES,
  deckFileBaseOf,
  deckFileFormatOf,
  deckFileName,
  importedDeck,
  type DeckFile,
  type DeckFileOptions,
} from "@solid-memo/domain/deckFile";
import {
  buildStudyQueue,
  resetFsrsStudyDay,
  resetStudyDay,
  studyDayOf,
  type StudyQueue,
} from "@solid-memo/domain/scheduling";
import { effectiveStates } from "@solid-memo/domain/fsrs";
import {
  SWITCH_STEPS,
  switchedStates,
  type SwitchOutcome,
  type SwitchProgress,
  type SwitchStep,
} from "@solid-memo/domain/schedulerSwitch";
import {
  monthOfStudyDay,
  shiftStudyDay,
  type Answer,
  type ResponseTimes,
} from "@solid-memo/domain/answer";
import {
  courseAnswerEffect,
  courseProgress,
  courseProgressOf,
  type CompletedChaptersEdit,
  type CourseAnswerEffect,
  type CourseOutline,
  type CourseProgress,
  type CourseResults,
} from "@solid-memo/domain/course";
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
  DocumentContext,
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
import { documentUrlOf } from "@solid-memo/domain/subjectUrl";
import { again, changedElsewhere, readNow, unsent } from "./writes";
import { stepReporter } from "./progress";
import { createPreferenceStore } from "./preferenceStore";
import { createAnswerStore, dueStatesOf, promptDueOf } from "./answerStore";
import { createDigestStore, noting, scheduleFrom } from "./digestStore";

export interface UseCases
  extends ReleaseDraftUseCases,
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
  /**
   * Mark a deck's unclaimed documents (the report's `unclaimed`) as the
   * deck's, once the user has confirmed they are: from then on they are
   * written to and deleted as the deck's. Each in one write made only
   * while it is as read; nothing else in it changes. deckGone when the
   * instance has no such deck.
   */
  claimDeckDocuments(instanceUrl: string, deckUrl: string): Promise<void>;
  /**
   * Everything wrong with one deck of the instance (domain/deckHealth.ts):
   * the check of its entry in the catalog and of its cards and reviews
   * documents, made as checkInstance makes it (a document still at the
   * version the digest says conformed is not checked again); the sides
   * whose language is not stated, of the cards the user may settle
   * (unknown when the release the deck was copied from cannot be read);
   * the cards that say the same; and what `text` (the markdown package's
   * plain text and check, which the caller passes in) finds in its text
   * written in Markdown. Writes nothing but the digest's receipts.
   */
  checkDeck<F extends MarkdownFinding>(
    instanceUrl: string,
    deck: Deck,
    text: DeckTextCheck<F>,
  ): Promise<DeckHealth<F>>;
  /** What the app can repair of what a check found, and what it leaves to the user. */
  planRepair(report: ValidationReport): RepairPlan;
  /** Apply repairs (the planned ones, or removals the user chose). */
  applyRepairs(repairs: readonly Repair[]): Promise<void>;
  listStorages(session: Session): Promise<Storage[]>;
  addManualStorage(url: string): Promise<Storage>;
  listInstances(session: Session): Promise<Instance[]>;
  getRegistrationOptions(session: Session): Promise<RegistrationOptions>;
  /**
   * Make an instance: its meta document and registrations, its catalog,
   * and its preferences, new ones (NEW_INSTANCE_PREFERENCES) with the
   * theme, the palette and the text size this device shows, so it
   * studies by FSRS-6.
   */
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
   * folder goes too unless it holds what another app put there, or the
   * releases published from it, which are kept, and the result says so.
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
  /**
   * Replace who made the deck and its license (withProvenance): the
   * authors tidied, the license one of KNOWN_LICENSES or the one it has.
   * The edit is made of the deck as its entry says now; when the catalog
   * document changed meanwhile, it is read and made again, three times
   * in all. Throws deckGone when the deck has no entry.
   */
  setDeckProvenance(deck: Deck, provenance: DeckProvenance): Promise<Deck>;
  /** Study several decks of an instance one way, as setDeckDirection, in one write of their catalog. */
  setDecksDirection(decks: readonly Deck[], direction: DeckDirection): Promise<Deck[]>;
  /**
   * Give several decks of an instance the same daily limits, as
   * setDeckPace, in one write of their catalog; a limit that is not a
   * whole number is refused before any write.
   */
  setDecksPace(decks: readonly Deck[], pace: DeckPace): Promise<Deck[]>;
  /**
   * Set the language the deck's card text is shown in first (its
   * fronts, backs, notes, labels, picture descriptions and wrong
   * options), kept on the deck in the pod; null goes back to the usual order, the app's
   * language first. A tag that names no language, or "zxx", is refused
   * (textLanguageInvalid) before any write.
   */
  setDeckCardLanguage(deck: Deck, language: string | null): Promise<Deck>;
  /** Remove a deck and its cards; the result names the documents kept for another app's data in them. */
  removeDeck(deck: Deck): Promise<KeptDocuments>;
  /** Remove several decks of an instance and their cards, their entries in one write of their catalog. */
  removeDecks(decks: readonly Deck[]): Promise<KeptDocuments>;
  /** The ready-made decks the app offers for import. */
  listLibraryDecks(): Promise<LibraryDeck[]>;
  /** Copy a library deck, cards included, into an instance as a new deck. */
  importLibraryDeck(instanceUrl: string, deck: LibraryDeck): Promise<Deck>;
  /** A library deck's cards, to look through before importing it. */
  listLibraryCards(deck: LibraryDeck): Promise<LibraryCard[]>;
  /**
   * A release a learner adds from a link (docs/deck-library.md, From a
   * link), read on its own and checked against the library's shapes, to
   * show before it is added. Refused when the text is no address of a
   * release (releaseUrlInvalid), when a subject of it breaks its shape
   * (releaseNotConforming), and as DeckLibrary.readRelease refuses. Read
   * as anyone reads it; writes nothing.
   */
  readReleaseFromLink(url: string): Promise<LibraryDeck>;
  /**
   * Add a release read from a link (readReleaseFromLink) to an instance
   * as the library's are: a deck imported (importLibraryDeck), a course
   * started (startCourse, the deck of it the instance has when it has
   * one). The copy names the release it came from
   * (`prov:wasDerivedFrom`); nothing is written where the release is.
   */
  importReleaseFromUrl(instanceUrl: string, release: LibraryDeck): Promise<Deck>;
  /**
   * What upgrading an imported deck to its library deck's current
   * release would do; null for a deck not from the library, or when
   * there is nothing (safe) to offer. Reads the library's index, the two
   * releases (and those in between, for a copy more than one behind) and
   * the copy's cards; writes nothing. Given the deck as listLibraryUpdates
   * lists it (its LibraryCopy, its series found), it does not look for its
   * series again. The releases a copy from a link would be upgraded with
   * are checked against the library's shapes first, as readReleaseFromLink
   * checks one (releaseNotConforming).
   */
  planLibraryUpgrade(deck: Deck, copy?: LibraryCopy): Promise<LibraryUpgradePlan | null>;
  /**
   * The instance's decks copied from a library release, each with its
   * deck in the library, the version it was copied from, and whether a
   * newer release is there (domain/library.ts, libraryCopiesOf). One read
   * of the library's index serves them all; none when no deck is a copy.
   * A copy whose series the index does not list is looked for as a
   * release added from a link: its release read, and its creator's
   * catalog for a newer one in its series ("unknown" when it cannot be
   * read). Writes nothing: planLibraryUpgrade says what an upgrade would
   * change.
   */
  listLibraryUpdates(instanceUrl: string): Promise<LibraryCopy[]>;
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
   * Where a mistake in the release at `releaseUrl` is reported
   * (domain/mistakeReport.ts): the library's tracker when the library's
   * index lists the release, however it was reached (copied, or opened
   * from a link), else the contact the release names, if any. Writes
   * nothing.
   */
  reportPlace(releaseUrl: string): Promise<ReportPlace>;
  /**
   * Apply the upgrade the user agreed to (domain/deckUpgrade.ts,
   * docs/migrations.md "How an upgrade is applied"), planned again on the
   * deck as it is: its cards document first, in one write made only while
   * it is as the plan read it; then, when cards with review states are
   * removed, its reviews document without them; and last its catalog
   * entry, moved to the new release, only while it says what was read.
   * Each write is one conditional write, made whole or not at all. A
   * failure stops the upgrade where it is, nothing put back: the deck is
   * readable, still names the release it came from, and is offered the
   * upgrade again, which finishes it. Refuses (deckChangedSinceOffer) when
   * the deck's cards no longer call for the changes the user agreed to.
   */
  applyLibraryUpgrade(
    deck: Deck,
    plan: LibraryUpgradePlan,
    onProgress?: (progress: DeckUpgradeProgress) => void,
  ): Promise<DeckUpgradeOutcome>;
  listCards(deck: Deck): Promise<Card[]>;
  /**
   * The deck's review states, every direction's, as stored: SM-2's, and
   * the FSRS-6 states beside them. The Studio's card workbench lists them
   * with the cards; what sets each prompt's due day is effectiveStates of
   * the two, by the instance's scheduler.
   */
  listDeckReviewStates(deck: Deck): Promise<ReviewStates>;
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
   * Make one bulk edit of the deck's cards (domain/cardBulk.ts), as the
   * user previewed it: the edit is planned again on the cards as they
   * are, and written in ONE write of the cards document, made only if it
   * is still as read (If-Match), then, when cards go with their review
   * states, ONE write of the reviews document; then the deck's schedule
   * in the digest is brought up to date. A cards document changed
   * meanwhile (or made since it was read as absent) is read and the edit
   * planned again, up to three times in all; once that plan is not the
   * one previewed, changedElsewhere, and nothing is written. Nothing is written when the plan saves and
   * removes nothing. The deck's own entry is untouched, as updateCard
   * leaves it. Resolves to the plan as written, whose inverse undoes it.
   */
  editCards(
    instanceUrl: string,
    deck: Deck,
    ids: readonly string[],
    edit: CardEdit,
    previewed: CardEditPlan,
  ): Promise<CardEditPlan>;
  /**
   * Undo an edit editCards made, the same way: its inverse is written
   * while the cards are as the edit left them (planUndo), else
   * changedElsewhere and nothing is written.
   */
  undoCardEdit(instanceUrl: string, deck: Deck, plan: CardEditPlan): Promise<void>;
  /**
   * Forget the cards of these ids, in one direction or (absent) in both
   * (domain/reviewStateEdits.ts, resetStates): their review states go,
   * so the scheduler sees them as new; their answers stay in the log.
   * One write of the reviews document, none when no card has a state;
   * then the deck's schedule in the digest is brought up to date. How
   * many cards were forgotten.
   */
  resetCards(
    instanceUrl: string,
    deck: Deck,
    ids: readonly string[],
    direction?: StudyDirection,
  ): Promise<number>;
  /**
   * Set the cards of these ids due on `due` (a study day), in one
   * direction or (absent) in both, their snapshot for resetting the
   * study day dropped (rescheduleStates). Refuses a day that is no date
   * (dueDayInvalid) before any read. A card never studied stays new.
   * One write of the reviews document, as resetCards. How many cards
   * were set due.
   */
  rescheduleCards(
    instanceUrl: string,
    deck: Deck,
    ids: readonly string[],
    due: string,
    direction?: StudyDirection,
  ): Promise<number>;
  /**
   * Move or copy the cards of these ids from the deck `from` to the deck
   * `to` of the same instance (domain/cardTransfer.ts,
   * planCardTransfer), with their review states when `keepProgress`.
   * The target is written first: its cards document in ONE write made
   * only if it is still as read (If-Match), then its reviews document;
   * for a move, then the source's reviews document, and its cards
   * document, likewise If-Match. A document changed meanwhile (or made
   * since it was read as absent) has the whole transfer planned again on
   * the decks as they are, up to three times in all, then
   * changedElsewhere. A transfer stopped half way (the
   * target written, the source not, or only its reviews) is finished by
   * making it again: cards the target holds already are not written
   * twice, and keep the states they have there. Then the
   * target's schedule in the digest is brought up to date, and for a
   * move the source's. The answer log is untouched. Refuses a transfer
   * to `from` itself (cardTransferSameDeck) before any read. Resolves to
   * the plan as written.
   */
  transferCards(
    instanceUrl: string,
    from: Deck,
    to: Deck,
    ids: readonly string[],
    options: TransferOptions,
  ): Promise<CardTransferPlan>;
  /**
   * Save the deck as a file (domain/deckFile.ts, DeckArchive.exportDeck),
   * in `options.format`, named after its title (deckFileName), with its
   * progress when `options.withProgress`. Writes nothing to the pod.
   */
  exportDeckFile(deck: Deck, options: DeckFileOptions): Promise<void>;
  /**
   * The deck file the user picks (Turtle or JSON-LD, by its name, else
   * its text: deckFileFormatOf), read as DeckArchive.readDeckFile reads
   * it; null when they pick none. Writes nothing.
   */
  openDeckFile(): Promise<DeckFile | null>;
  /**
   * Make the file's deck a new deck of the instance (importedDeck): its
   * id kept unless the instance uses it, its cards with their ids and,
   * with `withProgress`, its review states and a course's completed
   * chapters. Its cards document is written in ONE write, only if there
   * is none at its URL yet (one left by an import cut off has the deck
   * given a fresh id, once); then its review states in one write of its
   * reviews document; then its entry in the catalog, so the deck shows
   * only once it is whole. Each write is checked against the shapes.
   * Then the deck's schedule in the digest is brought up to date. The
   * deck as written.
   */
  importDeckFile(
    instanceUrl: string,
    file: DeckFile,
    options: { withProgress: boolean },
  ): Promise<Deck>;
  /**
   * What bringing the instance's cards up to this app's format would
   * touch — reads every deck's cards, writes nothing. Empty when there is
   * nothing to migrate.
   */
  planMigration(instanceUrl: string): Promise<MigrationPlan>;
  /**
   * Bring the instance up to this app's formats (docs/migrations.md "The
   * pod migration"), each document on its own, where it is: the documents
   * planMigration finds outdated, read again, one after another, each in
   * ONE write made only if it is still as it was read, its outdated
   * subjects brought up to date from that very read. Only ever run after
   * the user has agreed to the plan. A document that cannot be updated
   * now (changed elsewhere since it was read, refused, unreachable) is
   * left as it is — as it was, or updated when the answer to its write
   * was lost — and named with why; the others go on. Nothing is put back:
   * every document is readable, updated or not, and running it again
   * updates what is still outdated. Once nothing failed, the
   * registrations of the instance's data that are missing are added
   * (registerDataClasses); a failure there leaves the update done. Throws
   * when what is outdated cannot be read: nothing was written.
   */
  updateInstance(
    session: Session,
    instance: Instance,
    onProgress?: (progress: UpdateProgress) => void,
  ): Promise<UpdateOutcome>;
  /**
   * The partial copy of the guest's instance that a move into a new
   * folder (transferGuestStudy), cut off half-way by a closed tab, left
   * behind, as this browser noted it; null when there is none (any more).
   */
  findInterruptedGuestMove(instance: Instance): Promise<string | null>;
  /** Delete the partial copy an interrupted move left behind, and forget it. */
  removeInterruptedGuestMove(instance: Instance): Promise<void>;
  /**
   * The stored preferences; the defaults when none are stored, SM-2's
   * among them (DEFAULT_PREFERENCES): an instance with none was made
   * before a new one stated its own, and studies by SM-2.
   */
  getPreferences(instanceUrl: string): Promise<StudyPreferences>;
  /**
   * Give an instance a new name (instanceName: trimmed, not empty)
   * everywhere it is kept: its meta document, its catalog's title (and
   * the description, while it is the one the old name gave), and its
   * registrations in the type indexes, the instance's and the
   * catalog's, which name it in the instance list. Each write is made
   * of its document as it is then, and made again from a fresh read
   * when it changed meanwhile, three times in all. The instance as
   * renamed.
   */
  renameInstance(session: Session, instance: Instance, name: string): Promise<Instance>;
  /** The instance's catalog; null when it has none (an instance not updated yet). */
  readCatalog(instanceUrl: string): Promise<Catalog | null>;
  /**
   * Replace the catalog's description and license (describedCatalog),
   * of the catalog as it is now, again from a fresh read when it
   * changed meanwhile, three times in all. Throws noCatalogToUpdate when
   * the instance has no catalog. The catalog as written.
   */
  describeCatalog(instanceUrl: string, about: CatalogAbout): Promise<Catalog>;
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
   * Today's due and new cards for a deck, respecting the daily caps, with
   * what grading them takes and their states (StudySessionQueue).
   */
  getStudyQueue(instanceUrl: string, deck: Deck, now: Date): Promise<StudySessionQueue>;
  /**
   * How many prompts today's queue would hold, as getStudyQueue counts
   * them; from the deck's schedule in the instance's digest when neither
   * of its documents changed since, else from its documents (and the
   * digest is brought up to date).
   */
  getStudyCounts(
    instanceUrl: string,
    deck: Deck,
    now: Date,
  ): Promise<{ dueCount: number; newCount: number }>;
  /** Keep the deck's schedule in the digest, as of now: when a study session ends. */
  refreshStudyDigest(instanceUrl: string, deck: Deck): Promise<void>;
  /**
   * Apply one SM-2 review: load the prompt's state (or start fresh),
   * transition it, persist it, and return the new state, with what
   * undoReview needs to take it back. The answer logged keeps how long
   * it took (`times`, as the screen measured it; recordedResponseTimes
   * says which are kept). With `known` (a study session's, of its
   * queue), the preferences are not read again.
   */
  recordReview(
    instanceUrl: string,
    deck: Deck,
    prompt: Prompt,
    quality: ReviewQuality,
    now: Date,
    times?: ResponseTimes,
    known?: GradeBasis,
  ): Promise<RecordedReview>;
  /**
   * Take back an answer recordReview gave: the prompt's state goes back
   * to how it was before (a prompt that was new loses its state), and
   * the answer leaves the log, or the answers still on their way to it.
   * Resolves to the state written back, null for a prompt new again.
   */
  undoReview(instanceUrl: string, deck: Deck, undo: ReviewUndo): Promise<ReviewState | null>;
  /**
   * Undo the current study day for a deck: cards reviewed today go back
   * to how they were before, cards introduced today become new again.
   * Resolves to the number of cards reset.
   */
  resetStudyDay(instanceUrl: string, deck: Deck, now: Date): Promise<number>;
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
   * What the deck list's strip of courses needs of a course: its
   * release's outline and the cards the learner has answered. The deck
   * is taken as given, its catalog entry not read again, and the
   * release's cards are not mapped. A deck that is no library copy is a
   * mistake of the caller (a plain Error). Writes nothing.
   */
  getCourseSummary(deck: Deck): Promise<CourseSummary>;
  /**
   * Answer one of a course's multiple-choice questions (domain/course.ts
   * choicesOf): what the answer does to the card's schedule follows
   * courseAnswerEffect. A card introduced is first written into the deck,
   * as its release has it (distractors and fragment id included), then
   * graded; a review is graded as in study; either way the answer is
   * logged as a multiple-choice one, naming the wrong option chosen. No
   * daily limit applies: the learner reached the card. Writes nothing
   * when the answer is practice ("none"). The answer logged keeps how
   * long choosing took (`times`; a multiple-choice answer is not graded,
   * so it has no grading time).
   */
  answerCourseQuestion(
    instanceUrl: string,
    deck: Deck,
    card: LibraryCard,
    choice: CourseChoice,
    now: Date,
    times?: Pick<ResponseTimes, "recallMillis">,
  ): Promise<CourseAnswer>;
  /**
   * Note a chapter of the deck's course completed (its final review
   * passed), unlocking the next (DeckRepository.completeChapter). The
   * deck as its entry says then.
   */
  completeChapter(deck: Deck, chapterUrl: string): Promise<Deck>;
  /**
   * Change the chapters of the deck's course completed, as the Studio
   * does (DeckRepository.setCompletedChapters): mark one not done, or
   * restart the course. The learner's answers and review states stay.
   */
  setCompletedChapters(deck: Deck, edit: CompletedChaptersEdit): Promise<Deck>;
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

/**
 * Today's queue of a deck (UseCases.getStudyQueue), with the instance's
 * preferences it was built with, which a session grades its prompts by
 * (GradeBasis), and the deck's review states it was built from, which a
 * session shows each grade's interval from (previewIntervals): SM-2's,
 * and the FSRS-6 states beside them.
 */
export interface StudySessionQueue extends StudyQueue {
  prefs: StudyPreferences;
  states: ReviewState[];
  fsrsStates: FsrsState[];
}

/** What a grade is made with besides the prompt's state, which is the reviews document's: the instance's preferences. */
export interface GradeBasis {
  prefs: StudyPreferences;
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

/** What the deck list's strip needs of a course (UseCases.getCourseSummary). */
export type CourseSummary = Pick<Course, "outline" | "answeredCardIds">;

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

/**
 * A review recorded (UseCases.recordReview): the prompt's new SM-2
 * state, its new FSRS-6 state when FSRS-6 sets the due days, and how to
 * undo it.
 */
export interface RecordedReview {
  state: ReviewState;
  fsrs?: FsrsState;
  undo: ReviewUndo;
}

/**
 * What undoing one answer takes (UseCases.undoReview), kept in memory
 * while the session lasts: the stored snapshot (ReviewState.previous)
 * is of before the study day's first review, so it cannot undo a second.
 */
export interface ReviewUndo {
  key: ReviewKey;
  /** The prompt's SM-2 state before the answer; null for a prompt that was new. */
  before: ReviewState | null;
  /**
   * When the answer wrote an FSRS-6 state, the one before it (null: none,
   * as for a new prompt or one estimated from SM-2), which undoing writes
   * back or removes; absent when the answer left FSRS-6's state alone.
   */
  fsrs?: { before: FsrsState | null };
  /** The answer logged, and the study day it is in. */
  answer: { id: string; studyDay: string };
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
  /** Notes of a guest's study being moved or added to an instance; by default none is kept. */
  updateJournal?: UpdateJournal;
  /** The language the user chose; by default none is kept. */
  languagePreference?: LanguagePreference;
  /** The theme the user chose; by default none is kept. */
  themePreference?: ThemePreference;
  /** The palette the user chose; by default none is kept. */
  palettePreference?: PalettePreference;
  /** A copy of the user's own palette being shown; by default none is kept. */
  customPalettePreference?: CustomPalettePreference;
  /** The palettes the user designed; by default there are none. */
  paletteRepository?: PaletteRepository;
  /** The text size the user chose; by default none is kept. */
  textSizePreference?: TextSizePreference;
  /** The clock; injected for tests. */
  now?: () => Date;
  /** Fresh identifiers (a deck group, an answer, a guest's deck); injected for tests. */
  newId?: () => string;
  /** Keeps a guest's study read-only to anything else in the tab while it moves. */
  writeFence?: WriteFence;
  /** Where each instance's digest is kept; by default none is. */
  digestRepository?: DigestRepository;
  /** Where each instance's answer log is kept; by default none is. */
  answerLog?: AnswerLog;
  /** Names the shapes documents are checked by; a receipt of other rules does not count. */
  ruleset?: string;
  /** The pod a guest studies in on this device; by default there is none. */
  guestPod?: GuestPod;
  /** Decks as files; by default there is none to export or read. */
  deckArchive?: DeckArchive;
  /** Files on the user's device; by default none is saved or opened. */
  fileExchange?: FileExchange;
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

/**
 * How often a bulk edit of a deck's cards is planned and written, in
 * all, while the cards document keeps changing elsewhere (412).
 */
const CARD_EDIT_ATTEMPTS = 3;

/**
 * Whether a write of a cards document was refused because it changed
 * since it was read, or was made since it was read as absent (a 412).
 */
function cardsChangedElsewhere(error: unknown): boolean {
  return (
    changedElsewhere(error) || (error instanceof AppError && error.code === "createdElsewhere")
  );
}

/**
 * A bulk edit's write of a cards document: one PUT of the whole document,
 * which no pod cuts short, made only while the document is at the
 * version read (none to check when the pod gave none).
 */
function wholeAt(version: string | null): { whole: true; version?: string } {
  return version === null ? { whole: true } : { whole: true, version };
}

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
const NO_TEXT_SIZE_PREFERENCE: TextSizePreference = {
  chosen: () => DEFAULT_TEXT_SIZE,
  choose: () => undefined,
};
const NO_JOURNAL: UpdateJournal = {
  begin: () => undefined,
  end: () => undefined,
  staging: () => null,
  run: () => () => undefined,
  watch: () => undefined,
};
const NO_FENCE: WriteFence = { hold: () => () => undefined };
const NO_DIGESTS: DigestRepository = {
  readDigest: async () => null,
  updateDigest: async () => undefined,
};
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
const NO_DECK_ARCHIVE: DeckArchive = {
  exportDeck: async () => {
    throw new Error("This app keeps no deck archive.");
  },
  readDeckFile: async () => {
    throw new Error("This app keeps no deck archive.");
  },
};
const NO_FILE_EXCHANGE: FileExchange = { save: () => undefined, open: async () => null };
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
const NO_PALETTES: PaletteRepository = {
  listPalettes: none,
  savePalette: async () => {
    throw new Error("This app keeps no palettes.");
  },
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

/** A document the format update writes, and the writes that bring it up to date, each saying whether it wrote anything. */
interface UpdateItem {
  document: UpdateDocument;
  writes: (() => Promise<boolean>)[];
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
  palettePreference = NO_PALETTE_PREFERENCE,
  customPalettePreference = NO_CUSTOM_PALETTE_PREFERENCE,
  paletteRepository = NO_PALETTES,
  textSizePreference = NO_TEXT_SIZE_PREFERENCE,
  now = () => new Date(),
  newId = () => crypto.randomUUID(),
  writeFence = NO_FENCE,
  digestRepository = NO_DIGESTS,
  answerLog = NO_ANSWER_LOG,
  ruleset = "",
  guestPod = NO_GUEST_POD,
  deckArchive = NO_DECK_ARCHIVE,
  fileExchange = NO_FILE_EXCHANGE,
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
   * do, of its cards as `cards` reads them; null when nothing (safe). A
   * copy more than one release behind is planned with the releases in
   * between too: an upgrade to one of them, cut off before it moved the
   * deck's entry, may have left cards as that release has them, which are
   * the library's, not the user's.
   * The deck's series is looked up in the index, else as a release added
   * from a link, unless it is `known` (a LibraryCopy's). A copy from a
   * link is upgraded with releases no index lists: each is checked against
   * the library's shapes first, as the first one was (checkLinkedRelease).
   */
  async function planUpgrade(
    deck: Deck,
    cards: () => Promise<Card[]>,
    known?: LibraryCopy,
  ): Promise<LibraryUpgradePlan | null> {
    if (deck.sourceUrl === undefined) return null;
    const { series, fromLink } = known ?? (await seriesOf(deck));
    if (series === null) return null;
    // The index tells a copy of the current release, or of no older one,
    // without reading a release (thousands of cards) or the copy's cards.
    if (!offersNewerRelease(deck, series)) return null;
    const [from, to, copy] = await Promise.all([
      deckLibrary.fetchLibraryDeck(deck.sourceUrl),
      deckLibrary.fetchLibraryDeck(series.url),
      cards(),
    ]);
    const betweenUrls = series.releases
      .filter(
        (release) =>
          Number(release.version) > Number(from.version) &&
          Number(release.version) < Number(to.version),
      )
      .map((release) => release.url);
    if (fromLink === true) await Promise.all([series.url, ...betweenUrls].map(checkLinkedRelease));
    const between = await Promise.all(betweenUrls.map((url) => deckLibrary.fetchLibraryDeck(url)));
    // A course's outline stays in its release: a newer one may change only that.
    const outlines =
      from.isCourse === true && to.isCourse === true
        ? await Promise.all([
            deckLibrary.fetchCourseOutline(from.url),
            deckLibrary.fetchCourseOutline(to.url),
          ])
        : null;
    return planLibraryUpgrade({
      deck,
      cards: copy,
      from,
      between,
      to,
      releases: series.releases,
      // A course's deck holds only the cards the learner reached: an upgrade adds none.
      course: series.isCourse === true || from.isCourse === true,
      ...(outlines === null ? {} : { outlines: { from: outlines[0], to: outlines[1] } }),
    });
  }

  async function importLibraryDeck(instanceUrl: string, deck: LibraryDeck): Promise<Deck> {
    const content = await deckLibrary.fetchLibraryDeck(deck.url);
    return deckRepository.importDeck(instanceUrl, content);
  }

  function sourceOf(deck: Deck): string {
    if (deck.sourceUrl === undefined)
      throw new Error("A course's deck names the release it was copied from");
    return deck.sourceUrl;
  }

  async function courseSummary(deck: Deck): Promise<CourseSummary> {
    const [outline, reviews] = await Promise.all([
      deckLibrary.fetchCourseOutline(sourceOf(deck)),
      reviewStateRepository.listReviewStates(deck),
    ]);
    // A course asks front to back: a card is answered once it has that state.
    const answeredCardIds = reviews.sm2
      .filter((state) => state.direction === "front-to-back")
      .map((state) => state.cardId);
    return { outline, answeredCardIds };
  }

  async function startCourse(instanceUrl: string, course: LibraryDeck): Promise<Deck> {
    const started = (await deckRepository.listDecks(instanceUrl)).find((deck) =>
      isCopyOf(deck, course),
    );
    if (started !== undefined) return started;
    const release = await deckLibrary.fetchLibraryDeck(course.url);
    return deckRepository.importDeck(instanceUrl, { ...release, cards: [] });
  }

  /**
   * A copy's series, as the index lists it, else as a release added from a
   * link whose creator's catalog can be read (linkedSeries); none
   * otherwise.
   */
  async function seriesOf(deck: Deck): Promise<{ series: LibraryDeck | null; fromLink?: true }> {
    const indexed = (await deckLibrary.listLibraryDecks()).find((libraryDeck) =>
      isCopyOf(deck, libraryDeck),
    );
    if (indexed !== undefined) return { series: indexed };
    return linkedSeries(deck.sourceUrl!, new Map()).then(
      (found) => (found.complete ? { series: found.series, fromLink: true } : { series: null }),
      () => ({ series: null }),
    );
  }

  /**
   * Refuse a release read from a link (docs/deck-library.md, From a link)
   * when a subject of it breaks its shape in the library's shapes, read as
   * anyone reads it (releaseNotConforming); its warnings do not.
   */
  async function checkLinkedRelease(url: string): Promise<void> {
    const report = await shapeValidator.validateDocument(url, "library");
    const problems = report.subjects.flatMap((subject) =>
      subject.status === "checked"
        ? subject.violations.filter((violation) => violation.severity === "violation")
        : [],
    );
    if (problems.length > 0) {
      throw new AppError("releaseNotConforming", {
        host: releaseHost(url),
        count: problems.length,
        problems: problems
          .map((problem) => `${problem.path ?? ""} ${shown(problem.message)}`)
          .join("\n"),
      });
    }
  }

  /**
   * The series of a release added from a link, as its newest release
   * known describes it (docs/deck-library.md, From a link): the release
   * itself unless its creator's catalog can be read (`complete`), then
   * the newest of its series the catalog links. A release the
   * catalog links that cannot be read is passed over, and so is one the
   * copied release lists, as no newer one. `reads` keeps each release
   * read, for the copies looked up together: one read of each.
   */
  async function linkedSeries(
    url: string,
    reads: Map<string, Promise<LibraryDeck>>,
  ): Promise<{ copied: LibraryDeck; series: LibraryDeck; complete: boolean }> {
    const read = (release: string) => {
      let made = reads.get(release);
      if (made === undefined) {
        made = deckLibrary.readRelease(release);
        reads.set(release, made);
      }
      return made;
    };
    const [copied, published] = await Promise.all([read(url), deckLibrary.publishedBeside(url)]);
    if (published === null) return { copied, series: copied, complete: false };
    const listed = new Set(copied.releases.map((release) => release.url));
    const others = await Promise.all(
      published.filter((other) => !listed.has(other)).map((other) => read(other).catch(() => null)),
    );
    return { copied, series: newestRelease(copied, others), complete: true };
  }

  /** A copy whose series the library's index does not list, as a release added from a link; as it was when its release cannot be read. */
  async function linkedCopy(
    copy: LibraryCopy,
    reads: Map<string, Promise<LibraryDeck>>,
  ): Promise<LibraryCopy> {
    try {
      const { copied, series, complete } = await linkedSeries(copy.deck.sourceUrl!, reads);
      return {
        deck: copy.deck,
        series,
        version: copied.version,
        newer: complete ? offersNewerRelease(copy.deck, series) : "unknown",
        fromLink: true,
      };
    } catch {
      return copy;
    }
  }

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
   * What bringing the instance up to this app's formats would touch: its
   * meta document, preferences and catalog, and every deck's cards and
   * review states. A document still at a version with nothing outdated in
   * it, as the instance's digest says, is not read again. Reads only: the
   * digest's format notes are written by the deck list (getStudyCounts).
   */
  async function planOf(instanceUrl: string): Promise<MigrationPlan> {
    const [instance, preferences, catalog, decks, digest] = await Promise.all([
      instanceRepository.readMeta(instanceUrl),
      preferencesRepository.getPreferences(instanceUrl),
      deckRepository.readCatalog(instanceUrl),
      deckRepository.listDecks(instanceUrl),
      digestStore.of(instanceUrl),
    ]);
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
          reviews: reviews.unchanged ? [] : reviews.value.sm2,
        };
      }),
    );
    return planMigration({ instance, preferences, catalog, entries });
  }

  /**
   * The documents the format update brings up to this app's formats, as
   * planOf finds them now, in the order it writes them: the meta document,
   * the preferences, each deck's cards and review states, and last the
   * catalog document (its outdated deck entries, and its catalog when it
   * has none). No order between documents matters to what they say: each
   * subject is brought up to date on its own, and a catalog lists decks
   * of its own document. A document two decks share (another app may point
   * two decks at one) is one item, written for each deck in turn. Each
   * write reads the document afresh, brings its outdated subjects up to
   * date from that very read and writes them in place, only if it is still
   * as read (If-Match); whether it wrote anything (a document brought up
   * to date meanwhile is not written).
   */
  async function updateWork(session: Session, instanceUrl: string): Promise<UpdateItem[]> {
    const plan = await planOf(instanceUrl);
    const work: UpdateItem[] = [];
    const add = (document: UpdateDocument, write: () => Promise<boolean>) => {
      const item = work.find((candidate) => candidate.document.url === document.url);
      if (item === undefined) work.push({ document, writes: [write] });
      else item.writes.push(write);
    };
    if (plan.instanceOutdated) {
      add({ url: metaUrlOf(instanceUrl), holds: "instance" }, () =>
        instanceRepository.upgradeMeta(instanceUrl),
      );
    }
    if (plan.preferencesOutdated) {
      add({ url: preferencesUrlOf(instanceUrl), holds: "preferences" }, () =>
        preferencesRepository.upgradePreferences(instanceUrl),
      );
    }
    for (const { deck, cardCount, reviewCount } of plan.decks) {
      if (cardCount > 0) {
        add({ url: deck.cardsDocumentUrl, holds: "cards", deck: deck.title }, () =>
          deckRepository.upgradeCards(deck),
        );
      }
      if (reviewCount > 0) {
        add({ url: deck.reviewsDocumentUrl, holds: "reviews", deck: deck.title }, () =>
          reviewStateRepository.upgradeReviewStates(deck),
        );
      }
    }
    if (plan.catalogMissing || plan.deckCount > 0) {
      add({ url: catalogUrlOf(instanceUrl), holds: "catalog" }, async () => {
        // A catalog for an instance that has none, named as its record names it, published by the signed-in user.
        const made = plan.catalogMissing
          ? await catalogOf(
              session,
              (await instanceRepository.readMeta(instanceUrl))?.name ?? instanceUrl,
            )
          : null;
        return deckRepository.upgradeDecks(instanceUrl, made);
      });
    }
    return work;
  }

  /**
   * Write a bulk edit of the deck's cards (editCards, undoCardEdit): the
   * changes `plan` makes of the cards and review states as they are now,
   * in one conditional write of the cards document, again from a fresh
   * read when it changed meanwhile; then one write of the reviews
   * document, and the digest brought up to date. Resolves to the
   * changes written.
   */
  async function writeCardEdit<T extends CardChanges>(
    instanceUrl: string,
    deck: Deck,
    plan: (cards: Card[], reviews: ReviewState[]) => T,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const [read, reviews] = await Promise.all([
        readNow(deckRepository.readCardsSince(deck, undefined)),
        reviewStateRepository.listReviewStates(deck),
      ]);
      const changes = plan(read.value, reviews.sm2);
      if (changes.save.length === 0 && changes.remove.length === 0) return changes;
      try {
        await deckRepository.applyCardChanges(
          deck,
          { save: changes.save, remove: changes.remove },
          wholeAt(read.version),
        );
      } catch (error) {
        if (cardsChangedElsewhere(error) && attempt < CARD_EDIT_ATTEMPTS) continue;
        throw error;
      }
      // A card joins before its state, and leaves before it: no state is ever without its card for long.
      if (changes.reviewSaves.length > 0 || changes.reviewRemovals.length > 0) {
        // A card removed takes every state it has with it, SM-2's and FSRS-6's, as removing a card does;
        // another scheduler's stays. Undone, its SM-2 states come back, and FSRS-6 estimates from them.
        await reviewStateRepository.applyReviewChanges(deck, {
          save: changes.reviewSaves,
          remove: changes.reviewRemovals,
          every: true,
        });
      }
      // The edit is made: a digest left behind is brought up to date by the next deck list.
      await digestStore.refresh(instanceUrl, deck).catch(() => undefined);
      return changes;
    }
  }

  /**
   * Write an edit of the deck's review states (resetCards,
   * rescheduleCards) in one write of the reviews document, none when it
   * changes nothing; then bring the digest up to date. How many cards it
   * changed.
   */
  async function writeReviewEdit(
    instanceUrl: string,
    deck: Deck,
    changes: { save: ReviewState[]; remove: ReviewKey[]; fsrsSave?: FsrsState[] },
  ): Promise<number> {
    const { save, remove, fsrsSave = [] } = changes;
    const cards = new Set([...save, ...remove].map((key) => key.cardId));
    if (cards.size === 0) return 0;
    // A card forgotten loses every state it has that way, SM-2's and FSRS-6's, so none is read in its place.
    await reviewStateRepository.applyReviewChanges(deck, {
      save,
      remove,
      fsrs: { save: fsrsSave, remove: [] },
      every: true,
    });
    // The edit is made: a digest left behind is brought up to date by the next deck list.
    await digestStore.refresh(instanceUrl, deck).catch(() => undefined);
    return cards.size;
  }

  /**
   * One attempt at a transfer (transferCards): read both decks, plan,
   * write the target's documents, then for a move the source's (its
   * reviews before its cards), each cards document If-Match its read.
   */
  async function transferOnce(
    from: Deck,
    to: Deck,
    ids: readonly string[],
    options: TransferOptions,
  ): Promise<CardTransferPlan> {
    const [sourceCards, sourceStates, targetCards, targetStates] = await Promise.all([
      readNow(deckRepository.readCardsSince(from, undefined)),
      reviewStateRepository.listReviewStates(from),
      readNow(deckRepository.readCardsSince(to, undefined)),
      reviewStateRepository.listReviewStates(to),
    ]);
    const plan = planCardTransfer(
      {
        url: from.url,
        cards: sourceCards.value,
        states: sourceStates.sm2,
        fsrs: sourceStates.fsrs,
      },
      { url: to.url, cards: targetCards.value, states: targetStates.sm2, fsrs: targetStates.fsrs },
      ids,
      options,
    );
    // The target first: a move stopped here leaves the cards in both decks, never in neither.
    if (plan.target.save.length > 0) {
      await deckRepository.applyCardChanges(
        to,
        { save: plan.target.save, remove: [] },
        wholeAt(targetCards.version),
      );
    }
    if (plan.target.reviewSaves.length > 0 || plan.target.reviewRemovals.length > 0) {
      await reviewStateRepository.applyReviewChanges(to, {
        save: plan.target.reviewSaves,
        remove: plan.target.reviewRemovals,
        fsrs: { save: plan.target.fsrsSaves, remove: plan.target.fsrsRemovals },
        every: true,
      });
    }
    // The source's states before its cards: a move stopped between leaves the cards in the
    // source without progress, which the target has, and making it again finishes it.
    if (plan.source.reviewRemovals.length > 0) {
      await reviewStateRepository.applyReviewChanges(from, {
        save: [],
        remove: plan.source.reviewRemovals,
        every: true,
      });
    }
    if (plan.source.remove.length > 0) {
      await deckRepository.applyCardChanges(
        from,
        { save: [], remove: plan.source.remove },
        wholeAt(sourceCards.version),
      );
    }
    return plan;
  }

  async function studyCountsAndSchedule(instanceUrl: string, deck: Deck, now: Date) {
    const [prefs, digest] = await Promise.all([
      preferenceStore.get(instanceUrl),
      digestStore.of(instanceUrl),
    ]);
    const studyPrefs = deckPreferences(prefs, deck);
    const kept = digest.schedules[deck.url];
    const [cardsSince, reviewsSince] = await Promise.all([
      deckRepository.readCardsSince(deck, kept?.cardsVersion),
      reviewStateRepository.readReviewStatesSince(deck, kept?.reviewsVersion),
    ]);
    if (kept !== undefined && cardsSince.unchanged && reviewsSince.unchanged) {
      const counts = studyCountsOf(kept.schedule, {
        direction: deck.direction,
        prefs: studyPrefs,
        now,
      });
      if (counts !== null) return counts;
    }
    const [cards, reviews] = await Promise.all([
      cardsSince.unchanged ? deckRepository.readCardsSince(deck, undefined) : cardsSince,
      reviewsSince.unchanged
        ? reviewStateRepository.readReviewStatesSince(deck, undefined)
        : reviewsSince,
    ]);
    // A read without a version to compare is never "unchanged".
    if (cards.unchanged || reviews.unchanged)
      throw new Error("A read without a version to compare came back unchanged.");
    digestStore.noteSchedule(instanceUrl, deck, cards, reviews, prefs, now);
    const queue = buildStudyQueue({
      cards: cards.value,
      direction: deck.direction,
      reviews: effectiveStates(
        reviews.value.sm2,
        reviews.value.fsrs,
        prefs.scheduler,
        prefs.dayBoundaryHour,
      ),
      prefs: studyPrefs,
      now,
      random,
    });
    return { dueCount: queue.due.length, newCount: queue.newPrompts.length };
  }

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

  async function checkInstance(instanceUrl: string): Promise<ValidationReport> {
    const [decks, drafts, digest] = await Promise.all([
      deckRepository.listDecks(instanceUrl),
      releaseDraftRepository.documents(instanceUrl),
      digestStore.of(instanceUrl),
    ]);
    const unclaimed = await unclaimedDecksOf(decks);
    return withUnclaimed(
      await checkDocuments(
        instanceUrl,
        documentsToCheck(instanceUrl, decks, drafts, unclaimed),
        digest,
      ),
      unclaimed,
    );
  }

  /** The decks whose documents are unclaimed, each with those documents (DeckRepository.unclaimedDocuments). */
  async function unclaimedDecksOf(decks: readonly Deck[]): Promise<UnclaimedDeck[]> {
    const found = await Promise.all(
      decks.map(async (deck) => ({
        deckUrl: deck.url,
        title: deck.title,
        documents: await deckRepository.unclaimedDocuments(deck),
      })),
    );
    return found.filter((deck) => deck.documents.length > 0);
  }

  /**
   * The instance's documents, then its drafts': each with where it is,
   * which picks its shapes. An unclaimed document is not checked: it may
   * be anyone's, and a repair of what the check finds writes to it.
   */
  function documentsToCheck(
    instanceUrl: string,
    decks: readonly Deck[],
    drafts: readonly string[],
    unclaimed: readonly UnclaimedDeck[],
  ): { url: string; context: DocumentContext }[] {
    const skipped = new Set(unclaimed.flatMap((deck) => deck.documents.map(documentUrlOf)));
    return [
      ...instanceDocumentUrls(instanceUrl, decks)
        .filter((url) => !skipped.has(url))
        .map((url) => ({ url, context: "pod" as const })),
      ...drafts.map((url) => ({ url, context: "draft" as const })),
    ];
  }

  /** The check of these documents of the instance, each not checked again while still at the version the digest says conformed. */
  async function checkDocuments(
    instanceUrl: string,
    urls: readonly { url: string; context: DocumentContext }[],
    digest: InstanceDigest,
  ): Promise<ValidationReport> {
    const documents = await Promise.all(
      urls.map(async ({ url, context }): Promise<DocumentReport> => {
        const receipt = digest.receipts[url];
        const since = await shapeValidator.validateDocumentSince(
          url,
          receipt?.conformedTo === ruleset ? receipt.version : undefined,
          context,
        );
        if (since.unchanged) return { url, status: "checked", subjects: [] };
        if (since.version !== null && summarize(instanceUrl, [since.value]).conforms) {
          digestStore.remember(instanceUrl, noting(url, since.version, { conformedTo: ruleset }));
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
    const [decks, months, drafts] = await Promise.all([
      deckRepository.listDecks(instanceUrl),
      answerLog.months(instanceUrl),
      releaseDraftRepository.documents(instanceUrl),
    ]);
    const unclaimed = await unclaimedDecksOf(decks);
    const urls = [
      ...documentsToCheck(instanceUrl, decks, drafts, unclaimed),
      ...months.map((month) => ({
        url: historyUrlOf(instanceUrl, month),
        context: "pod" as const,
      })),
    ];
    let checked = 0;
    onChecked(checked, urls.length);
    const documents = await Promise.all(
      urls.map(async ({ url, context }) => {
        const document = await shapeValidator.validateDocument(url, context);
        onChecked(++checked, urls.length);
        return document;
      }),
    );
    return withUnclaimed(summarize(instanceUrl, documents), unclaimed);
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
    const report = await validateInstance(source);
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

  async function createInstance(
    session: Session,
    {
      containerUrl,
      name,
      registrationTarget,
    }: { containerUrl: string; name: string; registrationTarget: RegistrationTarget },
  ): Promise<Instance> {
    const instance = await instanceRepository.createInstance({
      webId: session.webId,
      containerUrl: containerUrl.trim(),
      name: name.trim(),
      registrationTarget,
    });
    await deckRepository.saveCatalog(instance.url, await catalogOf(session, instance.name));
    // Stated, so FSRS-6 is this instance's own choice, not a default: one with none stored studies by SM-2.
    await preferencesRepository.savePreferences(
      instance.url,
      preferenceStore.withDeviceAppearance(NEW_INSTANCE_PREFERENCES),
    );
    return instance;
  }

  /**
   * A new catalog for an instance: published by the session's owner,
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
  const drafts = createReleaseDraftUseCases({
    releaseDraftRepository,
    deckRepository,
    deckLibrary,
    shapeValidator,
    fileExchange,
    now,
  });
  return {
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
            publisher: (await catalogOf(session, catalog.title)).publisher,
          });
        }
        progress.stepped();
        for (const url of documents) {
          if (await instanceCopier.mentions(url, GUEST_ORIGIN))
            throw new AppError("guestUrlsLeft", { url });
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
    async claimDeckDocuments(instanceUrl, deckUrl) {
      const deck = (await deckRepository.listDecks(instanceUrl)).find(
        (listed) => listed.url === deckUrl,
      );
      if (deck === undefined) throw new AppError("deckGone", { deck: deckUrl });
      await deckRepository.claimDocuments(deck);
    },
    async checkDeck(instanceUrl, deck, text) {
      const [report, cards, release] = await Promise.all([
        Promise.all([digestStore.of(instanceUrl), unclaimedDecksOf([deck])]).then(
          async ([digest, unclaimed]) => {
            const skipped = new Set(unclaimed.flatMap((one) => one.documents));
            const urls = [deck.cardsDocumentUrl, deck.reviewsDocumentUrl].filter(
              (url) => !skipped.has(url),
            );
            return withUnclaimed(
              await checkDocuments(
                instanceUrl,
                [catalogUrlOf(instanceUrl), ...urls].map((url) => ({
                  url,
                  context: "pod" as const,
                })),
                digest,
              ),
              unclaimed,
            );
          },
        ),
        deckRepository.listCards(deck),
        // A release that cannot be read leaves the sides to settle unknown, not the rest of the check.
        deck.sourceUrl === undefined
          ? []
          : deckLibrary.fetchLibraryDeck(deck.sourceUrl).then(
              (release) => release.cards,
              () => undefined,
            ),
      ]);
      return deckHealth(deck, report, cards, release, text);
    },
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
      return instanceRepository.readDataClassRegistrations({
        webId: session.webId,
        instanceUrl: instance.url,
      });
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
      return deckRepository.saveDeck(
        withAbout(deck, { ...about, keywords: deckKeywords(about.keywords, deck) }),
      );
    },
    async setDeckPace(deck, pace) {
      return deckRepository.saveDeck(withPace(deck, pace));
    },
    setDeckProvenance(offered, provenance) {
      return again(async () => {
        const deck = await deckRepository.readDeck(offered.url);
        if (deck === null) throw new AppError("deckGone", { deck: offered.title });
        return deckRepository.saveDeck(withProvenance(deck, provenance));
      });
    },
    setDecksDirection(decks, direction) {
      return deckRepository.saveDecks(decks.map((deck) => ({ ...deck, direction })));
    },
    async setDecksPace(decks, pace) {
      return deckRepository.saveDecks(decks.map((deck) => withPace(deck, pace)));
    },
    async setDeckCardLanguage(deck, language) {
      // Checked and put in the case the app stores tags in before any write.
      return deckRepository.setCardLanguage(
        deck,
        withCardLanguage(deck, language).cardLanguage ?? null,
      );
    },
    removeDeck(deck) {
      return deckRepository.removeDeck(deck);
    },
    removeDecks(decks) {
      return deckRepository.removeDecks(decks);
    },
    listLibraryDecks() {
      return deckLibrary.listLibraryDecks();
    },
    importLibraryDeck,
    async listLibraryCards(deck) {
      return (await deckLibrary.fetchLibraryDeck(deck.url)).cards;
    },
    planLibraryUpgrade(deck, copy) {
      return planUpgrade(deck, () => deckRepository.listCards(deck), copy);
    },
    async listLibraryUpdates(instanceUrl) {
      const decks = await deckRepository.listDecks(instanceUrl);
      if (decks.every((deck) => deck.sourceUrl === undefined)) return [];
      const copies = libraryCopiesOf(decks, await deckLibrary.listLibraryDecks());
      // A creator's catalog links many releases, maybe of several copies: each is read once.
      const reads = new Map<string, Promise<LibraryDeck>>();
      return Promise.all(
        copies.map((copy) => (copy.series === null ? linkedCopy(copy, reads) : copy)),
      );
    },
    async readReleaseFromLink(text) {
      const url = releaseUrlOf(text);
      if (url === null) throw new AppError("releaseUrlInvalid", { url: text });
      // Read first: what cannot be read as a release says so, before any shape is loaded.
      const release = await deckLibrary.readRelease(url);
      await checkLinkedRelease(url);
      return release;
    },
    importReleaseFromUrl(instanceUrl, release) {
      return release.isCourse === true
        ? startCourse(instanceUrl, release)
        : importLibraryDeck(instanceUrl, release);
    },
    async deckRelease(deck) {
      return deck.sourceUrl === undefined ? null : deckLibrary.fetchLibraryDeck(deck.sourceUrl);
    },
    async reportPlace(releaseUrl) {
      const index = await deckLibrary.readLibraryIndex();
      if (index.releases.includes(releaseUrl)) return { library: true };
      const { contact } = await deckLibrary.fetchLibraryDeck(releaseUrl);
      return contact === undefined ? { library: false } : { library: false, contact };
    },
    async addReleaseLanguages(deck) {
      if (deck.sourceUrl === undefined) return null;
      const updated = withReleaseLanguages(
        deck,
        await deckLibrary.fetchLibraryDeck(deck.sourceUrl),
      );
      return updated === null ? null : deckRepository.saveDeck(updated);
    },
    async applyLibraryUpgrade(offered, offeredPlan, onProgress = () => undefined) {
      const progress = stepReporter<DeckUpgradeStep>("read", DECK_UPGRADE_STEPS.length, onProgress);
      /** Whether a document of the deck was written, or may have been (a write whose answer was lost). */
      let changed = false;
      /** Make one of the upgrade's writes: it changed the deck, unless its failure says it was never made. */
      const write = async (made: () => Promise<unknown>) => {
        try {
          await made();
        } catch (error) {
          if (!unsent(error)) changed = true;
          throw error;
        }
        changed = true;
      };
      let releaseUrl: string | undefined;
      try {
        // The deck, its cards, the releases (to plan again), and its review states when some are to go.
        progress.start();
        const deck = await deckRepository.readDeck(offered.url);
        if (deck === null) throw new AppError("deckGone", { deck: offered.title });
        if (deck.cardsDocumentUrl !== offered.cardsDocumentUrl)
          throw new AppError("deckChangedSinceOffer");
        const cards = await readNow(deckRepository.readCardsSince(deck, undefined));
        const plan = await planUpgrade(deck, async () => cards.value);
        if (plan === null || !sameCardChanges(plan, offeredPlan))
          throw new AppError("deckChangedSinceOffer");
        releaseUrl = plan.releaseUrl;
        // The states of the cards the release removes go with them, and those left of any it removed already.
        const removed = new Set([...plan.remove.map((card) => card.id), ...plan.gone]);
        const states =
          removed.size === 0 ? null : await reviewStateRepository.listReviewStates(deck);
        const of = <T extends ReviewKey>(list: readonly T[] = []) =>
          list.filter((state) => removed.has(state.cardId));
        const dropped = of(states?.sm2);
        const droppedFsrs = of(states?.fsrs);

        // The cards first, the deck readable with them, still naming the release it came from: written whole (a
        // PATCH of much text can be cut short, docs/testing.md), and only while the document is as the plan read it.
        progress.finished("cards");
        const save = upgradedCards(plan);
        if (save.length + plan.remove.length > 0) {
          await write(() =>
            deckRepository.applyCardChanges(
              deck,
              { save, remove: plan.remove.map((card) => card.id) },
              { whole: true, ...(cards.version === null ? {} : { version: cards.version }) },
            ),
          );
        }
        // Then the review states of the cards removed, when there are any.
        progress.finished("reviews");
        if (dropped.length + droppedFsrs.length > 0)
          await write(() =>
            reviewStateRepository.applyReviewChanges(deck, {
              save: [],
              remove: dropped,
              fsrs: { save: [], remove: droppedFsrs },
            }),
          );
        // Last the entry, which moves the deck to the new release, only while it says what was read.
        progress.finished("entry");
        const upgraded = await deckRepository.upgradeDeckEntry(
          deck,
          applyLibraryUpgrade(deck, plan),
        );
        progress.finished();
        return { ok: true, deck: upgraded };
      } catch (error) {
        const step = progress.step();
        if (step === "entry" && !unsent(error)) {
          // A write of the entry whose answer was lost may have been made: the entry says, when it can be read.
          const deck = await deckRepository.readDeck(offered.url).catch(() => undefined);
          if (deck === undefined) changed = true;
          else if (deck !== null && deck.sourceUrl === releaseUrl) return { ok: true, deck };
        }
        // Nothing is put back: the deck reads as its documents are, and planned again, the upgrade finishes.
        return { ok: false, step, error, changed };
      }
    },
    listCards(deck) {
      return deckRepository.listCards(deck);
    },
    listDeckReviewStates(deck) {
      return reviewStateRepository.listReviewStates(deck);
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
    editCards(instanceUrl, deck, ids, edit, previewed) {
      return writeCardEdit(instanceUrl, deck, (cards, reviews) => {
        const plan = planCardEdit(cards, ids, edit, reviews);
        if (!sameCardEditPlan(plan, previewed))
          throw new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
        return plan;
      });
    },
    async undoCardEdit(instanceUrl, deck, plan) {
      await writeCardEdit(instanceUrl, deck, (cards) => {
        const inverse = planUndo(cards, plan);
        if (inverse === null)
          throw new AppError("changedElsewhere", { url: deck.cardsDocumentUrl });
        return inverse;
      });
    },
    async resetCards(instanceUrl, deck, ids, direction) {
      const states = await reviewStateRepository.listReviewStates(deck);
      // An FSRS-6 state without an SM-2 state beside it goes too: every removes both kinds.
      const remove = resetStates([...states.sm2, ...states.fsrs], ids, direction);
      return writeReviewEdit(instanceUrl, deck, { save: [], remove });
    },
    async rescheduleCards(instanceUrl, deck, ids, due, direction) {
      if (!isStudyDay(due)) throw new AppError("dueDayInvalid", { day: due });
      const states = await reviewStateRepository.listReviewStates(deck);
      // Both schedulers' states fall due that day, so it holds whichever sets the due days.
      return writeReviewEdit(instanceUrl, deck, {
        save: rescheduleStates(states.sm2, ids, due, direction),
        remove: [],
        fsrsSave: rescheduleStates(states.fsrs, ids, due, direction),
      });
    },
    async transferCards(instanceUrl, from, to, ids, options) {
      if (from.url === to.url) throw new AppError("cardTransferSameDeck");
      for (let attempt = 1; ; attempt++) {
        try {
          const plan = await transferOnce(from, to, ids, options);
          // The cards are where they go: a digest left behind is brought up to date by the next deck list.
          await digestStore.refresh(instanceUrl, to).catch(() => undefined);
          if (options.mode === "move")
            await digestStore.refresh(instanceUrl, from).catch(() => undefined);
          return plan;
        } catch (error) {
          if (!cardsChangedElsewhere(error) || attempt === CARD_EDIT_ATTEMPTS) throw error;
        }
      }
    },
    async exportDeckFile(deck, options) {
      const text = await deckArchive.exportDeck(deck, options);
      fileExchange.save(
        deckFileName(deck, options.format),
        DECK_FILE_TYPES[options.format].mediaType,
        text,
      );
    },
    async openDeckFile() {
      const picked = await fileExchange.open(DECK_FILE_ACCEPT);
      if (picked === null) return null;
      const format = deckFileFormatOf(picked.name, picked.text);
      return {
        name: picked.name,
        format,
        content: await deckArchive.readDeckFile(picked.text, format, deckFileBaseOf(picked.name)),
      };
    },
    async importDeckFile(instanceUrl, file, { withProgress }) {
      let decks = await deckRepository.listDecks(instanceUrl);
      for (let attempt = 1; ; attempt++) {
        const { deck, cards, reviews, fsrsReviews } = importedDeck(instanceUrl, file.content, {
          withProgress,
          decks,
          freshId: `deck-${newId()}`,
          now: now().toISOString(),
        });
        try {
          // Only where nothing is yet: a deck's documents are never written over.
          await deckRepository.applyCardChanges(
            deck,
            { save: cards, remove: [] },
            { whole: true, version: ABSENT_VERSION },
          );
        } catch (error) {
          // A cards document an import cut off before its entry left: the deck takes another id.
          if (!(error instanceof AppError && error.code === "createdElsewhere") || attempt === 2)
            throw error;
          decks = [...decks, deck];
          continue;
        }
        if (reviews.length + fsrsReviews.length > 0)
          await reviewStateRepository.applyReviewChanges(deck, {
            save: reviews,
            remove: [],
            fsrs: { save: fsrsReviews, remove: [] },
          });
        await deckRepository.registerDeck(deck);
        // The deck is in: a digest left behind is brought up to date by the next deck list.
        await digestStore.refresh(instanceUrl, deck).catch(() => undefined);
        return deck;
      }
    },
    planMigration: (instanceUrl) => planOf(instanceUrl),
    async updateInstance(session, instance, onProgress = () => undefined) {
      const instanceUrl = ensureTrailingSlash(instance.url);
      const progress = stepReporter<UpdateStep>("read", UPDATE_STEPS.length, onProgress);
      progress.start();
      // Read afresh: part of what the user agreed to may have been updated meanwhile, elsewhere.
      const work = await updateWork(session, instanceUrl);
      progress.finished("write", work.length > 0 ? work.length : undefined);
      const updated: UpdateDocument[] = [];
      const failed: UpdateFailure[] = [];
      for (const { document, writes } of work) {
        // Each document on its own: one that cannot be updated now is left as it is, and the others go on.
        try {
          let wrote = false;
          for (const write of writes) if (await write()) wrote = true;
          if (wrote) updated.push(document);
        } catch (error) {
          failed.push({ ...document, error });
        }
        progress.stepped();
      }
      progress.finished("register");
      // Other apps find each kind of the instance's data by its class; the instance works without, and Preferences adds them later.
      if (failed.length === 0) {
        await instanceRepository
          .registerDataClasses({ webId: session.webId, instanceUrl, title: instance.name })
          .catch(() => undefined);
      }
      progress.finished();
      return { updated, failed };
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
    getPreferences: preferenceStore.get,
    async renameInstance(session, instance, typed) {
      const name = instanceName(typed);
      await again(async () => {
        const meta = await instanceRepository.readMeta(instance.url);
        if (meta === null) throw new AppError("noMetaToUpdate", { url: instance.url });
        if (meta.name !== name) await instanceRepository.saveMeta(instance.url, { ...meta, name });
      });
      await again(async () => {
        const catalog = await deckRepository.readCatalog(instance.url);
        if (catalog !== null && catalog.title !== name)
          await deckRepository.saveCatalog(instance.url, renamedCatalog(catalog, name));
      });
      await instanceRepository.renameRegistrations({
        webId: session.webId,
        instanceUrl: instance.url,
        title: name,
      });
      return { ...instance, name };
    },
    readCatalog(instanceUrl) {
      return deckRepository.readCatalog(instanceUrl);
    },
    describeCatalog(instanceUrl, about) {
      return again(async () => {
        const catalog = await deckRepository.readCatalog(instanceUrl);
        if (catalog === null) throw new AppError("noCatalogToUpdate", { url: instanceUrl });
        const described = describedCatalog(catalog, about);
        await deckRepository.saveCatalog(instanceUrl, described);
        return described;
      });
    },
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
    async getStudyQueue(instanceUrl, deck, now) {
      const [cards, reviews, prefs] = await Promise.all([
        deckRepository.listCards(deck),
        reviewStateRepository.listReviewStates(deck),
        preferenceStore.get(instanceUrl),
      ]);
      const queue = buildStudyQueue({
        cards,
        direction: deck.direction,
        reviews: effectiveStates(reviews.sm2, reviews.fsrs, prefs.scheduler, prefs.dayBoundaryHour),
        prefs: deckPreferences(prefs, deck),
        now,
        random,
      });
      return { ...queue, prefs, states: reviews.sm2, fsrsStates: reviews.fsrs };
    },
    getStudyCounts(instanceUrl, deck, now) {
      return studyCountsAndSchedule(instanceUrl, deck, now);
    },
    refreshStudyDigest: digestStore.refresh,
    recordReview(instanceUrl, deck, prompt, quality, now, times = {}, known) {
      return answerStore.grade(
        instanceUrl,
        deck,
        { cardId: prompt.card.id, cardUrl: prompt.card.url, direction: prompt.direction },
        quality,
        now,
        { times },
        known,
      );
    },
    async undoReview(instanceUrl, deck, { key, before, fsrs, answer }) {
      const back = <T>(state: T | null) =>
        state === null ? { save: [], remove: [key] } : { save: [state], remove: [] };
      // Both states as they were, in one save: FSRS-6's only when the answer wrote it.
      await reviewStateRepository.applyReviewChanges(deck, {
        ...back(before),
        ...(fsrs === undefined ? {} : { fsrs: back(fsrs.before) }),
      });
      // The answer never happened: off the answers on their way to the log, else out of it.
      await answerStore.withdraw(instanceUrl, answer);
      return before;
    },
    async resetStudyDay(instanceUrl, deck, now) {
      const [prefs, reviews] = await Promise.all([
        preferenceStore.get(instanceUrl),
        reviewStateRepository.listReviewStates(deck),
      ]);
      const reset = resetStudyDay(reviews.sm2, now, prefs.dayBoundaryHour);
      const count = reset.restore.length + reset.remove.length;
      if (count > 0) {
        // FSRS-6's states of the day go back with SM-2's, in the same save.
        const fsrs = resetFsrsStudyDay(reviews.fsrs, now, prefs.dayBoundaryHour);
        await reviewStateRepository.applyReviewChanges(deck, {
          save: reset.restore,
          remove: reset.remove,
          fsrs: { save: fsrs.restore, remove: fsrs.remove },
        });
        // The day never happened: its answers leave the log too, those still on their way first.
        await answerStore.removeDay(instanceUrl, deck.url, studyDayOf(now, prefs.dayBoundaryHour));
      }
      return count;
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
    startCourse,
    async getCourse(offered) {
      const deck = await deckRepository.readDeck(offered.url);
      if (deck === null) throw new AppError("deckGone", { deck: offered.title });
      const [release, { outline, answeredCardIds }] = await Promise.all([
        deckLibrary.fetchLibraryDeck(sourceOf(deck)),
        courseSummary(deck),
      ]);
      return {
        deck,
        release,
        outline,
        cards: Object.fromEntries(release.cards.map((card) => [card.id, card])),
        answeredCardIds,
        progress: courseProgress(outline, answeredCardIds, deck.completedChapters ?? []),
      };
    },
    getCourseSummary: courseSummary,
    async answerCourseQuestion(instanceUrl, deck, card, choice, now, times = {}) {
      const prompt = {
        cardId: card.id,
        cardUrl: `${deck.cardsDocumentUrl}#${card.id}`,
        direction: "front-to-back" as const,
      };
      const [prefs, current] = await Promise.all([
        preferenceStore.get(instanceUrl),
        reviewStateRepository.getReviewState(deck, {
          cardId: card.id,
          direction: prompt.direction,
        }),
      ]);
      // Whether the card is due goes by what sets its due day: under FSRS-6, its state's.
      const due = current.sm2 === null ? null : promptDueOf(current.sm2, current.fsrs, prefs);
      const effect = courseAnswerEffect(due, choice.correct, now, prefs.dayBoundaryHour);
      if (effect.kind === "none") return { effect: "none", state: current.sm2 };
      // The card joins the deck before its first state, so no state is ever without its card.
      if (effect.kind === "introduce")
        await deckRepository.applyCardChanges(deck, { save: [card], remove: [] });
      const chosen =
        choice.correct || choice.distractorId === undefined
          ? undefined
          : `${deck.cardsDocumentUrl}#${choice.distractorId}`;
      const { state } = await answerStore.grade(
        instanceUrl,
        deck,
        prompt,
        effect.grade,
        now,
        {
          mode: "multiple-choice",
          ...(chosen === undefined ? {} : { chosenDistractor: chosen }),
          times,
        },
        { prefs },
      );
      return { effect: effect.kind, state };
    },
    completeChapter(deck, chapterUrl) {
      return deckRepository.completeChapter(deck, chapterUrl);
    },
    setCompletedChapters(deck, edit) {
      return deckRepository.setCompletedChapters(deck, edit);
    },
    async openTrial(draft, instanceUrl) {
      const problems = trialProblems(draftReleaseModel(draft));
      if (problems.length > 0) return { ok: false, problems };
      const prefs = await preferenceStore.get(instanceUrl);
      return { ok: true, trial: await startTrial(trialSandbox(draft), draft, prefs) };
    },
  };
}
