import {
  CARD_FORMAT_VERSION,
  type Card,
  type CardContent,
  type Deck,
  type DeckDirection,
  textFormatOf,
} from "./deck";
import type { LibraryCard, LibraryDeckContent, LibraryRelease } from "./library";
import { isDefaultDeckDescription } from "./dcat";
import { copyKeywords, noKeywords, sameKeywords, type LangTexts } from "./keywords";
import { sameText, type LangText } from "./langText";

/** What of a deck itself a library release says: how it is studied, and what it says of itself. */
export type DeckDetail = "direction" | "title" | "description" | "keywords" | "themes";

/**
 * Bringing an imported deck up to a newer release of its library deck
 * (see docs/deck-library.md). The copy says which release it came from;
 * the library publishes the deck's releases, their cards keeping the same
 * fragment ids from one release to the next. Comparing the release the
 * copy came from, the newer one and the copy itself tells what the
 * library changed and what the user did: the library's changes are
 * applied only to cards the user has left as the library had them.
 * Retiring a card is not a change of its content: the library's
 * retirements apply to every card, since a retired card is kept, with
 * its review state, and only leaves study. Review history is kept, but
 * for cards the upgrade removes — which releases did before they could
 * retire a card.
 */
export interface LibraryUpgradePlan {
  /** The release the copy came from, and the one it moves to. */
  fromVersion: string;
  toVersion: string;
  /** URL of the release the copy moves to: its new source. */
  releaseUrl: string;
  /** What changed, release by release, oldest first; releases without notes left out. */
  notes: { version: string; notes: string }[];
  /** Cards the library added; retired ones too, kept retired, so a later release can bring them back. */
  add: LibraryCard[];
  /**
   * Cards the library changed that the user has not, as the release has
   * them, retired or not; and cards whose copy lost the release's text
   * format (see untouched) but is otherwise as the older release or the
   * newer one has it, whose marker it brings back.
   */
  change: LibraryCard[];
  /** Cards the library retired: kept with their review state, as the user has them, but no longer studied. */
  retire: Card[];
  /** Retired cards the library uses again: studied again, with the review state they had. */
  restore: Card[];
  /** Cards the library removed that the user has not changed. */
  remove: Card[];
  /**
   * Cards the library changed or removed that the user has changed too,
   * and cards it added that the copy has otherwise than the release (an
   * upgrade cut off half-way wrote them, and the user changed them since):
   * left as the user has them.
   */
  kept: Card[];
  /**
   * Cards the upgrade writes nothing to that the copy already has as the
   * newer release changed them — added, changed, retired or brought
   * back: content and retirement, or, for a card whose content the user
   * changed (`kept` too), its retirement. An upgrade cut off after it
   * wrote the cards, before it moved the deck's entry, left them so (or
   * the user made them so). They are an offer of their own: the deck
   * still names the older release, and moving it to the newer keeps a
   * later upgrade from taking them for the user's changes.
   */
  applied: Card[];
  /**
   * The ids of cards the library removed that the copy no longer has
   * either: an upgrade cut off after it wrote the cards removed them, or
   * the user did. Nothing is written to the cards, but review states left
   * of them are dropped with those of `remove`; and, as `applied`, they
   * are an offer of their own, which moves the deck to the newer release
   * — but in a course's deck, which lacks every card the learner has not
   * reached.
   */
  gone: string[];
  /**
   * What of the deck itself the newer release changed and the copy
   * already has as the newer release has it — its direction, title,
   * description, keywords or themes — as the user (or another app) made
   * it: nothing to write, but, as with `applied`, an offer of its own, so
   * that the deck moves to the newer release and a later upgrade does not
   * take it for the user's change.
   */
  appliedAbout: DeckDetail[];
  /** The library's new study direction, when the copy is still studied the old way. */
  direction?: DeckDirection;
  /**
   * The deck's new title and description, when the copy's change: the
   * release's where the user has left the old one, else the user's with
   * the languages the release adds (see upgradedText).
   */
  title?: LangText;
  description?: LangText;
  /**
   * The release's keywords and themes, when the copy still has the old
   * release's and they changed; keywords compare language by language
   * (see sameKeywords).
   */
  keywords?: LangTexts;
  themes?: string[];
}

/**
 * A text of the copy as an upgrade leaves it; undefined when it stays as
 * it is. The newer release's when the copy still has the older one's,
 * as the user left it. Else the copy's own, with the languages the
 * release has and the copy lacks, as long as the copy says what the
 * release says in every language both have (see withLanguagesOf): a deck
 * the user renamed keeps its name, in every language.
 */
