import { useState } from "preact/hooks";
import type { TransferMode } from "@solid-memo/domain/cardTransfer";
import type { Deck } from "@solid-memo/domain/deck";
import { useI18n } from "@solid-memo/ui/i18n";

/** A move or copy of the selected cards, as the user chose it. */
export interface CardTransfer {
  to: Deck;
  mode: TransferMode;
  keepProgress: boolean;
}

/**
 * Move or copy the selected cards to another deck of the instance: the
 * user picks the deck (`decks`, the instance's others) and whether the
 * cards keep their progress (they do to start with), told what becomes
 * of their history, then confirms (`onConfirm`). With no other deck,
 * it says so.
 */
export function TransferCardsDialog({
  mode,
  count,
  decks,
  busy,
  onConfirm,
  onCancel,
}: {
  mode: TransferMode;
  /** How many cards are selected. */
  count: number;
  decks: readonly Deck[];
  busy: boolean;
  onConfirm: (transfer: CardTransfer) => void;
  onCancel: () => void;
}) {
  const { t, readerText } = useI18n();
  const [deckUrl, setDeckUrl] = useState(decks[0]?.url ?? "");
  const [keepProgress, setKeepProgress] = useState(true);
  const cancel = (
    <button type="button" onClick={onCancel}>
      {t("studio.bulk.cancel")}
    </button>
  );
  if (decks.length === 0) {
    return (
      <div>
        <p>{t("studio.cardBulk.transfer.noDeck")}</p>
        <p class="actions">{cancel}</p>
      </div>
    );
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onConfirm({ to: decks.find((deck) => deck.url === deckUrl)!, mode, keepProgress });
      }}
    >
      <label>
        {t("studio.cardBulk.transfer.deck")}
        <select value={deckUrl} onChange={(event) => setDeckUrl(event.currentTarget.value)}>
          {decks.map((deck) => (
            <option key={deck.url} value={deck.url}>
              {readerText(deck.title)}
            </option>
          ))}
        </select>
      </label>
      <label class="studio-check">
        <input type="checkbox" checked={keepProgress} onChange={(event) => setKeepProgress(event.currentTarget.checked)} />
        {t("studio.cardBulk.transfer.keepProgress")}
      </label>
      <p class="hint">{t(`studio.cardBulk.transfer.${mode}Hint`)}</p>
      <p class="actions">
        <button type="submit" class="primary" disabled={busy}>
          {t(`studio.cardBulk.transfer.${mode}`, { count })}
        </button>
        {cancel}
      </p>
    </form>
  );
}
