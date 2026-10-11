import { useState } from "preact/hooks";
import { DECK_DIRECTIONS, type Deck, type DeckDirection } from "@solid-memo/domain/deck";
import type { DeckPace } from "@solid-memo/domain/deckPace";
import type { DeckGroup } from "@solid-memo/domain/deckTree";
import { ActionsMenu, MenuItem } from "@solid-memo/ui/ActionsMenu";
import { useI18n } from "@solid-memo/ui/i18n";
import { useConfirm } from "./shell/ConfirmDialog";
import { Dialog } from "./shell/Dialog";

/** Why no deck can be moved into a group: a newer version arranged them, or the arrangement has invalid data, set aside. */
export type MoveLock = "newerVersion" | "setAside";

/** The form a bulk action opens, to say how: in a dialog. */
type Form = "move" | "pace" | "direction";

/**
 * What can be done with the decks selected in Home's table, all at once,
 * in its BulkBar: move them into a group (or to the top level), give
 * them a pace or a direction (the three in a menu, Edit, each asking how
 * in a dialog), export them (a link to import and export, `exportHref`,
 * with them checked), or delete them, once the user confirms
 * (ConfirmDialog), naming each. Each resolves to whether it was done;
 * the screen says what was and why not. Only one is made at a time
 * (`busy`).
 */
export function DeckBulkActions({
  selected,
  groups,
  moveLocked,
  busy,
  exportHref,
  onMove,
  onPace,
  onDirection,
  onRemove,
}: {
  selected: readonly Deck[];
  /** Every group, in the arrangement's order, each with its trail (the groups it is in, then itself). */
  groups: readonly { group: DeckGroup; trail: readonly DeckGroup[] }[];
  /** Why none can be moved into a group; null when they can. */
  moveLocked: MoveLock | null;
  busy: boolean;
  /** Import and export, the selected decks checked to export. */
  exportHref: string;
  /** Into the group of that URL; null for the top level. */
  onMove: (parent: string | null) => Promise<boolean>;
  onPace: (pace: DeckPace) => Promise<boolean>;
  onDirection: (direction: DeckDirection) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const { t, readerText, directionLabel } = useI18n();
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [parent, setParent] = useState("");
  const [newCards, setNewCards] = useState("");
  const [maxReviews, setMaxReviews] = useState("");
  const [direction, setDirection] = useState<DeckDirection>(DECK_DIRECTIONS[0]!);
  const { ask, dialog } = useConfirm();

  /** Done, the form closes; not, it stays as filled in. */
  const done = (made: Promise<boolean>) =>
    void made.then((ok) => {
      if (ok) setForm(null);
    });

  function remove() {
    const names = selected.map((deck) => `“${readerText(deck.title)}”`).join(", ");
    ask({
      heading: t("studio.confirm.deleteDecks"),
      text: t("studio.bulk.removeConfirm", { count: selected.length, names }),
      action: t("studio.bulk.remove"),
      onConfirm: () => void onRemove(),
    });
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
    <>
      <ActionsMenu
        label={t("studio.bulk.groups.editDecks")}
        text={t("studio.bulk.groups.edit")}
        buttonClass=""
        open={menu}
        onOpen={() => setMenu(true)}
        onClose={() => setMenu(false)}
      >
        {(["move", "pace", "direction"] as const).map((which) => (
          <MenuItem key={which} disabled={busy} onSelect={() => setForm(which)}>
            {t(`studio.bulk.${which}`)}
          </MenuItem>
        ))}
      </ActionsMenu>
      <a class="button" href={exportHref}>
        {t("studio.bulk.export")}
      </a>
      <button type="button" class="danger" disabled={busy} onClick={remove}>
        {t("studio.bulk.remove")}
      </button>
      {dialog}
      {form !== null && (
        <Dialog heading={t(`studio.bulk.${form}`)} onClose={() => setForm(null)}>
          {form === "move" &&
            (moveLocked !== null ? (
              <p class="hint">
                {t(
                  moveLocked === "newerVersion"
                    ? "studio.bulk.moveReadOnly"
                    : "studio.bulk.moveSetAside",
                )}
              </p>
            ) : (
              <form
                aria-label={t("studio.bulk.move")}
                onSubmit={(event) => {
                  event.preventDefault();
                  done(onMove(parent === "" ? null : parent));
                }}
              >
                <label>
                  {t("studio.bulk.group")}
                  <select
                    autoFocus
                    value={parent}
                    onChange={(event) => setParent(event.currentTarget.value)}
                  >
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
              aria-label={t("studio.bulk.pace")}
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
                <input
                  type="number"
                  autoFocus
                  min={0}
                  step={1}
                  value={newCards}
                  onInput={(event) => setNewCards(event.currentTarget.value)}
                />
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
              aria-label={t("studio.bulk.direction")}
              onSubmit={(event) => {
                event.preventDefault();
                done(onDirection(direction));
              }}
            >
              <label>
                {t("studio.decks.direction")}
                <select
                  autoFocus
                  value={direction}
                  onChange={(event) => setDirection(event.currentTarget.value as DeckDirection)}
                >
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
        </Dialog>
      )}
    </>
  );
}
