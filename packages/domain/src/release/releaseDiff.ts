import { LATEST_VERSION, type CardV5 } from "@solid-memo/vocab/types.generated";
import type { Card, Deck } from "../deck.ts";
import { cardContentFromRecord } from "../deckRecord.ts";
import { sameKeywords } from "../keywords.ts";
import { sameText } from "../langText.ts";
import { planLibraryUpgrade, sameContent, type LibraryUpgradePlan } from "../libraryUpgrade.ts";
import { draftLibraryContent, draftLibraryDeck } from "./draftListing.ts";
import { canonical, type DraftNode, type ReleaseDraft } from "./releaseDraft.ts";
import type { ReleaseKind } from "./releaseModel.ts";
import { rebaseDraft } from "./releaseToDraft.ts";

/**
 * A draft against the release it follows (docs/studio.md, The release
 * diff): what the next version changes, subject by subject, and what
 * a learner's copy of the release would get from it. Subjects are
 * matched by their fragment ids, which a series keeps from one release
 * to the next. A subject the draft drops is not here: it breaks a rule
 * of the series (continuityProblems), which the screen shows beside.
 */

/** How a subject of the draft differs from the release's. */
export type DiffStatus = "added" | "changed" | "retired" | "restored";

export interface SubjectChange {
  kind: ReleaseKind;
  /** Its fragment id, the same in both. */
  id: string;
  status: DiffStatus;
  /** For one retired or restored: its content changed too. */
  alsoChanged?: true;
}

/** What a release says of itself that a diff compares. */
export type ReleaseDetail =
  | "course"
  | "title"
  | "description"
  | "keywords"
  | "themes"
  | "direction"
  | "license"
  | "authors"
  | "languages"
  | "sources";

export interface ReleaseDiff {
  /** What the release says of itself that the draft changes, in the order of RELEASE_DETAILS. */
  about: ReleaseDetail[];
  /** The subjects that differ: chapters, then steps, cards and wrong options, each in the draft's order. */
  subjects: SubjectChange[];
  /** How many subjects of each kind the draft has as the release has them. */
  unchanged: Record<ReleaseKind, number>;
}

export const RELEASE_DETAILS: readonly ReleaseDetail[] = [
  "course",
  "title",
  "description",
  "keywords",
  "themes",
  "direction",
  "license",
  "authors",
  "languages",
  "sources",
];

/** The kinds of subject, in the order a diff lists them, with the draft's list of each. */
const KINDS: readonly (readonly [ReleaseKind, "chapters" | "steps" | "cards" | "distractors"])[] = [
  ["chapter", "chapters"],
  ["step", "steps"],
  ["card", "cards"],
  ["distractor", "distractors"],
];

/** Whether two lists hold the same values, in any order. */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return canonical([...a].sort()) === canonical([...b].sort());
}

/** A record as it compares: its retirement aside, which is a status of its own, and its lists in any order. */
function comparable(data: object): string {
  return canonical(
    Object.fromEntries(
      Object.entries(data)
        .filter(([field]) => field !== "deprecated")
        .map(([field, value]) => [field, Array.isArray(value) ? [...(value as string[])].sort() : value]),
    ),
  );
}

/**
 * Whether a card says the same in both, as an upgrade compares them
 * (sameContent): its wrong options aside, which are subjects of their
 * own, and when it was made. A card without text on a side, which no
 * learner gets, compares by its record.
 */
function sameCard(a: CardV5, b: CardV5): boolean {
  const before = cardContentFromRecord(a);
  const after = cardContentFromRecord(b);
  if (before === null || after === null) {
    const { distractor: _a, created: _ac, ...was } = a;
    const { distractor: _b, created: _bc, ...now } = b;
    return comparable(was) === comparable(now);
  }
  return sameContent(before, after);
}

/** Whether a subject's record says the same in both, its retirement aside. */
function sameSubject(kind: ReleaseKind, a: object, b: object): boolean {
  return kind === "card" ? sameCard(a as CardV5, b as CardV5) : comparable(a) === comparable(b);
}

/** How a subject of the draft differs from the release's (`was`, absent when the release lacks it); null when it does not. */
function changeOf(kind: ReleaseKind, was: DraftNode<{ deprecated?: boolean }> | undefined, now: DraftNode<{ deprecated?: boolean }>): SubjectChange | null {
  const { id } = now;
  if (was === undefined) return { kind, id, status: "added" };
  const same = sameSubject(kind, was.data, now.data);
  const retired = now.data.deprecated === true;
  if (retired !== (was.data.deprecated === true)) {
    return { kind, id, status: retired ? "retired" : "restored", ...(same ? {} : { alsoChanged: true as const }) };
  }
  return same ? null : { kind, id, status: "changed" };
}

