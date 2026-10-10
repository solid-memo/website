import type { PublishedRelease } from "@solid-memo/application/releasePublishing";
import type { Instance } from "@solid-memo/domain/instance";
import { releasePlaceOf } from "@solid-memo/domain/release/releasePlace";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { CopyLink } from "./CopyLink";
import { ReadOnlyNotice } from "./ReadOnly";

/**
 * The releases an instance published (docs/studio.md, Releases), as its
 * catalogue links them: each by its address, with a link to copy,
 * whether anyone can read it (and, if not, a way to try again), and its
 * next version to start as a draft. A release is never changed here.
 * Starting a next version writes the catalogue, so it is held while the
 * catalogue may not be written (`hold`).
 */
export function ReleasesScreen({
  instance,
  releases,
  hold,
  healthHref,
  draftsHref,
  makingPublic,
  publicError,
  onMakePublic,
  starting,
  startError,
  onStartNext,
}: {
  instance: Instance;
  releases: readonly PublishedRelease[];
  hold: ReadOnlyReason | null;
  healthHref: string;
  draftsHref: string;
  /** The release being made public; null when none is. */
  makingPublic: string | null;
  publicError: ErrorText | null;
  onMakePublic: (url: string) => void;
  /** The release whose next version is being started; null when none is. */
  starting: string | null;
  startError: ErrorText | null;
  onStartNext: (url: string) => void;
}) {
  const { t } = useI18n();
  /** A release as its address names it ("capitals, version 2"), or its address. */
  const nameOf = (url: string) => {
    const place = releasePlaceOf(url);
    return place === null ? url : t("studio.releases.name", { name: place.name, version: place.version });
  };
  return (
    <section>
      <header>
        <h2>{t("studio.releases.heading", { instance: instance.name })}</h2>
      </header>
      <p class="hint">{t("studio.releases.intro")}</p>
      <ReadOnlyNotice reason={hold} subject="catalogue" healthHref={healthHref} />
      {releases.length === 0 ? (
        <p>{t("studio.releases.none")}</p>
      ) : (
        <div class="studio-table">
          <table class="studio-list">
            <caption>{t("studio.releases.caption", { instance: instance.name })}</caption>
            <thead>
              <tr>
                <th scope="col">{t("studio.releases.column.release")}</th>
                <th scope="col">{t("studio.releases.column.readers")}</th>
                <th scope="col">
                  <span class="visually-hidden">{t("studio.releases.column.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <tr key={release.url}>
                  <th scope="row">
                    <a href={release.url}>{nameOf(release.url)}</a>
                    <br />
                    <code>{release.url}</code>
                  </th>
                  <td>
                    {t(release.public ? "studio.releases.public" : "studio.releases.private")}
                    {!release.public && (
                      <>
                        {" "}
                        <button
                          type="button"
                          aria-label={t("studio.releases.makePublicOf", { release: nameOf(release.url) })}
                          disabled={makingPublic !== null}
                          onClick={() => onMakePublic(release.url)}
                        >
                          {t("studio.publish.makePublic")}
                        </button>
                      </>
                    )}
                  </td>
                  <td>
                    <CopyLink url={release.url} label={t("studio.releases.copyLink", { url: release.url })} />{" "}
                    <button
                      type="button"
                      aria-label={t("studio.releases.startNextOf", { release: nameOf(release.url) })}
                      disabled={hold !== null || starting !== null}
                      onClick={() => onStartNext(release.url)}
                    >
                      {t("studio.releases.startNext")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p role="status">
        {makingPublic !== null
          ? t("studio.publish.makingPublic")
          : starting !== null && t("studio.releases.starting")}
      </p>
      <ErrorMessage error={publicError ?? startError} />
      <p>
        <a href={draftsHref}>{t("studio.releases.drafts")}</a>
      </p>
    </section>
  );
}
