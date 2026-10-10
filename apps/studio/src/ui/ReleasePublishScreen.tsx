import { useState } from "preact/hooks";
import type { SavedRelease } from "@solid-memo/application/releasePublishing";
import { isGuestUrl } from "@solid-memo/domain/guest";
import { draftPlaceOf } from "@solid-memo/domain/release/draftLayout";
import type { ReleaseDraft } from "@solid-memo/domain/release/releaseDraft";
import { isReleaseContainer, releasesContainerOf, releaseUrlIn } from "@solid-memo/domain/release/releasePlace";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { CopyLink } from "./CopyLink";
import { ReadOnlyNotice } from "./ReadOnly";

/** What the publishing part of the release screen links to. */
export interface ReleasePublishLinks {
  /** The release check, for a pod. */
  checkHref: string;
  /** The release check, for the Solid Memo library. */
  libraryCheckHref: string;
  healthHref: string;
}

/** An action of the screen: whether it runs, why it failed last, and what starts it. */
interface Action<T> {
  pending: boolean;
  error: ErrorText | null;
  run: (value: T) => void;
}

/**
 * The second half of a draft's release screen (docs/studio.md,
 * Publishing a release): publishing the draft in the pod, and saving it
 * as a file for the library.
 *
 * - **Publish to my Pod**, unless it is a guest's (whose pod is this
 *   browser's alone): in a folder, the instance's `releases/` unless the
 *   user types another, at `<folder><name>/v<N>.ttl`. The user ticks that
 *   the release will be public and can never be changed, first. The
 *   release check's errors are counted, with a link to it; publishing
 *   checks again, the shapes too, and an error stops it.
 * - **Released**: where it is, a link to copy, whether anyone can read
 *   it (if not, a way to try again), and the next version to start.
 * - **Download .ttl**: the release at its address in the library, and
 *   the steps that send it to the library's `decks/` as a pull request.
 *
 * Nothing is published while a change waits to be saved (`saving`), and
 * nothing is published or started while the instance's catalogue may not
 * be written (`hold`).
 */
export function ReleasePublishScreen({
  draft,
  hold,
  saving,
  errors,
  links,
  publish,
  isPublic,
  makePublic,
  startNext,
  download,
  downloaded,
}: {
  draft: ReleaseDraft;
  hold: ReadOnlyReason | null;
  saving: boolean;
  /** The errors the release check finds (its rules, its shapes left out); undefined while it checks. */
  errors: number | undefined;
  links: ReleasePublishLinks;
  /** Publish at the address. */
  publish: Action<string>;
  /** Whether someone with no login can read the release the draft was published as; undefined while that is asked. */
  isPublic: boolean | undefined;
  makePublic: Action<string>;
  startNext: Action<string>;
  download: Action<void>;
  /** The file the last download saved; null before one did. */
  downloaded: SavedRelease | null;
}) {
  const { t, tx } = useI18n();
  // A draft's screens are routed only at a draft's URL.
  const place = draftPlaceOf(draft.url)!;
  const released = draft.root.releasedAs;
  return (
    <>
      <section aria-labelledby="release-publish-heading">
        <h3 id="release-publish-heading">{t("studio.publish.heading")}</h3>
        {released !== undefined ? (
          <Released url={released} hold={hold} healthHref={links.healthHref} isPublic={isPublic} makePublic={makePublic} startNext={startNext} />
        ) : isGuestUrl(draft.url) ? (
          <p class="hint">{t("studio.publish.guest")}</p>
        ) : (
          <PublishForm place={place} hold={hold} saving={saving} errors={errors} links={links} publish={publish} />
        )}
      </section>
      <section aria-labelledby="release-download-heading">
        <h3 id="release-download-heading">{t("studio.publish.downloadHeading")}</h3>
        <p class="hint">{t("studio.publish.downloadIntro")}</p>
        {/* Only aria-disabled while it saves, so it keeps the focus. */}
        <button type="button" aria-disabled={download.pending} onClick={() => !download.pending && download.run()}>
          {t("studio.publish.download")}
        </button>
        <p role="status">{downloaded !== null && !download.pending && tx("studio.publish.downloaded", { file: <code>{downloaded.name}</code>, url: <code>{downloaded.url}</code> })}</p>
        <ErrorMessage error={download.error} />
        <p>{t("studio.publish.stepsIntro")}</p>
        <ol class="release-steps">
          <li>{tx("studio.publish.stepCopy", { file: <code>{`decks/${place.name}/v${place.version}.ttl`}</code> })}</li>
          <li>
            {t("studio.publish.stepLibrary")} <code>npm run format:turtle &amp;&amp; npm run library</code>
          </li>
          <li>
            {t("studio.publish.stepCheck")} <code>npm run library:check -- --base main</code>
          </li>
          <li>
            {t("studio.publish.stepAll")} <code>npm run check &amp;&amp; npm run crosscheck</code>
          </li>
          <li>{t("studio.publish.stepPullRequest")}</li>
        </ol>
        <p>
          <a href={links.libraryCheckHref}>{t("studio.publish.libraryCheck")}</a>
        </p>
      </section>
    </>
  );
}

