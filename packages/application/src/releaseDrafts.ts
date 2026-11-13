// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import type { KeptDocuments } from "@solid-memo/domain/instance";
import { catalogUrlOf, isDocumentIn } from "@solid-memo/domain/instanceLayout";
import { draftAddressesGuest, isGuestPodIri, isGuestUrl } from "@solid-memo/domain/guest";
import { DECK_FILE_ACCEPT, deckFileFormatOf } from "@solid-memo/domain/deckFile";
import { shown, tidiedStated, type LangText } from "@solid-memo/domain/langText";
import { deckToDraft } from "@solid-memo/domain/release/deckToDraft";
import {
  draftContainerOf,
  draftNameFor,
  draftsContainerOf,
  draftPlaceOf,
  draftUrlOf,
  type ReleaseDraftSummary,
} from "@solid-memo/domain/release/draftLayout";
import {
  applyDraftChanges,
  blankDraft,
  idIn,
  iriIn,
  isRefusal,
  mergedDraft,
  publishedIdsOf,
  RDF_TYPE,
  type DraftChange,
  type DraftRefusal,
  type DraftTriple,
  type PublishedIds,
  type ReleaseDraft,
  unsupportedIdOf,
} from "@solid-memo/domain/release/releaseDraft";
import { continuityProblems } from "@solid-memo/domain/release/continuityRules";
import { withPlainSources } from "@solid-memo/domain/release/releaseMetadata";
import { draftLibraryDeck } from "@solid-memo/domain/release/draftListing";
import {
  releaseDiff,
  simulateLearnerUpgrade,
  type LearnerUpgrade,
  type ReleaseDiff,
} from "@solid-memo/domain/release/releaseDiff";
import {
  draftReleaseModel,
  outsideCreatorsOf,
  RECORD_CLASSES,
  strayPartsOf,
} from "@solid-memo/domain/release/draftModel";
import { markdownProblems, type MarkdownCheck } from "@solid-memo/domain/release/markdownFields";
import { problem, type ReleaseProblem } from "@solid-memo/domain/release/problems";
import {
  libraryProblems,
  libraryReleaseUrl,
  movedProblems,
  readWhole,
  ruleProblems,
  type CheckPolicy,
  type ReleaseCheck,
} from "@solid-memo/domain/release/releaseCheck";
import { FOAF_NAME, type ReleaseModel } from "@solid-memo/domain/release/releaseModel";
import {
  isDraftsPlaceOnward,
  releasePlaceOf,
  releasesContainerOf,
} from "@solid-memo/domain/release/releasePlace";
import {
  rebaseDraft,
  releaseToDraft,
  withOwnSeries,
} from "@solid-memo/domain/release/releaseToDraft";
import { nextVersionDraft, withOwnVersions } from "@solid-memo/domain/release/releaseVersion";
import type {
  DeckLibrary,
  DeckRepository,
  FileExchange,
  ReleaseDraftRepository,
  ReleasePublisher,
  ShapeValidator,
  StorageGateway,
} from "./ports";

/**
 * The drafts of releases (docs/studio.md, Drafts): a creator writes a
 * deck or course in their own pod, as a draft, before publishing it as
 * a release. These use cases list, make, read, change and delete them;
 * the changes are the domain's (domain/release/releaseDraft.ts), and the
 * documents the repository's.
 */

/** What a new draft starts from. */
export type NewDraft =
  /** Nothing: a deck, or a course, by this title. */
  | { kind: "blankDeck"; title: LangText }
  | { kind: "blankCourse"; title: LangText }
  /**
   * A deck of the instance: what a release would say of it
   * (deckToDraft). Its cards are read as the user only when their
   * document is the instance's (isInInstancePod), as no one otherwise.
   */
  | { kind: "fromDeck"; deck: Deck }
  /**
   * A release, by its URL: the next version of it (nextVersionDraft),
   * describing the series and publisher it names elsewhere, its sources
   * read one way (withPlainSources). Read as the
   * user only when it is the instance's (isInInstancePod), as no one
   * otherwise.
   */
  | { kind: "nextVersionOf"; url: string }
  /** A release in a Turtle or JSON-LD file the user picks, with only its own statements, in a series of its own and following no version (ownStatements, withOwnSeries, releaseToDraft), its sources read one way (withPlainSources). */
  | { kind: "fromFile" };

