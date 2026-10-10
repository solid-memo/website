import type { Answer } from "./answer";
import type { Deck } from "./deck";
import type { DeckGroup, DeckTree, GraftNode, TreeNode } from "./deckTree";
import type { StepPart } from "./deckUpgrade";
import type { Instance } from "./instance";
import { cardsContainerOf, catalogUrlOf, ensureTrailingSlash, reviewsContainerOf } from "./instanceLayout";
import type { Session } from "./session";
import { fragmentIdOf } from "./subjectUrl";

/**
 * Trying Solid Memo before logging in (docs/guest-mode.md): a guest
 * studies in a pod kept on their device, at an origin of its own. `.invalid`
 * is reserved and never resolves, so a guest URL that reached the network
 * by mistake would fail rather than go anywhere.
 */

/** Where the guest's pod lives: every guest URL starts with it. */
export const GUEST_ORIGIN = "https://guest.solid-memo.invalid/";

/** The guest's WebID, in a profile document of the guest's pod. */
export const GUEST_WEBID = `${GUEST_ORIGIN}profile/card#me`;

/** A guest's session: no login, the guest's WebID. */
export const GUEST_SESSION: Session = { webId: GUEST_WEBID, guest: true };

/** The instance a guest studies in, made when they start. */
export const GUEST_INSTANCE_URL = `${GUEST_ORIGIN}solid-memo/`;

/** Whether a URL is one of the guest's pod. */
export function isGuestUrl(url: string): boolean {
  return url.startsWith(GUEST_ORIGIN);
}

/**
 * Keeping a guest's study: their instance is copied into the pod they
 * logged in to, every IRI under it moved there and their WebID made the
 * guest's, then checked, registered in their type index, and only then
 * deleted from the device. A failure before the registration deletes the
 * copy and leaves the guest's study as it was.
 */
export const GUEST_TRANSFER_STEPS = ["stage", "copy", "adopt", "validate", "verify", "register", "tidy"] as const;

export type GuestTransferStep = (typeof GUEST_TRANSFER_STEPS)[number];

export interface GuestTransferProgress {
  step: GuestTransferStep;
  /** Steps finished, out of `total`. */
  done: number;
  total: number;
  /** How far into `step` it is; absent for a step done in one go. */
  part?: StepPart;
}

export type GuestTransferOutcome =
  /** The study is in the user's pod at `instance`; `tidied` says whether the guest's copy was deleted. */
  | { ok: true; instance: Instance; tidied: boolean }
  /**
   * Failed before the registration, at `step`: the guest's study is as it
   * was. `cleanedUp` says whether the partial copy was deleted; when it
   * was not, `leftoverUrl` is where it remains.
   */
  | { ok: false; step: GuestTransferStep; error: unknown; cleanedUp: boolean; leftoverUrl?: string };

/**
 * Where to suggest keeping a guest's study in a storage, as a new
 * instance (when the user has none to add it to): `solid-memo/main/`, as
 * for any first instance.
 */
export function suggestedGuestLocation(storageUrl: string): string {
  return `${ensureTrailingSlash(storageUrl)}solid-memo/main/`;
}

/** What a guest has studied, to offer keeping: each of their instances, with its number of decks. */
export interface GuestStudy {
  instances: { instance: Instance; deckCount: number }[];
}

/**
 * Adding a guest's study to an instance the user already has
 * (docs/guest-mode.md "Adding to an instance"): the guest's study is
 * read and checked, each deck chosen is added as a new deck (its
 * documents first, its catalog entry last, then its answers), the guest's
 * deck groups are made around them, the guest's study is found unchanged
 * since it was read, and only then is it deleted from the device.
 */
export const GUEST_MERGE_STEPS = ["read", "decks", "arrange", "verify", "tidy"] as const;

export type GuestMergeStep = (typeof GUEST_MERGE_STEPS)[number];

export interface GuestMergeProgress {
  step: GuestMergeStep;
  /** Steps finished, out of `total`. */
  done: number;
  total: number;
  /** How far into `step` it is; absent for a step done in one go. */
  part?: StepPart;
}

export type GuestMergeOutcome =
  /**
   * The study is in `instance`: `added` are its decks there, in the
   * guest's order; `tidied` says whether the guest's study was deleted
   * from the device.
   */
  | { ok: true; instance: Instance; added: Deck[]; tidied: boolean }
  /**
   * Failed at `step`. The decks in `added` are in `instance`, each whole
   * (its documents and its entry), with its answers unless adding them
   * failed; the guest's groups were made when the failure came after
   * "arrange"; nothing else was written. The guest's study is as it was.
   */
  | { ok: false; instance: Instance; step: GuestMergeStep; error: unknown; added: Deck[] };

/**
 * What adding a guest's study to an instance would add: each of the
 * guest's decks, with the instance's decks copied from the same library
 * release, which it is added beside rather than merged into. And how
 * many drafts of releases the guest wrote: they are not added, and go
 * with the rest of the guest's study.
 */
export interface GuestMergePlan {
  decks: { deck: Deck; sameRelease: Deck[] }[];
  drafts: number;
}

