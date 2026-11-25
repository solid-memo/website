// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { UseCases } from "@solid-memo/application/useCases";
import type { ResourceStore } from "@solid-memo/application/ports/device";
import type { Card, CardContent, Deck } from "@solid-memo/domain/deck";
import type { DeckGroup, TreeNode } from "@solid-memo/domain/deckTree";
import { planCardEdit } from "@solid-memo/domain/cardBulk";
import { builtInColors, PALETTE_ROLES } from "@solid-memo/domain/customPalette";
import { DEFAULT_PALETTE } from "@solid-memo/domain/palette";
import type { DraftChange, QuestionPlace } from "@solid-memo/domain/release/releaseDraft";
import type { MarkdownCheck } from "@solid-memo/domain/release/markdownFields";
import { SM } from "../vocab";
import { POD, SESSION, triplesOf, WEB_ID, wiredApp } from "./wiredApp";

/**
 * One scenario that writes a pod through the app's own use cases
 * (wiredApp), the same pod every time: a fixed clock, ids counted from
 * one, the first of whatever there is to choose from. It holds every
 * kind of data the app writes, each with every term its shape names
 * (podSnapshots.roundtrip.test.ts holds it to that), and the terms the
 * app writes outside the shapes. A pod it wrote is kept as a snapshot
 * (packages/vocab/fixtures/pods/), so every later version of the app is
 * shown to read what this one wrote.
 */

/** The instant everything in the scenario happens at. */
export const SCENARIO_NOW = new Date("2026-10-31T12:00:00.000Z");
/** The day after, when it ends. */
export const SCENARIO_END = new Date("2026-11-01T12:00:00.000Z");
export const SCENARIO_INSTANCE = `${POD}solid-memo/main/`;

const PICTURE = "https://upload.wikimedia.org/wikipedia/commons/4/4c/Flag_of_Sweden.svg";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";
const MARKDOWN = SM.markdown;

const markdownCheck: MarkdownCheck = {
  problems: () => [],
  chunks: () => ({ chunks: 1, empty: 0 }),
};

/** The deck with what a release says of one: a description, topics, keywords, an author and a license. */
async function described(u: UseCases, deck: Deck): Promise<Deck> {
  const about = await u.describeDeck(deck, {
    description: { en: "The capitals of the Nordic countries.", sv: "Nordens huvudstäder." },
    topics: ["https://solid-memo.com/ns/vocab/topics.ttl#geography"],
    keywords: { en: ["capitals"], sv: ["huvudstäder"] },
  });
  return u.setDeckProvenance(about, { authors: ["Alice <alice@example.org>"], license: LICENSE });
}

