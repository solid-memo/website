// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

/**
 * Every use case, run on a pod that holds what a later version of Solid
 * Memo may add to it (testing/laterData.ts): a write keeps what it does
 * not own (docs/vocab.md "Versioning policy", docs/data-model.md "Write
 * discipline"). The app and its Solid adapters are wired as
 * createAppUseCases wires them (testing/wiredApp.ts), over local pods.
 *
 * ROWS has one row per use case, typed over UseCases, so a new use case
 * without a row fails the typecheck. After every request that writes,
 * and once the row is done, each seed is still in its document, or the
 * row says where it went:
 *
 * - `gone`: the use case removes the subject, which is what was asked
 *   (WHY lists the reasons a row may give);
 * - `moved`: the use case removes its source, and the seed is at the
 *   address the row gives;
 * - `copied`: the source stays, and its terms are on the copy too.
 *
 * A subject of a class or a scheduler the app does not know is never
 * changed: it holds its seeds and nothing else.
 *
 * What the seeds leave out, and why:
 *
 * - a color set, whose shape is closed: no term may be added to one;
 * - an export, an import from a file or the library and a release
 *   published write what this app reads of their source, in a file or
 *   at a new address: those rows state no `copied`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import type { UseCases } from "@solid-memo/application/useCases";
import type { ResourceStore } from "@solid-memo/application/ports";
import { planCardEdit } from "@solid-memo/domain/cardBulk";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { GUEST_ORIGIN, GUEST_SESSION, GUEST_WEBID } from "@solid-memo/domain/guest";
import type { Instance } from "@solid-memo/domain/instance";
import type { LibraryDeck } from "@solid-memo/domain/library";
import type { CustomPalette } from "@solid-memo/domain/customPalette";
import { DEFAULT_PALETTE } from "@solid-memo/domain/palette";
import type { MarkdownCheck } from "@solid-memo/domain/release/markdownFields";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { SITE } from "@solid-memo/vocab/ns";
import type { ShapeName } from "@solid-memo/vocab/types.generated";
import { SM, SM_NS } from "./vocab";
import { LATER, laterThingOf, missing, seed, type Seed } from "./testing/laterData";
import {
  copyOf,
  type ExchangedFile,
  POD,
  SESSION,
  type Site,
  siteOf,
  triplesOf,
  WEB_ID,
  wiredApp,
} from "./testing/wiredApp";

/** A Tuesday noon: the study day every row runs on. */
const NOW = new Date("2026-11-10T12:00:00.000Z");
const NEXT_DAY = new Date("2026-11-11T12:00:00.000Z");
const INSTANCE = `${POD}solid-memo/main/`;

/** What a row says of the seeds its use case does not leave in place. */
interface Explained {
  /** The seeds on what the use case removes, which is what was asked of it. */
  removed?: (seed: Seed) => boolean;
  /** The line a seed that is gone is found as, anywhere in the pods. */
  moved?: (line: string) => string;
  /** The seeds on what the use case copies, its source staying, and the line each is found as on the copy. */
  copied?: { seeds: (seed: Seed) => boolean; as: (line: string) => string };
}

/** The pod every row starts from, and what a row needs to name in it. */
interface World {
  /** The site every row reads, its shapes and releases held once. */
  site: Site;
  store: ResourceStore;
  guestStore: ResourceStore;
  seeds: Seed[];
  instance: Instance;
  /** A deck of the user's own, with three cards, two of them studied. */
  capitals: Deck;
  cards: Card[];
  /** A second deck of the user's own, in a group, with one card. */
  other: Deck;
  group: string;
  /** A course under way. */
  course: Deck;
  courseRelease: LibraryDeck;
  /** A copy of an earlier release of a library deck. */
  copy: Deck;
  palette: CustomPalette;
  /** A draft made from `capitals`, and the release it was published as. */
  published: ReleaseDraftSummary;
  release: string;
  /** A draft not yet published. */
  draft: ReleaseDraftSummary;
  guestInstance: Instance;
  guestDeck: Deck;
}

/** What a row runs with: the app over a copy of the world's pods. */
interface Run extends World {
  u: UseCases;
  saved: ExchangedFile[];
  toOpen: ExchangedFile[];
}

type Row = (run: Run) => Promise<Explained | void>;

const markdownCheck: MarkdownCheck = {
  problems: () => [],
  chunks: () => ({ chunks: 1, empty: 0 }),
};

const LIBRARY = `${SITE}decks/`;
const libraryDeck = async (u: UseCases, name: string): Promise<LibraryDeck> => {
  const deck = (await u.listLibraryDecks()).find(({ url }) => url.startsWith(`${LIBRARY}${name}/`));
  if (deck === undefined) throw new Error(`The library has no deck ${name}.`);
  return deck;
};

/** The first question of a course's release. */
async function firstQuestion(u: UseCases, release: LibraryDeck) {
  const course = await u.getLibraryCourse(release);
  const step = course.outline.chapters.flatMap(({ steps }) => steps).find((s) => s.questionIds[0]);
  const card = course.cards.get(step!.questionIds[0]!);
  if (card === undefined) throw new Error("The course asks no question.");
  return card;
}

/** The deck with what a release says of one: a description, an author and a license. */
async function described(u: UseCases, deck: Deck): Promise<Deck> {
  const about = await u.describeDeck(deck, {
    description: { en: "The capitals of the Nordic countries." },
    topics: [],
    keywords: { en: ["capitals"] },
  });
  return u.setDeckProvenance(about, {
    authors: ["Alice <alice@example.org>"],
    license: "https://creativecommons.org/licenses/by/4.0/",
  });
}