/** A draft made, and for one made from a copy of a release, that release: to start the next version of instead. */
export interface CreatedDraft {
  draft: ReleaseDraftSummary;
  basedOn?: string;
}

/**
 * A draft against the release it follows (`previous`, as it was
 * published): what it changes (releaseDiff), the rules of the series it
 * breaks (continuityProblems: a subject dropped, an id given to another
 * kind, a version not the next), and what a learner's copy of the
 * release would get from it (simulateLearnerUpgrade).
 */
export interface DraftDiff {
  previous: ReleaseDraft;
  diff: ReleaseDiff;
  problems: ReleaseProblem[];
  upgrade: LearnerUpgrade;
}

/** A change made, the draft as it is then; or why it was not. */
export type DraftEdit = { ok: true; draft: ReleaseDraft } | { ok: false; refusal: DraftRefusal };

export interface ReleaseDraftUseCases {
  /** The instance's drafts, as its catalog links them. */
  listReleaseDrafts(instanceUrl: string): Promise<ReleaseDraftSummary[]>;
  /**
   * A new draft in the instance, from `from`, named after its title (or
   * its release's name) and numbered as the version it drafts, unlike the
   * instance's other drafts of that version. Null when no file was
   * picked. A name taken meanwhile, elsewhere, gives the next one. A
   * release's next version, or a deck's draft, is written into the
   * instance, so the release, or the deck's cards, is read as `webId`
   * only when it is the instance's (isInInstancePod): an instance
   * attached from someone else's pod may name a release, or a deck's
   * cards, of the user's own that was kept from everyone. Any other is
   * read as no one.
   */
  createReleaseDraft(
    instanceUrl: string,
    from: NewDraft,
    webId: string,
  ): Promise<CreatedDraft | null>;
  /**
   * A copy of the draft at `draftUrl`, another instance's, in this one
   * (a guest's draft, as the guest's study is added to an instance):
   * every subject of it moved to its place here, at its version, under
   * its name, or the next one none of the instance's drafts of that
   * version has. No draft is overwritten, nor any left half written
   * (the repository's create); the draft copied stays as it is. A
   * guest's draft whose copy would still link to the guest's pod by an
   * IRI is not written (guestUrlsLeft); its text may name any address.
   */
  copyReleaseDraft(draftUrl: string, instanceUrl: string): Promise<ReleaseDraftSummary>;
  /**
   * The draft as its documents say now, with what the releases before it
   * published (`published`), read from the release it follows. A release
   * before it that cannot be read counts everything the draft has as
   * published: nothing is deleted that might have been.
   */
  getReleaseDraft(draftUrl: string): Promise<ReleaseDraft>;
  /** The draft as getReleaseDraft has it, with the version its documents were at together (ReleaseDraftRepository.read). */
  readReleaseDraft(draftUrl: string): Promise<{ draft: ReleaseDraft; version: string }>;
  /**
   * Make the changes, in turn, to the draft as it is now, and write what
   * they change. A change refused writes nothing. When a document
   * changed elsewhere meanwhile (412), the draft is read again and the
   * changes made again, a few times, then changedElsewhere. Changes
   * refused then, as part of them was written before the 412 (a subject
   * they add is there), are kept as they were made where nothing else
   * changed what they change (mergedDraft).
   */
  editReleaseDraft(draftUrl: string, changes: readonly DraftChange[]): Promise<DraftEdit>;
  /** Delete a draft; the result names the documents kept for another app's data in them. */
  deleteReleaseDraft(draft: ReleaseDraftSummary): Promise<KeptDocuments>;
  /**
   * The release check of the draft as it is (docs/studio.md, The release
   * check), for a pod or for the repository's library (`policy`): the
   * domain's rules (its course, what a release needs, the policy's
   * curation, its text in Markdown by `markdownCheck`, which the caller
   * passes in, and against the release it follows), for the library its
   * place there, by the library's index; with `shapes`, the shapes and
   * profiles too (validateRelease), which take a while, so they are run
   * only when asked. Each part is made once for a draft (a draft is
   * changed into a new one, so each version is checked once), the
   * releases a draft follows read once.
   */
  checkReleaseDraft(
    draft: ReleaseDraft,
    markdownCheck: MarkdownCheck,
    policy: CheckPolicy,
    options?: { shapes?: boolean },
  ): Promise<ReleaseCheck>;
  /**
   * The draft as it is against the release it follows (docs/studio.md,
   * The release diff); null for a draft of a first release, which
   * follows none. The release is read once; one that cannot be read
   * fails it.
   */
  diffReleaseDraft(draft: ReleaseDraft): Promise<DraftDiff | null>;
}