export function upgradedText(
  mine: LangText | undefined,
  before: LangText | undefined,
  after: LangText | undefined,
): LangText | undefined {
  if (after === undefined) return undefined;
  if (sameText(mine, before)) return sameText(mine, after) ? undefined : after;
  return mine === undefined ? undefined : withLanguagesOf(mine, after);
}

/**
 * The copy's text with the languages `release` adds, when both say the
 * same in every language both have, sharing at least one; undefined when
 * that adds nothing. A copy whose English the user moved to the language
 * it is really in (retagged) still agrees, in the languages left. Tags
 * compare exactly: a copy retagged to a regional English ("en-gb")
 * shares no language with a release in plain English, so it is left as
 * it is, where comparing English text (see english) once matched them.
 */
function withLanguagesOf(mine: LangText, release: LangText): LangText | undefined {
  const shared = Object.keys(mine).filter((tag) => tag in release);
  if (shared.length === 0 || shared.some((tag) => mine[tag] !== release[tag])) return undefined;
  const added = Object.keys(release).filter((tag) => !(tag in mine));
  return added.length === 0 ? undefined : { ...release, ...mine };
}

/** Keywords as an upgrade leaves them: the release's, when the copy still has the older release's; else undefined. */
function upgradedKeywords(
  mine: LangTexts | undefined,
  before: LangTexts,
  after: LangTexts,
): LangTexts | undefined {
  return sameKeywords(mine, before) && !sameKeywords(before, after) ? copyKeywords(after) : undefined;
}

/** Whether two lists hold the same values, in any order. */
function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
}

/** A list as an upgrade leaves it: the release's, when the copy still has the older release's; else undefined. */
function upgradedList(
  mine: readonly string[] | undefined,
  before: readonly string[],
  after: readonly string[],
): string[] | undefined {
  return sameList(mine ?? [], before) && !sameList(before, after) ? [...after] : undefined;
}

/**
 * The deck with its title and description in the languages its own
 * release states them in and the copy lacks, where the copy says what
 * the release says in every language both have; null when that adds nothing. For a copy upgraded
 * before upgrades brought the texts along: nothing the user wrote changes.
 */
export function withReleaseLanguages(deck: Deck, release: LibraryDeckContent): Deck | null {
  const title = withLanguagesOf(deck.title, release.title);
  const description =
    deck.description === undefined || release.description === undefined
      ? undefined
      : isDefaultDeckDescription(deck.description, [deck.title])
        ? sameText(deck.description, release.description)
          ? undefined
          : release.description
        : withLanguagesOf(deck.description, release.description);
  if (title === undefined && description === undefined) return null;
  return { ...deck, ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }) };
}

/**
 * Whether two cards say the same, on both sides, with the same wrong
 * options (distractors, in order), written the same way (text format,
 * none being plain text); ids, versions and retirement aside.
 */
export function sameContent(a: CardContent, b: CardContent): boolean {
  return (
    textFormatOf(a) === textFormatOf(b) &&
    sameDistractors(a, b) &&
    sameText(a.front, b.front) &&
    sameText(a.back, b.back) &&
    a.frontImageUrl === b.frontImageUrl &&
    a.backImageUrl === b.backImageUrl &&
    sameText(a.frontImageDescription, b.frontImageDescription) &&
    sameText(a.backImageDescription, b.backImageDescription) &&
    sameText(a.frontNote, b.frontNote) &&
    sameText(a.backLabel, b.backLabel) &&
    sameText(a.backNote, b.backNote)
  );
}

/**
 * Whether the user has left the copy's card as a release has it — the
 * one the copy came from, say: the same content, or the same but for a
 * text format the copy lacks. An app that predates text formats drops
 * the marker as it imports or writes the card, which is not the user's
 * doing; a copy that states one of its own (`sm:plainText` against a
 * Markdown release, Markdown switched off) was changed on purpose.
 */
export function untouched(mine: CardContent, release: CardContent): boolean {
  return sameContent(mine.textFormat === undefined ? { ...mine, textFormat: release.textFormat } : mine, release);
}

/**
 * What an upgrade does to the content of the copy's card, from the card
 * in the release the copy came from (`old`; absent for one a later
 * release adds), in every release before the newer one that has it
 * (`earlier`: `old`, and those in between) and in the newer release
 * (`next`): nothing; "change" it to the newer release's, where the user
 * left it as an earlier release had it (the library's change; one in
 * between, where an upgrade cut off half-way wrote it), or as any of them
 * has it but for its text format (whose marker it brings back); take it
 * as "applied" where it is already as the newer release has it, which the
 * library changed or added; or keep it as the user has it ("kept"),
 * where the library changed or added it and the user changed it too.
 */