/** Writes the scenario's pod, and gives the store that holds it. */
export async function writeScenarioPod(): Promise<ResourceStore> {
  let count = 0;
  let now = SCENARIO_NOW;
  const app = wiredApp({
    now: () => now,
    newId: () => `id-${String(++count).padStart(4, "0")}`,
  });
  const u = app.useCases;
  const I = SCENARIO_INSTANCE;
  await app.fetch(`${POD}profile/card`, {
    method: "PUT",
    headers: { "Content-Type": "text/turtle" },
    body: `<#me> <http://xmlns.com/foaf/0.1/name> "Alice" ; <http://www.w3.org/ns/pim/space#storage> <${POD}> .`,
  });
  const instance = await u.createInstance(SESSION, {
    containerUrl: I,
    name: "Main",
    registrationTarget: "private",
  });
  await u.describeCatalog(I, { description: "Everything I study.", license: LICENSE });
  // What only an earlier version of the app wrote, and this one keeps: the folder an instance
  // replaced and when, and when the catalog last changed.
  const DCTERMS = "http://purl.org/dc/terms/";
  const then = `"2026-01-01T00:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>`;
  await app.fetch(`${I}meta.ttl`, {
    method: "PATCH",
    headers: { "Content-Type": "application/sparql-update" },
    body: `INSERT DATA {\n<${I}meta.ttl#it> <${DCTERMS}replaces> <${POD}solid-memo/old/> .\n<${I}meta.ttl#it> <${DCTERMS}modified> ${then} .\n}`,
  });
  await app.fetch(`${I}catalog.ttl`, {
    method: "PATCH",
    headers: { "Content-Type": "application/sparql-update" },
    body: `INSERT DATA {\n<${I}catalog.ttl#catalog> <${DCTERMS}modified> ${then} .\n}`,
  });

  // A deck of the user's own: a card with everything a card can say, one plain, one retired.
  let capitals = await described(u, await u.createDeck(I, { en: "Capitals", sv: "Huvudstäder" }));
  const cards = [
    await u.addCard(capitals, {
      front: { en: "Sweden", sv: "Sverige" },
      back: { en: "Stockholm", sv: "Stockholm" },
      frontImageUrl: PICTURE,
      frontImageDescription: { en: "A yellow cross on blue" },
      frontLabel: { en: "Country" },
      frontNote: { en: "A kingdom" },
      backImageUrl: PICTURE,
      backImageDescription: { en: "A yellow cross on blue" },
      backLabel: { en: "Capital" },
      backNote: { en: "Since the 1400s" },
      distractors: [{ id: "wrong-oslo", text: { en: "Oslo" }, note: { en: "Norway's" } }],
      textFormat: MARKDOWN,
      subjects: ["http://www.wikidata.org/entity/Q34"],
    }),
    await u.addCard(capitals, { front: { en: "Norway" }, back: { en: "Oslo" } }),
    await u.addCard(capitals, { front: { en: "Denmark" }, back: { en: "Copenhagen" } }),
  ];
  capitals = await u.setDeckDirection(capitals, "bidirectional");
  capitals = await u.setDeckPace(capitals, { newCardsPerDay: 5, maxReviewsPerDay: 50 });
  capitals = await u.setDeckCardLanguage(capitals, "en");
  capitals = await u.setDeckPictureHost(capitals, "upload.wikimedia.org", true);
  const retire = planCardEdit(await u.listCards(capitals), [cards[2]!.id], { kind: "retire" });
  await u.editCards(I, capitals, [cards[2]!.id], { kind: "retire" }, retire);

  // A second deck, in a group within a group.
  const other = await described(u, await u.createDeck(I, { en: "Other" }));
  await u.addCard(other, { front: { en: "Finland" }, back: { en: "Helsinki" } });
  const outer = u.newDeckGroup(I, { en: "Geography" });
  const inner = u.newDeckGroup(I, { en: "Europe" });
  await u.editDeckTree(I, {
    kind: "graft",
    nodes: [
      {
        kind: "group",
        group: outer,
        children: [{ kind: "group", group: inner, children: [{ kind: "deck", url: other.url }] }],
      },
    ],
  });

  // Preferences, and a palette of the user's own that sets every color.
  const prefs = await u.getPreferences(I);
  await u.savePreferences(I, { ...prefs, newCardsPerDay: 7, developerMode: true });
  const colors = (theme: "light" | "dark") => {
    const all = builtInColors(DEFAULT_PALETTE, theme);
    return Object.fromEntries(PALETTE_ROLES.map((role) => [role, all[role]!]));
  };
  const palette = await u.savePalette(
    I,
    {
      url: null,
      title: { en: "Mine" },
      basedOn: DEFAULT_PALETTE,
      light: colors("light"),
      dark: colors("dark"),
    },
    { useAnyway: true },
  );
  await u.chooseCustomPalette(palette, I);
  await u.chooseTextSize("large", I);
  await u.chooseTheme("dark", I);
  await u.dismissSchedulerInvitation(I);
  await u.chooseConnectedScreen(I, false);

  /** Grades the deck's prompts of the cards, new or due, each "good". */
  const study = async (deck: Deck, ids: readonly string[]) => {
    const queue = await u.getStudyQueue(I, deck, now);
    for (const prompt of [...queue.newPrompts, ...queue.due]) {
      if (!ids.includes(prompt.card.id)) continue;
      await u.recordReview(I, deck, prompt, 4, now, { recallMillis: 1200, gradeMillis: 300 });
    }
  };
  // The first day: a card under SM-2, then one under FSRS-6.
  await study(capitals, [cards[0]!.id]);
  await u.switchScheduler(I, { ...(await u.getPreferences(I)), scheduler: "fsrs6" });
  await study(capitals, [cards[1]!.id]);

  // A course drafted and published from the instance, then started from that release.
  const first = (await u.createReleaseDraft(
    I,
    { kind: "blankCourse", title: { en: "Solid" } },
    WEB_ID,
  ))!.draft;
  await u.editReleaseDraft(first.url, [
    { kind: "setAgent", id: "alice", agent: { name: "Alice", mbox: "mailto:alice@example.org" } },
    {
      kind: "setMeta",
      meta: {
        creator: [`${first.url}#alice`],
        publisher: `${first.url}#alice`,
        description: { en: "What Solid is, in two chapters.", sv: "Vad Solid är." },
        language: ["http://publications.europa.eu/resource/authority/language/ENG"],
        versionNotes: "The first version.",
        keyword: { en: ["solid"], sv: ["solid"] },
      },
    },
    { kind: "setLicense", license: LICENSE },
    {
      kind: "addChapter",
      id: "ch-pods",
      text: {
        title: { en: "Pods" },
        description: { en: "Where data lives." },
        textFormat: MARKDOWN,
      },
    },
    {
      kind: "addStep",
      id: "st-pods-1",
      chapter: "ch-pods",
      text: { theory: { en: "A pod stores your data." }, textFormat: MARKDOWN },
    },
    {
      kind: "addStep",
      id: "st-pods-2",
      chapter: "ch-pods",
      text: { theory: { en: "You choose who reads it." } },
    },
    { kind: "addChapter", id: "ch-apps", text: { title: { en: "Apps" } } },
    {
      kind: "addStep",
      id: "st-apps-1",
      chapter: "ch-apps",
      text: { theory: { en: "Apps ask for access." } },
    },
    ...question("q-pods-1", "What stores your data?", "A pod", { kind: "step", step: "st-pods-1" }),
    ...question("q-pods-2", "Who chooses who reads it?", "You", {
      kind: "step",
      step: "st-pods-2",
    }),
    ...question("q-pods-3", "Where does data live?", "In a pod", {
      kind: "review",
      chapter: "ch-pods",
    }),
    ...question("q-apps-1", "What do apps ask for?", "Access", { kind: "step", step: "st-apps-1" }),
  ]);
  const release = (version: number) => `${I}releases/${first.name}/v${version}.ttl`;
  await publish(u, first.url, release(1));
  const published = await u.readReleaseFromLink(release(1));
  let course = await u.startCourse(I, published);
  const asked = (await u.getLibraryCourse(published)).cards.get("q-pods-1")!;
  await u.answerCourseQuestion(
    I,
    course,
    asked,
    { correct: false, distractorId: "q-pods-1-d1" },
    now,
    {
      recallMillis: 900,
    },
  );
  course = await u.completeChapter(course, `${release(1)}#ch-pods`);

  // The day after, in the next month: the cards studied before are studied again, so each state holds the one before it.
  now = SCENARIO_END;
  await study(capitals, [cards[0]!.id, cards[1]!.id]);

  // The course's next version retires a chapter, a step, a card and a wrong option, and is published too.
  const second = (await u.createReleaseDraft(
    I,
    { kind: "nextVersionOf", url: release(1) },
    WEB_ID,
  ))!.draft;
  await u.editReleaseDraft(second.url, [
    { kind: "setMeta", meta: { versionNotes: "Without the chapter on apps." } },
    { kind: "retire", of: "chapter", id: "ch-apps" },
    { kind: "retire", of: "step", id: "st-pods-2" },
    { kind: "retire", of: "card", id: "q-pods-2" },
    { kind: "retire", of: "distractor", id: "q-pods-2-d1" },
  ]);
  await publish(u, second.url, release(2));
  // A draft of the version after it, and one of a deck of the user's own, stay drafts.
  await u.createReleaseDraft(I, { kind: "nextVersionOf", url: release(2) }, WEB_ID);
  await u.createReleaseDraft(I, { kind: "fromDeck", deck: capitals }, WEB_ID);

  capitals = await u.renameDeck(capitals, { en: "Nordic capitals", sv: "Nordens huvudstäder" });
  await u.renameInstance(SESSION, instance, "Main study");

  // What is worked out from the rest: the digest's receipts and schedules, and the month's summary.
  await app.settled();
  await u.getTodayFigures(I, now);
  for (const deck of [capitals, other, course]) await u.refreshStudyDigest(I, deck);
  await u.checkInstance(I);
  await app.settled();
  return app.store;
}