/** How often a change of a draft is made, in all, while its documents keep changing elsewhere. */
const EDIT_ATTEMPTS = 3;

/** How often a new draft is given another name, in all, while its place is taken elsewhere. */
const NAME_ATTEMPTS = 3;

/**
 * Whether the document at `url` (a release, a deck's cards) is the
 * instance's: in the instance, or in one of the user's storages (those
 * of `webId`) the instance is in too, each as a request sends the
 * address. None, when they cannot be found. Only such a document is
 * read as the user to be written into the instance, or a release made
 * public by it: an instance attached from someone else's pod may name
 * a document of the user's own that was kept from everyone.
 */
export async function isInInstancePod(
  storageGateway: Pick<StorageGateway, "discoverStorages">,
  instanceUrl: string,
  url: string,
  webId: string,
): Promise<boolean> {
  if (isDocumentIn(url, instanceUrl)) return true;
  const storages = await storageGateway.discoverStorages(webId).catch(() => []);
  return storages.some(
    (storage) =>
      isDocumentIn(url, storage.url) && isDocumentIn(catalogUrlOf(instanceUrl), storage.url),
  );
}

/** Whether a write was refused because a document changed, or was made, since it was read. */
function raced(error: unknown): boolean {
  return (
    error instanceof AppError &&
    (error.code === "changedElsewhere" || error.code === "createdElsewhere")
  );
}

/** Whether a new draft's release document was refused because one was made at `url` meanwhile: its place is taken, and nothing was written. */
function placeTaken(error: unknown, url: string): boolean {
  return error instanceof AppError && error.code === "createdElsewhere" && error.vars.url === url;
}

/**
 * The release, unless it names a subject by an id a draft cannot keep
 * (releaseIdUnsupported), or has a card, chapter, step or distractor
 * outside it (releaseForeignPart): no editor or check of a draft would
 * see that, but its release would publish it (GHSA-67w8-qjpm-jhwp). Nor
 * one that links to the guest's pod by an IRI (releaseLinksGuestPod): a
 * guest's draft of it could not be kept (GHSA-hc3p-fpwj-fvjp). Its
 * series lists only its own versions (withOwnVersions), and of its other
 * statements, it keeps only its own (ownStatements): nothing of a
 * version it no longer lists (GHSA-jp29-vf56-5g4g).
 */
function draftable(read: ReleaseDraft): ReleaseDraft {
  if (draftAddressesGuest(read)) throw new AppError("releaseLinksGuestPod", { url: read.url });
  const id = unsupportedIdOf(read);
  if (id !== null) throw new AppError("releaseIdUnsupported", { id });
  const release = {
    ...read,
    triples: read.triples.filter((triple) => !isOfReleaseAsRecord(read, triple)),
  };
  const foreign = strayPartsOf(release).find((stray) => idIn(release, stray) === null);
  if (foreign !== undefined) throw new AppError("releaseForeignPart", { part: foreign });
  return ownStatements(withOwnVersions(release));
}

/**
 * Whether a draft links to the guest's pod by an IRI other than its own
 * or one of its subjects' (`<draft>#id`), the only ones a copy of it
 * moves (copyReleaseDraft): a guest's draft that does could not be kept
 * (GHSA-hc3p-fpwj-fvjp). A next version takes statements from the
 * documents its release links to, which the release's own check
 * (draftable) does not see (GHSA-vrq3-87m3-6rgg).
 */
function linksGuestPodBeyond(draft: ReleaseDraft): boolean {
  let links = false;
  rebaseDraft(draft, draft.url, (iri) => {
    links ||= isGuestPodIri(iri) && iri !== draft.url && !iri.startsWith(`${draft.url}#`);
    return iri;
  });
  return links;
}

