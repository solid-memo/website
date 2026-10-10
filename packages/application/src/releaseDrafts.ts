import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import { DECK_FILE_ACCEPT, deckFileFormatOf } from "@solid-memo/domain/deckFile";
import { shown, tidiedStated, type LangText } from "@solid-memo/domain/langText";
import { deckToDraft } from "@solid-memo/domain/release/deckToDraft";
import { draftNameFor, draftPlaceOf, draftUrlOf, type ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import {
  applyDraftChanges,
  blankDraft,
  isRefusal,
  mergedDraft,
  publishedIdsOf,
  type DraftChange,
  type DraftRefusal,
  type PublishedIds,
  type ReleaseDraft,
  unsupportedIdOf,
} from "@solid-memo/domain/release/releaseDraft";
import { continuityProblems } from "@solid-memo/domain/release/continuityRules";
import { releaseDiff, simulateLearnerUpgrade, type LearnerUpgrade, type ReleaseDiff } from "@solid-memo/domain/release/releaseDiff";
import { draftReleaseModel } from "@solid-memo/domain/release/draftModel";
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
import type { ReleaseModel } from "@solid-memo/domain/release/releaseModel";
import { releasePlaceOf } from "@solid-memo/domain/release/releasePlace";
import { releaseToDraft } from "@solid-memo/domain/release/releaseToDraft";
import { nextVersionDraft } from "@solid-memo/domain/release/releaseVersion";
import type { DeckLibrary, DeckRepository, FileExchange, ReleaseDraftRepository, ShapeValidator } from "./ports";

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
  /** A deck of the instance: what a release would say of it (deckToDraft). */
  | { kind: "fromDeck"; deck: Deck }
  /** A release, by its URL: the next version of it (nextVersionDraft). */
  | { kind: "nextVersionOf"; url: string }
  /** A release in a Turtle or JSON-LD file the user picks, as it is (releaseToDraft). */
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
  /** The instance's drafts, as its catalogue links them. */
  listReleaseDrafts(instanceUrl: string): Promise<ReleaseDraftSummary[]>;
  /**
   * A new draft in the instance, from `from`, named after its title (or
   * its release's name) and numbered as the version it drafts, unlike the
   * instance's other drafts of that version. Null when no file was
   * picked. A name taken meanwhile, elsewhere, gives the next one.
   */
  createReleaseDraft(instanceUrl: string, from: NewDraft): Promise<CreatedDraft | null>;
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
  deleteReleaseDraft(draft: ReleaseDraftSummary): Promise<void>;
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
  checkReleaseDraft(draft: ReleaseDraft, markdownCheck: MarkdownCheck, policy: CheckPolicy, options?: { shapes?: boolean }): Promise<ReleaseCheck>;
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

/** Whether a write was refused because a document changed, or was made, since it was read. */
function raced(error: unknown): boolean {
  return error instanceof AppError && (error.code === "changedElsewhere" || error.code === "createdElsewhere");
}

/** Whether a new draft's release document was refused because one was made at `url` meanwhile: its place is taken, and nothing was written. */
function placeTaken(error: unknown, url: string): boolean {
  return error instanceof AppError && error.code === "createdElsewhere" && error.vars.url === url;
}

/** The release, unless it names a subject by an id a draft cannot keep (releaseIdUnsupported). */
function draftable(release: ReleaseDraft): ReleaseDraft {
  const id = unsupportedIdOf(release);
  if (id !== null) throw new AppError("releaseIdUnsupported", { id });
  return release;
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
function madeOnce<T>(made: Made<T>, draft: ReleaseDraft, policy: CheckPolicy, make: () => Promise<T>, whole: (value: T) => boolean = () => true): Promise<T> {
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
  now,
}: {
  releaseDraftRepository: ReleaseDraftRepository;
  deckRepository: DeckRepository;
  deckLibrary: DeckLibrary;
  shapeValidator: ShapeValidator;
  fileExchange: FileExchange;
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
   * The rules of the draft, its Markdown, and the parts that read what
   * is elsewhere: against the release it follows, and its place in the
   * library. A part that cannot read what it needs is a problem of its
   * own (previousUnread, libraryUnread); the rest stands.
   */
  async function ruleCheck(draft: ReleaseDraft, markdownCheck: MarkdownCheck, policy: CheckPolicy): Promise<Omit<ReleaseCheck, "shapes">> {
    const model = draftReleaseModel(draft);
    const { prev } = draft.root;
    const [drops, library] = await Promise.all([
      prev === undefined
        ? []
        : releaseModel(prev).then(
            (before) => continuityProblems(before, model),
            () => [problem(draft.url, { code: "previousUnread", params: { previous: prev } }, { related: [prev] })],
          ),
      policy === "pod"
        ? []
        : libraryPlace(draft).then(
            (place) => movedProblems(libraryProblems(draftReleaseModel(draft, place.url), place.index, place.name, place.version), place.url, draft.url),
            () => [problem(draft.url, { code: "libraryUnread", params: {} })],
          ),
    ]);
    return { rules: ruleProblems(model, policy), library, drops, markdown: markdownProblems(model, markdownCheck) };
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
    const taken = (await releaseDraftRepository.list(instanceUrl)).filter((draft) => draft.version === version).map((draft) => draft.name);
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

    async createReleaseDraft(instanceUrl, from) {
      const at = now().toISOString();
      switch (from.kind) {
        case "blankDeck":
        case "blankCourse": {
          const title = tidiedStated(from.title);
          const course = from.kind === "blankCourse";
          return { draft: await create(instanceUrl, { title, version: 1 }, (url) => blankDraft({ url, course, title, now: at })) };
        }
        case "fromDeck": {
          const cards = await deckRepository.listCards(from.deck);
          let basedOn: string | undefined;
          const draft = await create(instanceUrl, { title: from.deck.title, version: 1 }, (url) => {
            const made = deckToDraft(from.deck, cards, url, at);
            basedOn = made.basedOn;
            return made.draft;
          });
          return basedOn === undefined ? { draft } : { draft, basedOn };
        }
        case "nextVersionOf": {
          const release = draftable(await releaseDraftRepository.readRelease(from.url));
          const version = Number(release.root.version ?? "1") + 1;
          const name = nameInUrl(from.url) ?? undefined;
          return {
            draft: await create(instanceUrl, { title: release.root.title ?? {}, ...(name === undefined ? {} : { name }), version }, (url) =>
              nextVersionDraft(release, url),
            ),
          };
        }
        case "fromFile": {
          const file = await fileExchange.open(DECK_FILE_ACCEPT);
          if (file === null) return null;
          const release = draftable(await releaseDraftRepository.parseRelease(file.text, deckFileFormatOf(file.name, file.text)));
          const version = Number(release.root.version ?? "1");
          const name = nameInUrl(release.url) ?? undefined;
          return {
            draft: await create(instanceUrl, { title: release.root.title ?? {}, ...(name === undefined ? {} : { name }), version }, (url) =>
              releaseToDraft(release, url),
            ),
          };
        }
      }
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
        if (isRefusal(after) && cut !== null) after = mergedDraft(cut.before, cut.after, before) ?? after;
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
      const rules = madeOnce(ruleChecks, draft, policy, () => ruleCheck(draft, markdownCheck, policy), readWhole);
      const shaped = shapes ? madeOnce(shapeChecks, draft, policy, () => shapeCheck(draft, policy)) : null;
      return { ...(await rules), shapes: shaped === null ? null : await shaped };
    },

    async diffReleaseDraft(draft) {
      const { prev } = draft.root;
      if (prev === undefined) return null;
      const [previous, before] = await Promise.all([release(prev), releaseModel(prev)]);
      return {
        previous,
        diff: releaseDiff(previous, draft),
        problems: continuityProblems(before, draftReleaseModel(draft)),
        upgrade: simulateLearnerUpgrade(previous, draft),
      };
    },
  };
}
