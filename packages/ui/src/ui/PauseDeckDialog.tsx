// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useId, useRef, useState } from "preact/hooks";
import { useQuery } from "@tanstack/react-query";
import type { UseCases } from "@solid-memo/application/useCases";
import { OUTLOOK_DAYS } from "@solid-memo/application/deckPauses";
import { isCountableDay, shiftStudyDay } from "@solid-memo/domain/answer";
import type { Deck } from "@solid-memo/domain/deck";
import { Dialog } from "./Dialog";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { queries } from "./queries";
import { ReaderText } from "./ReaderText";

/**
 * Pausing a deck, in a modal dialog (Dialog), which closes on Escape or
 * its Close, the focus then back where it was. The learner pauses it until they resume it, or until a day
 * after today they pick. Beside the choice, what the pause is likely to
 * cost: the deck's average chance of recall on that day, or after
 * OUTLOOK_DAYS without one (getPauseOutlook). `onPause` makes the pause
 * and resolves to whether it did; the dialog then closes (`onClose`), or
 * stays open with the error the container gives (`error`).
 */
export function PauseDeckDialog({
  useCases,
  instanceUrl,
  deck,
  today,
  busy,
  error,
  onPause,
  onClose,
}: {
  useCases: Pick<UseCases, "getPauseOutlook">;
  instanceUrl: string;
  deck: Deck;
  /** Today's study day: the day to resume on comes after it. */
  today: string;
  /** The pause is being written. */
  busy: boolean;
  /** Why the pause was not made. */
  error: ErrorText | null;
  onPause: (resumesOn: string | null) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t, tx, formatDate, formatPercent } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const outlookId = useId();
  const [onDay, setOnDay] = useState(false);
  const tomorrow = shiftStudyDay(today, 1);
  const [day, setDay] = useState(tomorrow);
  // A day the field holds that the pause would take: a day after today.
  const chosen = onDay ? (isCountableDay(day) && day > today ? day : undefined) : null;

  const outlookQuery = useQuery(queries.pauseOutlook(useCases, instanceUrl, deck, chosen));
  const outlook = chosen === undefined ? undefined : outlookQuery.data;

  function outlookText() {
    if (outlook === undefined) return "";
    if (outlook.recall === null) return t("pauseDeck.nothingStudied");
    const percent = formatPercent(outlook.recall);
    return chosen === null
      ? t("pauseDeck.outlookAfter", { days: OUTLOOK_DAYS, percent })
      : t("pauseDeck.outlookOn", { day: formatDate(outlook.day), percent });
  }

  return (
    <Dialog
      heading={tx("pauseDeck.heading", { deck: <ReaderText text={deck.title} /> })}
      class="pause-dialog"
      dialogRef={ref}
      onClose={onClose}
    >
      <p>{t("pauseDeck.intro")}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || chosen === undefined) return;
          void onPause(chosen).then((paused) => {
            if (paused) ref.current!.close();
          });
        }}
      >
        <fieldset>
          <legend>{t("pauseDeck.until")}</legend>
          <label>
            <input
              type="radio"
              name="pause-until"
              checked={!onDay}
              onChange={() => setOnDay(false)}
            />
            {t("pauseDeck.untilResumed")}
          </label>
          <label>
            <input
              type="radio"
              name="pause-until"
              checked={onDay}
              onChange={() => setOnDay(true)}
            />
            {t("pauseDeck.resumeOn")}
          </label>
          <input
            type="date"
            aria-label={t("pauseDeck.day")}
            min={tomorrow}
            value={day}
            disabled={!onDay}
            aria-invalid={onDay && chosen === undefined}
            aria-describedby={outlookId}
            onInput={(event) => setDay(event.currentTarget.value)}
          />
        </fieldset>
        <p id={outlookId} class="hint" aria-live="polite">
          {onDay && chosen === undefined ? t("pauseDeck.dayInvalid") : outlookText()}
        </p>
        <ErrorMessage error={error} />
        <div class="actions">
          <button type="submit" class="primary" aria-disabled={busy || chosen === undefined}>
            {t("pauseDeck.pause")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