/**
 * Whether a statement types the release an agent or distribution, or
 * names it: it can have no record of those, so the Studio would show no
 * such name, and learners would see it if the release were its own
 * creator or publisher (GHSA-mv57-839j-wrf6).
 */
function isOfReleaseAsRecord(
  release: Pick<ReleaseDraft, "url">,
  { subject, predicate, object }: DraftTriple,
): boolean {
  if (subject !== release.url) return false;
  if (predicate === FOAF_NAME) return true;
  return predicate === RDF_TYPE && object.kind === "iri" && RECORD_CLASSES.has(object.value);
}

/** The IRIs of the release's agents, each of which it holds a record of. */
function agentIrisOf(release: ReleaseDraft): Set<string> {
  return new Set(release.agents.map(({ id }) => iriIn(release, id)));
}

/**
 * Of what the documents a release links to state, what a next version of
 * it may take: nothing of a creator with no record, which the Studio
 * shows by its IRI (ownStatements), of an agent, whose record is the
 * release's own to state, or of the release as a record (isOfReleaseAsRecord).
 */
function linkedStatements(release: ReleaseDraft, linked: readonly DraftTriple[]): DraftTriple[] {
  const outside = outsideCreatorsOf(release);
  const agents = agentIrisOf(release);
  return linked.filter(
    (triple) =>
      !outside.has(triple.subject) &&
      !agents.has(triple.subject) &&
      !isOfReleaseAsRecord(release, triple),
  );
}

/**
 * The release with only the statements a draft of it keeps: those of
 * the release and its own subjects (`<release>#id`), and of what they
 * name, at any depth (a source, a license, a blank node). A statement of
 * anything else is dropped: no editor shows it and no check sees it, and
 * published, at an address it names, it would say more of that release
 * than its draft does (GHSA-p2pr-x6fw-hrfx). So is a statement of a
 * creator with no record, which the release names only: the Studio
 * shows such a creator by its IRI, and a name the release gave it would
 * be the author learners see (GHSA-wjqr-hw63-jf4c).
 */
function ownStatements(release: ReleaseDraft): ReleaseDraft {
  const bySubject = new Map<string, DraftTriple[]>();
  for (const triple of release.triples) {
    const of = bySubject.get(triple.subject);
    if (of === undefined) bySubject.set(triple.subject, [triple]);
    else of.push(triple);
  }
  const kept = new Set<string>();
  const queue: string[] = [];
  const outside = outsideCreatorsOf(release);
  const keep = (subject: string) => {
    if (kept.has(subject) || outside.has(subject)) return;
    kept.add(subject);
    queue.push(subject);
  };
  keep(release.url);
  for (const subject of bySubject.keys()) if (idIn(release, subject) !== null) keep(subject);
  // What the records name: each IRI of theirs, as a move of them sees it.
  rebaseDraft({ ...release, triples: [] }, release.url, (iri) => {
    keep(iri);
    return iri;
  });
  for (let subject = queue.pop(); subject !== undefined; subject = queue.pop()) {
    for (const { object } of bySubject.get(subject) ?? []) {
      if (object.kind === "iri") keep(object.value);
      else if (object.kind === "blank") keep(`_:${object.value}`);
    }
  }
  const triples = release.triples.filter((triple) => kept.has(triple.subject));
  return triples.length === release.triples.length ? release : { ...release, triples };
}

/**
 * Whether an IRI is in the container of the draft at `url` and not one
 * of the source's own (`<source>`, `<source>#id`), which move to the
 * draft's: one of the draft's documents, `release.ttl`, `cards.ttl` or
 * `chapter-<id>.ttl`, with or without a fragment, or anything else
 * there. Read back from the pod, it would be one of the draft's own
 * subjects, what is stated of it hidden behind the record read of it,
 * and published with the draft (GHSA-8w75-jg23-rxq5).
 */
function takenBy(source: Pick<ReleaseDraft, "url">, url: string): (iri: string) => boolean {
  const container = draftContainerOf(url);
  return (iri) => iri.startsWith(container) && iri !== source.url && idIn(source, iri) === null;
}

