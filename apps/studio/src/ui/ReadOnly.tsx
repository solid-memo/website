import type { ComponentChildren } from "preact";
import type { ReadOnlyReason } from "@solid-memo/ui/dataCheck";
import { useI18n } from "@solid-memo/ui/i18n";

/** What a screen cannot change: a deck, the decks it lists, or the instance's catalogue. */
export type ReadOnlySubject = "deck" | "decks" | "catalogue";

/**
 * Why a screen changes nothing (useDataCheck): the instance's data is
 * being checked, or it is invalid, the whole instance blocked or the
 * deck (or decks, or catalogue) set aside, with a link to the health
 * screen that repairs it (`healthHref`). Nothing when it may change.
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
  // Blocked, it is the instance that is repaired, whatever the subject.
  const repair = <a href={healthHref}>{t(subject === "decks" && reason !== "blocked" ? "studio.readOnly.repairDecks" : "studio.readOnly.repair")}</a>;
  return <p class="warning">{tx(reason === "blocked" ? "studio.readOnly.blocked" : `studio.readOnly.${subject}`, { repair })}</p>;
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
