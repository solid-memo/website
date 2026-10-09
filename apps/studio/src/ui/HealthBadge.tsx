import { useEffect, useRef, useState } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { healthProblemCount } from "@solid-memo/domain/deckHealth";
import { useI18n } from "@solid-memo/ui/i18n";
import { deckTextCheck } from "@solid-memo/ui/markdownCache";

/**
 * A deck's health (UseCases.checkDeck), the Markdown read by the markdown
 * package. Its key is under the instance's check, so a repair, which
 * reads that afresh, reads this afresh too; with the cards document, so
 * an upgraded deck is checked anew. A badge does not check it again on
 * its own (as the instance's check is not): a repair, "Check again"
 * and opening the deck's health do.
 */
export function deckHealthQuery(useCases: UseCases, instanceUrl: string, deck: Deck) {
  return {
    queryKey: ["validation", instanceUrl, "deck", deck.url, deck.cardsDocumentUrl],
    queryFn: () => useCases.checkDeck(instanceUrl, deck, deckTextCheck()),
    staleTime: Infinity,
  };
}

/**
 * A ref for an element, and whether it has been on the screen yet
 * (IntersectionObserver): once it has, it stays so.
 */
export function useSeen<T extends Element>(): [{ current: T | null }, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
    });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [seen]);
  return [ref, seen];
}

/**
 * A deck's health as a badge, checked only once the badge is on the
 * screen, so a long table checks only the decks the user scrolls to:
 * nothing while it is checked, its problems as a link to its health
 * (`href`), "No problems" (or nothing, `quiet`, where that is noise),
 * or that it could not be checked.
 */
export function HealthBadge({
  useCases,
  instanceUrl,
  deck,
  href,
  quiet = false,
}: {
  useCases: UseCases;
  instanceUrl: string;
  deck: Deck;
  href: string;
  quiet?: boolean;
}) {
  const { t, readerText } = useI18n();
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const query = useQuery({ ...deckHealthQuery(useCases, instanceUrl, deck), enabled: seen });
  const count = query.data === undefined ? undefined : healthProblemCount(query.data);
  return (
    <span ref={ref}>
      {query.isError ? (
        <span class="studio-badge">{t("studio.health.badge.failed")}</span>
      ) : count === undefined ? null : count > 0 ? (
        <a class="studio-badge studio-badge-warning" href={href}>
          {t("studio.health.badge.problems", { count })}
          <span class="visually-hidden"> {t("studio.decks.healthOf", { deck: readerText(deck.title) })}</span>
        </a>
      ) : (
        !quiet && <span class="studio-badge">{t("studio.health.badge.healthy")}</span>
      )}
    </span>
  );
}
