import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import type { CardEdit, CardEditPlan, StatedSide } from "@solid-memo/domain/cardBulk";
import type { Card, Deck } from "@solid-memo/domain/deck";
import { canonicalTag } from "@solid-memo/domain/languageTag";
import { ActionsMenu, MenuItem } from "@solid-memo/ui/ActionsMenu";
import { ErrorMessage } from "@solid-memo/ui/ErrorMessage";
import { useI18n } from "@solid-memo/ui/i18n";
import { FindReplaceDialog } from "./FindReplaceDialog";
import { useConfirm } from "./shell/ConfirmDialog";
import { Dialog } from "./shell/Dialog";
import { TransferCardsDialog, type CardTransfer } from "./TransferCardsDialog";

/** The form an edit opens, to say how: in a dialog. */
type Form = "language" | "replace" | "reschedule" | "move" | "copy";

/** The menus the edits are grouped in. */
type Menu = "edit" | "schedule" | "transfer";

/** An edit of the selected cards' review states: forget them, or set the day they are due. */
export type ReviewEdit = { kind: "reset" } | { kind: "reschedule"; due: string };

/**
 * What can be done with the cards selected in the workbench, all at
 * once, in its BulkBar: retire them, restore them, write them in
 * Markdown or as plain text, state the language of their untagged
 * sides, find and replace in them (FindReplaceDialog, with a preview),
 * or delete them, once the user confirms (ConfirmDialog). The edits of
 * their text are in a menu (Edit), those of their schedule in another
 * (Schedule), and moving and copying in a third; an edit that needs to
 * be told more asks in a dialog. Each edit is planned on the cards as
 * they are (`plan`) and made with that plan (`onEdit`), which resolves
 * to whether it was made; an edit that would change none of them is not
 * made, and says so. Their review states can be forgotten, once the user
 * confirms, or set due on a day, today to start with (`onReviewEdit`,
 * which resolves to whether it was made). They can be moved or copied to
 * another deck of the instance (TransferCardsDialog, `onTransfer`, which
 * resolves to whether it was made). Only one is made at a time (`busy`).
 */
