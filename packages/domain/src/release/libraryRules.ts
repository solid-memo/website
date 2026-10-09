import { problem, type ReleaseProblem } from "./problems.ts";
import { DCAT_NS, DCTERMS_NS, type ReleaseModel, type ReleaseTerm } from "./releaseModel.ts";

/**
 * Where a release stands in a library (docs/deck-library.md): each
 * deck's releases at <name>/v<N>.ttl, the name plain, the versions
 * running 1, 2, … without gaps; and each release's metadata against
 * that place: one deck, the document itself, of its version, in its
 * series, by its publisher, following the version before it.
 */

/** Deck names are plain: lower-case letters, digits and dashes. */
export const DECK_NAME = /^[a-z0-9][a-z0-9-]*$/;
const RELEASE_PATH = /^([^/]+)\/v([1-9][0-9]*)\.ttl$/;

/** The deck and version a path names (`<name>/v<N>.ttl`), or undefined when it names no release. */
export function releasePathOf(path: string): { deck: string; version: number } | undefined {
  const match = RELEASE_PATH.exec(path);
  return match === null || !DECK_NAME.test(match[1]) ? undefined : { deck: match[1], version: Number(match[2]) };
}

/** A path that names no release, which a library holds nothing but. */
export function pathProblems(path: string): ReleaseProblem[] {
  return releasePathOf(path) === undefined ? [problem(path, { code: "notARelease", params: { path } })] : [];
}

/** Each deck, among the paths, whose versions do not run 1, 2, … without gaps. */
export function versionGapProblems(paths: Iterable<string>): ReleaseProblem[] {
  const versionsOf = new Map<string, number[]>();
  for (const path of paths) {
    const at = releasePathOf(path);
    if (at !== undefined) versionsOf.set(at.deck, [...(versionsOf.get(at.deck) ?? []), at.version]);
  }
  return [...versionsOf]
    .map(([deck, versions]) => [deck, versions.sort((a, b) => a - b)] as const)
    .filter(([, versions]) => versions.some((version, i) => version !== i + 1))
    .map(([deck, versions]) => problem(deck, { code: "versionGap", params: { deck, versions } }));
}

/** Where a release is published: its version, its series and publisher, and the release before it (none for version 1). */
export interface ReleasePlace {
  version: number;
  series: string;
  publisher: string;
  previous?: string;
}

/** What the shapes cannot say about a release's metadata, against its place. */
export function metadataProblems(model: ReleaseModel, place: ReleasePlace): ReleaseProblem[] {
  const { url } = model;
  const problems: ReleaseProblem[] = [];
  if (model.decks.length !== 1 || model.decks[0] !== url) {
    problems.push(problem(url, { code: "notOneDeck", params: { decks: model.decks } }));
  }
  const literals = model.version.filter((term) => term.kind === "literal");
  if (literals.length !== 1 || literals[0].value !== String(place.version)) {
    problems.push(
      problem(url, { code: "versionMismatch", params: { stated: model.version, expected: place.version } }, { field: `${DCAT_NS}version` }),
    );
  }
  const expect = (field: string, stated: readonly ReleaseTerm[], expected: readonly string[]) => {
    if (stated.length !== expected.length || stated.some((term, i) => term.value !== expected[i])) {
      problems.push(problem(url, { code: "linkMismatch", params: { stated: [...stated], expected: [...expected] } }, { field }));
    }
  };
  expect(`${DCAT_NS}inSeries`, model.inSeries, [place.series]);
  expect(`${DCAT_NS}isVersionOf`, model.isVersionOf, [place.series]);
  expect(`${DCTERMS_NS}publisher`, model.publisher, [place.publisher]);
  const previous = place.previous === undefined ? [] : [place.previous];
  expect(`${DCAT_NS}prev`, model.prev, previous);
  expect(`${DCAT_NS}previousVersion`, model.previousVersion, previous);
  return problems;
}
