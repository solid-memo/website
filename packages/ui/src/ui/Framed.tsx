// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { Locale } from "@solid-memo/domain/locale";
import { useDocumentTitle } from "./documentTitle";
import { I18nProvider, useI18n } from "./i18n";
import { MAIN_ID } from "./SkipLink";

/**
 * Whether the page is shown inside a frame (an iframe, an object) of
 * another page. Nothing of Solid Memo's frames the site, and GitHub
 * Pages can't send the header that would forbid it (docs/deployment.md),
 * so a framed page could have its buttons laid under another site's and
 * clicked unseen; any frame counts, whatever its page's origin.
 */
export function isFramed(win: Window): boolean {
  return win.top !== win.self;
}

/**
 * What the site shows in place of the app when it is framed (isFramed,
 * from apps/web/src/App.tsx): that it opens only on its own, and a link
 * that opens the same address in a tab of its own (`href`). Nothing in it
 * changes anything, so a click laid over it does nothing either.
 */
export function FramedPage({
  locale,
  appName,
  href,
}: {
  /** The language the learner reads: the one chosen on this device, else the browser's. */
  locale: Locale;
  /** The site's own name, as the app is given it. */
  appName?: string;
  href: string;
}) {
  return (
    <I18nProvider locale={locale} appName={appName}>
      <main id={MAIN_ID} tabIndex={-1}>
        <Framed href={href} />
      </main>
    </I18nProvider>
  );
}

function Framed({ href }: { href: string }) {
  const { t } = useI18n();
  useDocumentTitle([t("framed.title")]);
  return (
    <section>
      <h1>{t("framed.title")}</h1>
      <p>{t("framed.explain")}</p>
      <p>
        <a href={href} target="_blank" rel="noopener noreferrer">
          {t("framed.open")}
        </a>
      </p>
    </section>
  );
}
