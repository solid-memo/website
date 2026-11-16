// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import type { MigrationPlan } from "@solid-memo/domain/migration";
import { ErrorMessage } from "./ErrorMessage";
import { usePanelFocus } from "./panelFocus";
import { useI18n, type I18n, type ErrorText, type MessageKey } from "./i18n";
import { ReaderText } from "./ReaderText";

/** "a, b and c". */
function list(parts: string[], t: I18n["t"]): string {
  return parts.length <= 1
    ? parts.join("")
    : t("migrationNotice.listAnd", {
        rest: parts.slice(0, -1).join(", "),
        last: parts[parts.length - 1],
      });
}

/**
 * What each step of a format added, step by step from format 2: the
 * notice names only the steps after the oldest version it found, so a
 * document one version behind is not told about what it already has.
 */
const DECK_STEPS: readonly (readonly MessageKey[])[] = [
  ["migrationNotice.deckAdded.direction"],
  ["migrationNotice.deckAdded.dcat", "migrationNotice.deckAdded.description"],
  ["migrationNotice.deckAdded.titleLanguages"],
  ["migrationNotice.deckAdded.titleWithoutEnglish"],
  ["migrationNotice.deckAdded.keywordLanguages"],
];
const CARD_STEPS: readonly (readonly MessageKey[])[] = [
  ["migrationNotice.cardAdded.pictures"],
  ["migrationNotice.cardAdded.notes", "migrationNotice.cardAdded.retired"],
  ["migrationNotice.cardAdded.textLanguages"],
  ["migrationNotice.cardAdded.notesWithoutEnglish"],
  ["migrationNotice.cardAdded.frontLabel"],
  ["migrationNotice.cardAdded.subjects"],
];
const REVIEW_STATE_STEPS: readonly (readonly MessageKey[])[] = [
  ["migrationNotice.reviewStateAdded.wholeSnapshot"],
];
const PREFERENCES_STEPS: readonly (readonly MessageKey[])[] = [
  ["migrationNotice.preferencesAdded.everySetting"],
  ["migrationNotice.preferencesAdded.invalidData"],
  ["migrationNotice.preferencesAdded.theme"],
  ["migrationNotice.preferencesAdded.scheduler"],
  ["migrationNotice.preferencesAdded.colors", "migrationNotice.preferencesAdded.textSize"],
];

/** What the steps after format `from` added: "adds a label above a card's front and …". */
function addedSince(steps: readonly (readonly MessageKey[])[], from: number, t: I18n["t"]): string {
  // steps[0] is the step to format 2; data stating a version below 1 is read as format 1.
  return list(
    steps.slice(Math.max(from, 1) - 1).flatMap((keys) => keys.map((key) => t(key))),
    t,
  );
}

/** Deck format 3 gave every deck a description: a deck from before gets one. */
const DESCRIBED_DECK_FORMAT = 3;

/**
 * What the formats the plan touches added since the oldest version it
 * found of each, a sentence per format, without version numbers: "The
 * card format now adds a label above a card's front …". The instance
 * record's format added nothing to name, so it has none.
 */
export function describeFormats(plan: MigrationPlan, t: I18n["t"]): string[] {
  const { oldestFormat } = plan;
  const sentences: string[] = [];
  if (plan.catalogMissing) sentences.push(t("migrationNotice.catalogueFormat"));
  if (plan.preferencesOutdated) {
    sentences.push(
      t("migrationNotice.preferencesFormat", {
        added: addedSince(PREFERENCES_STEPS, oldestFormat.preferences, t),
      }),
    );
  }
  if (plan.deckCount > 0) {
    const deckFormat = t("migrationNotice.deckFormat", {
      added: addedSince(DECK_STEPS, oldestFormat.deck, t),
    });
    sentences.push(
      oldestFormat.deck < DESCRIBED_DECK_FORMAT
        ? `${deckFormat} ${t("migrationNotice.newDescriptions")}`
        : deckFormat,
    );
  }
  if (plan.cardCount > 0) {
    sentences.push(
      t("migrationNotice.cardFormat", { added: addedSince(CARD_STEPS, oldestFormat.card, t) }),
    );
  }
  if (plan.reviewCount > 0) {
    sentences.push(
      t("migrationNotice.reviewFormat", {
        added: addedSince(REVIEW_STATE_STEPS, oldestFormat.reviewState, t),
      }),
    );
  }
  return sentences;
}

/** The button label: "Update 3 decks and preferences". */
function updateLabel(plan: MigrationPlan, t: I18n["t"]): string {
  const parts: string[] = [];
  if (plan.decks.length > 0)
    parts.push(t("migrationNotice.buttonDecks", { count: plan.decks.length }));
  if (plan.preferencesOutdated) parts.push(t("migrationNotice.buttonPreferences"));
  if (plan.instanceOutdated) parts.push(t("migrationNotice.buttonInstanceRecord"));
  if (plan.catalogMissing) parts.push(t("migrationNotice.buttonCatalogue"));
  return t("migrationNotice.updateButton", { what: list(parts, t) });
}

/**
 * Tells the user their data is stored in an older format, what an update
 * would touch, and lets them start it. Nothing happens until they do:
 * the app works on the old format meanwhile. What the new formats add is
 * folded away, and how the update keeps the data safe is said by the
 * confirmation that follows. Shown with the screen, it leaves the focus
 * be; back from the confirmation (`focus`), it takes it.
 */
export function MigrationNotice({
  plan,
  busy,
  error,
  focus = false,
  onMigrate,
}: {
  plan: MigrationPlan;
  busy: boolean;
  error: ErrorText | null;
  /** Take the focus on mount: the user came back to the notice. */
  focus?: boolean;
  onMigrate: () => void;
}) {
  const { t } = useI18n();
  const ref = usePanelFocus<HTMLDivElement>(focus);
  const formats = describeFormats(plan, t);
  return (
    <div
      ref={ref}
      class="warning migration"
      role="region"
      aria-label={t("migrationNotice.region")}
      tabIndex={-1}
    >
      <p>
        <strong>{t("migrationNotice.heading")}</strong> {t("migrationNotice.body")}
      </p>
      <ul>
        {plan.instanceOutdated && <li>{t("migrationNotice.itemInstanceRecord")}</li>}
        {plan.catalogMissing && <li>{t("migrationNotice.itemCatalogue")}</li>}
        {plan.preferencesOutdated && <li>{t("migrationNotice.itemPreferences")}</li>}
        {plan.decks.map(({ deck, deckOutdated, cardCount, reviewCount }) => (
          <li key={deck.url}>
            <ReaderText text={deck.title} /> —{" "}
            {[
              ...(deckOutdated ? [t("migrationNotice.deckEntry")] : []),
              ...(cardCount > 0 ? [t("common.cardCount", { count: cardCount })] : []),
              ...(reviewCount > 0
                ? [t("migrationNotice.reviewStates", { count: reviewCount })]
                : []),
            ].join(", ")}
          </li>
        ))}
      </ul>
      {formats.length > 0 && (
        <details>
          <summary>{t("migrationNotice.whatsNew")}</summary>
          {formats.map((sentence) => (
            <p key={sentence}>{sentence}</p>
          ))}
        </details>
      )}
      <button class="primary" onClick={onMigrate} disabled={busy}>
        {busy ? t("migrationNotice.updating") : updateLabel(plan, t)}
      </button>
      <ErrorMessage error={error} />
    </div>
  );
}
