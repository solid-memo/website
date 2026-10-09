import { isGuestUrl } from "@solid-memo/domain/guest";
import type { Instance } from "@solid-memo/domain/instance";
import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";
import { routeToHash, statisticsHref, studioHref } from "./router";

/**
 * Persistent bar showing which instance the user is working in, with the
 * pages that belong to the whole instance. They are links, like every
 * other way to another page, so they can be opened in a new tab and are
 * listed with the page's links.
 */
export function InstanceBar({ instance }: { instance: Instance }) {
  const { t } = useI18n();
  return (
    <nav class="instance-bar" aria-label={t("instanceBar.label")}>
      <div class="instance-bar-identity">
        <strong>{instance.name}</strong>
        {isGuestUrl(instance.url) ? (
          <span class="hint">{t("instanceBar.inBrowser")}</span>
        ) : (
          <ExternalLink url={instance.url} class="hint">
            {t("instanceBar.openInPod")}
          </ExternalLink>
        )}
      </div>
      <a class="button" href={statisticsHref(instance.url)}>
        {t("instanceBar.statistics")}
      </a>
      <a class="button" href={routeToHash({ screen: "preferences", instanceUrl: instance.url })}>
        {t("instanceBar.preferences")}
      </a>
      <a class="button" href={studioHref(instance.url)}>
        {t("studio.open")}
      </a>
      <a class="button" href={routeToHash({ screen: "instancePicker" })}>
        {t("instanceBar.switch")}
      </a>
    </nav>
  );
}
