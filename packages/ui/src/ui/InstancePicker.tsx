import { isGuestUrl } from "@solid-memo/domain/guest";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type {
  Instance,
  RegistrationOptions,
  RegistrationTarget,
} from "@solid-memo/domain/instance";
import { ErrorMessage } from "./ErrorMessage";
import { RegistrationTargetChooser } from "./RegistrationTargetChooser";
import { ExternalLink } from "./ExternalLink";
import { KeptFolderNotice } from "./KeptFolderNotice";
import { useI18n, type ErrorText } from "./i18n";

/**
 * The user's instances, to open, delete or add to. Deleting one takes
 * its row, and the button pressed, off the page: the focus goes to the
 * instance now in that row (the last one, if it was last), or to New
 * instance when none is left, and a status line says it is gone; when
 * its folder was kept, holding another app's files, a notice says so.
 * While it is deleted, the button keeps the focus (aria-disabled).
 */
export function InstancePicker({
  instances,
  options,
  busy,
  error,
  onSelect,
  newInstanceHref,
  onAttach,
  onDelete,
  keptFolder = null,
}: {
  instances: Instance[];
  options: RegistrationOptions | null;
  busy: boolean;
  error: ErrorText | null;
  onSelect: (instance: Instance) => void;
  /** URL of the storage picker, where a new instance starts. */
  newInstanceHref: string;
  onAttach: (url: string, target: RegistrationTarget) => void;
  onDelete: (instance: Instance) => void;
  /** The folder the last deletion kept, as it holds another app's files; null when none. */
  keptFolder?: string | null;
}) {
  const { t } = useI18n();
  const [attachUrl, setAttachUrl] = useState("");
  const [target, setTarget] = useState<RegistrationTarget>("private");
  const listRef = useRef<HTMLUListElement>(null);
  const newInstanceRef = useRef<HTMLAnchorElement>(null);
  /** The instance being deleted and its row, until it is gone. */
  const deleting = useRef<{ instance: Instance; row: number } | null>(null);
  const [deleted, setDeleted] = useState("");

  useLayoutEffect(() => {
    const pending = deleting.current;
    if (pending === null || busy || instances.some((instance) => instance.url === pending.instance.url)) return;
    deleting.current = null;
    const rows = listRef.current?.children ?? [];
    const row = rows[Math.min(pending.row, rows.length - 1)];
    (row?.querySelector("button") ?? newInstanceRef.current!).focus();
    setDeleted(t("instancePicker.deleted", { name: pending.instance.name }));
  });

  function handleAttach(event: Event) {
    event.preventDefault();
    if (busy) return;
    onAttach(attachUrl.trim(), target);
  }

  function handleDelete(instance: Instance) {
    if (busy) return;
    if (
      window.confirm(t("instancePicker.deleteConfirm", { name: instance.name }))
    ) {
      deleting.current = { instance, row: instances.indexOf(instance) };
      setDeleted("");
      onDelete(instance);
    }
  }

  return (
    <section>
      <h2>{t("instancePicker.heading")}</h2>
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
              <button
                class="danger"
                onClick={() => handleDelete(instance)}
                aria-disabled={busy}
                aria-label={t("instancePicker.deleteLabel", { name: instance.name })}
              >
                {t("instancePicker.delete")}
              </button>
            </li>
          ))}
        </ul>
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
          <RegistrationTargetChooser
            options={options}
            value={target}
            onChange={setTarget}
          />
          <button type="submit" aria-disabled={busy}>
            {t("instancePicker.attach")}
          </button>
        </form>
      </details>
      <p class="visually-hidden" role="status">
        {deleted}
      </p>
      <KeptFolderNotice url={keptFolder} />
      <ErrorMessage error={error} />
    </section>
  );
}