/** A pod that holds every kind of data the app writes, and a guest's study beside it. */
async function buildWorld(): Promise<World> {
  const site = siteOf();
  const app = wiredApp({ now: () => NOW, site });
  const u = app.useCases;
  await app.fetch(`${POD}profile/card`, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: `<#me> <http://xmlns.com/foaf/0.1/name> "Alice" ; <http://www.w3.org/ns/pim/space#storage> <${POD}> .`,
  });
  const instance = await u.createInstance(SESSION, {
    containerUrl: INSTANCE,
    name: "Main",
    registrationTarget: "private",
  });

  let capitals = await u.createDeck(INSTANCE, { en: "Capitals" });
  const cards = [
    await u.addCard(capitals, {
      front: { en: "Sweden" },
      back: { en: "Stockholm" },
      distractors: [{ id: "wrong-oslo", text: { en: "Oslo" } }],
    }),
    await u.addCard(capitals, { front: { en: "Norway" }, back: { en: "Oslo" } }),
    await u.addCard(capitals, { front: { en: "Denmark" }, back: { en: "Copenhagen" } }),
  ];
  capitals = await described(u, capitals);
  // The first two cards are studied; the third stays new.
  const queue = await u.getStudyQueue(INSTANCE, capitals, NOW);
  for (const { id } of cards.slice(0, 2)) {
    const prompt = queue.newPrompts.find(({ card }) => card.id === id)!;
    await u.recordReview(INSTANCE, capitals, prompt, 4, NOW);
  }

  const other = await described(u, await u.createDeck(INSTANCE, { en: "Other" }));
  await u.addCard(other, { front: { en: "Finland" }, back: { en: "Helsinki" } });
  const group = u.newDeckGroup(INSTANCE, { en: "Geography" });
  await u.editDeckTree(INSTANCE, {
    kind: "graft",
    nodes: [{ kind: "group", group, children: [{ kind: "deck", url: other.url }] }],
  });

  const courseRelease = await libraryDeck(u, "korean-at-the-table");
  let course = await u.startCourse(INSTANCE, courseRelease);
  const question = await firstQuestion(u, courseRelease);
  await u.answerCourseQuestion(INSTANCE, course, question, { correct: true }, NOW);
  const { chapters } = (await u.getCourse(course)).outline;
  course = await u.completeChapter(course, chapters[0]!.url);

  const earlier = await u.readReleaseFromLink(`${LIBRARY}greek-alphabet/v1.ttl`);
  const copy = await u.importReleaseFromUrl(INSTANCE, earlier);

  const prefs = await u.getPreferences(INSTANCE);
  await u.savePreferences(INSTANCE, { ...prefs, newCardsPerDay: 7 });
  await u.switchScheduler(INSTANCE, { ...prefs, newCardsPerDay: 7, scheduler: "fsrs6" });
  const palette = await u.savePalette(INSTANCE, {
    url: null,
    title: { en: "Mine" },
    basedOn: DEFAULT_PALETTE,
    light: {},
    dark: {},
  });
  await u.chooseCustomPalette(palette, INSTANCE);

  const first = await u.createReleaseDraft(INSTANCE, { kind: "fromDeck", deck: capitals }, WEB_ID);
  const release = `${INSTANCE}releases/${first!.draft.name}/v1.ttl`;
  await u.publishRelease(first!.draft.url, release, markdownCheck);
  const second = await u.createReleaseDraft(INSTANCE, { kind: "fromDeck", deck: other }, WEB_ID);
  const drafts = await u.listReleaseDrafts(INSTANCE);
  const draftAt = (url: string) => drafts.find((draft) => draft.url === url)!;

  // What is worked out from the rest: the digest, with its receipts, and the month's summary.
  await u.getStatistics(INSTANCE, NOW);
  await u.refreshStudyDigest(INSTANCE, capitals);
  await u.checkInstance(INSTANCE);

  await u.startGuest("Guest study");
  const [guestInstance] = await u.listInstances(GUEST_SESSION);
  const guestDeck = await u.createDeck(guestInstance!.url, { en: "On the way" });
  await u.addCard(guestDeck, { front: { en: "Iceland" }, back: { en: "Reykjavik" } });
  const guestQueue = await u.getStudyQueue(guestInstance!.url, guestDeck, NOW);
  await u.recordReview(guestInstance!.url, guestDeck, guestQueue.newPrompts[0]!, 4, NOW);
  await app.settled();

  const report = await u.validateInstance(INSTANCE);
  expect(report.conforms).toBe(true);
  const seeds = [...(await seed(app.store)), ...(await seed(app.guestStore))];
  const [capitalsNow, otherNow, courseNow, copyNow] = await Promise.all(
    [capitals, other, course, copy].map(async (deck) =>
      (await u.listDecks(INSTANCE)).find(({ url }) => url === deck.url),
    ),
  );
  return {
    site,
    store: app.store,
    guestStore: app.guestStore,
    seeds,
    instance,
    capitals: capitalsNow!,
    cards,
    other: otherNow!,
    group: group.url,
    course: courseNow!,
    courseRelease,
    copy: copyNow!,
    palette,
    published: draftAt(first!.draft.url),
    release,
    draft: draftAt(second!.draft.url),
    guestInstance: guestInstance!,
    guestDeck,
  };
}

/** The seeds on what the app knows: a term, never a statement of a later version's subject. */
const known = ({ kind }: Seed) => kind === "term";

/** The seeds on the subjects whose address holds one of `parts`: a deck's id, a card's. */
const about =
  (...parts: string[]) =>
  (one: Seed) =>
    known(one) && parts.some((part) => one.subject.includes(part));

