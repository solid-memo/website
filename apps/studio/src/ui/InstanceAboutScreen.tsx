import { useState } from "preact/hooks";
import type { Catalog, CatalogAbout } from "@solid-memo/domain/catalog";
import type { Instance } from "@solid-memo/domain/instance";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { ExternalLink } from "@solid-memo/ui/ExternalLink";
import { useI18n, type ErrorText } from "@solid-memo/ui/i18n";
import { LicenseSelect } from "./LicenseSelect";

/**
 * An instance's name and its catalogue, each with its own form: the
 * name, kept in several places (UseCases.renameInstance); and the
 * catalogue's description and licence. The catalogue's publisher, the
 * pod's owner, is shown, never edited, as is where the instance is. An
 * instance without a catalogue (not updated yet) says so instead. Its
 * study preferences are set in Solid Memo (`preferencesHref`). The
 * catalogue form starts again from each new read of the catalogue, as
 * a rename can change its description.
 */
export function InstanceAboutScreen({
  instance,
  catalog,
  preferencesHref,
  busy,
  saved,
  error,
  onRename,
  onDescribe,
}: {
  instance: Instance;
  /** The catalogue as read; null when the instance has none. */
  catalog: Catalog | null;
  preferencesHref: string;
  busy: boolean;
  /** Whether the last save was made. */
  saved: boolean;
  error: ErrorText | null;
  onRename: (name: string) => void;
  onDescribe: (about: CatalogAbout) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(instance.name);

  return (
    <section>
      <header>
        <h2>{t("studio.instance.heading", { instance: instance.name })}</h2>
        <a href={preferencesHref}>{t("studio.instance.preferencesLink")}</a>
      </header>
      <dl class="facts">
        <dt>{t("studio.instance.address")}</dt>
        <dd>
          <ExternalLink url={instance.url} />
        </dd>
      </dl>
      <form
        class="card-edit"
        aria-labelledby="instance-name-heading"
        onSubmit={(event) => {
          event.preventDefault();
          onRename(name);
        }}
      >
        <h3 id="instance-name-heading">{t("studio.instance.name")}</h3>
        <label for="instance-name">{t("studio.instance.nameLabel")}</label>
        <input id="instance-name" value={name} required disabled={busy} aria-describedby="instance-name-hint" onInput={(event) => setName(event.currentTarget.value)} />
        <p id="instance-name-hint" class="hint">
          {t("studio.instance.nameHint")}
        </p>
        <button type="submit" disabled={busy}>
          {t("studio.instance.saveName")}
        </button>
      </form>
      <section aria-labelledby="instance-catalog-heading">
        <h3 id="instance-catalog-heading">{t("studio.instance.catalog")}</h3>
        {catalog === null ? (
          <p class="hint">{t("studio.instance.noCatalog")}</p>
        ) : (
          <>
            <dl class="facts">
              <dt>{t("studio.instance.publisher")}</dt>
              <dd>
                {catalog.publisher.name} (<ExternalLink url={catalog.publisher.webId} />)
              </dd>
            </dl>
            <CatalogForm key={`${catalog.description}\n${catalog.license ?? ""}`} catalog={catalog} busy={busy} onDescribe={onDescribe} />
          </>
        )}
      </section>
      <p class="hint" role="status">
        {saved ? t("studio.about.saved") : ""}
      </p>
      <ErrorMessage error={error} />
    </section>
  );
}

/** The catalogue's description and licence, from `catalog` as read. */
function CatalogForm({ catalog, busy, onDescribe }: { catalog: Catalog; busy: boolean; onDescribe: (about: CatalogAbout) => void }) {
  const { t } = useI18n();
  const [about, setAbout] = useState({ description: catalog.description, license: catalog.license ?? "" });

  return (
    <form
      class="card-edit"
      onSubmit={(event) => {
        event.preventDefault();
        onDescribe({ description: about.description, ...(about.license === "" ? {} : { license: about.license }) });
      }}
    >
      <label for="catalog-description">{t("studio.instance.description")}</label>
      <textarea
        id="catalog-description"
        value={about.description}
        required
        disabled={busy}
        onInput={(event) => setAbout({ ...about, description: event.currentTarget.value })}
      />
      <LicenseSelect id="catalog-license" value={about.license} current={catalog.license} disabled={busy} onChange={(license) => setAbout({ ...about, license })} />
      <p class="hint">{t("studio.instance.licenseHint")}</p>
      <button type="submit" disabled={busy}>
        {t("studio.instance.saveCatalog")}
      </button>
    </form>
  );
}
