// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { chosenDistractorIn, type Answer } from "./answer";
import type { Deck, Distractor } from "./deck";
import type { DeckGroup, DeckTree, GraftNode, TreeNode } from "./deckTree";
import type { StepPart } from "./deckUpgrade";
import type { Instance } from "./instance";
import { isIriPastBound } from "./pathKeys";
import { namedFsrsSubject } from "./reviewRecord";
import {
  cardsContainerOf,
  catalogUrlOf,
  ensureTrailingSlash,
  reviewsContainerOf,
} from "./instanceLayout";
import type { ReleaseDraftSummary } from "./release/draftLayout";
import type { ReleaseDraft } from "./release/releaseDraft";
import { rebaseDraft } from "./release/releaseToDraft";
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
export const GUEST_TRANSFER_STEPS = [
  "stage",
  "copy",
  "adopt",
  "validate",
  "verify",
  "register",
  "tidy",
] as const;

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
  | {
      ok: false;
      step: GuestTransferStep;
      error: unknown;
      cleanedUp: boolean;
      leftoverUrl?: string;
    };

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
 * deck groups are made around them, each of the guest's drafts is copied
 * to the instance, the guest's study is found unchanged since it was
 * read, and only then is it deleted from the device.
 */
export const GUEST_MERGE_STEPS = ["read", "decks", "arrange", "drafts", "verify", "tidy"] as const;

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
   * "arrange"; the drafts in `copied` are in `instance`, each whole;
   * nothing else was written. The guest's study is as it was.
   */
  | {
      ok: false;
      instance: Instance;
      step: GuestMergeStep;
      error: unknown;
      added: Deck[];
      copied: ReleaseDraftSummary[];
    };

/**
 * What adding a guest's study to an instance would add: each of the
 * guest's decks, with the instance's decks copied from the same library
 * release, which it is added beside rather than merged into. And how
 * many drafts of releases the guest wrote: each is copied to the
 * instance, under its name unless the instance has a draft of that name
 * and version, then the next free one.
 */
export interface GuestMergePlan {
  decks: { deck: Deck; sameRelease: Deck[] }[];
  drafts: number;
}

