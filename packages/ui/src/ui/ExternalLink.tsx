import type { ComponentChildren } from "preact";
import { isHttpUrl, isLinkableUrl } from "@solid-memo/domain/webId";
import { ExternalIcon } from "./icons";
import { useI18n } from "./i18n";

/**
 * A URL shown to the user is always clickable — provided it is safe to
 * follow. URLs mostly come from pod data, so anything but http(s)/mailto
 * renders as plain text instead of a link. A web link opens in a new tab,
 * as it points outside the app, and says so, seen and heard, so nobody is
 * left wondering why Back does nothing; a mailto: link opens the mail app
 * and no tab at all.
 */
export function ExternalLink({
  url,
  class: className,
  title,
  dir,
  children,
}: {
  url: string;
  class?: string;
  title?: string;
  /** The link's own direction, isolating it from the text around it. */
  dir?: "ltr";
  /** Link text; defaults to the URL itself. */
  children?: ComponentChildren;
}) {
  const { t } = useI18n();
  const text = children ?? url;
  if (!isLinkableUrl(url)) {
    return (
      <span class={className} dir={dir}>
        {text}
      </span>
    );
  }
  if (!isHttpUrl(url)) {
    return (
      <a class={className} href={url} title={title} dir={dir}>
        {text}
      </a>
    );
  }
  return (
    <a class={className} href={url} title={title} dir={dir} target="_blank" rel="noopener noreferrer">
      {text}
      <ExternalIcon />
      <span class="visually-hidden"> {t("common.opensInNewTab")}</span>
    </a>
  );
}
