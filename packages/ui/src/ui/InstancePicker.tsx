// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { MAX_CATALOG_LINKS } from "@solid-memo/domain/deck";
import { isGuestUrl } from "@solid-memo/domain/guest";
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type {
  Instance,
  RegistrationOptions,
  RegistrationTarget,
} from "@solid-memo/domain/instance";
import { type LossQuestion, useAskFirst } from "./askFirst";
import { ErrorMessage } from "./ErrorMessage";
import { RegistrationTargetChooser } from "./RegistrationTargetChooser";
import { ExternalLink } from "./ExternalLink";
import { KeptFolderNotice } from "./KeptFolderNotice";
import { useI18n, type ErrorText } from "./i18n";

/**
 * The user's instances, to open, remove or add to. One can be removed
 * from the list (`removable`), which leaves its data as it is and sends
 * nothing to its server; only one in the user's own storages
 * (`deletable`) can have its data deleted, and a row outside them says
 * so (`outsidePod`). Either takes its row, and the button pressed, off
 * the page: the focus goes to the instance now in that row (the last
 * one, if it was last), or to New instance when none is left, and a
 * status line says it is gone, unless an error says something failed;
 * when its folder was kept, holding another app's files, a notice says
 * so. Meanwhile, the button keeps the focus (aria-disabled).
 */