function contentAction(
  mine: CardContent,
  old: CardContent | undefined,
  earlier: readonly CardContent[],
  next: CardContent,
): "none" | "change" | "applied" | "kept" {
  const libraryChanged = old === undefined || !sameContent(old, next);
  if (sameContent(mine, next)) return libraryChanged ? "applied" : "none";
  if (untouched(mine, next) || earlier.some((card) => untouched(mine, card))) return "change";
  return libraryChanged ? "kept" : "none";
}

/** Whether two cards have the same distractors, matched by id: RDF keeps no order among a card's sm:distractor. */
function sameDistractors(a: CardContent, b: CardContent): boolean {
  const mine = a.distractors ?? [];
  const theirs = new Map((b.distractors ?? []).map((distractor) => [distractor.id, distractor]));
  return (
    mine.length === theirs.size &&
    mine.every((distractor) => {
      const other = theirs.get(distractor.id);
      return other !== undefined && sameText(distractor.text, other.text) && sameText(distractor.note, other.note);
    })
  );
}

/**
 * What upgrading the copy to the newer release would do; null — no
 * offer — when the release is not newer, uses a card format this app
 * does not know, or would change nothing (a copy already as the newer
 * release has it, in some card or in the deck's own texts, still moves to
 * it: see `applied`, `gone` and `appliedAbout`). Planned again on a copy
 * an upgrade cut off half-way left, it finishes that upgrade, or, once a
 * newer release is out, takes the copy on to that one: a card already as
 * the release the cut-off upgrade was to has it (one of `between`), or as
 * the newer release has it, counts as the library's, not the user's. A
 * course's deck (`course`) holds only the cards the learner has reached,
 * each joining it when its question is first answered: its upgrade adds
 * none, but changes, retires and restores those it holds as any copy's.
 */