/** Publishes the draft; a draft the release check refuses fails with what the check found. */
async function publish(u: UseCases, draftUrl: string, target: string): Promise<void> {
  try {
    await u.publishRelease(draftUrl, target, markdownCheck);
  } catch (error) {
    const draft = await u.getReleaseDraft(draftUrl);
    const found = await u.checkReleaseDraft(draft, markdownCheck, "pod", { shapes: true });
    throw new Error(`${String(error)}\n${JSON.stringify(found, null, 1)}`);
  }
}

/** A course's question with two wrong options, asked at `place`. */
function question(id: string, front: string, back: string, place: QuestionPlace): DraftChange[] {
  return [
    { kind: "addCard", id, card: { front: { en: front }, back: { en: back } } },
    { kind: "addQuestion", card: id, place },
    {
      kind: "addDistractor",
      card: id,
      id: `${id}-d1`,
      distractor: { text: { en: "Something else" } },
    },
    { kind: "addDistractor", card: id, id: `${id}-d2`, distractor: { text: { en: "Nothing" } } },
  ];
}

/**
 * A pod as a snapshot holds it: each RDF document under a comment line
 * with its address, its statements as N-Triples lines, sorted, the
 * documents by address.
 */
export async function snapshotOf(store: ResourceStore): Promise<string> {
  const documents = [...(await triplesOf(store))].sort(([a], [b]) => (a < b ? -1 : 1));
  return documents.map(([url, lines]) => `# ${url}\n${[...lines].sort().join("\n")}\n`).join("");
}

