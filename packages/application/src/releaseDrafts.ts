import { AppError } from "@solid-memo/domain/appError";
import type { Deck } from "@solid-memo/domain/deck";
import { DECK_FILE_ACCEPT, deckFileFormatOf } from "@solid-memo/domain/deckFile";
import { shown, tidiedStated, type LangText } from "@solid-memo/domain/langText";
import { deckToDraft } from "@solid-memo/domain/release/deckToDraft";
import { draftNameFor, draftUrlOf, type ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
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
import { releaseToDraft } from "@solid-memo/domain/release/releaseToDraft";
import { nextVersionDraft } from "@solid-memo/domain/release/releaseVersion";
import type { DeckRepository, FileExchange, ReleaseDraftRepository } from "./ports";

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
  return /\/([a-z0-9][a-z0-9-]*)\/v[1-9][0-9]*\.ttl$/.exec(url)?.[1] ?? null;
}

export function createReleaseDraftUseCases({
  releaseDraftRepository,
  deckRepository,
  fileExchange,
  now,
}: {
  releaseDraftRepository: ReleaseDraftRepository;
  deckRepository: DeckRepository;
  fileExchange: FileExchange;
  now: () => Date;
}): ReleaseDraftUseCases {
  /** What each release published, by URL: releases are frozen, so it is read once. */
  const publishedOf = new Map<string, Promise<PublishedIds>>();

  /** What the release `url` and those before it published. */
  function published(url: string): Promise<PublishedIds> {
    let ids = publishedOf.get(url);
    if (ids === undefined) {
      ids = releaseDraftRepository.readRelease(url).then(publishedIdsOf);
      // A failed read is tried again next time.
      ids.catch(() => publishedOf.delete(url));
      publishedOf.set(url, ids);
    }
    return ids;
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
  };
}
