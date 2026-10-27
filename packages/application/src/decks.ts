// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { withAbout, type DeckAbout } from "@solid-memo/domain/deckAbout";
import { withProvenance, type DeckProvenance } from "@solid-memo/domain/deckProvenance";
import type { LangTexts } from "@solid-memo/domain/keywords";
import { withCardLanguage } from "@solid-memo/domain/deckCardLanguage";
import { withPace, type DeckPace } from "@solid-memo/domain/deckPace";
import type { Deck, DeckDirection } from "@solid-memo/domain/deck";
import type { KeptDocuments } from "@solid-memo/domain/instance";
import { tidiedStated, type LangText } from "@solid-memo/domain/langText";
import { canonicalTag } from "@solid-memo/domain/languageTag";
import type { DeckGroup, DeckTree, DeckTreeEdit } from "@solid-memo/domain/deckTree";
import { deckGroupUrlOf } from "@solid-memo/domain/instanceLayout";
import type { DeckRepository } from "./ports";
import { AppError } from "@solid-memo/domain/appError";
import { again } from "./writes";

export interface DeckUseCases {
  listDecks(instanceUrl: string): Promise<Deck[]>;
  /**
   * A new deck by `title`: its name in every language it is given in,
   * each under the language the user stated, the tag lower case (see
   * tidiedStated). The same words in several languages are saved as
   * given: they are the name in each of those languages.
   */
  createDeck(instanceUrl: string, title: LangText): Promise<Deck>;
  /**
   * Rename the deck: `title` is its name in every language it is to have,
   * a language left out or cleared removed, as createDeck.
   */
  renameDeck(deck: Deck, title: LangText): Promise<Deck>;
  /** The instance's decks as the user arranged them into groups (domain/deckTree.ts). */
  listDeckTree(instanceUrl: string): Promise<DeckTree>;
  /**
   * A new group's identity, before anything is written (a `combine` edit
   * writes it): a fresh URL in the instance's catalog document, and its
   * name as entered, tidied as a deck's (see createDeck). Synchronous, so
   * the screen can show the group, and the edit naming it, at once.
   */
  newDeckGroup(instanceUrl: string, title: LangText): DeckGroup;
  /**
   * Make one edit of the arrangement (DeckRepository.editDeckTree); a
   * rename's name is tidied as a deck's. Returns the tree as written.
   */
  editDeckTree(instanceUrl: string, edit: DeckTreeEdit): Promise<DeckTree>;
  /**
   * Change how the deck is studied. Review state is kept: a card's
   * front→back state waits, unused, while the deck is studied back→front.
   */
  setDeckDirection(deck: Deck, direction: DeckDirection): Promise<Deck>;
  /**
   * Replace what a deck says about itself: its description, in every
   * language it is to have, as createDeck's title, topics and keywords,
   * each language's under the language the user stated (see withAbout):
   * a tag that names no language is refused (textLanguageInvalid), as
   * are new untagged keywords (textNeedsLanguage).
   */
  describeDeck(deck: Deck, about: DeckAbout): Promise<Deck>;
  /**
   * Set the deck's own daily limits; a limit left out follows the
   * instance's preferences again.
   */
  setDeckPace(deck: Deck, pace: DeckPace): Promise<Deck>;
  /**
   * Replace who made the deck and its license (withProvenance): the
   * authors tidied, the license one of KNOWN_LICENSES or the one it has.
   * The edit is made of the deck as its entry says now; when the catalog
   * document changed meanwhile, it is read and made again, three times
   * in all. Throws deckGone when the deck has no entry.
   */
  setDeckProvenance(deck: Deck, provenance: DeckProvenance): Promise<Deck>;
  /** Study several decks of an instance one way, as setDeckDirection, in one write of their catalog. */
  setDecksDirection(decks: readonly Deck[], direction: DeckDirection): Promise<Deck[]>;
  /**
   * Give several decks of an instance the same daily limits, as
   * setDeckPace, in one write of their catalog; a limit that is not a
   * whole number is refused before any write.
   */
  setDecksPace(decks: readonly Deck[], pace: DeckPace): Promise<Deck[]>;
  /**
   * Set the language the deck's card text is shown in first (its
   * fronts, backs, notes, labels, picture descriptions and wrong
   * options), kept on the deck in the pod; null goes back to the usual order, the app's
   * language first. A tag that names no language, or "zxx", is refused
   * (textLanguageInvalid) before any write.
   */
  setDeckCardLanguage(deck: Deck, language: string | null): Promise<Deck>;
  /** Remove a deck and its cards; the result names the documents kept for another app's data in them. */
  removeDeck(deck: Deck): Promise<KeptDocuments>;
  /** Remove several decks of an instance and their cards, their entries in one write of their catalog. */
  removeDecks(decks: readonly Deck[]): Promise<KeptDocuments>;
}