export function InstancePicker({
  instances,
  purpose,
  options,
  removable,
  deletable,
  outsidePod,
  busy,
  error,
  onSelect,
  newInstanceHref,
  onAttach,
  onDelete,
  onDetach,
  keptFolder = null,
  keptReleases = false,
  keptDocuments = 0,
}: {
  instances: Instance[];
  /** What the instance is picked for, said under the heading; none when it is to open it. */
  purpose?: ComponentChildren;
  options: RegistrationOptions | null;
  /** Whether the instance may be taken off the list: all but a guest's own. */
  removable: (instance: Instance) => boolean;
  /** Whether the instance's data may be deleted: it is in the user's own storages. */
  deletable: (instance: Instance) => boolean;
  /** Whether the instance is known to be outside the user's storages, which is why it has no delete. */
  outsidePod: (instance: Instance) => boolean;
  busy: boolean;
  error: ErrorText | null;
  onSelect: (instance: Instance) => void;
  /** URL of the storage picker, where a new instance starts. */
  newInstanceHref: string;
  onAttach: (url: string, target: RegistrationTarget) => void;
  onDelete: (instance: Instance) => void;
  /** Take the instance off the list, leaving its data. */
  onDetach: (instance: Instance) => void;
  /** The folder the last deletion kept, as it holds another app's files or the instance's releases; null when none. */
  keptFolder?: string | null;
  /** Whether the kept folder holds the releases published from the instance, which are why it is kept, or part of why. */
  keptReleases?: boolean;
  /** How many documents the last deletion kept, as they also hold another app's data. */
  keptDocuments?: number;
}) {
  const { t } = useI18n();
  const askFirst = useAskFirst();
  const [attachUrl, setAttachUrl] = useState("");
  const [target, setTarget] = useState<RegistrationTarget>("private");
  const listRef = useRef<HTMLUListElement>(null);
  const newInstanceRef = useRef<HTMLAnchorElement>(null);
  /** The instance being taken off the list, its row and what to say then, until it is gone. */
  const leaving = useRef<{ instance: Instance; row: number; gone: string } | null>(null);
  const [gone, setGone] = useState("");

  useLayoutEffect(() => {
    const pending = leaving.current;
    if (
      pending === null ||
      busy ||
      instances.some((instance) => instance.url === pending.instance.url)
    )
      return;
    leaving.current = null;
    const rows = listRef.current?.children ?? [];
    const row = rows[Math.min(pending.row, rows.length - 1)];
    (row?.querySelector("button") ?? newInstanceRef.current!).focus();
    // Off the list, but it failed: the error says so, and the next read may bring it back.
    if (error === null) setGone(pending.gone);
  });

  function handleAttach(event: Event) {
    event.preventDefault();
    if (busy) return;
    onAttach(attachUrl.trim(), target);
  }

  /** Once the user confirms the question, `act` on the instance, whose row then goes, saying `saying`. */
  function askThen(
    instance: Instance,
    question: Omit<LossQuestion, "onConfirm">,
    saying: string,
    act: (instance: Instance) => void,
  ) {
    if (busy) return;
    askFirst({
      ...question,
      onConfirm: () => {
        leaving.current = { instance, row: instances.indexOf(instance), gone: saying };
        setGone("");
        act(instance);
      },
    });
  }

  function handleDelete(instance: Instance) {
    const { name } = instance;
    askThen(
      instance,
      {
        heading: t("instancePicker.deleteHeading"),
        text: t("instancePicker.deleteConfirm", { name }),
        action: t("instancePicker.deleteAction"),
      },
      t("instancePicker.deleted", { name }),
      onDelete,
    );
  }

  function handleDetach(instance: Instance) {
    const { name } = instance;
    askThen(
      instance,
      {
        heading: t("instancePicker.removeHeading"),
        text: t("instancePicker.removeConfirm", { name }),
        action: t("instancePicker.removeAction"),
      },
      t("instancePicker.removed", { name }),
      onDetach,
    );
  }

  return (
    <section>
      <h2>{t("instancePicker.heading")}</h2>
      {purpose !== undefined && <p>{purpose}</p>}
      <p class="hint">{t("instancePicker.intro")}</p>
      {instances.length === 0 ? (
        <p>{t("instancePicker.empty")}</p>
      ) : (
        <ul ref={listRef} class="instance-list">
          {instances.map((instance) => (
            <li key={instance.url}>
              <button onClick={() => onSelect(instance)} disabled={busy}>
                {instance.name}
              </button>{" "}
              {isGuestUrl(instance.url) ? (
                <span class="hint">{t("instanceBar.inBrowser")}</span>
              ) : (
                <ExternalLink url={instance.url} class="hint">
                  {t("instanceBar.openInPod")}
                </ExternalLink>
              )}{" "}
              {removable(instance) && (
                <button
                  onClick={() => handleDetach(instance)}
                  aria-disabled={busy}
                  aria-label={t("instancePicker.removeLabel", { name: instance.name })}
                >
                  {t("instancePicker.remove")}
                </button>
              )}
              {deletable(instance) && (
                <button
                  class="danger"
                  onClick={() => handleDelete(instance)}
                  aria-disabled={busy}
                  aria-label={t("instancePicker.deleteLabel", { name: instance.name })}
                >
                  {t("instancePicker.delete")}
                </button>
              )}
              {outsidePod(instance) && <span class="hint">{t("instancePicker.outsidePod")}</span>}
            </li>
          ))}
        </ul>
      )}
      {instances.length >= MAX_CATALOG_LINKS && (
        <p class="hint">{t("instancePicker.listFull", { limit: MAX_CATALOG_LINKS })}</p>
      )}
      <a ref={newInstanceRef} class="button" href={newInstanceHref}>
        {t("instancePicker.newInstance")}
      </a>
      <details>
        <summary>{t("instancePicker.attachSummary")}</summary>
        <form onSubmit={handleAttach}>
          <label for="attach-url">{t("instancePicker.attachUrl")}</label>
          <input
            id="attach-url"
            type="url"
            placeholder="https://your-pod/solid-memo/my-instance/"
            value={attachUrl}
            onInput={(e) => setAttachUrl(e.currentTarget.value)}
            required
            disabled={busy}
          />
          <RegistrationTargetChooser options={options} value={target} onChange={setTarget} />
          <button type="submit" aria-disabled={busy}>
            {t("instancePicker.attach")}
          </button>
        </form>
      </details>
      <p class="visually-hidden" role="status">
        {gone}
      </p>
      <KeptFolderNotice url={keptFolder} releases={keptReleases} documents={keptDocuments} />
      <ErrorMessage error={error} />
    </section>
  );
}