/** Nothing of a pod is asked for or written: the use case is the device's, or the sign-in's. */
const local = (use: (u: UseCases) => unknown): Row => {
  return async ({ u }) => void (await use(u));
};

const MOVED = `${POD}solid-memo/moved/`;
const IDP = "https://idp.example/";
const textCheck = { plain: (text: string) => text, check: () => [] };

const ROWS: { [Name in keyof UseCases]: Row } = {
  // The session and the account.
  restoreSession: local((u) => u.restoreSession()),
  loginWithWebId: local((u) => u.loginWithWebId(WEB_ID)),
  loginWithProvider: local((u) => u.loginWithProvider(IDP)),
  logout: local((u) => u.logout()),
  hasStoredSession: local((u) => u.hasStoredSession()),
  forgetStoredSession: local((u) => u.forgetStoredSession()),
  onLoggedOutElsewhere: local((u) => u.onLoggedOutElsewhere(() => undefined)()),
  onSessionExpired: local((u) => u.onSessionExpired(() => undefined)()),
  discoverAccount: async ({ u }) => void (await u.discoverAccount(SESSION)),
  viewWebIdDocument: async ({ u }) => void (await u.viewWebIdDocument(SESSION)),

  // A guest's study.
  startGuest: async ({ u }) => void (await u.startGuest("Again")),
  discardGuest: async ({ u }) => {
    await u.discardGuest();
    // The whole pod goes with the guest: it is this browser's alone.
    return { removed: ({ document }) => document.startsWith(GUEST_ORIGIN) };
  },
  findGuestStudy: async ({ u }) => void (await u.findGuestStudy()),
  transferGuestStudy: async ({ u, guestInstance }) => {
    const outcome = await u.transferGuestStudy(SESSION, guestInstance, {
      containerUrl: MOVED,
      registrationTarget: "private",
    });
    expect(outcome).toMatchObject({ ok: true, tidied: true });
    return {
      // The profile and the type index are the guest pod's own, and go with it.
      removed: ({ document }) =>
        document.startsWith(GUEST_ORIGIN) && !document.startsWith(guestInstance.url),
      moved: (line) => line.replaceAll(guestInstance.url, MOVED).replaceAll(GUEST_WEBID, WEB_ID),
    };
  },
  planGuestMerge: async ({ u, guestInstance, instance }) =>
    void (await u.planGuestMerge(guestInstance, instance)),
  mergeGuestStudy: async ({ u, guestInstance, instance }) => {
    const outcome = await u.mergeGuestStudy(SESSION, guestInstance, instance);
    // Adding a study writes what this app reads of it: one a later version wrote is not added, and stays.
    expect(outcome).toMatchObject({ ok: false, step: "read", error: { code: "guestStudyTooNew" } });
  },
  findInterruptedGuestMove: async ({ u, guestInstance }) =>
    void (await u.findInterruptedGuestMove(SESSION, guestInstance)),
  removeInterruptedGuestMove: async ({ u, guestInstance }) =>
    void (await u.removeInterruptedGuestMove(SESSION, guestInstance)),

  // Instances.
  listStorages: async ({ u }) => void (await u.listStorages(SESSION)),
  addManualStorage: async ({ u }) => void (await u.addManualStorage(POD)),
  listInstances: async ({ u }) => void (await u.listInstances(SESSION)),
  isInOwnPod: async ({ u }) => void (await u.isInOwnPod(INSTANCE)),
  getRegistrationOptions: async ({ u }) => void (await u.getRegistrationOptions(SESSION)),
  createInstance: async ({ u }) =>
    void (await u.createInstance(SESSION, {
      containerUrl: `${POD}solid-memo/second/`,
      name: "Second",
      registrationTarget: "private",
    })),
  attachInstanceByUrl: async ({ u, instance }) => {
    await u.detachInstance(SESSION, instance);
    await u.attachInstanceByUrl(SESSION, INSTANCE, "private");
    return { removed: ({ document }) => document.includes("TypeIndex") };
  },
  deleteInstance: async ({ u, instance }) => {
    await u.deleteInstance(SESSION, instance);
    // Solid Memo's data goes, what a later version of it wrote too, and the registration.
    // A state of a scheduler this app does not know is not its to judge, and stays.
    return {
      removed: (one) =>
        one.kind !== "state" &&
        (one.document.startsWith(INSTANCE) || one.document.includes("TypeIndex")),
    };
  },
  detachInstance: async ({ u, instance }) => {
    await u.detachInstance(SESSION, instance);
    return { removed: (one) => known(one) && one.subject.includes("TypeIndex.ttl#") };
  },
  oldRegistrations: async ({ u, instance }) => void (await u.oldRegistrations(SESSION, instance)),
  removeOldRegistrations: async ({ u, instance }) =>
    void (await u.removeOldRegistrations(SESSION, instance)),
  renameInstance: async ({ u, instance }) =>
    void (await u.renameInstance(SESSION, instance, "Renamed")),
  readCatalog: async ({ u }) => void (await u.readCatalog(INSTANCE)),
  describeCatalog: async ({ u }) =>
    void (await u.describeCatalog(INSTANCE, { description: "Everything I study." })),
  planMigration: async ({ u }) => void (await u.planMigration(INSTANCE)),
  updateInstance: async ({ u, instance }) => void (await u.updateInstance(SESSION, instance)),

  // Preferences.
  language: local((u) => u.language(["sv"])),
  chooseLanguage: local((u) => u.chooseLanguage("sv")),
  themeChoice: local((u) => u.themeChoice()),
  instanceTheme: async ({ u }) => void (await u.instanceTheme(INSTANCE)),
  chooseTheme: async ({ u }) => void (await u.chooseTheme("dark", INSTANCE)),
  paletteChoice: local((u) => u.paletteChoice()),
  customPaletteChoice: local((u) => u.customPaletteChoice()),
  instancePalette: async ({ u }) => void (await u.instancePalette(INSTANCE)),
  choosePalette: async ({ u }) => void (await u.choosePalette(DEFAULT_PALETTE, INSTANCE)),
  chooseCustomPalette: async ({ u, palette }) =>
    void (await u.chooseCustomPalette(palette, INSTANCE)),
  listPalettes: async ({ u }) => void (await u.listPalettes(INSTANCE)),
  savePalette: async ({ u, palette }) =>
    void (await u.savePalette(INSTANCE, { ...palette, title: { en: "Renamed" } })),
  textSizeChoice: local((u) => u.textSizeChoice()),
  instanceTextSize: async ({ u }) => void (await u.instanceTextSize(INSTANCE)),
  chooseTextSize: async ({ u }) => void (await u.chooseTextSize("large", INSTANCE)),
  getPreferences: async ({ u }) => void (await u.getPreferences(INSTANCE)),
  preferencesMisfit: async ({ u }) => void (await u.preferencesMisfit(INSTANCE)),
  savePreferences: async ({ u }) =>
    void (await u.savePreferences(INSTANCE, {
      ...(await u.getPreferences(INSTANCE)),
      maxReviewsPerDay: 50,
    })),
  switchScheduler: async ({ u }) =>
    void (await u.switchScheduler(INSTANCE, {
      ...(await u.getPreferences(INSTANCE)),
      scheduler: "sm2",
    })),
  dismissSchedulerInvitation: async ({ u }) => void (await u.dismissSchedulerInvitation(INSTANCE)),
  connectedScreenChoice: async ({ u }) => void (await u.connectedScreenChoice(SESSION)),
  skipConnectedScreen: async ({ u, instance }) => void (await u.skipConnectedScreen([instance])),
  connectedScreenShown: async ({ u }) => void (await u.connectedScreenShown(INSTANCE)),
  chooseConnectedScreen: async ({ u }) => void (await u.chooseConnectedScreen(INSTANCE, false)),

  // Decks.
  listDecks: async ({ u }) => void (await u.listDecks(INSTANCE)),
  createDeck: async ({ u }) => void (await u.createDeck(INSTANCE, { en: "New" })),
  renameDeck: async ({ u, capitals }) => void (await u.renameDeck(capitals, { en: "Renamed" })),
  listDeckTree: async ({ u }) => void (await u.listDeckTree(INSTANCE)),
  newDeckGroup: local((u) => u.newDeckGroup(INSTANCE, { en: "Group" })),
  editDeckTree: async ({ u, capitals, group }) => {
    await u.editDeckTree(INSTANCE, { kind: "rename", group, title: { en: "Places" } });
    await u.editDeckTree(INSTANCE, {
      kind: "move",
      node: capitals.url,
      to: { parent: group, after: null },
    });
    await u.editDeckTree(INSTANCE, { kind: "removeGroup", group });
    return { removed: about(group) };
  },
  setDeckDirection: async ({ u, capitals }) =>
    void (await u.setDeckDirection(capitals, "bidirectional")),
  describeDeck: async ({ u, capitals }) =>
    void (await u.describeDeck(capitals, {
      description: { en: "Where the governments sit." },
      topics: [],
      keywords: {},
    })),
  setDeckPace: async ({ u, capitals }) =>
    void (await u.setDeckPace(capitals, { newCardsPerDay: 3 })),
  setDeckProvenance: async ({ u, capitals }) =>
    void (await u.setDeckProvenance(capitals, { authors: ["Bob"] })),
  setDecksDirection: async ({ u, capitals, other }) =>
    void (await u.setDecksDirection([capitals, other], "back-to-front")),
  setDecksPace: async ({ u, capitals, other }) =>
    void (await u.setDecksPace([capitals, other], { maxReviewsPerDay: 20 })),
  setDeckCardLanguage: async ({ u, capitals }) =>
    void (await u.setDeckCardLanguage(capitals, "en")),
  setDeckPictureHost: async ({ u, copy }) =>
    void (await u.setDeckPictureHost(copy, "upload.wikimedia.org", true)),
  pauseDeck: async ({ u, capitals }) =>
    void (await u.pauseDeck(INSTANCE, capitals, null, new Date("2026-03-01T12:00:00Z"))),
  getPauseOutlook: async ({ u, capitals }) =>
    void (await u.getPauseOutlook(INSTANCE, capitals, null, new Date("2026-03-01T12:00:00Z"))),
  getComeback: async ({ u, capitals }) =>
    void (await u.getComeback(INSTANCE, capitals, new Date("2026-03-01T12:00:00Z"))),
  resumeDeck: async ({ u, capitals }) => {
    const paused = await u.pauseDeck(INSTANCE, capitals, null, new Date("2026-03-01T12:00:00Z"));
    await u.resumeDeck(INSTANCE, paused, new Date("2026-03-02T12:00:00Z"));
  },
  removeDeck: async ({ u, capitals }) => {
    await u.removeDeck(capitals);
    return { removed: about(capitals.id) };
  },
  removeDecks: async ({ u, capitals, other }) => {
    await u.removeDecks([capitals, other]);
    return { removed: about(capitals.id, other.id) };
  },

  // Cards.
  listCards: async ({ u, capitals }) => void (await u.listCards(capitals)),
  listCardsInTurn: async ({ u, capitals }) => void (await u.listCardsInTurn(capitals)),
  listDeckReviewStates: async ({ u, capitals }) => void (await u.listDeckReviewStates(capitals)),
  addCard: async ({ u, capitals }) =>
    void (await u.addCard(capitals, { front: { en: "Iceland" }, back: { en: "Reykjavik" } })),
  updateCard: async ({ u, capitals, cards }) =>
    void (await u.updateCard(capitals, cards[1]!, {
      front: { en: "Norge" },
      back: { en: "Oslo" },
    })),
  removeCard: async ({ u, capitals, cards }) => {
    await u.removeCard(capitals, cards[1]!);
    return { removed: about(cards[1]!.id) };
  },
  stateCardLanguages: async ({ u, capitals }) =>
    void (await u.stateCardLanguages(capitals, { front: "en", back: "en" })),
  editCards: async ({ u, capitals, cards }) => {
    const ids = cards.map(({ id }) => id);
    const plan = planCardEdit(await u.listCards(capitals), ids, { kind: "retire" });
    await u.editCards(INSTANCE, capitals, ids, { kind: "retire" }, plan);
  },
  undoCardEdit: async ({ u, capitals, cards }) => {
    const ids = cards.map(({ id }) => id);
    const edit = { kind: "setText", side: "front", tag: "en", text: "Changed" } as const;
    const plan = planCardEdit(await u.listCards(capitals), ids, edit);
    await u.undoCardEdit(
      INSTANCE,
      capitals,
      await u.editCards(INSTANCE, capitals, ids, edit, plan),
    );
  },
  resetCards: async ({ u, capitals, cards }) => {
    expect(await u.resetCards(INSTANCE, capitals, [cards[0]!.id])).toBe(1);
    // A card set back to new has no review state: its own are removed.
    return {
      removed: (one) =>
        known(one) && one.subject.includes(`reviews/`) && one.subject.includes(cards[0]!.id),
    };
  },
  rescheduleCards: async ({ u, capitals, cards }) =>
    void (await u.rescheduleCards(INSTANCE, capitals, [cards[0]!.id], "2026-12-01")),
  transferCards: async ({ u, capitals, other, cards }) => {
    const copy = await u.transferCards(
      INSTANCE,
      capitals,
      other,
      [cards[0]!.id],
      { mode: "copy", keepProgress: true },
      WEB_ID,
    );
    const move = await u.transferCards(
      INSTANCE,
      capitals,
      other,
      [cards[1]!.id],
      { mode: "move", keepProgress: true },
      WEB_ID,
    );
    const placeOf = (from: string, to: string) => (address: string) =>
      address
        .replaceAll(capitals.cardsDocumentUrl, other.cardsDocumentUrl)
        .replaceAll(capitals.reviewsDocumentUrl, other.reviewsDocumentUrl)
        .replaceAll(from, to);
    // The cards' own states go with them; a later scheduler's stay with the deck they were made in.
    return {
      copied: {
        seeds: about(cards[0]!.id, `${capitals.cardsDocumentUrl}#wrong-oslo`),
        as: placeOf(cards[0]!.id, copy.cards[0]!.to),
      },
      moved: placeOf(cards[1]!.id, move.cards[0]!.to),
    };
  },
  exportDeckFile: async ({ u, capitals, saved }) => {
    await u.exportDeckFile(INSTANCE, capitals, { format: "turtle", withProgress: true }, WEB_ID);
    // A file is what the user takes elsewhere: it has every term of the deck and its cards.
    expect(saved[0]!.text).toContain(`sm:${LATER.note.slice(SM_NS.length)} "kept"`);
  },
  openDeckFile: async ({ u, capitals, saved, toOpen }) => {
    await u.exportDeckFile(INSTANCE, capitals, { format: "turtle", withProgress: true }, WEB_ID);
    toOpen.push(saved[0]!);
    expect(await u.openDeckFile()).not.toBeNull();
  },
  importDeckFile: async ({ u, capitals, saved, toOpen }) => {
    await u.exportDeckFile(INSTANCE, capitals, { format: "jsonld", withProgress: true }, WEB_ID);
    toOpen.push(saved[0]!);
    await u.importDeckFile(INSTANCE, (await u.openDeckFile())!, { withProgress: true });
  },

  // The library.
  listLibraryDecks: async ({ u }) => void (await u.listLibraryDecks()),
  importLibraryDeck: async ({ u }) =>
    void (await u.importLibraryDeck(INSTANCE, await libraryDeck(u, "roman-numerals"))),
  listLibraryCards: async ({ u }) =>
    void (await u.listLibraryCards(await libraryDeck(u, "roman-numerals"))),
  getLibraryCourse: async ({ u, courseRelease }) => void (await u.getLibraryCourse(courseRelease)),
  readReleaseFromLink: async ({ u, release }) => void (await u.readReleaseFromLink(release)),
  importReleaseFromUrl: async ({ u, release }) =>
    void (await u.importReleaseFromUrl(INSTANCE, await u.readReleaseFromLink(release))),
  planLibraryUpgrade: async ({ u, copy }) =>
    void expect(await u.planLibraryUpgrade(copy)).not.toBeNull(),
  listLibraryUpdates: async ({ u }) => void (await u.listLibraryUpdates(INSTANCE)),
  addReleaseLanguages: async ({ u, copy }) => void (await u.addReleaseLanguages(copy)),
  deckRelease: async ({ u, copy }) => void (await u.deckRelease(copy)),
  releaseIsCourse: async ({ u, courseRelease }) =>
    void (await u.releaseIsCourse(courseRelease.url)),
  applyLibraryUpgrade: async ({ u, copy }) => {
    const plan = await u.planLibraryUpgrade(copy);
    expect(await u.applyLibraryUpgrade(copy, plan!)).toMatchObject({ ok: true });
  },

  reportPlace: async ({ u, courseRelease }) => void (await u.reportPlace(courseRelease.url)),
  unseenHighlights: local((u) => u.unseenHighlights(["a"])),
  dismissHighlights: local((u) => u.dismissHighlights(["a"])),

  // Courses.
  startCourse: async ({ u }) =>
    void (await u.startCourse(INSTANCE, await libraryDeck(u, "standard-for-public-code"))),
  getCourse: async ({ u, course }) => void (await u.getCourse(course)),
  getCourseSummary: async ({ u, course }) => void (await u.getCourseSummary(course)),
  answerCourseQuestion: async ({ u, course, courseRelease }) => {
    const question = await firstQuestion(u, courseRelease);
    await u.answerCourseQuestion(INSTANCE, course, question, { correct: false }, NOW);
  },
  completeChapter: async ({ u, course }) => {
    const { chapters } = (await u.getCourse(course)).outline;
    await u.completeChapter(course, chapters[1]!.url);
  },
  setCompletedChapters: async ({ u, course }) =>
    void (await u.setCompletedChapters(course, { kind: "restart" })),

  // Study.
  getStudyQueue: async ({ u, capitals }) => void (await u.getStudyQueue(INSTANCE, capitals, NOW)),
  getStudyCounts: async ({ u, capitals }) => void (await u.getStudyCounts(INSTANCE, capitals, NOW)),
  refreshStudyDigest: async ({ u, capitals }) =>
    void (await u.refreshStudyDigest(INSTANCE, capitals)),
  recordReview: async ({ u, capitals }) => {
    // The day after: a new card, and the cards studied before, whose states are written over.
    const queue = await u.getStudyQueue(INSTANCE, capitals, NEXT_DAY);
    expect(queue.due).toHaveLength(2);
    for (const prompt of [...queue.newPrompts, ...queue.due]) {
      await u.recordReview(INSTANCE, capitals, prompt, 4, NEXT_DAY);
    }
  },
  undoReview: async ({ u, capitals }) => {
    const queue = await u.getStudyQueue(INSTANCE, capitals, NOW);
    const { undo } = await u.recordReview(INSTANCE, capitals, queue.newPrompts[0]!, 4, NOW);
    await u.undoReview(INSTANCE, capitals, undo);
  },
  resetStudyDay: async ({ u, capitals, cards }) => {
    expect(await u.resetStudyDay(INSTANCE, capitals, NOW)).toBeGreaterThan(0);
    // The day's answers are removed, and the states of the cards first studied that day.
    return {
      removed: (one) =>
        known(one) &&
        (one.subject.includes("history/") ||
          (one.subject.includes("reviews/") && cards.some(({ id }) => one.subject.includes(id)))),
    };
  },

  // Statistics.
  getStatistics: async ({ u }) => void (await u.getStatistics(INSTANCE, NOW)),
  getTodayFigures: async ({ u }) => void (await u.getTodayFigures(INSTANCE, NOW)),
  knownTodayFigures: async ({ u }) => void (await u.knownTodayFigures(INSTANCE, NOW)),
  saveAnswers: async ({ u, saved }) => {
    await u.saveAnswers(INSTANCE, NOW);
    expect(saved).toHaveLength(1);
  },
  loadAnswerLog: async ({ u }) => void (await u.loadAnswerLog(INSTANCE)),
  deckInsight: async ({ u, capitals }) =>
    void (await u.deckInsight(INSTANCE, capitals, NOW, await u.getPreferences(INSTANCE))),
  cardAnswers: async ({ u, capitals, cards }) =>
    void (await u.cardAnswers(INSTANCE, capitals, cards[0]!.id)),
  getCardProgress: async ({ u }) => void (await u.getCardProgress(INSTANCE, NOW)),
  getCourseStatistics: async ({ u, course }) =>
    void (await u.getCourseStatistics(INSTANCE, NOW, [course])),

  // Checks: a later version's data is no problem.
  validateInstance: async ({ u }) =>
    void expect(await u.validateInstance(INSTANCE)).toMatchObject({ conforms: true }),
  checkInstance: async ({ u }) =>
    void expect(await u.checkInstance(INSTANCE)).toMatchObject({ conforms: true }),
  claimDeckDocuments: async ({ u, capitals }) =>
    void (await u.claimDeckDocuments(INSTANCE, capitals.url)),
  checkDeck: async ({ u, capitals }) => void (await u.checkDeck(INSTANCE, capitals, textCheck)),
  forgetDeckCheck: async ({ u, capitals }) => u.forgetDeckCheck(INSTANCE, capitals),

  // Drafts and releases.
  listReleaseDrafts: async ({ u }) => void (await u.listReleaseDrafts(INSTANCE)),
  createReleaseDraft: async ({ u, capitals, release }) => {
    await u.createReleaseDraft(INSTANCE, { kind: "fromDeck", deck: capitals }, WEB_ID);
    await u.createReleaseDraft(INSTANCE, { kind: "nextVersionOf", url: release }, WEB_ID);
  },
  copyReleaseDraft: async ({ u, draft }) => void (await u.copyReleaseDraft(draft.url, INSTANCE)),
  checkReleaseDraftCopy: async ({ u, draft }) =>
    void (await u.checkReleaseDraftCopy(draft.url, draft.url)),
  getReleaseDraft: async ({ u, draft }) => void (await u.getReleaseDraft(draft.url)),
  readReleaseDraft: async ({ u, draft }) => void (await u.readReleaseDraft(draft.url)),
  editReleaseDraft: async ({ u, draft }) =>
    void (await u.editReleaseDraft(draft.url, [
      { kind: "addCard", id: "one", card: { front: { en: "One" }, back: { en: "Ett" } } },
    ])),
  deleteReleaseDraft: async ({ u, draft }) => {
    await u.deleteReleaseDraft(draft);
    // A draft goes whole, with what a later version said in its documents.
    return { removed: ({ document }) => document.startsWith(draft.url.replace(/[^/]*$/, "")) };
  },
  checkReleaseDraft: async ({ u, draft }) =>
    void (await u.checkReleaseDraft(await u.getReleaseDraft(draft.url), markdownCheck, "pod")),
  diffReleaseDraft: async ({ u, draft }) =>
    void (await u.diffReleaseDraft(await u.getReleaseDraft(draft.url))),
  publishRelease: async ({ u, draft }) => {
    // A release states only what its shapes describe: a draft that holds a later version's
    // subject is not published, and stays as it is.
    const { shapes } = await u.checkReleaseDraft(
      await u.getReleaseDraft(draft.url),
      markdownCheck,
      "pod",
      { shapes: true },
    );
    expect(shapes).toEqual([
      expect.objectContaining({ code: "unshaped", subject: laterThingOf(draft.url) }),
    ]);
    await expect(
      u.publishRelease(draft.url, `${INSTANCE}releases/${draft.name}/v1.ttl`, markdownCheck),
    ).rejects.toMatchObject({ code: "releaseHasErrors" });
  },
  makeReleasePublic: async ({ u, release }) =>
    void (await u.makeReleasePublic(INSTANCE, release, WEB_ID).catch(() => undefined)),
  isReleasePublic: async ({ u, release }) => void (await u.isReleasePublic(release)),
  downloadRelease: async ({ u, draft, saved }) => {
    await u.downloadRelease(draft.url);
    expect(saved).toHaveLength(1);
  },
  listPublishedReleases: async ({ u }) => void (await u.listPublishedReleases(INSTANCE)),
  readInstanceGraph: async ({ u }) => void (await u.readInstanceGraph(INSTANCE, WEB_ID)),
  // The trial's pod is one composition makes, kept apart from the user's: here it reads the preferences only.
  openTrial: async ({ u, published }) =>
    void (await expect(
      u.openTrial(await u.getReleaseDraft(published.url), INSTANCE),
    ).rejects.toThrow("This app plays no trials.")),
};