/** The documents of a snapshot (snapshotOf), each with its lines. */
export function documentsOf(snapshot: string): Map<string, string[]> {
  const documents = new Map<string, string[]>();
  let lines: string[] = [];
  for (const line of snapshot.split("\n")) {
    if (line.startsWith("# ")) documents.set(line.slice(2), (lines = []));
    else if (line !== "") lines.push(line);
  }
  return documents;
}

/** An app over a pod that holds a snapshot's documents, at the instant the scenario ended, or at `now`. */
export async function appOver(
  snapshot: string,
  written?: (method: string, url: string) => Promise<void>,
  now: Date = SCENARIO_END,
) {
  const app = wiredApp({ now: () => now, written });
  for (const [url, lines] of documentsOf(snapshot)) {
    const response = await app.fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "text/turtle" },
      body: lines.join("\n"),
    });
    if (!response.ok) throw new Error(`${url} could not be put in place: ${response.status}`);
  }
  return app;
}

/** A value as JSON holds it, a map as an object of its entries. */
function plain(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_, one: unknown) =>
      one instanceof Map ? Object.fromEntries(one) : one instanceof Set ? [...one] : one,
    ),
  );
}

/**
 * What the app reads of the scenario's pod, through its use cases: the
 * instance and its catalog, each deck with its cards and review states,
 * the course a deck is a copy of, the preferences, the palettes, the
 * answer log, and each draft and release. Only what is stored and read
 * back, nothing worked out from it, so a later version reads the same
 * unless it reads less.
 */
