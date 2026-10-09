import { useState } from "preact/hooks";
import { DECK_DIRECTIONS, type Deck, type DeckDirection } from "@solid-memo/domain/deck";
import type { DeckPace } from "@solid-memo/domain/deckPace";
import type { DeckGroup } from "@solid-memo/domain/deckTree";
import { useI18n } from "@solid-memo/ui/i18n";

/** The form a bulk action opens, to say how. */
type Form = "move" | "pace" | "direction";

/**
 * What can be done with the decks selected in Home's table, all at once:
 * move them into a group (or to the top level), give them a pace or a
 * direction, export them (a link to import and export, `exportHref`,
 * with them ticked), or delete them, once the user confirms, naming each. Each
 * resolves to whether it was done; the screen says what was and why not.
 * Only one is made at a time (`busy`).
 */
export function DeckBulkActions({
  selected,
  groups,
  readOnly,
  busy,
  exportHref,
  onMove,
  onPace,
  onDirection,
  onRemove,
  onClear,
}: {
  selected: readonly Deck[];
  /** Every group, in the arrangement's order, each with its trail (the groups it is in, then itself). */
  groups: readonly { group: DeckGroup; trail: readonly DeckGroup[] }[];
  /** A newer version arranged the decks: none can be moved. */
  readOnly: boolean;
  busy: boolean;
  /** Import and export, the selected decks ticked to export. */
  exportHref: string;
  /** Into the group of that URL; null for the top level. */
  onMove: (parent: string | null) => Promise<boolean>;
  onPace: (pace: DeckPace) => Promise<boolean>;
  onDirection: (direction: DeckDirection) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
  onClear: () => void;
}) {
  const { t, readerText, directionLabel } = useI18n();
  const [form, setForm] = useState<Form | null>(null);
  const [parent, setParent] = useState("");
  const [newCards, setNewCards] = useState("");
  const [maxReviews, setMaxReviews] = useState("");
  const [direction, setDirection] = useState<DeckDirection>(DECK_DIRECTIONS[0]!);

  /** Done, the form closes; not, it stays as filled in. */
  const done = (made: Promise<boolean>) =>
    void made.then((ok) => {
      if (ok) setForm(null);
    });

  const toggle = (which: Form) => setForm((open) => (open === which ? null : which));

  function remove() {
    const names = selected.map((deck) => `“${readerText(deck.title)}”`).join(", ");
    if (!window.confirm(t("studio.bulk.removeConfirm", { count: selected.length, names }))) return;
    setForm(null);
    void onRemove();
  }

  const buttons = (
    <p class="actions">
      <button type="submit" class="primary" disabled={busy}>
        {t("studio.bulk.apply")}
      </button>
      <button type="button" onClick={() => setForm(null)}>
        {t("studio.bulk.cancel")}
      </button>
    </p>
  );

  return (
    <div class="studio-bulk" role="group" aria-label={t("studio.bulk.label")}>
      <p>{t("studio.bulk.selected", { count: selected.length })}</p>
      <div class="actions">
        {(["move", "pace", "direction"] as const).map((which) => (
          <button key={which} type="button" aria-expanded={form === which} disabled={busy} onClick={() => toggle(which)}>
            {t(`studio.bulk.${which}`)}
          </button>
        ))}
        <a class="button" href={exportHref}>
          {t("studio.bulk.export")}
        </a>
        <button type="button" class="danger" disabled={busy} onClick={remove}>
          {t("studio.bulk.remove")}
        </button>
        <button type="button" onClick={onClear}>
          {t("studio.bulk.clear")}
        </button>
      </div>
      {form === "move" &&
        (readOnly ? (
          <p class="hint">{t("studio.bulk.moveReadOnly")}</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              done(onMove(parent === "" ? null : parent));
            }}
          >
            <label>
              {t("studio.bulk.group")}
              <select value={parent} onChange={(event) => setParent(event.currentTarget.value)}>
                <option value="">{t("studio.bulk.topLevel")}</option>
                {groups.map(({ group, trail }) => (
                  <option key={group.url} value={group.url}>
                    {trail.map((step) => readerText(step.title)).join(" › ")}
                  </option>
                ))}
              </select>
            </label>
            {buttons}
          </form>
        ))}
      {form === "pace" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            done(
              onPace({
                ...(newCards.trim() === "" ? {} : { newCardsPerDay: Number(newCards) }),
                ...(maxReviews.trim() === "" ? {} : { maxReviewsPerDay: Number(maxReviews) }),
              }),
            );
          }}
        >
          <label>
            {t("studio.bulk.newCardsPerDay")}
            <input type="number" min={0} step={1} value={newCards} onInput={(event) => setNewCards(event.currentTarget.value)} />
          </label>
          <label>
            {t("studio.bulk.maxReviewsPerDay")}
            <input
              type="number"
              min={0}
              step={1}
              value={maxReviews}
              onInput={(event) => setMaxReviews(event.currentTarget.value)}
            />
          </label>
          <p class="hint">{t("studio.bulk.paceHint")}</p>
          {buttons}
        </form>
      )}
      {form === "direction" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            done(onDirection(direction));
          }}
        >
          <label>
            {t("studio.decks.direction")}
            <select value={direction} onChange={(event) => setDirection(event.currentTarget.value as DeckDirection)}>
              {DECK_DIRECTIONS.map((option) => (
                <option key={option} value={option}>
                  {directionLabel(option)}
                </option>
              ))}
            </select>
          </label>
          {buttons}
        </form>
      )}
    </div>
  );
}
