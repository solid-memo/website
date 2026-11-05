// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import {
  AGENT_V1,
  CARD_V7,
  DISTRACTOR_V1,
  DISTRIBUTION_V1,
  DRAFT_CHAPTER_V1,
  DRAFT_DECK_V1,
  DRAFT_STEP_V1,
} from "@solid-memo/vocab/descriptors.generated";
import {
  idIn,
  idsInUse,
  iriIn,
  NOTHING_PUBLISHED,
  SERIES_ID,
  type DraftNode,
  type DraftTriple,
  type ReleaseDraft,
} from "./releaseDraft.ts";

/**
 * A release as a draft at another address (docs/studio.md, Drafts): the
 * release read whole, every subject of it (`<release>#id`) and the
 * release itself (`<release>`) moved to the draft's (`<draft>#id`,
 * `<draft>`), wherever a record or a statement names it; everything else
 * as the release says it. An import of a release file is this, in a
 * series of its own (withOwnSeries): the draft holds what the release
 * held, so publishing it unchanged gives the release again at its new
 * address (assemble, in the repository).
 * What the next version of a release starts from is in releaseVersion.ts.
 */
export function releaseToDraft(release: ReleaseDraft, url: string): ReleaseDraft {
  const draft = rebaseDraft(release, url);
  const { releasedAs: _released, ...root } = draft.root;
  return { ...draft, root, published: NOTHING_PUBLISHED };
}

/**
 * A release file as a draft may start from it: in a series of its own
 * (docs/studio.md, Drafts). A series the file names that is one of its
 * own subjects (`<release>#id`) is kept, and moves with the release; one
 * named anywhere else is another release's, whose newest version the
 * draft would be once published. Such a series gives way to one of the
 * file's own, `#series` (or `#series-2`, … when that id is taken), as
 * `dcat:inSeries` and as `dcat:isVersionOf` when that names no subject
 * of the file either, and what the file states of it is dropped
 * (GHSA-38m7-8r5j-q79f).
 */
export function withOwnSeries(release: ReleaseDraft): ReleaseDraft {
  const { inSeries, isVersionOf, ...rest } = release.root;
  const foreign = (iri: string | undefined): iri is string =>
    iri !== undefined && idIn(release, iri) === null;
  if (!foreign(inSeries) && !foreign(isVersionOf)) return release;
  const series = foreign(inSeries) ? iriIn(release, freeId(release, SERIES_ID)) : inSeries;
  const version = foreign(isVersionOf) ? series : isVersionOf;
  // The release itself, named as its own series, keeps what it states.
  const dropped = new Set(
    [inSeries, isVersionOf].filter((iri) => foreign(iri) && iri !== release.url),
  );
  return {
    ...release,
    root: {
      ...rest,
      ...(series === undefined ? {} : { inSeries: series }),
      ...(version === undefined ? {} : { isVersionOf: version }),
    },
    triples: release.triples.filter((triple) => !dropped.has(triple.subject)),
  };
}

/** `id`, or `id-2`, `id-3`, … the first that no subject of the draft has. */
function freeId(draft: ReleaseDraft, id: string): string {
  const used = idsInUse(draft);
  let name = id;
  for (let n = 2; used.has(name); n++) name = `${id}-${n}`;
  return name;
}

/** An IRI of the release at `from` as one of `to`; any other IRI as it is. */
export function moved(iri: string, from: string, to: string): string {
  if (iri === from) return to;
  return iri.startsWith(`${from}#`) ? `${to}${iri.slice(from.length)}` : iri;
}

/** Every IRI of the draft moved by `move`: the records' and the statements'. */
export function rebaseDraft(
  draft: ReleaseDraft,
  url: string,
  move: (iri: string) => string = (iri) => moved(iri, draft.url, url),
): ReleaseDraft {
  const nodes = <T>(list: readonly DraftNode<T>[]) =>
    list.map((node) => ({ id: node.id, data: rebased(node.data, move) }));
  return {
    ...draft,
    url,
    root: rebased(draft.root, move),
    agents: nodes(draft.agents),
    distributions: nodes(draft.distributions),
    chapters: nodes(draft.chapters),
    steps: nodes(draft.steps),
    cards: nodes(draft.cards),
    distractors: nodes(draft.distractors),
    triples: draft.triples.map(
      (triple): DraftTriple => ({
        subject: triple.subject.startsWith("_:") ? triple.subject : move(triple.subject),
        predicate: triple.predicate,
        object:
          triple.object.kind === "iri"
            ? { kind: "iri", value: move(triple.object.value) }
            : triple.object,
      }),
    ),
  };
}

/** The fields of a draft's records that name an IRI, as their shapes say. */
const LINKS = new Set(
  [
    AGENT_V1,
    DISTRIBUTION_V1,
    DRAFT_DECK_V1,
    DRAFT_CHAPTER_V1,
    DRAFT_STEP_V1,
    CARD_V7,
    DISTRACTOR_V1,
  ].flatMap((descriptor) =>
    descriptor.fields
      .filter((field) => field.kind === "iri" || field.kind === "iriEnum")
      .map((field) => field.name),
  ),
);

/** A record with every IRI it names moved by `move`. */
function rebased<T>(data: T, move: (iri: string) => string): T {
  return Object.fromEntries(
    Object.entries(data as object).map(([field, value]) => [
      field,
      !LINKS.has(field) || value === undefined
        ? value
        : Array.isArray(value)
          ? value.map((one: string) => move(one))
          : move(value as string),
    ]),
  ) as T;
}