export async function recordsOf(u: UseCases): Promise<unknown> {
  const I = SCENARIO_INSTANCE;
  const decks = await u.listDecks(I);
  const drafts = await u.listReleaseDrafts(I);
  const releases = await u.listPublishedReleases(I);
  return plain({
    instances: await u.listInstances(SESSION),
    catalog: await u.readCatalog(I),
    tree: await u.listDeckTree(I),
    decks: await Promise.all(
      decks.map(async (deck) => ({
        deck,
        cards: await u.listCards(deck),
        reviewStates: await u.listDeckReviewStates(deck),
        course:
          deck.sourceUrl !== undefined && (await u.releaseIsCourse(deck.sourceUrl))
            ? await u.getCourse(deck).then(({ outline, cards, answeredCardIds, release }) => ({
                outline,
                cards,
                answeredCardIds,
                release,
              }))
            : null,
      })),
    ),
    preferences: await u.getPreferences(I),
    theme: await u.instanceTheme(I),
    textSize: await u.instanceTextSize(I),
    palette: await u.instancePalette(I),
    palettes: await u.listPalettes(I),
    connectedScreenShown: await u.connectedScreenShown(I),
    answers: await u.loadAnswerLog(I),
    drafts: await Promise.all(
      drafts.map(async (summary) => ({ summary, draft: await u.getReleaseDraft(summary.url) })),
    ),
    releases: await Promise.all(
      releases.map(async ({ url }) => ({
        url,
        release: await u.readReleaseFromLink(url),
        cards: await u.listLibraryCards(await u.readReleaseFromLink(url)),
      })),
    ),
  });
}

/** The groups among the nodes of a deck tree, nested ones too. */
function groupsOf(nodes: readonly TreeNode[]): DeckGroup[] {
  return nodes.flatMap((node) =>
    node.kind === "group" ? [node.group, ...groupsOf(node.children)] : [],
  );
}

/** What a card says, as an edit of it gives it. */
function contentOf(card: Card): CardContent {
  const {
    id: _id,
    url: _url,
    formatVersion: _format,
    createdAt: _at,
    retired: _retired,
    fromRelease: _from,
    ...content
  } = card;
  return content;
}

/**
 * Saves back what the app reads of the scenario's pod, each as it read
 * it: the instance's name, the preferences, the palettes, each deck's
 * entry and cards, each group, and each draft not yet published. A pod
 * the app reads whole says the same after as before. A save the app
 * refuses, as of a subject in a format newer than its own, throws.
 */
export async function saveBack(u: UseCases): Promise<void> {
  const I = SCENARIO_INSTANCE;
  const [instance] = await u.listInstances(SESSION);
  await u.renameInstance(SESSION, instance!, instance!.name);
  await u.savePreferences(I, await u.getPreferences(I));
  for (const palette of await u.listPalettes(I))
    await u.savePalette(I, palette, { useAnyway: true });
  for (const deck of await u.listDecks(I)) {
    await u.renameDeck(deck, deck.title);
    for (const card of await u.listCards(deck)) await u.updateCard(deck, card, contentOf(card));
  }
  for (const group of groupsOf((await u.listDeckTree(I)).children)) {
    await u.editDeckTree(I, { kind: "rename", group: group.url, title: group.title });
  }
  for (const { url, releasedAs } of await u.listReleaseDrafts(I)) {
    if (releasedAs !== undefined) continue;
    const { root } = await u.getReleaseDraft(url);
    await u.editReleaseDraft(url, [{ kind: "setMeta", meta: { title: root.title } }]);
  }
}

/** The day after the scenario ended, when another version uses its pod (usePod). */
export const USED_AT = new Date("2026-11-02T12:00:00.000Z");

