import { problem, type CountedThing, type ReleaseProblem, type SourceDetail } from "./problems.ts";
import { DCTERMS_NS, SCHEMA_NS, type ReleaseMaking, type ReleaseModel, type ReleaseSource, type ReleaseTerm, type ReleaseText } from "./releaseModel.ts";

/**
 * How a release says it was made, curated (docs/studio.md, The release
 * check): warnings, never errors, on what a reader of its provenance
 * would miss. A source it names says what it is (a title), whose it is
 * (a creator) and on what terms it was used (a licence, or a comment
 * quoting the evidence for one). A source its own making used is one it
 * is derived from too. And what its making says it counts (its chapters,
 * steps, sources, cards) is what it has. No rule here names a series,
 * author or host.
 */

const PROV = "http://www.w3.org/ns/prov#";
export const RDFS_COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";

/** What a release states, of a subject and a predicate. */
export type StatementsOf = (subject: string, predicate: string) => ReleaseTerm[];

/**
 * The activities that generated a release (`generating`, in order) and
 * what it states of its sources (provenanceRules), from its statements
 * (`said`): the library's command reads them from its quads, the Studio
 * from a draft's statements. An activity in `carried` is how an earlier
 * release was made.
 */
export function provenanceOf(
  said: StatementsOf,
  generating: readonly string[],
  sources: readonly ReleaseTerm[],
  carried: ReadonlySet<string> = new Set(),
): Pick<ReleaseModel, "making" | "sourceDetails"> {
  const making: ReleaseMaking[] = generating.map((iri) => ({
    iri,
    used: said(iri, `${PROV}used`).flatMap((term) => (term.kind === "iri" ? [term.value] : [])),
    comments: said(iri, RDFS_COMMENT).filter((term): term is ReleaseText => term.kind === "literal"),
    carried: carried.has(iri),
  }));
  const named = [...new Set([...sources.flatMap((term) => (term.kind === "iri" ? [term.value] : [])), ...making.flatMap((one) => one.used)])];
  const sourceDetails: ReleaseSource[] = named.map((iri) => ({
    iri,
    title: said(iri, `${DCTERMS_NS}title`),
    creator: said(iri, `${DCTERMS_NS}creator`),
    licence: said(iri, `${DCTERMS_NS}license`),
    comments: said(iri, RDFS_COMMENT),
  }));
  return { making, sourceDetails };
}

/**
 * The counts a making's comment may state, by the words that name them
 * in English and Swedish: "17 chapters", "193 steps", "248 documents".
 * Chapters and steps are a course's own only (a deck's comment may count
 * a book's chapters).
 * Cards are often counted in parts ("15 chemical-name cards", "near 80
 * cards"), so only a total counts: "466 cards in all". A number may have
 * thousands commas ("1,398").
 */
const COUNTED: readonly { what: CountedThing; course: boolean; words: RegExp }[] = [
  { what: "chapters", course: true, words: /\b(\d[\d,]*)\s+(?:chapters?|kapitel)(?![\p{L}\d])/giu },
  { what: "steps", course: true, words: /\b(\d[\d,]*)\s+(?:steps?|steg)(?![\p{L}\d])/giu },
  { what: "sources", course: false, words: /\b(\d[\d,]*)\s+(?:sources?|documents?|källor|källa|dokument)(?![\p{L}\d])/giu },
  {
    what: "cards",
    course: false,
    words: /\b(\d[\d,]*)\s+(?:cards?|questions?|kort|frågor|fråga)\s+(?:in all|in total|i allt|totalt|sammanlagt)(?![\p{L}\d])/giu,
  },
];

/** How many of each the release has: its chapters, steps and cards in use, and the sources it is derived from. */
function countsOf(model: ReleaseModel): Record<CountedThing, number> {
  return {
    chapters: model.chapters.filter((one) => !one.retired).length,
    steps: model.steps.filter((one) => !one.retired).length,
    sources: model.sources.length,
    cards: model.cards.filter((one) => !one.retired).length,
  };
}

/** What a reader of how the release was made would miss; every one a warning. */
export function provenanceProblems(model: ReleaseModel): ReleaseProblem[] {
  const problems: ReleaseProblem[] = [];
  const derived = new Set(model.sources.map((term) => term.value));
  for (const source of model.sourceDetails) {
    const missing: SourceDetail[] = [
      ...(source.title.length === 0 ? ["title" as const] : []),
      ...(source.creator.length === 0 ? ["creator" as const] : []),
      ...(source.licence.length === 0 && source.comments.length === 0 ? ["licence" as const] : []),
    ];
    if (missing.length > 0) problems.push(problem(source.iri, { code: "sourceUndescribed", params: { missing } }, { severity: "warning" }));
    // An earlier release's making is not rewritten: what it used is not held to this release's derivation.
    const users = model.making.filter((one) => !one.carried && one.used.includes(source.iri)).map((one) => one.iri);
    if (users.length > 0 && !derived.has(source.iri)) {
      problems.push(problem(source.iri, { code: "usedNotDerived", params: {} }, { related: users, severity: "warning" }));
    }
  }
  const counts = countsOf(model);
  const course = model.types.includes(`${SCHEMA_NS}Course`);
  const counted = COUNTED.filter((one) => course || !one.course);
  // An earlier release's making counted that release: it is not held to this one.
  for (const making of model.making.filter((one) => !one.carried)) {
    for (const comment of making.comments) {
      for (const { what, words } of counted) {
        for (const match of comment.value.matchAll(words)) {
          const stated = Number(match[1]!.replaceAll(",", ""));
          if (stated !== counts[what]) {
            problems.push(
              problem(making.iri, { code: "countDisagrees", params: { what, stated, counted: counts[what] } }, { field: RDFS_COMMENT, severity: "warning" }),
            );
          }
        }
      }
    }
  }
  return problems;
}