/** The guest's decks, each with the target's decks copied from the same library release, and the guest's drafts, counted. */
export function guestMergePlan(
  guestDecks: readonly Deck[],
  targetDecks: readonly Deck[],
  drafts: number,
): GuestMergePlan {
  return {
    decks: guestDecks.map((deck) => ({
      deck,
      sameRelease:
        deck.sourceUrl === undefined
          ? []
          : targetDecks.filter((target) => target.sourceUrl === deck.sourceUrl),
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
export function mergedDeck(
  guest: Deck,
  instanceUrl: string,
  id: string,
  formatVersion: number,
): Deck {
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
 * Whether the guest's card `cardId` can be added to the deck `to`: its
 * IRI in `to`'s cards document can be written (chosenDistractorIn), and
 * so can the longest name its review states take in `to`'s reviews
 * document, its FSRS-6 state from back to front. Its id came from a
 * release and fit under the guest's shorter address; a card that does
 * not fit is left out, with its review states and its answers, as it
 * could be neither written nor studied there.
 */
export function cardFitsDeck(
  cardId: string,
  to: Pick<Deck, "cardsDocumentUrl" | "reviewsDocumentUrl">,
): boolean {
  return (
    chosenDistractorIn(to.cardsDocumentUrl, cardId) !== undefined &&
    !isIriPastBound(namedFsrsSubject(to.reviewsDocumentUrl, { cardId, direction: "back-to-front" }))
  );
}

/**
 * A card of the guest's deck as it is added to the deck whose cards
 * document is at `cardsDocumentUrl`: without a wrong option whose IRI
 * there could not be written (chosenDistractorIn). Its id came from a
 * release and fit under the guest's shorter address; the rest of the
 * card, and every other option, is added as it is.
 */
export function movedCard<C extends { distractors?: readonly Distractor[] }>(
  card: C,
  cardsDocumentUrl: string,
): C {
  const { distractors, ...rest } = card;
  if (distractors === undefined) return card;
  const kept = distractors.filter(
    ({ id }) => chosenDistractorIn(cardsDocumentUrl, id) !== undefined,
  );
  if (kept.length === distractors.length) return card;
  return (kept.length === 0 ? rest : { ...rest, distractors: kept }) as C;
}

/**
 * An answer to a card of the guest's deck `from`, as an answer to the
 * same card of `to`, the deck it was added as: its deck, its card and the
 * wrong option chosen named in `to`'s documents, by the same fragment
 * ids; its own id the guest's followed by `to`'s, so that the same answer
 * added to another deck (the guest's deck added again) is an entry of its
 * own, and added again to the same deck changes nothing. A wrong option
 * whose IRI in `to`'s cards document could not be written
 * (chosenDistractorIn), as one with an id that fit under the guest's
 * shorter address may be, is left out, not the answer. Everything else
 * stays.
 */
export function mergedAnswer(answer: Answer, to: Deck): Answer {
  const inCards = (url: string) => `${to.cardsDocumentUrl}#${fragmentIdOf(url)}`;
  const { chosenDistractor, ...rest } = answer;
  const chosen =
    chosenDistractor === undefined
      ? undefined
      : chosenDistractorIn(to.cardsDocumentUrl, fragmentIdOf(chosenDistractor));
  return {
    ...rest,
    id: `${answer.id}-${to.id}`,
    deckUrl: to.url,
    cardUrl: inCards(answer.cardUrl),
    ...(chosen === undefined ? {} : { chosenDistractor: chosen }),
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
        return [
          {
            kind: "group",
            group: { url: groupUrl(node.group), title: node.group.title },
            children: graftOf(node.children),
          },
        ];
      }
      const deck = added.get(node.deck.url);
      return deck === undefined ? [] : [{ kind: "deck", url: deck.url }];
    });
  return tree.children.some((node) => node.kind === "group") ? graftOf(tree.children) : [];
}

/**
 * Each `https://` in a text, through the end of its host (and port): every
 * one, also one that starts inside another.
 */
const HTTPS_AUTHORITY = /(?=(https:\/\/[^\s/\\?#<>"'()]*))/gi;

/** The guest's pod's origin, as a parsed URL reports it. */
const GUEST_POD_ORIGIN = new URL(GUEST_ORIGIN).origin;

/**
 * Whether a text names the guest's pod: a URL in it whose origin, once
 * parsed, is the guest's, however its host is spelled (in capitals, with
 * the port, without the slash after it). Every text holding `GUEST_ORIGIN`
 * is one.
 */
function namesGuestPod(text: string): boolean {
  return Array.from(text.matchAll(HTTPS_AUTHORITY), ([, authority]) => authority!).some(
    (authority) => URL.canParse(authority) && new URL(authority).origin === GUEST_POD_ORIGIN,
  );
}

/** Whether an IRI is in the guest's pod, however its host is spelled (namesGuestPod). */
export function isGuestPodIri(iri: string): boolean {
  return URL.canParse(iri) && new URL(iri).origin === GUEST_POD_ORIGIN;
}

/**
 * The fields of a deck, a card and a wrong option that hold text for the
 * reader (names, titles, card text, notes): a copy writes them as
 * literals, as they are, never as an address it moves. Skipped by name,
 * at any depth: guest.test.ts lists every field of Deck, Card,
 * Distractor and the review states, so a new field, or one that reuses
 * one of these names for an address, fails it until it is placed.
 */
const READER_TEXT_FIELDS: ReadonlySet<string> = new Set([
  "title",
  "description",
  "keywords",
  "authors",
  "front",
  "back",
  "frontImageDescription",
  "frontLabel",
  "frontNote",
  "backImageDescription",
  "backLabel",
  "backNote",
  "text",
  "note",
]);

/**
 * Whether a guest's deck, its cards or review states, as they are added
 * to an instance, still name the guest's pod by address: in any field at
 * any depth but the text the reader reads (READER_TEXT_FIELDS), which
 * may name any address and is copied as it is. Each such field holds one
 * whole IRI, which is also parsed as one (isGuestPodIri), as the move
 * does: a URL parser reads spellings without `//` as the guest's pod too.
 */
export function addressesGuest(value: unknown): boolean {
  return addressesGuestBut(value, READER_TEXT_FIELDS);
}

/**
 * The fields of a deck, a card and a wrong option that hold its own
 * place (its id, its address and its documents'): an import gives it a
 * new one, and a release or a deck file read at the guest's pod has
 * them there. With them, the text a release adds for the reader (what
 * changed in it), which may name any address: guest.test.ts lists every
 * field of LibraryDeckContent, so a new one fails it until it is placed.
 */
const OWN_PLACE_FIELDS: ReadonlySet<string> = new Set([
  ...READER_TEXT_FIELDS,
  "versionNotes",
  "id",
  "url",
  "cardsDocumentUrl",
  "reviewsDocumentUrl",
]);

/**
 * Whether data from outside the instance, a release or a deck file as
 * it is read, links to the guest's pod by an address in a field that
 * is neither its own place nor text for the reader (OWN_PLACE_FIELDS),
 * as addressesGuest finds one: added to a guest's study, such an
 * address would stay as it is when the study is kept, so it would not
 * be kept (GHSA-hc3p-fpwj-fvjp).
 */
export function linksGuestPod(value: unknown): boolean {
  return addressesGuestBut(value, OWN_PLACE_FIELDS);
}

function addressesGuestBut(value: unknown, skipped: ReadonlySet<string>): boolean {
  if (typeof value === "string") return isGuestPodIri(value) || namesGuestPod(value);
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(value).some(
    ([field, held]) => !skipped.has(field) && addressesGuestBut(held, skipped),
  );
}

/**
 * Whether a draft names the guest's pod by an IRI: its own, one its
 * records link to, or one of its statements' terms. Its text, a
 * literal, may name any address and is copied as it is.
 */
export function draftAddressesGuest(draft: ReleaseDraft): boolean {
  let named = isGuestPodIri(draft.url);
  rebaseDraft(draft, draft.url, (iri) => {
    named ||= isGuestPodIri(iri);
    return iri;
  });
  return named || draft.triples.some(({ predicate }) => isGuestPodIri(predicate));
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
    entry: {
      ...deck,
      completedChapters:
        deck.completedChapters === undefined ? undefined : [...deck.completedChapters].sort(),
    },
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
  return typeof note?.url === "string" && typeof note.stamp === "string"
    ? { url: note.url, stamp: note.stamp }
    : null;
}