/**
 * Uses the scenario's pod as a learner would the day after, through
 * whatever this version of the app writes: each deck renamed and paced,
 * a card changed and one added, what is due and new studied, a deck
 * made, the preferences, a palette and a group changed. It only adds
 * and changes, and removes nothing, so that whatever the pod said
 * before of a subject it still says something of after (lostTerms). It
 * finds what it uses by reading the pod, which another version may have
 * written.
 */
export async function usePod(u: UseCases, now: Date = USED_AT): Promise<void> {
  const I = SCENARIO_INSTANCE;
  const [instance] = await u.listInstances(SESSION);
  await u.renameInstance(SESSION, instance!, `${instance!.name}, used`);
  const prefs = await u.getPreferences(I);
  await u.savePreferences(I, { ...prefs, maxReviewsPerDay: prefs.maxReviewsPerDay + 1 });
  for (const palette of await u.listPalettes(I)) {
    await u.savePalette(
      I,
      { ...palette, title: { ...palette.title, en: "Used" } },
      { useAnyway: true },
    );
  }
  for (const group of groupsOf((await u.listDeckTree(I)).children)) {
    await u.editDeckTree(I, {
      kind: "rename",
      group: group.url,
      title: { ...group.title, en: "Used" },
    });
  }
  for (const listed of await u.listDecks(I)) {
    // A course's cards are its release's: its copy is studied, and left as it is.
    const own = listed.sourceUrl === undefined;
    let deck = listed;
    if (own) {
      deck = await u.renameDeck(deck, { ...deck.title, en: `${deck.title.en ?? "Deck"}, used` });
      deck = await u.setDeckPace(deck, { newCardsPerDay: 9, maxReviewsPerDay: 90 });
      const [card] = (await u.listCards(deck)).filter(({ retired }) => retired !== true);
      if (card !== undefined) {
        const content = contentOf(card);
        await u.updateCard(deck, card, { ...content, front: { ...content.front, en: "Used" } });
      }
      await u.addCard(deck, { front: { en: "Added" }, back: { en: "Later" } });
    }
    const queue = await u.getStudyQueue(I, deck, now);
    for (const prompt of [...queue.due, ...queue.newPrompts]) {
      await u.recordReview(I, deck, prompt, 4, now, { recallMillis: 1000, gradeMillis: 200 });
    }
  }
  const made = await u.createDeck(I, { en: "Made later" });
  await u.addCard(made, { front: { en: "One" }, back: { en: "Ett" } });
}

/**
 * What a pod no longer says of a subject it said something of: each
 * `subject property` pair of `before` (a snapshot) that `after` has no
 * statement of, in the same document. The digest is left out, as it is
 * worked out from the rest. A use of a pod that only adds and changes
 * (usePod) loses none: one that does dropped what it did not know.
 */
export function lostTerms(before: string, after: string): string[] {
  const pairsOf = (lines: readonly string[]) =>
    new Set(lines.map((line) => /^(\S+ <[^>]*>) /.exec(line)![1]!));
  const now = documentsOf(after);
  const lost: string[] = [];
  for (const [url, lines] of documentsOf(before)) {
    if (url === `${SCENARIO_INSTANCE}digest.ttl`) continue;
    const kept = pairsOf(now.get(url) ?? []);
    for (const pair of pairsOf(lines)) if (!kept.has(pair)) lost.push(`${url}: ${pair}`);
  }
  return lost;
}

/** The documents of `before` that `after` does not hold with the same statements, the digest aside. */
export function changedDocuments(before: string, after: string): string[] {
  const now = documentsOf(after);
  return [...documentsOf(before)]
    .filter(
      ([url, lines]) =>
        url !== `${SCENARIO_INSTANCE}digest.ttl` &&
        JSON.stringify(now.get(url)) !== JSON.stringify(lines),
    )
    .map(([url]) => url);
}