/**
 * What the draft changes of the release it follows (`previous`): what
 * it says of itself, and each chapter, step, card and wrong option it
 * adds, changes, retires or restores.
 */
export function releaseDiff(previous: ReleaseDraft, draft: ReleaseDraft): ReleaseDiff {
  // The release's subjects at the draft's address, so the links between them compare.
  const before = rebaseDraft(previous, draft.url);
  const subjects: SubjectChange[] = [];
  const unchanged = { chapter: 0, step: 0, card: 0, distractor: 0 };
  for (const [kind, list] of KINDS) {
    const was = new Map<string, DraftNode<{ deprecated?: boolean }>>(before[list].map((node) => [node.id, node]));
    for (const node of draft[list]) {
      const change = changeOf(kind, was.get(node.id), node);
      if (change === null) unchanged[kind]++;
      else subjects.push(change);
    }
  }
  const [a, b] = [draftLibraryDeck(before), draftLibraryDeck(draft)];
  const same: Record<ReleaseDetail, boolean> = {
    course: before.course === draft.course,
    title: sameText(a.title, b.title),
    description: sameText(a.description, b.description),
    keywords: sameKeywords(a.keywords, b.keywords),
    themes: sameList(a.themes, b.themes),
    direction: a.direction === b.direction,
    license: a.license === b.license,
    authors: sameList(a.authors, b.authors),
    languages: sameList(before.root.language, draft.root.language),
    sources: sameList(before.root.wasDerivedFrom, draft.root.wasDerivedFrom),
  };
  return { about: RELEASE_DETAILS.filter((detail) => !same[detail]), subjects, unchanged };
}

/** What a learner's copy of the release would get from the draft (simulateLearnerUpgrade). */
export interface LearnerUpgrade {
  /** Whether the draft's version comes after the release's: a learner is offered only a newer one. */
  newer: boolean;
  /** What upgrading the copy would do; null when it would change nothing, or the draft is not newer. */
  plan: LibraryUpgradePlan | null;
  /**
   * The learner's progress the draft would lose: the cards it drops,
   * whose review history goes with them, and, of a course, the chapters
   * completed that it no longer has. Found by id, newer or not. None
   * when the draft retires what it no longer uses, as a release must.
   */
  lost: { cards: string[]; chapters: string[] };
}

/** Where the learner's copy is said to be: nowhere, for no copy is written. */
const LEARNER = "https://learner.solid-memo.invalid/solid-memo/";

/**
 * Upgrading a learner's copy of the release (`previous`) to the draft,
 * as Solid Memo would plan it (planLibraryUpgrade): the copy as an
 * import makes it, the learner having changed nothing, every card
 * there (a course's learner having reached every question) and, of a
 * course, every chapter completed. Nothing is written: the plan is what
 * learners' decks would get.
 */
export function simulateLearnerUpgrade(previous: ReleaseDraft, draft: ReleaseDraft): LearnerUpgrade {
  const from = draftLibraryContent(previous);
  const to = draftLibraryContent(draft);
  const newer = Number(to.version) > Number(from.version);
  const course = previous.course || draft.course;
  const cardsDocumentUrl = `${LEARNER}decks/learner.ttl`;
  const deck: Deck = {
    id: "learner",
    url: `${LEARNER}catalog.ttl#learner`,
    title: from.title,
    cardsDocumentUrl,
    reviewsDocumentUrl: `${LEARNER}reviews/learner.ttl`,
    createdAt: "",
    formatVersion: LATEST_VERSION.deck,
    direction: from.direction,
    authors: from.authors,
    ...(from.license === undefined ? {} : { license: from.license }),
    ...(from.description === undefined ? {} : { description: from.description }),
    sourceUrl: from.url,
    themes: from.themes,
    keywords: from.keywords,
  };
  const cards = from.cards.map((card): Card => ({ ...card, url: `${cardsDocumentUrl}#${card.id}`, createdAt: "" }));
  const plan = newer ? planLibraryUpgrade({ deck, cards, from, to, releases: draftLibraryDeck(draft).releases, course }) : null;
  const dropped = (was: readonly { id: string }[], now: readonly { id: string }[]) => {
    const kept = new Set(now.map((one) => one.id));
    return was.map((one) => one.id).filter((id) => !kept.has(id));
  };
  return { newer, plan, lost: { cards: dropped(from.cards, to.cards), chapters: dropped(previous.chapters, draft.chapters) } };
}