/** The form that publishes the draft in the pod: the folder, the address it makes, the user's word that it will be public. */
function PublishForm({
  place,
  hold,
  saving,
  errors,
  links,
  publish,
}: {
  place: { instanceUrl: string; name: string; version: number };
  hold: ReadOnlyReason | null;
  saving: boolean;
  errors: number | undefined;
  links: ReleasePublishLinks;
  publish: Action<string>;
}) {
  const { t } = useI18n();
  const [folder, setFolder] = useState(() => releasesContainerOf(place.instanceUrl));
  const [understood, setUnderstood] = useState(false);
  const valid = isReleaseContainer(folder.trim());
  const target = valid ? releaseUrlIn(folder.trim(), place.name, place.version) : null;
  const ready = target !== null && understood && hold === null && !saving && errors === 0;

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (ready && !publish.pending) publish.run(target);
  }

  return (
    <>
      <p class="hint">{t("studio.publish.intro")}</p>
      <ReadOnlyNotice reason={hold} subject="catalogue" healthHref={links.healthHref} />
      <p>
        {errors === undefined ? (
          t("studio.publish.checking")
        ) : errors === 0 ? (
          t("studio.publish.noErrors")
        ) : (
          <a href={links.checkHref}>{t("studio.publish.errors", { count: errors })}</a>
        )}
      </p>
      <form class="card-edit" onSubmit={handleSubmit}>
        <label for="release-folder">{t("studio.publish.folder")}</label>
        <input
          id="release-folder"
          type="url"
          value={folder}
          aria-describedby="release-folder-hint"
          aria-invalid={!valid || undefined}
          onInput={(event) => setFolder(event.currentTarget.value)}
        />
        <p id="release-folder-hint" class={valid ? "hint field-hint" : "error"}>
          {target === null ? t("studio.publish.folderInvalid") : t("studio.publish.address", { url: target })}
        </p>
        <label class="radio-option">
          <input type="checkbox" checked={understood} onChange={(event) => setUnderstood(event.currentTarget.checked)} />{" "}
          {t("studio.publish.confirm")}
        </label>
        {/* Only aria-disabled while it publishes, so it keeps the focus should that fail. */}
        <button type="submit" class="primary" disabled={!ready} aria-disabled={publish.pending}>
          {t("studio.publish.publish")}
        </button>
      </form>
      <p role="status">{publish.pending ? t("studio.publish.publishing") : saving && t("studio.publish.waitSaving")}</p>
      <ErrorMessage error={publish.error} />
    </>
  );
}

/** A draft released: where its release is, whether anyone can read it, and its next version to start. */
function Released({
  url,
  hold,
  healthHref,
  isPublic,
  makePublic,
  startNext,
}: {
  url: string;
  hold: ReadOnlyReason | null;
  healthHref: string;
  isPublic: boolean | undefined;
  makePublic: Action<string>;
  startNext: Action<string>;
}) {
  const { t, tx } = useI18n();
  return (
    <>
      <p>{tx("studio.publish.releasedAt", { url: <a href={url}>{url}</a> })}</p>
      <p>
        <CopyLink url={url} label={t("studio.releases.copyLink", { url })} />
      </p>
      {isPublic === undefined ? (
        <p class="hint">{t("studio.publish.askingPublic")}</p>
      ) : isPublic ? (
        <p>{t("studio.publish.public")}</p>
      ) : (
        <>
          <p class="warning">{t("studio.publish.private")}</p>
          <button type="button" aria-disabled={makePublic.pending} onClick={() => !makePublic.pending && makePublic.run(url)}>
            {t("studio.publish.makePublic")}
          </button>
        </>
      )}
      <p role="status">{makePublic.pending && t("studio.publish.makingPublic")}</p>
      <ErrorMessage error={makePublic.error} />
      <p class="hint">{t("studio.publish.nextHint")}</p>
      <ReadOnlyNotice reason={hold} subject="catalogue" healthHref={healthHref} />
      <button type="button" disabled={hold !== null} aria-disabled={startNext.pending} onClick={() => !startNext.pending && startNext.run(url)}>
        {t("studio.releases.startNext")}
      </button>
      <p role="status">{startNext.pending && t("studio.releases.starting")}</p>
      <ErrorMessage error={startNext.error} />
    </>
  );
}
