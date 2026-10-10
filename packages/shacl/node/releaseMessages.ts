import type { MarkdownProblem } from "@solid-memo/markdown/problems";
import { MAX_CHARS, MAX_DEPTH, MAX_TABLE_CELLS, MAX_TABLE_COLUMNS } from "@solid-memo/markdown/parse";
import type { CurationProblem, ReadinessProblem, ReleaseProblem, ShapeProblem, UnreadProblem } from "@solid-memo/domain/release/problems";
import type { ReleaseTerm } from "@solid-memo/domain/release/releaseModel";
import { SM_NS } from "@solid-memo/vocab/tooling/vocab";

/**
 * The problems the release rules (@solid-memo/domain/release) find,
 * worded in English for `npm run library` (deckLibrary.ts): each after
 * where it is, `decks/<name>/v<N>.ttl:`, its subjects shown relative to
 * the release (`<#q-1>`). The library's curation is the shapes' to
 * word, which state it too (LibraryDeckV5): its problems have no words
 * here. Nor has a version that does not follow the one before it: in the
 * library a version's path fixes it, so `versionMismatch` says so.
 */

const PREFIXES: readonly (readonly [string, string])[] = [
  [SM_NS, "solid-memo:"],
  ["http://purl.org/dc/terms/", "dcterms:"],
  ["http://www.w3.org/ns/dcat#", "dcat:"],
];

/** A predicate's IRI as Turtle writes it in the library: `solid-memo:front`. */
function nameOf(iri: string): string {
  const [namespace, prefix] = PREFIXES.find(([namespace]) => iri.startsWith(namespace))!;
  return `${prefix}${iri.slice(namespace.length)}`;
}

/** Values as a problem quotes them: a literal's text in quotes, any other `<iri>`; "nothing" for none. */
function shownValues(terms: readonly ReleaseTerm[]): string {
  return terms.length === 0 ? "nothing" : terms.map((t) => (t.kind === "literal" ? JSON.stringify(t.value) : `<${t.value}>`)).join(", ");
}

/** What a Markdown problem means for a release's author, after the subject and field it is in. */
function markdownText(problem: MarkdownProblem): string {
  const code = (source: string) => JSON.stringify(source);
  switch (problem.code) {
    case "tooLong":
      return `is ${problem.length} characters, more than the ${MAX_CHARS} the app reads as Markdown: it would be shown as plain text. Make it shorter.`;
    case "tooComplex":
      return "nests or marks up more than the app reads as Markdown (docs/markdown.md, Limits): it would be shown as plain text.";
    case "tooDeep":
      return `nests ${code(problem.source)} past the ${MAX_DEPTH} levels of blocks and markup the app reads (each quote, list item, paragraph, emphasis and link is one): it would be shown as its source.`;
    case "largeTable":
      return `has a table of more than ${MAX_TABLE_COLUMNS} columns or ${MAX_TABLE_CELLS} cells: it would be shown as its source.`;
    case "html":
      return `has raw HTML, ${code(problem.source)}, which is shown as its source: write it as code, or escape its "<" (\\<).`;
    case "image":
      return `has a picture, ${code(problem.source)}, which is never shown, only its description: a card shows a picture by solid-memo:frontImage or backImage.`;
    case "link":
      return `has a link, ${code(problem.source)}, where none may be (a card's sides, its label and its options): ${problem.autolink ? "an autolink loses its angle brackets; " : ""}write it as code to show it as written.`;
    case "linkNotFollowed":
      return `links to ${code(problem.url)}, which the app does not follow: only an https: address without a user name or password is.`;
    case "linkHost":
      return `has link text that reads as the host name or address ${code(problem.text)}, but the link leads to ${problem.host}: name that host, or word the text otherwise (a file's name, such as package.json, reads as a host name too).`;
    case "hiddenControl":
      return `has ${problem.controls.join(", ")} in ${problem.in === "code" ? "code" : "a link"}, which would show as markers: such controls make text read other than it is.`;
    case "characterReference":
      return `has the character reference ${problem.source}, which Markdown shows decoded: write it as code, or escape its "&" (\\${problem.source}).`;
    case "notOneParagraph":
      return "is an option but not one paragraph: the right option and the wrong ones must look alike.";
    case "dashHeading":
      return `underlines a line with dashes, ${code(problem.source)}, which makes it a heading, not a line of text and a thematic break: put a blank line before the break (in a step's theory, it ends a chunk), or write the heading with "##".`;
  }
}

/**
 * The problems worded here: all but curation, readiness and the shapes'
 * results (the Studio's: the library's command words what the shapes
 * find as the shapes do), `versionNotNext`, and the Studio's own parts
 * not read (the command reads every release, or fails).
 */
export type WordedProblem = Exclude<
  ReleaseProblem,
  CurationProblem | ReadinessProblem | ShapeProblem | UnreadProblem | { code: "versionNotNext" }
>;

/**
 * A problem in English. `label` is where it is (`decks/<name>/v<N>.ttl`)
 * and `url` the release's address, which its subjects are shown
 * relative to.
 */