/** The statements, but those of or naming an IRI `taken` says is the new draft's. */
function untaken(triples: readonly DraftTriple[], taken: (iri: string) => boolean): DraftTriple[] {
  return triples.filter(
    ({ subject, object }) => !taken(subject) && !(object.kind === "iri" && taken(object.value)),
  );
}

/**
 * The statements, but those of an address where the draft at `url` or a
 * next version of it is published unless the creator chooses another
 * folder (isDraftsPlaceOnward), other than the source's own, which move
 * to the draft's. Publishing the draft there would be refused
 * (releaseForeignStatement), or its next version would be, and published
 * elsewhere, it would say of that release what no draft of it does
 * (GHSA-jp29-vf56-5g4g). The place is the draft's, wherever its source
 * is: the instance's releases/, by the draft's name.
 */
function unplaced(
  triples: readonly DraftTriple[],
  source: ReleaseDraft,
  url: string,
): DraftTriple[] {
  const theirs = (iri: string) =>
    isDraftsPlaceOnward(url, iri) && iri !== source.url && idIn(source, iri) === null;
  return untaken(triples, takenBy(source, url)).filter(({ subject }) => !theirs(subject));
}

/**
 * The release, or draft, to be made the draft at `url`, before it is
 * moved there: without a statement of or naming an address in the new
 * draft's container (takenBy), or of where it is published (unplaced),
 * and with only its own statements (ownStatements): nothing only such a
 * statement led to, nor what a draft read from the pod states of a
 * creator with no record, which an import would have dropped
 * (GHSA-q4pr-36j5-g5m5). Before the move, the draft's own address is
 * one of these too: a statement of it is not one of the source's.
 */
function inItsPlace(source: ReleaseDraft, url: string): ReleaseDraft {
  return ownStatements({ ...source, triples: unplaced(source.triples, source, url) });
}

/** The name a release's URL gives its series (`…/capitals/v2.ttl` → `capitals`); null when it is named otherwise. */
function nameInUrl(url: string): string | null {
  return releasePlaceOf(url)?.name ?? null;
}

/** What a check made of a draft, by policy: made once for each draft (a version of it). */
type Made<T> = WeakMap<ReleaseDraft, Map<CheckPolicy, Promise<T>>>;

/**
 * What `make` makes of the draft for the policy, made once and kept; a
 * failure, or what `whole` says is not whole, is forgotten, so the next
 * call tries again.
 */
function madeOnce<T>(
  made: Made<T>,
  draft: ReleaseDraft,
  policy: CheckPolicy,
  make: () => Promise<T>,
  whole: (value: T) => boolean = () => true,
): Promise<T> {
  const byPolicy = made.get(draft) ?? new Map<CheckPolicy, Promise<T>>();
  made.set(draft, byPolicy);
  let result = byPolicy.get(policy);
  if (result === undefined) {
    result = make();
    byPolicy.set(policy, result);
    result.then(
      (value) => whole(value) || byPolicy.delete(policy),
      () => byPolicy.delete(policy),
    );
  }
  return result;
}