/** A run of the app over a copy of the world's pods, with what a row runs with. */
async function runOn(world: World, written?: () => Promise<void>) {
  const store = await copyOf(world.store);
  const guestStore = await copyOf(world.guestStore);
  const app = wiredApp({ store, guestStore, now: () => NOW, written, site: world.site });
  const run: Run = { ...world, u: app.useCases, saved: app.saved, toOpen: app.toOpen };
  return { store, guestStore, app, run };
}

/**
 * A document changed as a writer that knows nothing of what is worked
 * out from it would change it: in place, at a new version, with nothing
 * else written.
 */
async function rewrite(
  store: ResourceStore,
  document: string,
  change: (lines: readonly string[]) => string[],
): Promise<void> {
  const resource = await store.get(document);
  if (resource?.kind !== "rdf") throw new Error(`No document ${document}`);
  const triples = change(resource.triples);
  expect(triples, document).not.toEqual(resource.triples);
  await store.set(document, { ...resource, triples, etag: `"${crypto.randomUUID()}"` });
}

/** The lines of `subject`, said of `copy` instead. */
const saidOf = (lines: readonly string[], subject: string, copy: string) =>
  lines
    .filter((line) => line.startsWith(`<${subject}> `))
    .map((line) => line.replace(`<${subject}>`, `<${copy}>`));

