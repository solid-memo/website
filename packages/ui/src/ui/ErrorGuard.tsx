// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Locale } from "@solid-memo/domain/locale";
import { ErrorBoundary, ErrorReport, SomethingWentWrong } from "./ErrorBoundary";
import type { SiteSource } from "./Footer";
import { I18nProvider, useI18n } from "./i18n";
import { MAIN_ID } from "./SkipLink";

/**
 * What the whole page is guarded by, around the site's app (from
 * apps/web/src/main.tsx): an ErrorBoundary whose "Something went wrong"
 * takes the whole page when what failed was outside a workspace's own
 * boundary (AppShell's), and a notice for an error nothing caught
 * (UncaughtErrorNotice). Both speak the language the learner reads when
 * the error comes up (`locale`), outside the app's own choice of it.
 */
export function ErrorGuard({
  source,
  appName,
  locale,
  children,
}: {
  source: SiteSource;
  /** The site's own name, as the app is given it. */
  appName?: string;
  /** The language the learner reads now: the one chosen on this device, else the browser's. */
  locale: () => Locale;
  children: ComponentChildren;
}) {
  return (
    <>
      <ErrorBoundary
        fallback={(error, reset) => (
          <I18nProvider locale={locale()} appName={appName}>
            <main id={MAIN_ID} tabIndex={-1}>
              <SomethingWentWrong error={error} source={source} onTryAgain={reset} heading="h1" />
            </main>
          </I18nProvider>
        )}
      >
        {children}
      </ErrorBoundary>
      <UncaughtErrorNotice source={source} appName={appName} locale={locale} />
    </>
  );
}

/** An error nothing caught, numbered so that each one's details are its own. */
interface Uncaught {
  error: unknown;
  count: number;
}

/**
 * An error thrown outside a render (a click's handler, a promise no one
 * awaited), which the window hears of: the page around it still works,
 * so it is said in a notice the learner can close, with the way to
 * report it. An error event with no error is not the app's: a script
 * from elsewhere, or the browser's own notice of a ResizeObserver loop.
 * The browser still logs each to the console; nothing is sent anywhere.
 */
function UncaughtErrorNotice({
  source,
  appName,
  locale,
}: {
  source: SiteSource;
  appName?: string;
  locale: () => Locale;
}) {
  const [uncaught, setUncaught] = useState<Uncaught | null>(null);
  useEffect(() => {
    let count = 0;
    const show = (error: unknown) => setUncaught({ error, count: ++count });
    const onError = (event: ErrorEvent) => {
      if (event.error != null) show(event.error);
    };
    const onRejection = (event: PromiseRejectionEvent) => show(event.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  if (uncaught === null) return null;
  return (
    <I18nProvider locale={locale()} appName={appName}>
      <ErrorNotice
        key={uncaught.count}
        error={uncaught.error}
        source={source}
        onClose={() => setUncaught(null)}
      />
    </I18nProvider>
  );
}

function ErrorNotice({
  error,
  source,
  onClose,
}: {
  error: unknown;
  source: SiteSource;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <section class="warning crash-notice" aria-label={t("crash.noticeRegion")}>
      <p role="alert">{t("crash.notice")}</p>
      <ErrorReport error={error} source={source} />
      <button type="button" onClick={onClose}>
        {t("crash.close")}
      </button>
    </section>
  );
}
