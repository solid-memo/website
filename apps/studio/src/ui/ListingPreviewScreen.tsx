import { draftLibraryDeck } from "@solid-memo/domain/release/draftListing";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { useI18n } from "@solid-memo/ui/i18n";
import { LibraryDeckScreen } from "@solid-memo/ui/LibraryDeckScreen";
import { LibraryDeckRow } from "@solid-memo/ui/LibraryScreen";

/** What a part of the preview does when used: nothing, it being a picture. */
const nothing = () => undefined;

/**
 * A draft as the library lists the release it will be (docs/studio.md,
 * The listing preview): its row in the library's list (LibraryDeckRow)
 * and its own page (LibraryDeckScreen), as Solid Memo shows them, built
 * from the draft alone (draftLibraryDeck). Both are inert: a picture of
 * what learners will see, nothing in it to follow or press.
 */
export function ListingPreviewScreen({ draft }: { draft: ReleaseDraft }) {
  const { t } = useI18n();
  const deck = draftLibraryDeck(draft);
  return (
    <section>
      <header>
        <h2>{t("studio.preview.heading")}</h2>
      </header>
      <p class="hint">{t("studio.preview.intro")}</p>
      <section aria-labelledby="preview-row">
        <h3 id="preview-row">{t("studio.preview.row")}</h3>
        <div class="listing-preview" inert>
          <ul class="library-list">
            <li>
              <LibraryDeckRow deck={deck} selected={false} imported={false} busy={false} deckHref="#" previewHref="#" onToggle={nothing} />
            </li>
          </ul>
        </div>
      </section>
      <section aria-labelledby="preview-page">
        <h3 id="preview-page">{t("studio.preview.page")}</h3>
        <div class="listing-preview" inert>
          <LibraryDeckScreen deck={deck} browseHref="#" previewHref="#" imported={false} busy={false} error={null} onImport={nothing} onStartCourse={nothing} />
        </div>
      </section>
    </section>
  );
}
