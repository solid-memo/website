// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { Component, type ComponentChildren } from "preact";
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { type ErrorPlace, errorDetails, errorReportUrl } from "@solid-memo/domain/errorReport";
import { useDocumentTitle } from "./documentTitle";
import { ExternalLink } from "./ExternalLink";
import type { SiteSource } from "./Footer";
import { useI18n } from "./i18n";

/** Where the start is: Solid Memo's deck list, from anywhere on the site. */
const START = "#/";

/**
 * Its children, until one of them throws while it renders (or in an
 * effect); then `fallback`, given what was thrown and a way to render
 * the children afresh. A route followed meanwhile (a hashchange) renders
 * them afresh too, so a link that still works leads out of the failed
 * screen. What it catches stays in the browser: it is logged to the
 * console, and sent nowhere.
 */
export class ErrorBoundary extends Component<
  {
    fallback: (error: unknown, reset: () => void) => ComponentChildren;
    children: ComponentChildren;
  },
  { failed: boolean; error: unknown }
> {
  state = { failed: false, error: undefined as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
  }

  componentDidMount() {
    window.addEventListener("hashchange", this.reset);
  }

  componentWillUnmount() {
    window.removeEventListener("hashchange", this.reset);
  }

  reset = () => {
    if (this.state.failed) this.setState({ failed: false, error: undefined });
  };

  render() {
    return this.state.failed
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children;
  }
}

/** Where an error came up, as errorDetails reads it: the build, the route shown, the site's folder. */
export function errorPlace(source: SiteSource): ErrorPlace {
  return {
    version: source.version,
    commitSha: source.commitSha,
    hash: window.location.hash,
    site: new URL(".", document.baseURI).href,
  };
}

/**
 * "Something went wrong": the screen in place of one that failed
 * (ErrorBoundary), its heading focused so a screen reader says it. Try
 * again renders the screen afresh; Go to the start goes to `#/`, which
 * renders afresh as well, already there or not. Then the way to report
 * it (ErrorReport). `heading` is the heading's level: a page's own when
 * nothing else is left of it, else under the masthead's.
 */
export function SomethingWentWrong({
  error,
  source,
  onTryAgain,
  heading: Heading = "h2",
}: {
  error: unknown;
  source: SiteSource;
  onTryAgain: () => void;
  heading?: "h1" | "h2";
}) {
  const { t } = useI18n();
  useDocumentTitle([t("crash.title")]);
  const ref = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  useEffect(() => ref.current!.focus(), []);
  return (
    <section class="crash" aria-labelledby={titleId}>
      <Heading id={titleId} ref={ref} tabIndex={-1}>
        {t("crash.title")}
      </Heading>
      <p>{t("crash.explain")}</p>
      <div class="edit-actions">
        <button type="button" onClick={onTryAgain}>
          {t("crash.tryAgain")}
        </button>
        <button
          type="button"
          onClick={() => {
            // Already at the start, no hashchange renders it afresh.
            if (window.location.hash === START) onTryAgain();
            else window.location.hash = START;
          }}
        >
          {t("crash.start")}
        </button>
      </div>
      <ErrorReport error={error} source={source} />
    </section>
  );
}

/**
 * How a learner hands an error on, if they like: Copy details, Report it
 * (the bug form, filled in with the same details), and the details
 * themselves folded away, to read or copy by hand. The details are taken
 * as the error came up, every address taken out of them
 * (domain/errorReport.ts). Nothing leaves the browser on its own.
 */
export function ErrorReport({ error, source }: { error: unknown; source: SiteSource }) {
  const { t, partLang } = useI18n();
  const [{ place, details }] = useState(() => {
    const place = errorPlace(source);
    return { place, details: errorDetails(error, place) };
  });
  const [copied, setCopied] = useState<boolean | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <p class="crash-report">
        <button type="button" onClick={() => void copy()}>
          {t("crash.copy")}
        </button>
        <ExternalLink url={errorReportUrl(source.repoUrl, place, details)}>
          {t("crash.report")}
        </ExternalLink>
      </p>
      <p role="status" class="hint">
        {copied !== null && t(copied ? "crash.copied" : "crash.copyFailed")}
      </p>
      <p class="hint">{t("crash.private")}</p>
      <details class="error-detail">
        <summary>{t("common.technicalDetails")}</summary>
        <code lang={partLang("en")} translate={false}>
          {details}
        </code>
      </details>
    </>
  );
}