/**
 * A deck's name as entered (see tidiedStated). The app requires a name
 * before it saves, so a name with no text left is a mistake in the app:
 * a plain Error.
 */
function deckTitle(title: LangText): LangText {
  const tidied = tidiedStated(title);
  if (Object.keys(tidied).length === 0) throw new Error("A deck needs a name");
  return tidied;
}

/** A deck group's name as entered, tidied as a deck's: the app requires one before it saves. */
function groupTitle(title: LangText): LangText {
  const tidied = tidiedStated(title);
  if (Object.keys(tidied).length === 0) throw new Error("A deck group needs a name");
  return tidied;
}

/**
 * A deck's keywords as entered, under the canonical form of the language
 * tag each language was given ("SV-se" → "sv-se", "iw" → "he"; lists of
 * one language merged); a tag that names no language is refused
 * (textLanguageInvalid). Only the tags the user states in this edit are
 * checked: a tag the deck already has (in any case) is kept as stored,
 * even one the app would not accept from the user ("und", "en-x-…") or
 * would re-tag ("iw"), so data another app wrote is not changed or
 * refused without the user touching it. Untagged keywords ("") are left
 * for withAbout, which keeps them only as the deck has them (see
 * tidiedKeywords).
 */
function deckKeywords(keywords: LangTexts, deck: Deck): LangTexts {
  const stored = new Set(Object.keys(deck.keywords ?? {}).map((tag) => tag.toLowerCase()));
  const canonical = new Map<string, string[]>();
  for (const [tag, list] of Object.entries(keywords)) {
    const stated = tag === "" || stored.has(tag.toLowerCase()) ? tag : canonicalTag(tag);
    if (stated === null) throw new AppError("textLanguageInvalid", { tag });
    canonical.set(stated, [...(canonical.get(stated) ?? []), ...list]);
  }
  return Object.fromEntries(canonical);
}

/**
 * The decks of an instance, and how the user arranges them into groups
 * (domain/deckTree.ts): each made, named, described, studied one way or
 * another and removed, through its entry in the instance's catalog.
 */
export function createDeckUseCases({
  deckRepository,
  newId,
}: {
  deckRepository: DeckRepository;
  newId: () => string;
}): DeckUseCases {
  return {
    listDecks(instanceUrl) {
      return deckRepository.listDecks(instanceUrl);
    },
    async createDeck(instanceUrl, title) {
      return deckRepository.createDeck(instanceUrl, deckTitle(title));
    },
    async renameDeck(deck, title) {
      return deckRepository.renameDeck(deck, deckTitle(title));
    },
    listDeckTree(instanceUrl) {
      return deckRepository.readDeckTree(instanceUrl);
    },
    newDeckGroup(instanceUrl, title) {
      return { url: deckGroupUrlOf(instanceUrl, newId()), title: groupTitle(title) };
    },
    async editDeckTree(instanceUrl, edit) {
      return deckRepository.editDeckTree(
        instanceUrl,
        edit.kind === "rename" ? { ...edit, title: groupTitle(edit.title) } : edit,
      );
    },
    setDeckDirection(deck, direction) {
      return deckRepository.saveDeck({ ...deck, direction });
    },
    async describeDeck(deck, about) {
      return deckRepository.saveDeck(
        withAbout(deck, { ...about, keywords: deckKeywords(about.keywords, deck) }),
      );
    },
    async setDeckPace(deck, pace) {
      return deckRepository.saveDeck(withPace(deck, pace));
    },
    setDeckProvenance(offered, provenance) {
      return again(async () => {
        const deck = await deckRepository.readDeck(offered.url);
        if (deck === null) throw new AppError("deckGone", { deck: offered.title });
        return deckRepository.saveDeck(withProvenance(deck, provenance));
      });
    },
    setDecksDirection(decks, direction) {
      return deckRepository.saveDecks(decks.map((deck) => ({ ...deck, direction })));
    },
    async setDecksPace(decks, pace) {
      return deckRepository.saveDecks(decks.map((deck) => withPace(deck, pace)));
    },
    async setDeckCardLanguage(deck, language) {
      // Checked and put in the case the app stores tags in before any write.
      return deckRepository.setCardLanguage(
        deck,
        withCardLanguage(deck, language).cardLanguage ?? null,
      );
    },
    removeDeck(deck) {
      return deckRepository.removeDeck(deck);
    },
    removeDecks(decks) {
      return deckRepository.removeDecks(decks);
    },
  };
}
