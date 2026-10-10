import { useState } from "preact/hooks";
import { releaseHost, type LibraryDeck } from "@solid-memo/domain/library";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { LibraryDeckScreen } from "./LibraryDeckScreen";
import { Loading } from "./Loading";

/**
 * Adding a deck or a course from a link to its release, published
 * anywhere (docs/deck-library.md, From a link): the link pasted
 * (`onShow`, which puts it in the URL), then the release as the
 * library's page shows one, with the host it is published on and what
 * it is, and a line saying it is not the library's. It is added as the
 * library's are: a deck imported, a course started (`onAdd`).
 */
export function ImportUrlScreen({
  url,
  release,
  reading,
  readError,
  imported,
  busy,
  error,
  onShow,
  onAdd,
}: {
  /** The link pasted, as the URL has it; none yet. */
  url?: string;
  /** The release at the link, read and checked; none while it is read, or when it cannot be. */
  release?: LibraryDeck;
  /** The release is being read and checked. */
  reading: boolean;
  /** Why the release cannot be added. */
  readError: ErrorText | null;
  /** The instance already holds a copy of the release's series. */
  imported: boolean;
  /** The release is being added. */
  busy: boolean;
  /** Why adding it failed. */
  error: ErrorText | null;
  onShow: (url: string) => void;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState(url ?? "");

  function handleSubmit(event: Event) {
    event.preventDefault();
    onShow(typed.trim());
  }

  return (
    <section>
      <header>
        <h2>{t("importUrl.heading")}</h2>
      </header>
      <p>{t("importUrl.intro")}</p>
      <form onSubmit={handleSubmit}>
        <label>
          {t("importUrl.label")}
          <input type="url" required value={typed} onInput={(event) => setTyped(event.currentTarget.value)} />
        </label>
        <button type="submit">{t("importUrl.show")}</button>
      </form>
      {reading && <Loading label={t("importUrl.reading")} />}
      <ErrorMessage error={readError} />
      {release !== undefined && (
        <>
          <p class="hint">{t("importUrl.notLibrary", { host: releaseHost(release.url) })}</p>
          <LibraryDeckScreen
            deck={release}
            host={releaseHost(release.url)}
            imported={imported}
            busy={busy}
            error={error}
            onImport={onAdd}
            onStartCourse={onAdd}
          />
        </>
      )}
    </section>
  );
}
