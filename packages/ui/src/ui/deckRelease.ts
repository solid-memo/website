import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import type { LibraryDeckContent } from "@solid-memo/domain/library";

/**
 * The library release a deck was copied from (UseCases.deckRelease): null
 * for a deck not from the library, undefined while it is read or when it
 * cannot be. Read once per release: a release never changes.
 */
export function useDeckRelease(useCases: UseCases, deck: Deck): LibraryDeckContent | null | undefined {
  return useDeckReleaseQuery(useCases, deck).release;
}

/**
 * The library release a deck was copied from, as useDeckRelease reads it,
 * and why it could not be read (`error`), for a screen that waits on it.
 */
export function useDeckReleaseQuery(
  useCases: UseCases,
  deck: Deck,
): { release: LibraryDeckContent | null | undefined; error: Error | null } {
  const query = useQuery({
    queryKey: ["deckRelease", deck.sourceUrl],
    queryFn: () => useCases.deckRelease(deck),
    enabled: deck.sourceUrl !== undefined,
    staleTime: Infinity,
  });
  return deck.sourceUrl === undefined ? { release: null, error: null } : { release: query.data, error: query.error };
}

/**
 * The ids of a card's distractors the release its deck came from
 * published (domain/distractors.ts: never deleted, only retired): none for
 * a deck not from the library or a card the release lacks, and, while the
 * release is read or when it cannot be, every one the card has, so none
 * is deleted before it is known.
 */
export function publishedDistractorIds(
  release: LibraryDeckContent | null | undefined,
  card: { id: string; distractors?: readonly { id: string }[] },
): ReadonlySet<string> {
  if (release === undefined) return new Set((card.distractors ?? []).map((distractor) => distractor.id));
  const published = release?.cards.find((released) => released.id === card.id);
  return new Set((published?.distractors ?? []).map((distractor) => distractor.id));
}
