import { useState } from "preact/hooks";
import type { Storage } from "@solid-memo/domain/storage";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n, type ErrorText } from "./i18n";

function sourceLabel(source: Storage["source"], t: I18n["t"]): string {
  switch (source) {
    case "profile":
      return t("storagePicker.source.profile");
    case "linkHeader":
      return t("storagePicker.source.linkHeader");
    case "manual":
      return t("storagePicker.source.manual");
  }
}

export function StoragePicker({
  storages,
  busy,
  error,
  onSelect,
  onAddManual,
}: {
  storages: Storage[];
  busy: boolean;
  error: ErrorText | null;
  onSelect: (storage: Storage) => void;
  onAddManual: (url: string) => void;
}) {
  const { t } = useI18n();
  const [manualUrl, setManualUrl] = useState("");

  function handleSubmit(event: Event) {
    event.preventDefault();
    onAddManual(manualUrl.trim());
  }

  return (
    <section>
      <h2>{t("storagePicker.heading")}</h2>
      <p class="hint">{t("storagePicker.intro")}</p>
      {storages.length === 0 ? (
        <p>{t("storagePicker.empty")}</p>
      ) : (
        <ul class="storage-list">
          {storages.map((storage) => (
            <li key={storage.url}>
              <button onClick={() => onSelect(storage)} disabled={busy}>
                {storage.url}
              </button>{" "}
              <span class="hint">({sourceLabel(storage.source, t)})</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={handleSubmit}>
        <label for="storage-url">{t("storagePicker.url")}</label>
        <input
          id="storage-url"
          type="url"
          placeholder="https://your-pod/"
          value={manualUrl}
          onInput={(e) => setManualUrl(e.currentTarget.value)}
          required
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          {t("storagePicker.use")}
        </button>
      </form>
      <ErrorMessage error={error} />
    </section>
  );
}
