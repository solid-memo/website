import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import type { Deck } from "@solid-memo/domain/deck";
import { useI18n } from "@solid-memo/ui/i18n";
import { useSeen } from "./HealthBadge";

/**
 * The instance's copies of library releases (UseCases.listLibraryUpdates):
 * one read of the library's index for every deck. Its key is under the
 * instance's decks, so whatever reads them afresh (an upgrade, a deck
 * removed) reads this afresh too. The index changes only with the site,
 * so it is not read again on its own.
 */
export function libraryUpdatesQuery(useCases: UseCases, instanceUrl: string) {
  return {
    queryKey: ["decks", instanceUrl, "libraryUpdates"],
    queryFn: () => useCases.listLibraryUpdates(instanceUrl),
    staleTime: Infinity,
  };
}

/**
 * Whether the library has a newer release of a deck copied from it, as a
 * badge linking to the instance's library copies (`href`), looked up only
 * once the badge is on the screen. Nothing while it is looked up, when
 * the copy is up to date, or when the library cannot be read: the deck
 * works as it is.
 */
export function UpdateBadge({
  useCases,
  instanceUrl,
  deck,
  href,
}: {
  useCases: UseCases;
  instanceUrl: string;
  deck: Deck;
  href: string;
}) {
  const { t, readerText } = useI18n();
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const query = useQuery({ ...libraryUpdatesQuery(useCases, instanceUrl), enabled: seen });
  const copy = query.data?.find((each) => each.deck.url === deck.url);
  return (
    <span ref={ref}>
      {copy?.newer === true && (
        <a class="studio-badge studio-badge-warning" href={href}>
          {t("studio.library.badge", { version: copy.series!.version })}
          <span class="visually-hidden"> {t("studio.library.badgeOf", { deck: readerText(deck.title) })}</span>
        </a>
      )}
    </span>
  );
}
