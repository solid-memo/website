// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { licenseLabel } from "@solid-memo/domain/license";
import { visibleControls } from "@solid-memo/markdown/parse";
import { ExternalLink } from "./ExternalLink";
import { WebLink } from "./Markdown";

/**
 * A link a release gives outside Markdown — a deck's source, a license —
 * reading `label`, or its address when it has none. Drawn as a Markdown
 * link is (WebLink): its hidden characters shown, isolated from the text
 * around it, and the host it leads to beside it unless the text is the
 * address and names that host itself. It is followed for `http:` too, as
 * sources carry it, but never with a `user@` before the host; otherwise
 * it is text.
 */
export function DataLink({ url, label }: { url: string; label?: string }) {
  const link = webLink(url);
  const shown = visibleControls(label ?? url);
  if (link === null) return <span dir="auto">{shown}</span>;
  return (
    <WebLink link={link} written={url} shown={shown}>
      {shown}
    </WebLink>
  );
}

/**
 * A license, linked: by its short name when it is one of the well-known
 * ones on their own site (licenseLabel), which needs no host beside it;
 * otherwise by its address (DataLink).
 */
export function LicenseLink({ url }: { url: string }) {
  const name = licenseLabel(url);
  if (name === url) return <DataLink url={url} />;
  return <ExternalLink url={url}>{name}</ExternalLink>;
}

function webLink(url: string): { href: string; host: string } | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username !== "" || parsed.password !== "")
    return null;
  return { href: parsed.href, host: parsed.host };
}
