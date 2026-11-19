// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { ComponentChildren } from "preact";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { useI18n } from "@solid-memo/ui/i18n";

/** What a screen cannot change: a deck, the decks it lists, or the instance's catalog. */
export type ReadOnlySubject = "deck" | "decks" | "catalogue";

/**
 * Why a screen changes nothing (useDataCheck): the instance's data is
 * being checked, or could not be checked, or it is invalid, the whole instance blocked or the
 * deck (or decks, or catalog) set aside until it is fixed outside the
 * app, with a link to the health screen that names what does not
 * conform (`healthHref`). Nothing when it may change.
 */
export function ReadOnlyNotice({
  reason,
  subject,
  healthHref,
}: {
  reason: ReadOnlyReason | null;
  subject: ReadOnlySubject;
  healthHref: string;
}) {
  const { t, tx } = useI18n();
  if (reason === null) return null;
  if (reason === "checking") return <p class="hint">{t("studio.readOnly.checking")}</p>;
  // Held until the check can be made; Solid Memo's "Warn only" lets the user go on regardless.
  if (reason === "unchecked") return <p class="warning">{t("studio.readOnly.unchecked")}</p>;
  const health = <a href={healthHref}>{t("studio.readOnly.health")}</a>;
  return (
    <p class="warning">
      {tx(reason === "blocked" ? "studio.readOnly.blocked" : `studio.readOnly.${subject}`, {
        health,
      })}
    </p>
  );
}

/**
 * A screen's part that changes things, held while it may not
 * (ReadOnlyNotice says why, above it): a fieldset disabled, so no
 * control in it can be used, whatever it is. Links still lead on. It
 * stays mounted either way, so what is typed in it is kept.
 */
export function ReadOnlyScope({
  reason,
  subject,
  healthHref,
  children,
}: {
  reason: ReadOnlyReason | null;
  subject: ReadOnlySubject;
  healthHref: string;
  children: ComponentChildren;
}) {
  return (
    <>
      <ReadOnlyNotice reason={reason} subject={subject} healthHref={healthHref} />
      <fieldset class="studio-scope" disabled={reason !== null}>
        {children}
      </fieldset>
    </>
  );
}
