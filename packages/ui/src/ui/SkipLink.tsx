import { useI18n } from "./i18n";

/** Where the skip link goes: the main landmark, past the site header. */
export const MAIN_ID = "main";

/**
 * The first Tab stop: a link past the header (theme, languages, masthead,
 * instance bar) to the main content, shown only once focused. The hash
 * names routes here, so it moves the focus itself instead of following
 * its href.
 */
export function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      class="skip-link"
      href={`#${MAIN_ID}`}
      onClick={(event) => {
        event.preventDefault();
        document.getElementById(MAIN_ID)?.focus();
      }}
    >
      {t("app.skipToContent")}
    </a>
  );
}
