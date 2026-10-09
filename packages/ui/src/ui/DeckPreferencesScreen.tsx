import { Fragment } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Deck } from "@solid-memo/domain/deck";
import { AppError } from "@solid-memo/domain/appError";
import type { LangText } from "@solid-memo/domain/langText";
import type { DeckLanguages, StatedLanguages } from "@solid-memo/domain/deckLanguages";
import type { DeckPace } from "@solid-memo/domain/deckPace";
import type { StudyPreferences } from "@solid-memo/domain/preferences";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type I18n, type ErrorText } from "./i18n";
import { ReaderText } from "./ReaderText";
import { DeckLanguagesSection } from "./DeckLanguagesSection";
import {
  draftOf,
  LangTextField,
  rememberLanguages,
  textOfDraft,
  useMissingLanguage,
  type LangTextDraft,
} from "./LangTextField";

type Limit = keyof DeckPace;

const LIMITS: Limit[] = ["newCardsPerDay", "maxReviewsPerDay"];

/** A limit's field label. */
function limitLabel(t: I18n["t"], limit: Limit): string {
  switch (limit) {
    case "newCardsPerDay":
      return t("deckPreferences.newCardsPerDay");
    case "maxReviewsPerDay":
      return t("deckPreferences.maxReviewsPerDay");
  }
}

/** What the number in a limit's field counts, shown after it. */
function limitUnit(t: I18n["t"], limit: Limit, count: number): string {
  switch (limit) {
    case "newCardsPerDay":
      return t("deckPreferences.newCardsUnit", { count });
    case "maxReviewsPerDay":
      return t("deckPreferences.maxReviewsUnit", { count });
  }
}

/**
 * A deck's own preferences: its name (renamed here, or the deck removed)
 * and its daily limits on new cards and on
 * reviews. A limit the deck does not set follows the instance's
 * preferences, which an empty field shows as its placeholder — so
 * emptying a field hands the limit back to them. Each field is followed
 * by what it counts, in the number of the value shown in it; that and
 * the hint about empty fields describe it.
 *
 * The name is edited in every language it has, each the user's to state
 * (LangTextField).
 *
 * Below the limits, the deck's text whose language is not settled
 * (DeckLanguagesSection): its untagged card sides, stated here in bulk.
 * A link may open the screen there (`section`).
 *
 * Rename gives way to the name's field, which takes the focus; Save and
 * Cancel give it back to Rename. The buttons that start a change keep
 * the focus while it saves (aria-disabled), as the screen stays.
 */
