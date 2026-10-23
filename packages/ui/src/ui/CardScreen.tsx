// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import {
  isMarkdown,
  type Card,
  type CardContent,
  type CardTextPart,
  type Distractor,
} from "@solid-memo/domain/deck";
import { useCardText } from "./cardLanguage";
import { cardName } from "./DataText";
import type { DeckLanguages } from "@solid-memo/domain/deckLanguages";
import type { LangText } from "@solid-memo/domain/langText";
import {
  cardLanguageHints,
  CardContentFields,
  CardFieldsErrorMessage,
  checkDraft,
  draftChanged,
  draftOf,
  rememberCardLanguages,
  type CardDraft,
  type CardFieldsError,
} from "./CardContentFields";
import { useAskFirst } from "./askFirst";
import { CardFace } from "./CardFace";
import { DistractorFields } from "./DistractorFields";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type ErrorText } from "./i18n";
import { CardIcon, TrashIcon } from "./icons";
import { RetiredNotice } from "./RetiredCards";

/** What a deck with no cards (yet read) says of its languages: nothing. */
const NO_LANGUAGES: DeckLanguages = { unstatedCounts: { front: 0, back: 0 } };
const NO_TITLE: LangText = {};
const NONE_PUBLISHED: ReadonlySet<string> = new Set();
const NO_DISTRACTORS: readonly Distractor[] = [];

/** What a card's editor holds: its fields as edited and as they were last saved, and its wrong options as changed (null while they are not). */
export interface CardEdits {
  draft: CardDraft;
  pristine: CardDraft;
  changed: Distractor[] | null;
}

/**
 * One card's own page: the card as it looks in study, and its editor.
 * While a change saves, its buttons keep the focus (aria-disabled), as
 * the page stays.
 *
 * The editor edits each text in the languages it is in, a text new to
 * the card starting in the language the deck's cards usually have
 * (`languages`). A side saved with no language keeps none until the user
 * edits it or gives it a translation: then its language is asked for.
 *
 * Under the card's fields, its wrong options (DistractorFields): changed
 * there, they are saved with the card, by its Save; left as they were,
 * they show the card's as it is read afresh (a change made in the
 * Studio meanwhile included), and the save does not state them, so the
 * card keeps its own. A page that
 * edits them on its own (the Studio's card inspector) leaves them out
 * (`withDistractors` false), as it gives the page its own heading
 * (`heading` false). Those the deck's
 * release published (`published`) are never deleted, only retired.
 *
 * While the editor holds changes not saved (since it opened, or since
 * the last save), it says so (`onUnsaved`) with a way to save them as
 * Save does, which resolves to whether they were saved; then, once
 * there are none (saved, or the editor gone), null. With `keep`, the
 * editor keeps what it holds there as it changes, and starts from what
 * is there: a page that shows it elsewhere as the window changes (the
 * Studio's card beside its deck's cards, or alone) loses none of it.
 */
