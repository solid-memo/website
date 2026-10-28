// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useState } from "preact/hooks";
import type { PublishedRelease } from "@solid-memo/application/releasePublishing";
import type { Instance } from "@solid-memo/domain/instance";
import { folded } from "@solid-memo/domain/langText";
import type { ReleaseDraftSummary } from "@solid-memo/domain/release/draftLayout";
import { releasePlaceOf } from "@solid-memo/domain/release/releasePlace";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { CopyLink } from "./CopyLink";
import { ReadOnlyNotice } from "./ReadOnly";
import { useConfirm } from "./shell/ConfirmDialog";
import { DataTable } from "./shell/DataTable";
import { nextSort, sortedRows, type TableSort } from "./shell/tableModel";

/** A column of the releases, to sort them by. */
type ReleaseColumn = "release" | "readers" | "draft";

/**
 * The releases an instance published (docs/studio.md, Releases), as its
 * catalog links them: each by its address, with a link to copy,
 * whether anyone can read it (and, if not, a way to try again, once the
 * user confirms it), the draft it was published from, while the
 * instance has it (`draftOf`),
 * and its next version to start as a draft. A release is never changed here.
 * The table is a DataTable: a column's header sorts it by the column,
 * then the other way, then as the catalog lists them, Enter opens the
 * release at the cursor, as its name's link does, and a filter keeps
 * the releases whose name or address holds its text, case and accents
 * aside.
 * Starting a next version writes the catalog, so it is held while the
 * catalog may not be written (`hold`).
 */
export function ReleasesScreen({
  instance,
  releases,
  hold,
  healthHref,
  draftsHref,
  draftOf,
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
  /** The draft a release was published from, with where it opens; null for none the instance has. */
  draftOf: (url: string) => { draft: ReleaseDraftSummary; href: string } | null;
  /** The release being made public; null when none is. */
  makingPublic: string | null;
  publicError: ErrorText | null;
  onMakePublic: (url: string) => void;
  /** The release whose next version is being started; null when none is. */
  starting: string | null;
  startError: ErrorText | null;
  onStartNext: (url: string) => void;
}) {
  const { t, locale, readerText } = useI18n();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<TableSort<ReleaseColumn>>();
  const { ask, dialog } = useConfirm();
  /** A release as its address names it ("capitals, version 2"), or its address. */
  const nameOf = (url: string) => {
    const place = releasePlaceOf(url);
    return place === null
      ? url
      : t("studio.releases.name", { name: place.name, version: place.version });
  };
  /** A draft as its link names it: its title, else its name, and its version. */
  const draftName = (draft: ReleaseDraftSummary) =>
    t("studio.releases.name", {
      name: Object.keys(draft.title).length === 0 ? draft.name : readerText(draft.title),
      version: draft.version,
    });
  const wanted = folded(filter.trim());
  const shown = sortedRows(
    releases.filter((release) =>
      [nameOf(release.url), release.url].some((text) => folded(text).includes(wanted)),
    ),
    sort,
    (release, column) => {
      switch (column) {
        case "release":
          return nameOf(release.url);
        case "readers":
          return t(release.public ? "studio.releases.public" : "studio.releases.private");
        case "draft": {
          const source = draftOf(release.url);
          return source === null ? undefined : draftName(source.draft);
        }
      }
    },
    locale,
  );
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
        <>
          <label class="studio-filter">
            {t("studio.releases.filter")}
            <input
              type="search"
              aria-keyshortcuts="/"
              value={filter}
              onInput={(event) => setFilter(event.currentTarget.value)}
            />
          </label>
          {shown.length === 0 ? (
            <p>{t("studio.releases.noMatch", { filter: filter.trim() })}</p>
          ) : (
            <DataTable
              caption={t("studio.releases.caption", { instance: instance.name })}
              rows={shown}
              keyOf={(release) => release.url}
              name={{
                key: "release",
                label: t("studio.releases.column.release"),
                cell: (release) => (
                  <>
                    <a href={release.url}>{nameOf(release.url)}</a>
                    <br />
                    <code>{release.url}</code>
                  </>
                ),
              }}
              columns={[
                {
                  key: "readers",
                  label: t("studio.releases.column.readers"),
                  cell: (release) => (
                    <>
                      {t(release.public ? "studio.releases.public" : "studio.releases.private")}
                      {!release.public && (
                        <>
                          {" "}
                          <button
                            type="button"
                            aria-label={t("studio.releases.makePublicOf", {
                              release: nameOf(release.url),
                            })}
                            disabled={makingPublic !== null}
                            onClick={() =>
                              ask({
                                heading: t("studio.confirm.makePublic"),
                                text: t("studio.publish.makePublicConfirm", {
                                  release: nameOf(release.url),
                                }),
                                action: t("studio.publish.makePublic"),
                                onConfirm: () => onMakePublic(release.url),
                              })
                            }
                          >
                            {t("studio.publish.makePublic")}
                          </button>
                        </>
                      )}
                    </>
                  ),
                },
                {
                  key: "draft",
                  label: t("studio.releases.column.draft"),
                  cell: (release) => {
                    const source = draftOf(release.url);
                    return source === null ? (
                      <span class="hint">{t("studio.releases.noDraft")}</span>
                    ) : (
                      <a href={source.href}>{draftName(source.draft)}</a>
                    );
                  },
                },
                {
                  key: "actions",
                  label: <span class="visually-hidden">{t("studio.releases.column.actions")}</span>,
                  unsorted: true,
                  cell: (release) => (
                    <>
                      <CopyLink
                        url={release.url}
                        label={t("studio.releases.copyLink", { url: release.url })}
                      />{" "}
                      <button
                        type="button"
                        aria-label={t("studio.releases.startNextOf", {
                          release: nameOf(release.url),
                        })}
                        disabled={hold !== null || starting !== null}
                        onClick={() => onStartNext(release.url)}
                      >
                        {t("studio.releases.startNext")}
                      </button>
                    </>
                  ),
                },
              ]}
              sort={sort}
              onSort={(key) => setSort(nextSort(sort, key as ReleaseColumn))}
              onOpen={(release) => window.location.assign(release.url)}
            />
          )}
        </>
      )}
      <p role="status">
        {makingPublic !== null
          ? t("studio.publish.makingPublic")
          : starting !== null && t("studio.releases.starting")}
      </p>
      <ErrorMessage error={publicError ?? startError} />
      {dialog}
      <p>
        <a href={draftsHref}>{t("studio.releases.drafts")}</a>
      </p>
    </section>
  );
}