export function DeckPreferencesScreen({
  deck,
  deckHref,
  preferences,
  preferencesHref,
  languages,
  languagesUnreadable = null,
  section,
  stated = null,
  busy,
  error,
  onSave,
  onRename,
  onRemove,
  onStateLanguages,
}: {
  deck: Deck;
  /** URL of the deck's page; its name links there. */
  deckHref: string;
  /** The instance's preferences: the limits a deck follows unless it sets its own. */
  preferences: Pick<StudyPreferences, Limit>;
  /** URL of the instance's preferences, where those limits are set. */
  preferencesHref: string;
  /** What the deck's cards say of their languages (deckLanguages); undefined while they are read. */
  languages: DeckLanguages | undefined;
  /** Why the deck's languages could not be checked (its cards or library release unread); null when they could. */
  languagesUnreadable?: ErrorText | null;
  /** The part of the screen a link opened it at: its heading takes the focus. */
  section?: "languages";
  /** How many cards the last statement of languages changed; null before any. */
  stated?: number | null;
  busy: boolean;
  error: ErrorText | null;
  onSave: (pace: DeckPace) => void;
  onRename: (title: LangText) => void;
  /** Remove the deck and all its cards (after the user confirms). */
  onRemove: () => void;
  /** State the language of the deck's untagged card fronts and backs. */
  onStateLanguages: (languages: StatedLanguages) => void;
}) {
  const { t, tx, locale, readerText, errorText } = useI18n();
  /** The deck-name draft while renaming; null otherwise. */
  const [deckName, setDeckName] = useState<LangTextDraft | null>(null);
  const { missing, ask, clear } = useMissingLanguage("deck-name");
  const renameRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  /** Rename takes the focus once it is back: the renaming was saved or cancelled. */
  const backToRename = useRef(false);

  useLayoutEffect(() => {
    if (deckName !== null) {
      nameRef.current!.focus();
      nameRef.current!.select();
    } else if (backToRename.current) {
      backToRename.current = false;
      renameRef.current!.focus();
    }
  }, [deckName === null]);

  function stopRenaming() {
    backToRename.current = true;
    clear();
    setDeckName(null);
  }

  /** The fields as typed; empty means "follow the instance's preferences". */
  const [draft, setDraft] = useState<Record<Limit, string>>(() => ({
    newCardsPerDay: deck.newCardsPerDay?.toString() ?? "",
    maxReviewsPerDay: deck.maxReviewsPerDay?.toString() ?? "",
  }));

  function handleRenameSubmit(event: Event, name: LangTextDraft) {
    event.preventDefault();
    if (busy) return;
    const result = textOfDraft(name);
    if ("missing" in result) {
      ask(result.missing);
      return;
    }
    rememberLanguages("deck", result.text, name);
    onRename(result.text);
    stopRenaming();
  }

  function handleRemove() {
    if (busy) return;
    if (
      window.confirm(
        t("deckPreferences.removeConfirm", { title: readerText(deck.title) }),
      )
    ) {
      onRemove();
    }
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    if (busy) return;
    const pace: DeckPace = {};
    for (const limit of LIMITS) {
      if (draft[limit] !== "") pace[limit] = Number(draft[limit]);
    }
    onSave(pace);
  }

  return (
    <section>
      <header>
        <h2>
          {tx("deckPreferences.heading", {
            deck: (
              <a href={deckHref}>
                <ReaderText text={deck.title} />
              </a>
            ),
          })}
        </h2>
      </header>
      {deckName === null ? (
        <div class="edit-actions">
          <button
            ref={renameRef}
            onClick={() => {
              if (!busy) {
                setDeckName(draftOf(deck.title, [locale, ...navigator.languages]));
              }
            }}
            aria-disabled={busy}
          >
            {t("deckPreferences.renameButton")}
          </button>
          <button class="danger" onClick={handleRemove} aria-disabled={busy}>
            {t("deckPreferences.removeButton")}
          </button>
        </div>
      ) : (
        <form
          class="card-edit"
          onSubmit={(e) => handleRenameSubmit(e, deckName)}
        >
          <LangTextField
            id="deck-name"
            label={t("deckPreferences.deckName")}
            role="deckName"
            draft={deckName}
            suggestions={Object.keys({ ...deck.title, ...deck.description })}
            translationsOpen
            required
            disabled={busy}
            missing={missing}
            errorId="deck-name-error"
            inputRef={nameRef}
            onChange={(next) => {
              clear();
              setDeckName(next);
            }}
          />
          <ErrorMessage
            id="deck-name-error"
            error={
              missing === undefined
                ? null
                : errorText(new AppError("textNeedsLanguage", { field: t("language.field.deckName") }))
            }
          />
          <div class="edit-actions">
            <button type="submit" aria-disabled={busy}>
              {t("deckPreferences.saveName")}
            </button>
            <button
              type="button"
              aria-label={t("deckPreferences.cancelRenamingLabel")}
              onClick={() => {
                if (!busy) stopRenaming();
              }}
              aria-disabled={busy}
            >
              {t("deckPreferences.cancelButton")}
            </button>
          </div>
        </form>
      )}
      <form onSubmit={handleSubmit}>
        {LIMITS.map((limit) => (
          <Fragment key={limit}>
            <label for={`deck-${limit}`}>{limitLabel(t, limit)}</label>
            <span class="input-with-unit">
              <input
                id={`deck-${limit}`}
                type="number"
                min="0"
                step="1"
                value={draft[limit]}
                placeholder={String(preferences[limit])}
                onInput={(e) => setDraft({ ...draft, [limit]: e.currentTarget.value })}
                aria-describedby={[
                  `deck-${limit}-unit`,
                  limit === "newCardsPerDay" && "deck-new-hint",
                  "deck-empty-hint",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={busy}
              />
              <span id={`deck-${limit}-unit`} class="hint">
                {limitUnit(t, limit, draft[limit] === "" ? preferences[limit] : Number(draft[limit]))}
              </span>
            </span>
            {limit === "newCardsPerDay" && (
              <p id="deck-new-hint" class="hint">
                {t("studyPace.startSmall")}
              </p>
            )}
          </Fragment>
        ))}
        <p id="deck-empty-hint" class="hint">
          {tx("deckPreferences.emptyHint", {
            link: <a href={preferencesHref}>{t("deckPreferences.studyPreferencesLink")}</a>,
          })}
        </p>
        <button type="submit" aria-disabled={busy}>
          {t("deckPreferences.saveButton")}
        </button>
      </form>
      <DeckLanguagesSection
        deck={deck}
        languages={languages}
        unreadable={languagesUnreadable}
        arrival={section === "languages"}
        busy={busy}
        stated={stated}
        onStateLanguages={onStateLanguages}
      />
      <ErrorMessage error={error} />
    </section>
  );
}