export function releaseMessage(problem: WordedProblem, label: string, url: string): string {
  const shown = (iri: string) => (iri.startsWith(`${url}#`) ? `<${iri.slice(url.length)}>` : `<${iri}>`);
  const list = (iris: readonly string[]) => iris.map(shown).join(", ");
  /** The file of a release, as its successor names it: `v1.ttl`. */
  const fileOf = (release: string) => release.slice(release.lastIndexOf("/") + 1);
  const subject = shown(problem.subject);
  const at = `${label}: `;
  switch (problem.code) {
    case "notARelease":
      return `decks/${problem.params.path} is neither the index nor a release: decks/ holds only index.ttl and <name>/v<N>.ttl, the name lower-case letters, digits and dashes.`;
    case "versionGap":
      return `decks/${problem.params.deck}/: versions must run 1, 2, … without gaps; found ${problem.params.versions.map((v) => `v${v}.ttl`).join(", ")}.`;
    case "notOneDeck":
      return `${at}expected the document itself to be its one solid-memo:Deck, found ${problem.params.decks.map((d) => `<${d}>`).join(", ") || "none"}.`;
    case "versionMismatch":
      return `${at}states dcat:version ${shownValues(problem.params.stated)}; its path says "${problem.params.expected}".`;
    case "linkMismatch": {
      const [expected] = problem.params.expected;
      return `${at}states ${nameOf(problem.field!)} ${shownValues(problem.params.stated)}; its path says ${expected === undefined ? "nothing, being the first version" : `<${expected}>`}.`;
    }
    case "cardsDropped":
      return `${at}drops ${problem.params.ids.map((id) => `<#${id}>`).join(", ")}, which ${fileOf(problem.params.previous)} has. A card is never removed: retire it (owl:deprecated true), so the copies that have it keep it and its review history.`;
    case "outlineDropped":
      return `${at}drops ${problem.params.ids.map((id) => `<#${id}>`).join(", ")}, which ${fileOf(problem.params.previous)} has. A chapter, step or distractor is never removed: retire it (owl:deprecated true), so the copies that follow the course keep their place in it.`;
    case "idReused":
      return `${at}<#${problem.params.id}> is a ${problem.params.now}, but a ${problem.params.was} in ${fileOf(problem.params.previous)}: an id names one subject for good, so give the ${problem.params.now} an id of its own.`;
    case "outlineWithoutCourse":
      return `${at}has chapters or steps but is no schema:Course: type the release itself schema:Course.`;
    case "courseWithoutChapter":
      return `${at}is a schema:Course without a chapter: a course has at least one solid-memo:Chapter.`;
    case "courseDirection":
      return `${at}states solid-memo:studyDirection ${shownValues(problem.params.stated)}; a course studies solid-memo:frontToBack.`;
    case "chapterPartOf":
      return `${at}chapter ${subject} is part of ${list(problem.params.parts)}; a chapter is part of the release it is in (schema:isPartOf <>).`;
    case "stepPartOf":
      return `${at}step ${subject} is part of ${shown(problem.params.part)}, which is no chapter of this release.`;
    case "askedNotACard":
      return `${at}${subject} names ${shown(problem.params.card)} by ${nameOf(problem.field!)}, which is no card of this release.`;
    case "askedRetired":
      return `${at}${subject} names ${shown(problem.params.card)} by ${nameOf(problem.field!)}, which is retired: name a card in use, or retire ${subject} too.`;
    case "notADistractor":
      return `${at}${subject} names ${shown(problem.params.distractor)} by solid-memo:distractor, which is no solid-memo:Distractor of this release.`;
    case "distractorShared":
      return `${at}distractor ${subject} is named by ${list(problem.params.cards)}; a distractor is one card's: give each card its own.`;
    case "checkedTwice":
      return `${at}${subject} is checked by ${list(problem.params.steps)}; a card is checked by one step at most.`;
    case "checkedAndReviewed":
      return `${at}${subject} is checked by ${list(problem.params.steps)} and a review question of ${list(problem.params.chapters)}; a card is the one or the other.`;
    case "noBack":
      return `${at}${subject} has no text on its back (solid-memo:back), the right one among the options a course offers.`;
    case "fewDistractors":
      return `${at}${subject} has too few distractors (${problem.params.count}); a card a course asks has at least ${problem.params.least}.`;
    case "distractorLanguages": {
      const missing = problem.params.missing.map((l) => (l === "" ? "untagged" : `@${l}`)).join(", ");
      return `${at}distractor ${subject} has no text ${missing}, which the back of ${shown(problem.params.card)} has.`;
    }
    case "chapterPositions":
      return `${at}chapters ${list(problem.params.chapters)} share schema:position ${problem.params.position}; a course's chapters each have their own.`;
    case "stepPositions":
      return `${at}steps ${list(problem.params.steps)} of ${shown(problem.params.chapter)} share schema:position ${problem.params.position}; a chapter's steps each have their own.`;
    case "chapterWithoutStep":
      return `${at}chapter ${subject} has no step in use; a chapter in use has at least one step that is not retired.`;
    case "textFormatMisplaced": {
      const why = problem.params.distractor ? "a distractor's text is written as its card's" : "its text is plain text";
      return `${at}${subject} states solid-memo:textFormat, which only a card, a step or a chapter does: ${why}.`;
    }
    case "textFormatUnknown":
      return `${at}${subject} states solid-memo:textFormat ${shownValues([problem.params.format])}, no concept of solid-memo:TextFormats: the app shows its text as plain text.`;
    case "markdown": {
      const { language, finding } = problem.params;
      return `${at}${subject} ${nameOf(problem.field!)}${language === "" ? "" : `@${language}`} ${markdownText(finding as MarkdownProblem)}`;
    }
    case "theoryEmptyChunk": {
      const { language } = problem.params;
      return `${at}${subject} solid-memo:theory${language === "" ? "" : `@${language}`} has a thematic break first, last or right after another, which makes an empty chunk the app drops: a step's theory is shown a chunk at a time, split at its top-level thematic breaks, with text between each two.`;
    }
    case "theoryChunks": {
      const counts = problem.params.counts.map(
        ({ language, chunks }) => `${chunks} ${chunks === 1 ? "chunk" : "chunks"} in solid-memo:theory${language === "" ? "" : `@${language}`}`,
      );
      return `${at}${subject} has its theory in ${counts.join(", ")}: a step's theory is in as many chunks in each language, so a learner who switches language keeps their place.`;
    }
  }
}
