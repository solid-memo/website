// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { problem, type ReleaseProblem } from "./problems.ts";
import {
  DCAT_NS,
  publishedIds,
  versionOf,
  type ReleaseKind,
  type ReleaseModel,
} from "./releaseModel.ts";

/**
 * A release against the version before it (docs/deck-library.md): it
 * drops none of the cards, chapters, steps and distractors that one has
 * (one the deck no longer uses is retired, owl:deprecated true, so the
 * copies that have it keep it and its review history, and the learners
 * that follow a course their place in it), gives none of their ids to
 * another kind of subject, and its version is that one's plus one.
 */

const KINDS: readonly ReleaseKind[] = ["card", "chapter", "step", "distractor"];
const OUTLINE: readonly ReleaseKind[] = ["chapter", "step", "distractor"];

export function continuityProblems(before: ReleaseModel, after: ReleaseModel): ReleaseProblem[] {
  const problems: ReleaseProblem[] = [];
  const previous = before.url;
  const dropped = (kinds: readonly ReleaseKind[]) => {
    const now = new Set(kinds.flatMap((kind) => publishedIds(after, kind)));
    return kinds.flatMap((kind) => publishedIds(before, kind)).filter((id) => !now.has(id));
  };
  const cards = dropped(["card"]);
  if (cards.length > 0)
    problems.push(
      problem(
        after.url,
        { code: "cardsDropped", params: { ids: cards, previous } },
        { related: [previous] },
      ),
    );
  const outline = dropped(OUTLINE);
  if (outline.length > 0) {
    problems.push(
      problem(
        after.url,
        { code: "outlineDropped", params: { ids: outline, previous } },
        { related: [previous] },
      ),
    );
  }

  const kindsNow = new Map<string, ReleaseKind[]>();
  for (const kind of KINDS)
    for (const id of publishedIds(after, kind)) {
      const kinds = kindsNow.get(id);
      if (kinds === undefined) kindsNow.set(id, [kind]);
      else kinds.push(kind);
    }
  for (const was of KINDS) {
    for (const id of publishedIds(before, was)) {
      const now = kindsNow.get(id) ?? [];
      if (now.length > 0 && !now.includes(was)) {
        problems.push(
          problem(
            after.url,
            { code: "idReused", params: { id, was, now: now[0], previous } },
            { related: [previous] },
          ),
        );
      }
    }
  }

  const version = versionOf(after);
  const previousVersion = versionOf(before);
  if (version !== undefined && previousVersion !== undefined && version !== previousVersion + 1) {
    problems.push(
      problem(
        after.url,
        { code: "versionNotNext", params: { version, previousVersion, previous } },
        { related: [previous] },
      ),
    );
  }
  return problems;
}

/**
 * A release in a pod against the series it names. One that follows none
 * (no `dcat:prev`) starts one of its own, `<release>#id`. A series
 * anywhere else is another release's, and the release, once published,
 * would be offered to that one's learners as its newest version
 * (GHSA-38m7-8r5j-q79f). One that follows a release stays in that one's
 * series, which is where it is: in a document in the container of the
 * release it follows or in one above it (that one's `#series`, or a
 * library's index), so not in another pod on the same server
 * (seriesAbove). What the release it follows says of a series anywhere
 * else is no proof that the series is its own. A library's first
 * versions are in its index's series, which the library policy places
 * them in instead.
 */
export function ownSeriesProblems(model: ReleaseModel): ReleaseProblem[] {
  const previous = model.prev.filter((term) => term.kind === "iri").map((term) => term.value);
  return model.inSeries
    .filter((term) => term.kind === "iri" && !term.value.startsWith(`${model.url}#`))
    .flatMap((term): ReleaseProblem[] => {
      const series = term.value;
      const where = { field: `${DCAT_NS}inSeries`, related: [series] };
      if (previous.length === 0)
        return [problem(model.url, { code: "seriesNotOwn", params: { series } }, where)];
      if (previous.some((url) => seriesAbove(url, series))) return [];
      return [
        problem(
          model.url,
          { code: "seriesNotPrevious", params: { series, previous: previous[0]! } },
          { field: where.field, related: [series, previous[0]!] },
        ),
      ];
    });
}

/**
 * Whether the document of a series is in the container of a release or
 * in one above it, on its origin: a pod's `v1.ttl#series` beside
 * `v2.ttl`, or a library's `decks/index.ttl#x` above `decks/x/v2.ttl`.
 * A series in another pod on the same server is in neither. A path that
 * holds an encoded `/` or `\` (`%2F`, `%5C`) is in neither too: a server
 * may read it as a separator, so its container isn't the one it seems.
 * Known limits: a series document in the origin's root container is
 * above every release on that origin, and a series kept in a sibling
 * container, neither the release's nor one above it, is refused
 * (seriesNotPrevious).
 */
export function seriesAbove(release: string, series: string): boolean {
  const at = URL.parse(release);
  const of = URL.parse(series);
  if (at === null || of === null || at.origin === "null" || at.origin !== of.origin) return false;
  const encodedSeparator = (url: URL) => /%(2f|5c)/i.test(url.pathname);
  if (encodedSeparator(at) || encodedSeparator(of)) return false;
  const container = (url: URL) => url.pathname.slice(0, url.pathname.lastIndexOf("/") + 1);
  return container(at).startsWith(container(of));
}
