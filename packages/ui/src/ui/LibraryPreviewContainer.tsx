import { useState } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { activeCards, studyDirections } from "@solid-memo/domain/deck";
import type { LibraryDeck } from "@solid-memo/domain/library";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n } from "./i18n";
import { LibraryPreviewScreen, type PreviewPrompt } from "./LibraryPreviewScreen";
import { Loading } from "./Loading";

/**
 * Fetches a library deck's cards and shows them at random, one after
 * another, never the same prompt twice in a row unless it is the only one.
 */
export function LibraryPreviewContainer({
  useCases,
  deck,
  deckHref,
  onExit,
  random = Math.random,
}: {
  useCases: UseCases;
  deck: LibraryDeck;
  /** URL of the deck's page. */
  deckHref: string;
  onExit: () => void;
  /** Uniform [0, 1) source picking the next card. */
  random?: () => number;
}) {
  const { t, readerText, readerLang, errorText } = useI18n();
  const cardsQuery = useQuery({
    queryKey: ["libraryCards", deck.url],
    queryFn: () => useCases.listLibraryCards(deck),
  });
  const [first] = useState(random);
  const [shown, setShown] = useState<{ index: number; turn: number } | null>(
    null,
  );

  if (cardsQuery.error) {
    return <ErrorMessage error={errorText(cardsQuery.error)} />;
  }
  if (cardsQuery.data === undefined) {
    return <Loading label={t("libraryPreview.loading")} />;
  }

  const directions = studyDirections(deck.direction);
  const prompts: PreviewPrompt[] = activeCards(cardsQuery.data).flatMap((card) =>
    directions.map((direction) => ({ card, direction })),
  );
  const index = shown?.index ?? Math.floor(first * prompts.length);
  const turn = shown?.turn ?? 0;

  function next() {
    const others = prompts.length - 1;
    const step = others === 0 ? 0 : 1 + Math.floor(random() * others);
    setShown({ index: (index + step) % prompts.length, turn: turn + 1 });
  }

  return (
    <LibraryPreviewScreen
      deckName={readerText(deck.title)}
      deckLang={readerLang(deck.title)}
      deckHref={deckHref}
      prompt={prompts.length === 0 ? null : prompts[index]}
      turn={turn}
      onNext={next}
      onExit={onExit}
    />
  );
}
