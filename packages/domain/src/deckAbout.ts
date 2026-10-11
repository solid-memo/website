// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { AppError } from "./appError";
import { TOPICS } from "@solid-memo/vocab/concepts.generated";
import type { Deck } from "./deck";
import { noKeywords, tidiedKeywords, type LangTexts } from "./keywords";
import { tidiedStated, type LangText } from "./langText";

/**
 * What a deck says about itself beyond its name (see docs/data-model.md):
 * a description, which every deck has (DCAT-AP asks one of every
 * dataset), the topics of Solid Memo's topics scheme it is about, and
 * free-text keywords in the languages the user stated.
 */
export interface DeckAbout {
  /**
   * The description in every language it is to have, each under the
   * language the user stated; a language left out or cleared is removed.
   */
  description: LangText;
  /** IRIs of concepts of the topics scheme. */
  topics: string[];
  /**
   * The keywords in every language they are to have, each under the
   * language the user stated (see tidiedKeywords); untagged ones ("")
   * only as the deck has them. A language left out is removed.
   */
  keywords: LangTexts;
}

const TOPIC_IRIS: readonly string[] = TOPICS.concepts.map((concept) => concept.iri);

/** The topics a deck names among its themes. */
export function topicsOfDeck(deck: Deck): string[] {
  return (deck.themes ?? []).filter((theme) => TOPIC_IRIS.includes(theme));
}

/** Keywords as typed in one language: comma-separated, trimmed, each once. */
export function parseKeywords(text: string): string[] {
  return [
    ...new Set(
      text
        .split(",")
        .map((keyword) => keyword.trim())
        .filter((k) => k !== ""),
    ),
  ];
}

/**
 * The deck with what it says about itself replaced: the description, in
 * the languages given, trimmed (see tidiedStated), the topics replacing
 * the ones it named (other themes, such as the EU education theme of a
 * library deck, are kept), the keywords, per language (see
 * tidiedKeywords). Refuses an empty description, and new keywords whose
 * language is not stated.
 */
export function withAbout(deck: Deck, about: DeckAbout): Deck {
  const description = tidiedStated(about.description);
  if (Object.keys(description).length === 0) throw new AppError("deckNeedsDescription");
  const themes = [
    ...(deck.themes ?? []).filter((theme) => !TOPIC_IRIS.includes(theme)),
    ...about.topics,
  ];
  const keywords = tidiedKeywords(about.keywords, deck.keywords);
  const { themes: _themes, keywords: _keywords, ...rest } = deck;
  return {
    ...rest,
    description,
    ...(themes.length === 0 ? {} : { themes }),
    ...(noKeywords(keywords) ? {} : { keywords }),
  };
}
