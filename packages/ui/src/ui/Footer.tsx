// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { ExternalLink } from "./ExternalLink";
import { useI18n } from "./i18n";

/** Which code the site runs, and where it is: what the footer names and links to. */
export interface SiteSource {
  /**
   * The repository's web page, without a trailing slash. Its commits, its
   * changelog, its issue forms and its Discussions are found under it, at
   * the paths GitHub gives them.
   */
  repoUrl: string;
  /** The site's version (the root package.json's). */
  version: string;
  /** Full commit hash of the build; null when unknown. */
  commitSha: string | null;
}

/**
 * Site-wide attribution, the build's version, and the way to the page
 * that says what Solid Memo is, the docs, the source code, the
 * changelog, the issue tracker and Discussions, shown under every
 * screen. The About page and the docs are this site's own pages, at
 * `about/` and `docs/` (docs/deployment.md), so their links open in the
 * same tab. They are relative, and routing is by hash, so they lead to
 * the pages whether the site runs at a domain's root or in a subfolder.
 * The pages are in English only, which each link says with `hreflang`,
 * and every other language's label says in words.
 */
export function Footer({ source: { repoUrl, version, commitSha } }: { source: SiteSource }) {
  const { t, tx } = useI18n();
  return (
    <footer class="site-footer">
      <p>
        {tx("footer.createdBy", {
          author: <ExternalLink url="https://github.com/antwika">antwika</ExternalLink>,
        })}
      </p>
      <p>
        {commitSha === null
          ? t("footer.version", { version })
          : tx("footer.versionAtCommit", {
              version,
              commit: (
                <ExternalLink url={`${repoUrl}/commit/${commitSha}`} title={commitSha}>
                  {commitSha.slice(0, 7)}
                </ExternalLink>
              ),
            })}
      </p>
      <p class="footer-links">
        <a href="about/" hreflang="en">
          {t("footer.about")}
        </a>
        <a href="docs/" hreflang="en">
          {t("footer.docs")}
        </a>
        <ExternalLink url={repoUrl}>{t("footer.sourceCode")}</ExternalLink>
        <ExternalLink url={`${repoUrl}/blob/main/CHANGELOG.md`}>
          {t("footer.changelog")}
        </ExternalLink>
        <ExternalLink url={`${repoUrl}/issues/new/choose`}>{t("footer.reportIssue")}</ExternalLink>
        <ExternalLink url={`${repoUrl}/discussions`}>{t("footer.discussions")}</ExternalLink>
      </p>
    </footer>
  );
}
