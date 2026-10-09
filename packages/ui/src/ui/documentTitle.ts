import { useEffect } from "preact/hooks";
import { useI18n } from "./i18n";

/** Longest a part of the title is kept: a card's front can be a paragraph. */
const MAX_PART = 60;

/**
 * The browser tab's title: `parts` (most specific first) and the app's
 * name, in the user's language, so tabs, history and a screen reader tell
 * the screens apart. Empty parts (a name still loading) are left out;
 * null leaves the title to whoever else sets it.
 */
export function useDocumentTitle(parts: string[] | null) {
  const { t } = useI18n();
  const title =
    parts === null
      ? null
      : [
          ...parts
            .filter((part) => part !== "")
            .map((part) => (part.length > MAX_PART ? `${part.slice(0, MAX_PART - 1)}…` : part)),
          t("app.documentTitle"),
        ].join(" – ");
  useEffect(() => {
    if (title !== null) document.title = title;
  }, [title]);
}