/** The guest's decks, each with the target's decks copied from the same library release, and the guest's drafts, counted. */
export function guestMergePlan(guestDecks: readonly Deck[], targetDecks: readonly Deck[], drafts: number): GuestMergePlan {
  return {
    decks: guestDecks.map((deck) => ({
      deck,
      sameRelease:
        deck.sourceUrl === undefined ? [] : targetDecks.filter((target) => target.sourceUrl === deck.sourceUrl),
    })),
    drafts,
  };
}

/**
 * A guest's deck as a new deck of the instance at `instanceUrl`: the
 * fragment id `id`, its documents named after it in the instance's
 * decks/ and reviews/, and everything else it says (its title,
 * provenance, direction, pace, chapters completed, when it was made) as
 * the guest's deck says it. Written in this app's format.
 */
export function mergedDeck(guest: Deck, instanceUrl: string, id: string, formatVersion: number): Deck {
  const base = ensureTrailingSlash(instanceUrl);
  return {
    ...guest,
    id,
    url: `${catalogUrlOf(base)}#${id}`,
    cardsDocumentUrl: `${cardsContainerOf(base)}${id}.ttl`,
    reviewsDocumentUrl: `${reviewsContainerOf(base)}${id}.ttl`,
    formatVersion,
  };
}

/**
 * An answer to a card of the guest's deck `from`, as an answer to the
 * same card of `to`, the deck it was added as: its deck, its card and the
 * wrong option chosen named in `to`'s documents, by the same fragment
 * ids; its own id the guest's followed by `to`'s, so that the same answer
 * added to another deck (the guest's deck added again) is an entry of its
 * own, and added again to the same deck changes nothing. Everything else
 * stays.
 */
export function mergedAnswer(answer: Answer, to: Deck): Answer {
  const inCards = (url: string) => `${to.cardsDocumentUrl}#${fragmentIdOf(url)}`;
  return {
    ...answer,
    id: `${answer.id}-${to.id}`,
    deckUrl: to.url,
    cardUrl: inCards(answer.cardUrl),
    ...(answer.chosenDistractor === undefined ? {} : { chosenDistractor: inCards(answer.chosenDistractor) }),
  };
}

/**
 * The guest's deck groups, as groups to make in the instance around the
 * decks added (DeckTreeEdit "graft"): each group a new one (`groupUrl`
 * names it, given the guest's), holding what the guest's held, in the guest's order; each
 * deck the one it was added as, a deck that was not added left out (a
 * group may so be empty, as the guest may have left one). None when the
 * guest made no group: the decks added then stay where new decks go.
 */
export function graftOfGuestTree(
  tree: DeckTree,
  added: ReadonlyMap<string, Deck>,
  groupUrl: (guestGroup: DeckGroup) => string,
): GraftNode[] {
  const graftOf = (nodes: readonly TreeNode[]): GraftNode[] =>
    nodes.flatMap((node): GraftNode[] => {
      if (node.kind === "group") {
        return [{ kind: "group", group: { url: groupUrl(node.group), title: node.group.title }, children: graftOf(node.children) }];
      }
      const deck = added.get(node.deck.url);
      return deck === undefined ? [] : [{ kind: "deck", url: deck.url }];
    });
  return tree.children.some((node) => node.kind === "group") ? graftOf(tree.children) : [];
}

/** Whether a value names the guest's pod anywhere: in any text it holds, at any depth. */
export function mentionsGuest(value: unknown): boolean {
  if (typeof value === "string") return value.includes(GUEST_ORIGIN);
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value).some(mentionsGuest);
}

/**
 * A note, kept on the device while a guest's study is being added
 * (UpdateJournal), of what a guest's deck or deck group was added to an
 * instance as (`url`), and `stamp`, what it was made from: for a deck,
 * its catalog entry and the versions of its cards and reviews documents
 * as they were read (guestDeckStamp); for a group, the whole arrangement
 * of the guest's groups around the decks added. Adding the study again
 * finds a deck whose stamp matches there and adds only its answers, which
 * changes nothing that is there, and makes a group whose stamp matches
 * under the same URL, which a graft already made leaves as it is. A deck
 * the guest changed since is added again, as a deck of its own, and
 * groups arranged otherwise since are made anew.
 */
export interface GuestMergeNote {
  url: string;
  stamp: string;
}

/**
 * What a guest's deck was read as, to tell on a later run whether it
 * changed: its catalog entry (its chapters completed in any order) and
 * the versions of its cards and reviews documents (`versionOf`, "" for
 * none).
 */
export function guestDeckStamp(deck: Deck, versionOf: (url: string) => string): string {
  return JSON.stringify({
    entry: { ...deck, completedChapters: deck.completedChapters === undefined ? undefined : [...deck.completedChapters].sort() },
    cards: versionOf(deck.cardsDocumentUrl),
    reviews: versionOf(deck.reviewsDocumentUrl),
  });
}

/** Under what the note of a guest's deck or group added to an instance is kept. */
export function guestMergeKey(guestUrl: string, instanceUrl: string): string {
  return `${guestUrl} added to ${ensureTrailingSlash(instanceUrl)}`;
}

export function encodeGuestMergeNote(note: GuestMergeNote): string {
  return JSON.stringify(note);
}

/** The note as kept; null when there is none, or none this app can read. */
export function decodeGuestMergeNote(text: string | null): GuestMergeNote | null {
  if (text === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const note = value as Partial<GuestMergeNote> | null;
  return typeof note?.url === "string" && typeof note.stamp === "string" ? { url: note.url, stamp: note.stamp } : null;
}
