// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { isHttpUrl, isLinkableUrl } from "@solid-memo/domain/webId";
import { namesItsHost } from "@solid-memo/markdown/links";
import { visibleControls } from "@solid-memo/markdown/parse";
import { ExternalIcon } from "./icons";
import { useI18n } from "./i18n";

/**
 * A URL shown to the user is always clickable — provided it is safe to
 * follow. URLs mostly come from pod data, so anything but http(s)/mailto
 * renders as plain text instead of a link, as does one with a user name or
 * password before its host, which would hide the host it leads to. With
 * no text of its own, it reads its address with the hidden characters
 * shown as markers (visibleControls); a web address that does not name
 * the host it opens as the URL parser reads it (namesItsHost), such as one
 * with a look-alike slash or an international host, reads as the parser
 * has it instead, punycode kept, so the text names the host the link
 * opens. A web link opens in a new tab, as it points outside the app,
 * and says so, seen and heard, so nobody is left wondering why Back does
 * nothing; a mailto: link opens the mail app and no tab at all.
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
  /** The link's own direction, isolating it from the text around it: left to right, or that of its first letter ("auto"). */
  dir?: "ltr" | "auto";
  /** Link text; defaults to the URL itself, its hidden characters shown, or as the parser has it when that names another host (shownAddress). */
  children?: ComponentChildren;
}) {
  const { t } = useI18n();
  if (!isLinkableUrl(url)) {
    return (
      <span class={className} dir={dir}>
        {children ?? visibleControls(url)}
      </span>
    );
  }
  if (!isHttpUrl(url)) {
    return (
      <a class={className} href={url} title={title} dir={dir}>
        {children ?? visibleControls(url)}
      </a>
    );
  }
  return (
    <a
      class={className}
      href={url}
      title={title}
      dir={dir}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children ?? shownAddress(url)}
      <ExternalIcon />
      <span class="visually-hidden"> {t("common.opensInNewTab")}</span>
    </a>
  );
}

/**
 * A web address as its link reads it: as written, its hidden characters
 * shown, when it names the host it opens as the URL parser reads it;
 * otherwise as the parser has it (punycode kept), so its text cannot
 * name another host than the one it opens.
 */
function shownAddress(url: string): string {
  const parsed = new URL(url);
  return namesItsHost(url, parsed.host) ? visibleControls(url) : parsed.href;
}
