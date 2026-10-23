// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { CARD_FORMAT_VERSION, DECK_FORMAT_VERSION } from "@solid-memo/domain/deck";
import { INSTANCE_FORMAT_VERSION } from "@solid-memo/domain/instance";
import type { MigrationPlan } from "@solid-memo/domain/migration";
import { PREFERENCES_FORMAT_VERSION } from "@solid-memo/domain/preferences";
import { REVIEW_STATE_FORMAT_VERSION } from "@solid-memo/domain/review";
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
 * What is outdated, as a subject: "2 deck entries, 255 cards in 3 decks
 * and your preferences". Never empty for a plan the notice shows.
 */
export function describeOutdated(plan: MigrationPlan, t: I18n["t"]): string {
  const parts: string[] = [];
  if (plan.instanceOutdated) parts.push(t("migrationNotice.instanceRecord"));
  if (plan.catalogMissing) parts.push(t("migrationNotice.instanceCatalogue"));
  if (plan.preferencesOutdated) parts.push(t("migrationNotice.yourPreferences"));
  if (plan.deckCount > 0) parts.push(t("migrationNotice.deckEntries", { count: plan.deckCount }));
  if (plan.cardCount > 0) {
    const decks = plan.decks.filter(({ cardCount }) => cardCount > 0).length;
    parts.push(
      t("migrationNotice.countIn", {
        what: t("common.cardCount", { count: plan.cardCount }),
        decks: t("migrationNotice.inDecks", { count: decks }),
      }),
    );
  }
  if (plan.reviewCount > 0) {
    const decks = plan.decks.filter(({ reviewCount }) => reviewCount > 0).length;
    parts.push(
      t("migrationNotice.countIn", {
        what: t("migrationNotice.reviewStates", { count: plan.reviewCount }),
        decks: t("migrationNotice.inDecks", { count: decks }),
      }),
    );
  }
  return list(parts, t);
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

/** What the formats the plan touches added since the oldest version it found of each. */
export function describeFormats(plan: MigrationPlan, t: I18n["t"]): string {
  const { oldestFormat } = plan;
  const parts: string[] = [];
  if (plan.instanceOutdated)
    parts.push(t("migrationNotice.instanceFormat", { version: INSTANCE_FORMAT_VERSION }));
  if (plan.catalogMissing) parts.push(t("migrationNotice.catalogueFormat"));
  if (plan.preferencesOutdated) {
    parts.push(
      t("migrationNotice.preferencesFormat", {
        version: PREFERENCES_FORMAT_VERSION,
        added: addedSince(PREFERENCES_STEPS, oldestFormat.preferences, t),
      }),
    );
  }
  if (plan.deckCount > 0) {
    parts.push(
      t("migrationNotice.deckFormat", {
        version: DECK_FORMAT_VERSION,
        added: addedSince(DECK_STEPS, oldestFormat.deck, t),
      }),
    );
  }
  if (plan.cardCount > 0) {
    parts.push(
      t("migrationNotice.cardFormat", {
        version: CARD_FORMAT_VERSION,
        added: addedSince(CARD_STEPS, oldestFormat.card, t),
      }),
    );
  }
  if (plan.reviewCount > 0) {
    parts.push(
      t("migrationNotice.reviewFormat", {
        version: REVIEW_STATE_FORMAT_VERSION,
        added: addedSince(REVIEW_STATE_STEPS, oldestFormat.reviewState, t),
      }),
    );
  }
  return list(parts, t);
}

/** Deck format 3 gave every deck a description: a deck from before gets one. */
const DESCRIBED_DECK_FORMAT = 3;

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
 * the app works on the old format meanwhile. Shown with the screen, it
 * leaves the focus be; back from the confirmation (`focus`), it takes it.
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
  const singular =
    plan.deckCount +
      plan.cardCount +
      plan.reviewCount +
      Number(plan.preferencesOutdated) +
      Number(plan.instanceOutdated) +
      Number(plan.catalogMissing) ===
    1;
  return (
    <div
      ref={ref}
      class="warning migration"
      role="region"
      aria-label={t("migrationNotice.region")}
      tabIndex={-1}
    >
      <p>
        <strong>{t("migrationNotice.heading")}</strong>{" "}
        {t("migrationNotice.stored", {
          count: singular ? 1 : 2,
          outdated: describeOutdated(plan, t),
        })}{" "}
        {t("migrationNotice.writes", { formats: describeFormats(plan, t) })}{" "}
        {t("migrationNotice.howItWorks")}
        {plan.oldestFormat.deck < DESCRIBED_DECK_FORMAT && (
          <> {t("migrationNotice.newDescriptions")}</>
        )}
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
      <button class="primary" onClick={onMigrate} disabled={busy}>
        {busy ? t("migrationNotice.updating") : updateLabel(plan, t)}
      </button>
      <ErrorMessage error={error} />
    </div>
  );
}