export function createReleaseDraftUseCases({
  releaseDraftRepository,
  deckRepository,
  deckLibrary,
  shapeValidator,
  fileExchange,
  storageGateway,
  releasePublisher,
  now,
}: {
  releaseDraftRepository: ReleaseDraftRepository;
  deckRepository: DeckRepository;
  deckLibrary: DeckLibrary;
  shapeValidator: ShapeValidator;
  fileExchange: FileExchange;
  storageGateway: Pick<StorageGateway, "discoverStorages">;
  /** The releases the instance published, which a draft may follow (isFollowable). */
  releasePublisher: Pick<ReleasePublisher, "listPublished">;
  now: () => Date;
}): ReleaseDraftUseCases {
  /** Each release a draft follows, by URL: releases are frozen, so each is read once. */
  const releases = new Map<string, Promise<ReleaseDraft>>();

  function release(url: string): Promise<ReleaseDraft> {
    let read = releases.get(url);
    if (read === undefined) {
      read = releaseDraftRepository.readRelease(url);
      // A failed read is tried again next time.
      read.catch(() => releases.delete(url));
      releases.set(url, read);
    }
    return read;
  }

  /** What the release `url` and those before it published. */
  function published(url: string): Promise<PublishedIds> {
    return release(url).then(publishedIdsOf);
  }

  /** Each release a draft follows, as the release rules read it, by URL. */
  const releaseModels = new Map<string, Promise<ReleaseModel>>();

  function releaseModel(url: string): Promise<ReleaseModel> {
    let model = releaseModels.get(url);
    if (model === undefined) {
      model = release(url).then((read) => draftReleaseModel(read));
      model.catch(() => releaseModels.delete(url));
      releaseModels.set(url, model);
    }
    return model;
  }

  const ruleChecks: Made<Omit<ReleaseCheck, "shapes">> = new WeakMap();
  const shapeChecks: Made<ReleaseProblem[]> = new WeakMap();

  /** Where the library would publish the draft: its name and version there, by its place in the instance; and the index. */
  async function libraryPlace(draft: ReleaseDraft) {
    // A draft is read only at a draft's place.
    const { name, version } = draftPlaceOf(draft.url)!;
    const index = await deckLibrary.readLibraryIndex();
    return { name, version, index, url: libraryReleaseUrl(index.url, name, version) };
  }

  /**
   * Whether the release `prev` may be the one the draft follows, which
   * publishing takes the series' earlier versions, and what is stated of
   * them, from: one the instance published, in its releases folder
   * (releasesContainerOf) or linked from its catalog
   * (`sm:publishedRelease`), or one of the library's, in its index's
   * folder. Never one in its drafts folder, where no release is
   * published. Another app that can write the draft can name any
   * release, and write one among the drafts (GHSA-8frq-fhj8-9226): only
   * the instance's own releases, what its catalog says it published, and
   * the library are not the draft's to write. Fails when the catalog or
   * the library's index cannot be read.
   */
  async function isFollowable(draftUrl: string, prev: string): Promise<boolean> {
    // A draft is read only at a draft's place.
    const { instanceUrl } = draftPlaceOf(draftUrl)!;
    if (isDocumentIn(prev, draftsContainerOf(instanceUrl))) return false;
    if (isDocumentIn(prev, releasesContainerOf(instanceUrl))) return true;
    if ((await releasePublisher.listPublished(instanceUrl)).includes(prev)) return true;
    const index = await deckLibrary.readLibraryIndex();
    return isDocumentIn(prev, new URL(".", index.url).href);
  }

  /**
   * The draft against the release it follows (continuityProblems): one
   * that is neither the instance's nor the library's (isFollowable) is
   * a problem of its own (previousElsewhere), and is not read; one that
   * cannot be read, or whose place cannot be told, is previousUnread.
   */
  async function dropsOf(
    draft: ReleaseDraft,
    model: ReleaseModel,
    prev: string,
  ): Promise<ReleaseProblem[]> {
    const unread = () => [
      problem(
        draft.url,
        { code: "previousUnread", params: { previous: prev } },
        { related: [prev] },
      ),
    ];
    const followable = await isFollowable(draft.url, prev).catch(() => null);
    if (followable === null) return unread();
    if (!followable)
      return [
        problem(
          draft.url,
          { code: "previousElsewhere", params: { previous: prev } },
          { related: [prev] },
        ),
      ];
    return releaseModel(prev).then((before) => continuityProblems(before, model), unread);
  }

  /**
   * The rules of the draft, its Markdown, and the parts that read what
   * is elsewhere: against the release it follows, and its place in the
   * library. A part that cannot read what it needs is a problem of its
   * own (previousUnread, libraryUnread); the rest stands.
   */
  async function ruleCheck(
    draft: ReleaseDraft,
    markdownCheck: MarkdownCheck,
    policy: CheckPolicy,
  ): Promise<Omit<ReleaseCheck, "shapes">> {
    const model = draftReleaseModel(draft);
    const { prev } = draft.root;
    const [drops, library] = await Promise.all([
      prev === undefined ? [] : dropsOf(draft, model, prev),
      policy === "pod"
        ? []
        : libraryPlace(draft).then(
            (place) =>
              movedProblems(
                libraryProblems(
                  draftReleaseModel(draft, place.url),
                  place.index,
                  place.name,
                  place.version,
                ),
                place.url,
                draft.url,
              ),
            () => [problem(draft.url, { code: "libraryUnread", params: {} })],
          ),
    ]);
    return {
      rules: ruleProblems(model, policy),
      library,
      drops,
      markdown: markdownProblems(model, markdownCheck),
    };
  }

  async function shapeCheck(draft: ReleaseDraft, policy: CheckPolicy): Promise<ReleaseProblem[]> {
    if (policy === "pod") return shapeValidator.validateRelease(draft, draft.url);
    const place = await libraryPlace(draft);
    return shapeValidator.validateRelease(draft, place.url, place.index.url);
  }

  async function withPublished(draft: ReleaseDraft): Promise<ReleaseDraft> {
    if (draft.root.prev === undefined) return draft;
    try {
      return { ...draft, published: await published(draft.root.prev) };
    } catch {
      return { ...draft, published: publishedIdsOf(draft) };
    }
  }

  /**
   * Write a new draft of `version`, named after `title` unless `name` is
   * given: made at `url` (the draft at its place) unlike the instance's
   * drafts of that version, and again under the next name when that place
   * was taken elsewhere meanwhile (its release document made there).
   */
  async function create(
    instanceUrl: string,
    { title, name, version }: { title: LangText; name?: string; version: number },
    make: (url: string) => ReleaseDraft,
  ): Promise<ReleaseDraftSummary> {
    const taken = (await releaseDraftRepository.list(instanceUrl))
      .filter((draft) => draft.version === version)
      .map((draft) => draft.name);
    for (let attempt = 1; ; attempt++) {
      const chosen = draftNameFor(name ?? shown(title), taken);
      const url = draftUrlOf(instanceUrl, chosen, version);
      try {
        return await releaseDraftRepository.create(instanceUrl, make(url));
      } catch (error) {
        // Only a place taken is tried again: any other failure took back what it wrote (the repository's create).
        if (!placeTaken(error, url) || attempt === NAME_ATTEMPTS) throw error;
        taken.push(chosen);
      }
    }
  }

  return {
    listReleaseDrafts(instanceUrl) {
      return releaseDraftRepository.list(instanceUrl);
    },

    async createReleaseDraft(instanceUrl, from, webId) {
      const at = now().toISOString();
      switch (from.kind) {
        case "blankDeck":
        case "blankCourse": {
          const title = tidiedStated(from.title);
          const course = from.kind === "blankCourse";
          return {
            draft: await create(instanceUrl, { title, version: 1 }, (url) =>
              blankDraft({ url, course, title, now: at }),
            ),
          };
        }
        case "fromDeck": {
          // Written into the instance: read as the user only when its cards are the instance's.
          const asNoOne = !(await isInInstancePod(
            storageGateway,
            instanceUrl,
            from.deck.cardsDocumentUrl,
            webId,
          ));
          const cards = await deckRepository.listCards(from.deck, { asNoOne });
          let basedOn: string | undefined;
          const draft = await create(instanceUrl, { title: from.deck.title, version: 1 }, (url) => {
            const made = deckToDraft(from.deck, cards, url, at);
            basedOn = made.basedOn;
            return made.draft;
          });
          return basedOn === undefined ? { draft } : { draft, basedOn };
        }
        case "nextVersionOf": {
          // Written into the instance: read as the user only when it is the instance's.
          const asNoOne = !(await isInInstancePod(storageGateway, instanceUrl, from.url, webId));
          const release = draftable(
            await releaseDraftRepository.readRelease(from.url, { asNoOne }),
          );
          // Its series and publisher as their document describes them, when the release does not: the next version describes them itself.
          const linked = linkedStatements(
            release,
            await releaseDraftRepository.readLinked(release),
          );
          const version = Number(release.root.version ?? "1") + 1;
          const name = nameInUrl(from.url) ?? undefined;
          return {
            draft: await create(
              instanceUrl,
              { title: release.root.title ?? {}, ...(name === undefined ? {} : { name }), version },
              (url) => {
                // Its sources read as learners read them, whatever the linked documents state of them (withPlainSources).
                const draft = withPlainSources(
                  nextVersionDraft(inItsPlace(release, url), url, unplaced(linked, release, url)),
                );
                // What the linked documents state is checked as the draft has it, as the release was (draftable).
                if (linksGuestPodBeyond(draft))
                  throw new AppError("releaseLinksGuestPod", { url: release.url });
                return draft;
              },
            ),
          };
        }
        case "fromFile": {
          const file = await fileExchange.open(DECK_FILE_ACCEPT);
          if (file === null) return null;
          // In a series of its own, unless the file's is one of its subjects (GHSA-38m7-8r5j-q79f), following no version (GHSA-jp29-vf56-5g4g).
          const release = draftable(
            withOwnSeries(
              await releaseDraftRepository.parseRelease(
                file.text,
                deckFileFormatOf(file.name, file.text),
              ),
            ),
          );
          const version = Number(release.root.version ?? "1");
          const name = nameInUrl(release.url) ?? undefined;
          return {
            draft: await create(
              instanceUrl,
              { title: release.root.title ?? {}, ...(name === undefined ? {} : { name }), version },
              (url) => withPlainSources(releaseToDraft(inItsPlace(release, url), url)),
            ),
          };
        }
      }
    },

    async copyReleaseDraft(draftUrl, instanceUrl) {
      const { draft } = await releaseDraftRepository.read(draftUrl);
      // A draft is read only at a draft's place; its copy is named as it is, not after its title.
      const { name, version } = draftPlaceOf(draftUrl)!;
      return create(instanceUrl, { title: {}, name, version }, (url) => {
        // What the draft states of an address in the copy's container, as a release made a draft could (GHSA-8w75-jg23-rxq5), is not copied.
        const copy = rebaseDraft(inItsPlace(draft, url), url);
        // A guest's pod goes once the guest's study is kept: a copy links to nothing in it (its text may name any address).
        if (isGuestUrl(draftUrl) && draftAddressesGuest(copy))
          throw new AppError("guestUrlsLeft", { url });
        return copy;
      });
    },

    async getReleaseDraft(draftUrl) {
      return withPublished((await releaseDraftRepository.read(draftUrl)).draft);
    },

    async readReleaseDraft(draftUrl) {
      const { draft, version } = await releaseDraftRepository.read(draftUrl);
      return { draft: await withPublished(draft), version };
    },

    async editReleaseDraft(draftUrl, changes) {
      /** The attempt a change elsewhere cut short last: some of what it changed may be written. */
      let cut: { before: ReleaseDraft; after: ReleaseDraft } | null = null;
      for (let attempt = 1; ; attempt++) {
        const read = await releaseDraftRepository.read(draftUrl);
        const before = await withPublished(read.draft);
        let after = applyDraftChanges(before, changes);
        // Refused now that part of it is written (a subject it adds is there): what it changed, on the draft as it is.
        if (isRefusal(after) && cut !== null)
          after = mergedDraft(cut.before, cut.after, before) ?? after;
        if (isRefusal(after)) return { ok: false, refusal: after };
        try {
          await releaseDraftRepository.applyChanges(before, after, read.version);
          return { ok: true, draft: after };
        } catch (error) {
          if (!raced(error) || attempt === EDIT_ATTEMPTS) throw error;
          cut = { before, after };
        }
      }
    },

    deleteReleaseDraft(draft) {
      return releaseDraftRepository.delete(draft);
    },

    async checkReleaseDraft(draft, markdownCheck, policy, { shapes = false } = {}) {
      const rules = madeOnce(
        ruleChecks,
        draft,
        policy,
        () => ruleCheck(draft, markdownCheck, policy),
        readWhole,
      );
      const shaped = shapes
        ? madeOnce(shapeChecks, draft, policy, () => shapeCheck(draft, policy))
        : null;
      return { ...(await rules), shapes: shaped === null ? null : await shaped };
    },

    async diffReleaseDraft(draft) {
      const { prev } = draft.root;
      if (prev === undefined) return null;
      const [previous, before] = await Promise.all([release(prev), releaseModel(prev)]);
      const listed = draftLibraryDeck(draft);
      return {
        previous,
        diff: releaseDiff(previous, draft, listed),
        problems: continuityProblems(before, draftReleaseModel(draft)),
        upgrade: simulateLearnerUpgrade(previous, draft, listed),
      };
    },
  };
}
