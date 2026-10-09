import type { DeckLanguageIssues } from "@solid-memo/domain/deckLanguages";
import { useI18n } from "./i18n";

/**
 * Tells the user, on the deck's page, that some of the deck's text does
 * not say which language it is in (deckLanguageIssues): how many card
 * sides state none, with a link to the deck preferences' Languages
 * section (`href`), where they are settled. It stays while anything is
 * left to settle, as settling it is the point, and goes once nothing is;
 * a region with a name, announced only as the user reaches it.
 *
 * `unchecked`: the library release the deck was copied from could not be
 * read, so the counts (which leave out text still as the release has it)
 * are not known; the notice says so instead of counting.
 */
export function DeckLanguagesNotice({
  issues,
  href,
  unchecked = false,
}: {
  issues: DeckLanguageIssues;
  href: string;
  unchecked?: boolean;
}) {
  const { t } = useI18n();
  const count = unchecked
    ? t("deckLanguagesNotice.unchecked")
    : t("deckLanguagesNotice.unstated", { count: issues.unstated });
  return (
    <div class="warning migration" role="region" aria-label={t("deckLanguagesNotice.region")}>
      <p>
        <strong>{t("deckLanguagesNotice.heading")}</strong> {count}
      </p>
      <p>
        <a href={href}>{t("deckLanguagesNotice.link")}</a>
      </p>
    </div>
  );
}