export function planLibraryUpgrade({
  deck,
  cards,
  from,
  between = [],
  to,
  releases,
  course = false,
}: {
  deck: Deck;
  /** The copy's cards, as the pod holds them. */
  cards: readonly Card[];
  /** The release the copy came from. */
  from: LibraryDeckContent;
  /**
   * The releases between the two, when the copy is more than one behind:
   * an upgrade to one of them, cut off before it moved the deck's entry,
   * may have left cards as that release has them. None by default.
   */
  between?: readonly LibraryDeckContent[];
  /** The deck's current release. */
  to: LibraryDeckContent;
  /** Every release of the deck, as the index describes them. */
  releases: readonly LibraryRelease[];
  /** Whether the copy is a course's deck (either release is a course). */
  course?: boolean;
}): LibraryUpgradePlan | null {
  if (Number(to.version) <= Number(from.version)) return null;
  if (to.cards.some((card) => card.formatVersion > CARD_FORMAT_VERSION)) return null;
  const byId = (release: LibraryDeckContent) => new Map(release.cards.map((card) => [card.id, card]));
  const before = byId(from);
  const passed = between.map(byId);
  const after = byId(to);
  const copy = new Map(cards.map((card) => [card.id, card]));
  /** The card in each release before the newer one that has it: the one the copy came from, then those in between. */
  const earlierOf = (id: string) => [before, ...passed].flatMap((release) => release.get(id) ?? []);

  const add: LibraryCard[] = [];
  const change: LibraryCard[] = [];
  const retire: Card[] = [];
  const restore: Card[] = [];
  const remove: Card[] = [];
  const kept: Card[] = [];
  const applied: Card[] = [];
  const gone: string[] = [];
  /** The copy's card against the newer release's: `old` the one the copy came from (absent for one a later release adds). */
  const plan = (mine: Card, old: LibraryCard | undefined, next: LibraryCard) => {
    const earlier = earlierOf(mine.id);
    const action = contentAction(mine, old, earlier, next);
    const retired = next.retired === true;
    const wasRetired = mine.retired === true;
    // The library's retirement holds whatever the user did to the card: one a later release adds is as the newer
    // release has it; another, when a release before it had it as the copy has it (the library changed it since).
    const retiresAnew =
      retired !== wasRetired && (old === undefined || earlier.some((card) => (card.retired === true) === wasRetired));
    if (retiresAnew) (retired ? retire : restore).push(mine);
    if (action === "change") change.push(next);
    else if (action === "kept") kept.push(mine);
    // Nothing to write, but already as the newer release changed it: its content, or its retirement.
    const retirementApplied = old !== undefined && retired !== (old.retired === true);
    if (action !== "change" && !retiresAnew && (action === "applied" || retirementApplied)) applied.push(mine);
  };
  // Every card of the releases, the copy's own release's first, in the order they list them.
  for (const id of new Set([from, ...between, to].flatMap((release) => release.cards.map((card) => card.id)))) {
    const old = before.get(id);
    const next = after.get(id);
    const mine = copy.get(id);
    if (next === undefined) {
      // Removed by the library: from the copy too, where the user left it as a release had it. One the copy no
      // longer has either is gone, its review states left, if any, going with it.
      if (mine === undefined) gone.push(id);
      else (earlierOf(id).some((card) => untouched(mine, card)) ? remove : kept).push(mine);
    } else if (mine !== undefined) plan(mine, old, next);
    // Not in the copy: added unless the user removed it, or, in a course's deck, the learner has not reached it.
    else if (old === undefined && !course) add.push(next);
  }
  const direction =
    to.direction !== from.direction && deck.direction === from.direction ? to.direction : undefined;
  const about = {
    title: upgradedText(deck.title, from.title, to.title),
    // The app's default description is not the user's: it gives way to the release's.
    description:
      deck.description !== undefined && isDefaultDeckDescription(deck.description, [deck.title, from.title])
        ? to.description === undefined || sameText(deck.description, to.description)
          ? undefined
          : to.description
        : upgradedText(deck.description, from.description, to.description),
    keywords: upgradedKeywords(deck.keywords, from.keywords, to.keywords),
    themes: upgradedList(deck.themes, from.themes, to.themes),
  };
  const aboutChanged = Object.values(about).some((value) => value !== undefined);
  // What of the deck itself the newer release changed and the copy already has as it has it.
  const appliedAbout = (
    [
      ["direction", to.direction !== from.direction && deck.direction === to.direction],
      ["title", !sameText(from.title, to.title) && sameText(deck.title, to.title)],
      ["description", !sameText(from.description, to.description) && sameText(deck.description, to.description)],
      ["keywords", !sameKeywords(from.keywords, to.keywords) && sameKeywords(deck.keywords, to.keywords)],
      ["themes", !sameList(from.themes, to.themes) && sameList(deck.themes ?? [], to.themes)],
    ] as const
  ).flatMap(([detail, isApplied]): DeckDetail[] => (isApplied ? [detail] : []));
  if (
    add.length + change.length + retire.length + restore.length + remove.length + applied.length + appliedAbout.length === 0 &&
    // A course's deck lacks every card the learner has not reached: one the release removed is no sign of an upgrade.
    (course || gone.length === 0) &&
    direction === undefined &&
    !aboutChanged
  ) {
    return null;
  }
  return {
    fromVersion: from.version,
    toVersion: to.version,
    releaseUrl: to.url,
    notes: releases
      .filter((r) => Number(r.version) > Number(from.version) && Number(r.version) <= Number(to.version))
      .flatMap((r) => (r.notes === undefined ? [] : [{ version: r.version, notes: r.notes }])),
    add,
    change,
    retire,
    restore,
    remove,
    kept,
    applied,
    gone,
    appliedAbout,
    ...(direction === undefined ? {} : { direction }),
    ...Object.fromEntries(Object.entries(about).filter(([, value]) => value !== undefined)),
  };
}

/**
 * The cards the upgrade writes: the added and changed ones as the release
 * has them, and the retired and restored ones as the copy has them, with
 * their retirement changed. A changed card already carries the
 * release's retirement.
 */
export function upgradedCards(plan: LibraryUpgradePlan): (LibraryCard | Card)[] {
  const changed = new Set(plan.change.map((card) => card.id));
  const flagged = [
    ...plan.retire.map((card): Card => ({ ...card, retired: true })),
    ...plan.restore.map(({ retired: _retired, ...card }): Card => card),
  ].filter((card) => !changed.has(card.id));
  return [...plan.add, ...plan.change, ...flagged];
}

/**
 * The deck as the upgrade writes it: from the newer release, in its
 * direction, with its title, description, keywords and themes, when
 * those change (keywords left out when the release has none).
 */
export function applyLibraryUpgrade(deck: Deck, plan: LibraryUpgradePlan): Deck {
  const { keywords, ...rest } = deck;
  const upgradedKeywords = plan.keywords ?? keywords;
  return {
    ...rest,
    ...(upgradedKeywords === undefined || noKeywords(upgradedKeywords) ? {} : { keywords: upgradedKeywords }),
    sourceUrl: plan.releaseUrl,
    ...(plan.direction === undefined ? {} : { direction: plan.direction }),
    ...(plan.title === undefined ? {} : { title: plan.title }),
    ...(plan.description === undefined ? {} : { description: plan.description }),
    ...(plan.themes === undefined ? {} : { themes: plan.themes }),
  };
}
