import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import type { Quad } from "n3";
import { parseTurtle } from "@solid-memo/turtle/rdf";
import { DECKS_ROOT } from "@solid-memo/vocab/tooling/root";
import { buildIndex, courseProblems, loadValidators, markdownProblems, metadataProblems, validateLibrary, type DeckRelease } from "./deckLibrary.ts";

/**
 * The golden test of the library's rules (docs/deck-library.md, Checks):
 * what they say, in the words of `npm run library:check`, of published
 * releases of decks/, which never change, with faults put in. The text
 * in deckLibrary.golden.txt was written by the rules before they moved
 * to the domain (@solid-memo/domain/release), so a change to a rule or
 * its wording shows here as a diff. Update it with
 * `npm run test:unit -- packages/shacl/node/deckLibrary.golden.test.ts -u`
 * only when the change is meant.
 */

const SM = "https://solid-memo.com/ns/vocab/v1.ttl#";
const SCHEMA = "https://schema.org/";
const DECKS = ["greek-alphabet", "git-commands", "solid-fundamentals"];
/** A subject of a card, chapter, step or distractor, in the house style: its first line names its type. */
const OUTLINE_SUBJECT = /(\n<#[^>]*>\n\s+a solid-memo:(?:Card|Step|Chapter|Distractor)[^;.]*;)/g;

async function published(deck: string): Promise<DeckRelease> {
  const turtle = await readFile(join(DECKS_ROOT, deck, "v1.ttl"), "utf8");
  return { deck, version: 1, turtle, quads: parseTurtle(turtle, `https://solid-memo.com/decks/${deck}/v1.ttl`) };
}

function rewritten(release: DeckRelease, turtle: string): DeckRelease {
  return { ...release, turtle, quads: parseTurtle(turtle, `https://solid-memo.com/decks/${release.deck}/v1.ttl`) };
}

function without(release: DeckRelease, drop: (q: Quad) => boolean): DeckRelease {
  return { ...release, quads: release.quads.filter((q) => !drop(q)) };
}

it("says what it said of published releases with faults put in", async () => {
  const validators = await loadValidators();
  const out: string[] = [];
  const section = (title: string, problems: readonly string[]) => out.push(`## ${title}`, ...problems);
  for (const deck of DECKS) {
    const release = await published(deck);
    section(`${deck}: as published`, [...metadataProblems(release), ...courseProblems(release), ...markdownProblems(release)]);
    section(`${deck}: at the next version's path`, metadataProblems({ ...release, version: 2 }));
    const retired = rewritten(release, release.turtle.replace(OUTLINE_SUBJECT, "$1\n    <http://www.w3.org/2002/07/owl#deprecated> true ;"));
    section(`${deck}: everything retired`, courseProblems(retired));
    const outline = without(release, (q) => q.predicate.value === `${SCHEMA}isPartOf` || q.predicate.value === `${SCHEMA}position`);
    section(`${deck}: no outline links`, courseProblems(outline));
    const card = /\n<(#[^>]+)>\n\s+a solid-memo:Card/.exec(release.turtle)![1];
    const coursed = rewritten(
      release,
      `${release.turtle}\n<#zz-ch> a <${SM}Chapter> ; <${SCHEMA}isPartOf> <https://x.example/> ; <${SM}reviewQuestion> <#zz-none> , <${card}> .\n<#zz-st> a <${SM}Step> ; <${SCHEMA}isPartOf> <#zz-ch> ; <${SM}checkedBy> <${card}> .\n`,
    );
    section(`${deck}: an outline added`, courseProblems(coursed));
  }
  for (const deck of DECKS.slice(0, 2)) {
    const release = await published(deck);
    const marked = rewritten(release, release.turtle.replace(OUTLINE_SUBJECT, "$1\n    solid-memo:textFormat solid-memo:markdown ;"));
    section(`${deck}: everything in Markdown`, markdownProblems(marked));
    const subjects = [...new Set(release.quads.map((q) => q.subject.value).filter((s) => s.includes("#")))];
    const dropped = new Set(subjects.filter((_, i) => i % 3 === 0));
    const next = { ...without(release, (q) => dropped.has(q.subject.value)), version: 2 };
    const problems = await validateLibrary([release, next], buildIndex([release, next]), validators);
    // The shapes' reports (several lines each) are pySHACL's and rdf-validate-shacl's words, not the rules'.
    section(`${deck}: a next version that drops a third`, problems.filter((p) => !p.includes("\n")));
  }
  const course = await published("solid-fundamentals");
  const stripped = without(course, (q) => [`${SM}distractorText`, `${SM}back`].includes(q.predicate.value) && !q.subject.value.includes("#ch-1"));
  section("solid-fundamentals: no backs nor distractor text", courseProblems(stripped).slice(0, 40));
  await expect(`${out.join("\n")}\n`).toMatchFileSnapshot("deckLibrary.golden.txt");
}, 30_000);