export function CardBulkActions({
  cards,
  languages,
  busy,
  plan,
  onEdit,
  today,
  onReviewEdit,
  decks,
  onTransfer,
}: {
  /** The selected cards the table shows. */
  cards: readonly Card[];
  /** The languages the find and replace offers. */
  languages: readonly string[];
  busy: boolean;
  plan: (edit: CardEdit) => CardEditPlan;
  onEdit: (edit: CardEdit, plan: CardEditPlan) => Promise<boolean>;
  /** Today's study day, the due day offered. */
  today: string;
  onReviewEdit: (edit: ReviewEdit) => Promise<boolean>;
  /** The decks the cards can be moved or copied to: the instance's others. */
  decks: readonly Deck[];
  onTransfer: (transfer: CardTransfer) => Promise<boolean>;
}) {
  const { t, errorText } = useI18n();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [nothing, setNothing] = useState(false);
  const [tag, setTag] = useState("");
  const [side, setSide] = useState<StatedSide | "">("");
  const [tagError, setTagError] = useState<AppError | null>(null);
  const [due, setDue] = useState(today);
  const { ask, dialog } = useConfirm();

  const open = (which: Form) => {
    setNothing(false);
    setForm(which);
  };

  /** Make the edit, unless it changes nothing; done, its form closes. */
  function edit(change: CardEdit, planned = plan(change)) {
    const changes = planned.save.length + planned.remove.length;
    setNothing(changes === 0);
    if (changes === 0) return;
    void onEdit(change, planned).then((ok) => {
      if (ok) setForm(null);
    });
  }

  function remove() {
    ask({
      heading: t("studio.confirm.deleteCards"),
      text: t("studio.cardBulk.removeConfirm", { count: cards.length }),
      action: t("studio.cardBulk.remove"),
      onConfirm: () => edit({ kind: "remove" }),
    });
  }

  function reviewEdit(change: ReviewEdit) {
    setNothing(false);
    void onReviewEdit(change).then((ok) => {
      if (ok) setForm(null);
    });
  }

  function transfer(change: CardTransfer) {
    setNothing(false);
    void onTransfer(change).then((ok) => {
      if (ok) setForm(null);
    });
  }

  function reset() {
    ask({
      heading: t("studio.confirm.forgetCards"),
      text: t("studio.cardBulk.resetConfirm", { count: cards.length }),
      action: t("studio.cardBulk.reset"),
      onConfirm: () => reviewEdit({ kind: "reset" }),
    });
  }

  function stateLanguage() {
    if (canonicalTag(tag) === null) {
      setTagError(new AppError("textLanguageInvalid", { tag }));
      return;
    }
    setTagError(null);
    edit({ kind: "stateLanguage", tag, ...(side === "" ? {} : { side }) });
  }

  /** One of the menus, by its button's text and its name. */
  const group = (which: Menu, text: string, label: string, items: ComponentChildren) => (
    <ActionsMenu label={label} text={text} buttonClass="" open={menu === which} onOpen={() => setMenu(which)} onClose={() => setMenu(null)}>
      {items}
    </ActionsMenu>
  );
  const item = (label: string, onSelect: () => void) => (
    <MenuItem disabled={busy} onSelect={onSelect}>
      {label}
    </MenuItem>
  );
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
      {group(
        "edit",
        t("studio.bulk.groups.edit"),
        t("studio.bulk.groups.editCards"),
        <>
          {item(t("studio.cardBulk.markdownOn"), () => edit({ kind: "setTextFormat", markdown: true }))}
          {item(t("studio.cardBulk.markdownOff"), () => edit({ kind: "setTextFormat", markdown: false }))}
          {item(t("studio.cardBulk.stateLanguage"), () => open("language"))}
          {item(t("studio.cardBulk.findReplace"), () => open("replace"))}
        </>,
      )}
      {group(
        "schedule",
        t("studio.bulk.groups.schedule"),
        t("studio.bulk.groups.scheduleCards"),
        <>
          {item(t("studio.cardBulk.reschedule"), () => open("reschedule"))}
          {item(t("studio.cardBulk.reset"), reset)}
        </>,
      )}
      {group(
        "transfer",
        t("studio.bulk.groups.transfer"),
        t("studio.bulk.groups.transferCards"),
        <>
          {item(t("studio.cardBulk.moveTo"), () => open("move"))}
          {item(t("studio.cardBulk.copyTo"), () => open("copy"))}
        </>,
      )}
      <button type="button" disabled={busy} onClick={() => edit({ kind: "retire" })}>
        {t("studio.cardBulk.retire")}
      </button>
      <button type="button" disabled={busy} onClick={() => edit({ kind: "restore" })}>
        {t("studio.cardBulk.restore")}
      </button>
      <button type="button" class="danger" disabled={busy} onClick={remove}>
        {t("studio.cardBulk.remove")}
      </button>
      {/* Said in the form, while one is open. */}
      {nothing && form === null && <p role="status">{t("studio.cardBulk.nothing")}</p>}
      {dialog}
      {form === "language" && (
        <Dialog heading={t("studio.cardBulk.stateLanguage")} onClose={() => setForm(null)}>
          <form
            aria-label={t("studio.cardBulk.stateLanguage")}
            onSubmit={(event) => {
              event.preventDefault();
              stateLanguage();
            }}
          >
            <label>
              {t("studio.cardBulk.tag")}
              <input type="text" autoFocus value={tag} onInput={(event) => setTag(event.currentTarget.value)} />
            </label>
            <label>
              {t("studio.cardBulk.side")}
              <select value={side} onChange={(event) => setSide(event.currentTarget.value as StatedSide | "")}>
                <option value="">{t("studio.cardBulk.sides.both")}</option>
                <option value="front">{t("studio.cardBulk.sides.front")}</option>
                <option value="back">{t("studio.cardBulk.sides.back")}</option>
              </select>
            </label>
            <p class="hint">{t("studio.cardBulk.stateHint")}</p>
            <ErrorMessage error={errorText(tagError)} />
            {nothing && <p role="status">{t("studio.cardBulk.nothing")}</p>}
            {buttons}
          </form>
        </Dialog>
      )}
      {form === "reschedule" && (
        <Dialog heading={t("studio.cardBulk.reschedule")} onClose={() => setForm(null)}>
          <form
            aria-label={t("studio.cardBulk.reschedule")}
            onSubmit={(event) => {
              event.preventDefault();
              reviewEdit({ kind: "reschedule", due });
            }}
          >
            <label>
              {t("studio.cardBulk.dueLabel")}
              <input type="date" autoFocus value={due} required disabled={busy} onInput={(event) => setDue(event.currentTarget.value)} />
            </label>
            <p class="hint">{t("studio.cardBulk.rescheduleHint")}</p>
            {buttons}
          </form>
        </Dialog>
      )}
      {(form === "move" || form === "copy") && (
        <TransferCardsDialog
          // Another mode: its choices start afresh.
          key={form}
          mode={form}
          count={cards.length}
          decks={decks}
          busy={busy}
          onConfirm={transfer}
          onCancel={() => setForm(null)}
        />
      )}
      {form === "replace" && (
        <FindReplaceDialog
          cards={cards}
          languages={languages}
          plan={plan}
          busy={busy}
          onConfirm={edit}
          onCancel={() => setForm(null)}
        />
      )}
    </>
  );
}