/** What a derived kind's case does: reads through the app, changes the source as another writer would, and reads again. */
type DerivedCase = (run: Run, store: ResourceStore) => Promise<void>;

/**
 * Every kind of data the app writes: data in its own right ("source"),
 * or worked out from other data, with the case that shows a reader
 * ignores it once what it was made from has changed. A writer that
 * reads less (an older version, another app) changes the source and
 * leaves what was worked out as it is, so it must be told stale, never
 * trusted. A new kind has to be put here, or the typecheck fails.
 */
const KINDS: Record<ShapeName, "source" | DerivedCase> = {
  agent: "source",
  answer: "source",
  card: "source",
  catalog: "source",
  chapter: "source",
  colorSet: "source",
  deck: "source",
  deckGroup: "source",
  distractor: "source",
  distribution: "source",
  draftChapter: "source",
  draftDeck: "source",
  draftStep: "source",
  instance: "source",
  libraryDeck: "source",
  libraryDeckSeries: "source",
  palette: "source",
  preferences: "source",
  reviewState: "source",
  step: "source",

  // A document's receipt says it conformed at one version of it: at another, it is checked again.
  documentReceipt: async ({ u, capitals, cards }, store) => {
    expect(await u.checkInstance(INSTANCE)).toMatchObject({ conforms: true });
    const sides = [SM.front, SM.back].map((side) => `<${cards[2]!.url}> <${side}> `);
    await rewrite(store, capitals.cardsDocumentUrl, (lines) =>
      lines.filter((line) => !sides.some((side) => line.startsWith(side))),
    );
    expect(await u.checkInstance(INSTANCE)).toMatchObject({ conforms: false });
  },

  // A deck's schedule counts its prompts at one version of its documents: at another, they are counted again.
  deckSchedule: async ({ u, capitals, cards }, store) => {
    const before = await u.getStudyCounts(INSTANCE, capitals, NOW);
    await rewrite(store, capitals.cardsDocumentUrl, (lines) => [
      ...lines,
      ...saidOf(lines, cards[2]!.url, `${capitals.cardsDocumentUrl}#card-added`),
    ]);
    expect(await u.getStudyCounts(INSTANCE, capitals, NOW)).toEqual({
      ...before,
      newCount: before.newCount + 1,
    });
  },

  // A month's summary is of one version of the month's document: at another, its answers are counted again.
  monthSummary: async ({ u }, store) => {
    const month = `${INSTANCE}history/2026-11.ttl`;
    const answersToday = async () =>
      (await u.getTodayFigures(INSTANCE, NOW)).days.reduce((sum, day) => sum + day.answers, 0);
    const before = await answersToday();
    expect(before).toBeGreaterThan(0);
    await rewrite(store, month, (lines) => {
      const answer = /^<([^>]*#answer-[^>]*)> /.exec(
        lines.find((line) => line.includes("#answer-"))!,
      )![1]!;
      return [...lines, ...saidOf(lines, answer, `${answer}-again`)];
    });
    expect(await answersToday()).toBe(before + 1);
  },

  // An FSRS-6 state counts while the SM-2 state of its prompt has the same last review. A
  // review saved by a writer that knows SM-2 only leaves it behind: unread, never wrong.
  fsrsReviewState: async ({ u, capitals, cards }, store) => {
    const later = new Date("2026-11-20T12:00:00.000Z");
    const dueThen = async () =>
      (await u.getStudyQueue(INSTANCE, capitals, later)).due.map(({ card }) => card.id);
    expect((await u.getPreferences(INSTANCE)).scheduler).toBe("fsrs6");
    expect(await dueThen()).toContain(cards[0]!.id);
    const state = `<${capitals.reviewsDocumentUrl}#${cards[0]!.id}> `;
    const XSD = "http://www.w3.org/2001/XMLSchema#";
    await rewrite(store, capitals.reviewsDocumentUrl, (lines) =>
      lines.map((line) =>
        line.startsWith(`${state}<${SM.lastReviewedAt}> `)
          ? `${state}<${SM.lastReviewedAt}> "2026-11-11T12:00:00.000Z"^^<${XSD}dateTime> .`
          : line.startsWith(`${state}<${SM.due}> `)
            ? `${state}<${SM.due}> "2026-12-24" .`
            : line,
      ),
    );
    // The SM-2 state sets the due day now, though the FSRS-6 state still says an earlier one.
    expect(await dueThen()).not.toContain(cards[0]!.id);
  },
};