export function CardScreen({
  card,
  deckTitle = NO_TITLE,
  languages = NO_LANGUAGES,
  published = NONE_PUBLISHED,
  heading = true,
  withDistractors = true,
  arrival,
  busy,
  saved,
  error,
  onSave,
  onRemove,
  onUnsaved,
  keep,
}: {
  card: Card;
  /** The deck's name: its languages are suggested for the card's text. */
  deckTitle?: LangText;
  /** What the deck's cards say of their languages (deckLanguages). */
  languages?: DeckLanguages;
  /** The ids of the card's distractors the deck's release published. */
  published?: ReadonlySet<string>;
  /** Whether the page heads the card itself ("Card"). */
  heading?: boolean;
  /** Whether the editor edits the card's wrong options too. */
  withDistractors?: boolean;
  /** The text the page was opened at (a link to it): where the user arrives. */
  arrival?: CardTextPart;
  busy: boolean;
  /** The last save succeeded (and nothing was edited since). */
  saved: boolean;
  error: ErrorText | null;
  /** Save the card; it may resolve to whether it was saved. */
  onSave: (content: CardContent) => void | Promise<boolean>;
  onRemove: () => void;
  onUnsaved?: (save: (() => Promise<boolean>) | null) => void;
  /** Where the editor's edits are kept, by its owner, for the editor shown next of the same card. */
  keep?: { current: CardEdits | null };
}) {
  const { t } = useI18n();
  const { cardText, cardLanguages } = useCardText();
  const askFirst = useAskFirst();
  const hints = useMemo(() => cardLanguageHints(languages, deckTitle), [languages, deckTitle]);
  // Each text starts in the language it is shown in elsewhere: the deck's card language first.
  const startDraft = () => draftOf(card, cardLanguages(), { defaults: hints.defaults });
  const [draft, setDraft] = useState(() => keep?.current?.draft ?? startDraft());
  /** The draft as it started, or as last saved: what is not saved differs from it. */
  const [pristine, setPristine] = useState(keep?.current?.pristine ?? draft);
  const [invalid, setInvalid] = useState<CardFieldsError | null>(null);
  /** The wrong options as changed here, until saved; null while left as the card has them. */
  const [changed, setChanged] = useState<Distractor[] | null>(keep?.current?.changed ?? null);
  // As it is rendered, so an editor gone the next moment has kept its last edit.
  if (keep !== undefined) keep.current = { draft, pristine, changed };
  const distractors = changed ?? card.distractors ?? NO_DISTRACTORS;

  // What is known of the deck (its cards' languages) may come
  // after the page opens: an editor not yet touched — no text, no
  // picture's URL, nor Markdown switched — starts again from it.
  const started = useRef(false);
  useLayoutEffect(() => {
    const untouched =
      draft.touched.length === 0 &&
      draft.frontImageUrl === (card.frontImageUrl ?? "") &&
      draft.backImageUrl === (card.backImageUrl ?? "") &&
      draft.markdown === isMarkdown(card.textFormat);
    if (started.current && untouched) {
      const fresh = startDraft();
      setDraft(fresh);
      setPristine(fresh);
    }
    started.current = true;
  }, [hints]);

  // The languages of the user's own text a save states are this device's
  // latest choices for it once the save succeeds, not before.
  const submitted = useRef<{ content: CardContent; draft: CardDraft } | null>(null);
  useLayoutEffect(() => {
    // Saved, the card read afresh has the wrong options changed here.
    if (saved) setChanged(null);
    if (!saved || submitted.current === null) return;
    rememberCardLanguages(submitted.current.content, submitted.current.draft);
    setPristine(submitted.current.draft);
    submitted.current = null;
  }, [saved]);

  /** Saves the card as edited, once it is valid; whether it was saved. */
  function save(): Promise<boolean> {
    if (busy) return Promise.resolve(false);
    const check = checkDraft(draft, card);
    if (!check.ok) {
      setInvalid(check.invalid);
      return Promise.resolve(false);
    }
    setInvalid(null);
    // Wrong options left as they were are not stated: the card keeps its own.
    const content = changed === null ? check.content : { ...check.content, distractors: changed };
    submitted.current = { content, draft };
    return Promise.resolve(onSave(content)).then((done) => done !== false);
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    void save();
  }

  // The latest save, with the latest edits.
  const saveRef = useRef(save);
  saveRef.current = save;
  const unsaved = changed !== null || draftChanged(draft, pristine);
  useEffect(() => {
    if (!unsaved || onUnsaved === undefined) return;
    onUnsaved(() => saveRef.current());
    return () => onUnsaved(null);
  }, [unsaved]);

  function handleRemove() {
    if (busy) return;
    askFirst({
      heading: t("card.removeHeading"),
      text: t("card.removeConfirm", { card: cardName(card, cardText) }),
      action: t("card.removeAction"),
      onConfirm: onRemove,
    });
  }

  return (
    <section>
      {heading && (
        <header>
          <h2>
            <CardIcon />
            {t("card.heading")}
          </h2>
        </header>
      )}
      <div class="practice-card">
        <CardFace
          side="front"
          text={card.front}
          imageUrl={card.frontImageUrl}
          imageDescription={card.frontImageDescription}
          label={card.frontLabel}
          note={card.frontNote}
          textFormat={card.textFormat}
        />
        <CardFace
          side="back"
          text={card.back}
          imageUrl={card.backImageUrl}
          imageDescription={card.backImageDescription}
          label={card.backLabel}
          note={card.backNote}
          textFormat={card.textFormat}
        />
      </div>
      {card.retired && <RetiredNotice />}
      <form onSubmit={handleSubmit} noValidate>
        <CardContentFields
          draft={draft}
          saved={card}
          busy={busy}
          invalid={invalid}
          suggestions={hints.suggestions}
          arrival={arrival}
          onChange={(next) => {
            // A language asked for is answered as the user changes the card.
            if (invalid?.entry !== undefined) setInvalid(null);
            setDraft(next);
          }}
        />
        {withDistractors && (
          <DistractorFields
            cardId={card.id}
            distractors={distractors}
            published={published}
            back={card.back}
            textFormat={card.textFormat}
            busy={busy}
            suggestions={hints.suggestions.back}
            onChange={setChanged}
          />
        )}
        <CardFieldsErrorMessage invalid={invalid} />
        <div class="edit-actions">
          <button type="submit" aria-disabled={busy}>
            {t("card.saveButton")}
          </button>
          <button
            type="button"
            class="danger icon"
            aria-label={t("card.removeButton")}
            title={t("card.removeButton")}
            onClick={handleRemove}
            aria-disabled={busy}
          >
            <TrashIcon />
          </button>
        </div>
      </form>
      {/* Mounted throughout, so each save is heard: the text clears while
          the next one is under way and comes back once it is done. */}
      <p class="hint" role="status">
        {saved ? t("card.saved") : ""}
      </p>
      <ErrorMessage error={error} />
    </section>
  );
}
