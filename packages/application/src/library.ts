// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { shown } from "@solid-memo/domain/langText";
import {
  isCopyOf,
  libraryCopiesOf,
  newestRelease,
  offersNewerRelease,
  releaseHost,
  releaseUrlOf,
  type LibraryCopy,
} from "@solid-memo/domain/library";
import type { Card, Deck } from "@solid-memo/domain/deck";
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
  sameCardChanges,
  type DeckUpgradeOutcome,
  type DeckUpgradeProgress,
  type DeckUpgradeStep,
} from "@solid-memo/domain/deckUpgrade";
import type { ReviewKey } from "@solid-memo/domain/review";
import type { DeckLibrary, DeckRepository, ReviewStateRepository, ShapeValidator } from "./ports";
import { AppError } from "@solid-memo/domain/appError";
import type { CourseUseCases } from "./courses";
import { readNow, unsent } from "./writes";
import { stepReporter } from "./progress";

export interface LibraryUseCases {
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
   * is not from the library). Nothing the user wrote changes. Only a copy
   * of a series the library's index lists: a release added from a link
   * stays where its server keeps it, which can change it at any time, so
   * its texts come only with an upgrade the user agrees to.
   */
  addReleaseLanguages(deck: Deck): Promise<Deck | null>;
  /**
   * The library release an imported deck was copied from, as it is in
   * the library; null for a deck not from the library. The forms leave a
   * text that is still the release's as it is (see sameText). Writes nothing.
   */
  deckRelease(deck: Deck): Promise<LibraryDeckContent | null>;
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
}

/**
 * The deck library (docs/deck-library.md): its decks looked through and
 * imported, a release added from a link, checked against the library's
 * shapes first, and an imported deck upgraded to a newer release of its
 * series (domain/deckUpgrade.ts, docs/migrations.md).
 */
export function createLibraryUseCases({
  deckLibrary,
  deckRepository,
  reviewStateRepository,
  shapeValidator,
  courses,
}: {
  deckLibrary: DeckLibrary;
  deckRepository: DeckRepository;
  reviewStateRepository: ReviewStateRepository;
  shapeValidator: ShapeValidator;
  courses: Pick<CourseUseCases, "startCourse">;
}): LibraryUseCases {
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

  return {
    listLibraryDecks() {
      return deckLibrary.listLibraryDecks();
    },
    importLibraryDeck,
    async listLibraryCards(deck) {
      return (await deckLibrary.fetchLibraryDeck(deck.url)).cards;
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
        ? courses.startCourse(instanceUrl, release)
        : importLibraryDeck(instanceUrl, release);
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
    async addReleaseLanguages(deck) {
      if (deck.sourceUrl === undefined) return null;
      const indexed = await deckLibrary.listLibraryDecks();
      if (!indexed.some((libraryDeck) => isCopyOf(deck, libraryDeck))) return null;
      const updated = withReleaseLanguages(
        deck,
        await deckLibrary.fetchLibraryDeck(deck.sourceUrl),
      );
      return updated === null ? null : deckRepository.saveDeck(updated);
    },
    async deckRelease(deck) {
      return deck.sourceUrl === undefined ? null : deckLibrary.fetchLibraryDeck(deck.sourceUrl);
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
  };
}