describe("a write keeps what it does not own", () => {
  let world: World;
  beforeAll(async () => {
    world = await buildWorld();
  }, 120_000);

  const derived = Object.entries(KINDS).filter(
    (kind): kind is [ShapeName, DerivedCase] => kind[1] !== "source",
  );
  it.each(derived)("data worked out from other data is told stale: %s", async (_, stale) => {
    const { store, run } = await runOn(world);
    await stale(run, store);
  });

  it("starts from a pod that holds every kind of data, each seeded", () => {
    const kinds = new Set(world.seeds.map(({ kind }) => kind));
    expect([...kinds].sort()).toEqual(["state", "term", "thing"]);
  });

  it.each(Object.keys(ROWS) as (keyof UseCases)[])("%s", async (name) => {
    const lost = new Map<string, Seed>();
    const inGuestPod = ({ document }: Seed) => document.startsWith(GUEST_ORIGIN);
    const guestSeeds = world.seeds.filter(inGuestPod);
    const podSeeds = world.seeds.filter((one) => !inGuestPod(one));
    const look = async () => {
      const gone = [
        ...(await missing(store, podSeeds)),
        ...(await missing(guestStore, guestSeeds)),
      ];
      for (const one of gone) lost.set(one.line, one);
    };
    const { store, guestStore, app, run } = await runOn(world, () => look());
    const explained = (await ROWS[name](run)) ?? {};
    await app.settled();
    await look();

    const everywhere = new Set(
      [...(await triplesOf(store)).values(), ...(await triplesOf(guestStore)).values()].flat(),
    );
    const unexplained: string[] = [];
    let removed = 0;
    for (const one of lost.values()) {
      if (explained.removed?.(one) === true) removed++;
      else if (explained.moved === undefined || !everywhere.has(explained.moved(one.line))) {
        unexplained.push(one.line);
      }
    }
    expect([`${unexplained.length} lost`, ...unexplained.slice(0, 12)], "seeds lost").toEqual([
      "0 lost",
    ]);
    // A removal no seed went with is one the use case no longer makes.
    if (explained.removed !== undefined) expect(removed, "seeds removed").toBeGreaterThan(0);
    if (explained.copied !== undefined) {
      const { seeds, as } = explained.copied;
      const copies = world.seeds.filter(seeds).map(({ line }) => as(line));
      expect(copies.length, "seeds copied").toBeGreaterThan(0);
      expect(
        copies.filter((line) => !everywhere.has(line)),
        "seeds not on the copy",
      ).toEqual([]);
    }
    // A later version's subject holds its seeds and nothing else.
    const later = new Map<string, Set<string>>();
    for (const { kind, subject, line } of world.seeds) {
      if (kind !== "thing" && kind !== "state") continue;
      later.set(subject, (later.get(subject) ?? new Set()).add(line));
    }
    const changed = [...everywhere].filter((line) => {
      const subject = /^<([^>]*)> /.exec(line)?.[1];
      const seeded = subject === undefined ? undefined : later.get(subject);
      return seeded !== undefined && !seeded.has(line);
    });
    expect(changed, "a later version's subject changed").toEqual([]);
  });
});
