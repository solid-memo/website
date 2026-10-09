import { useState } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import { TOPICS } from "@solid-memo/vocab/concepts.generated";
import type { Deck } from "@solid-memo/domain/deck";
import { parseKeywords, topicsOfDeck, type DeckAbout } from "@solid-memo/domain/deckAbout";
import { keywordsIn, type LangTexts } from "@solid-memo/domain/keywords";
import { topicLabels } from "@solid-memo/domain/library";
import { shownTag } from "@solid-memo/domain/langText";
import { ErrorMessage } from "./ErrorMessage";
import {
  draftOf,
  LangTextField,
  rememberLanguages,
  textOfDraft,
  useMissingLanguage,
  type DraftEntry,
  type LangTextDraft,
} from "./LangTextField";
import { linkify } from "./linkify";
import { recentLanguages } from "./remembered";
import { useI18n } from "./i18n";
import { ReaderText, ReaderTexts } from "./ReaderText";

/**
 * What a deck says about itself — its description, its topics (from
 * Solid Memo's topics scheme) and its keywords — with a form to change
 * them. The description is required: every deck has one, as DCAT-AP asks
 * of every dataset (see docs/data-model.md). It is edited in every
 * language it has, each the user's to state (LangTextField); a deck with
 * none yet starts it in the language of the name the reader sees, else
 * the one last chosen for a deck's text on this device.
 *
 * Keywords are edited the same way, a comma-separated entry per
 * language, each the user's to state; a deck with none yet starts them
 * in the language of its description, else its name, else the one last
 * chosen. Keywords saved with no language (from an older format) stay
 * as they are, or some removed, until the user states their language:
 * a keyword added to them asks for it. The reader is shown only the
 * keywords in their language, and those in none (see keywordsIn).
 */
export function DeckAboutSection({
  deck,
  busy,
  onSave,
}: {
  deck: Deck;
  busy: boolean;
  onSave: (about: DeckAbout) => void;
}) {
  const { t, tx, locale, readerText, readerLang, errorText } = useI18n();
  /** The drafts while editing; null otherwise. */
  const [draft, setDraft] = useState<{
    description: LangTextDraft;
    topics: string[];
    keywords: LangTextDraft;
  } | null>(null);
  const { missing, ask, clear } = useMissingLanguage("deck-description");
  const keywordsQuestion = useMissingLanguage("deck-keywords");
  const topics = topicLabels(deck.themes ?? []);
  /** The keywords the reader is shown: those in their language. */
  const keywords = keywordsIn(deck.keywords, locale);

  function edit() {
    const languages = [locale, ...navigator.languages];
    const titleTag = shownTag(deck.title, languages);
    const descriptionTag = deck.description === undefined ? undefined : shownTag(deck.description, languages);
    setDraft({
      description: draftOf(deck.description, languages, {
        tag: titleTag ?? recentLanguages("deck")[0] ?? null,
      }),
      topics: topicsOfDeck(deck),
      keywords: draftOf(joinedKeywords(deck.keywords), languages, {
        tag: [descriptionTag, titleTag].find((tag) => tag !== undefined && tag !== "") ?? recentLanguages("deck")[0] ?? null,
      }),
    });
  }

  /** Only while editing, when there is a draft. */
  function toggleTopic(topic: string, checked: boolean) {
    setDraft((current) => ({
      ...current!,
      topics: checked ? [...current!.topics, topic] : current!.topics.filter((other) => other !== topic),
    }));
  }

  function handleSubmit(event: Event) {
    event.preventDefault();
    const result = textOfDraft(draft!.description);
    if ("missing" in result) {
      ask(result.missing);
      return;
    }
    const typed = keywordsOfDraft(draft!.keywords, deck.keywords);
    if ("missing" in typed) {
      keywordsQuestion.ask(typed.missing);
      return;
    }
    rememberLanguages("deck", result.text, draft!.description);
    rememberLanguages("deck", typed.keywords, draft!.keywords);
    onSave({
      description: result.text,
      topics: draft!.topics,
      keywords: typed.keywords,
    });
    setDraft(null);
  }

  if (draft === null) {
    return (
      <section class="deck-about" aria-label={t("deckAbout.label")}>
        {deck.description !== undefined && (
          <p class="deck-description" lang={readerLang(deck.description)}>
            {linkify(readerText(deck.description))}
          </p>
        )}
        {(topics.length > 0 || keywords.length > 0) && (
          <p class="hint">
            {topics.length > 0 && tx("deckAbout.topicsLine", { topics: <ReaderTexts texts={topics} /> })}
            {topics.length > 0 && keywords.length > 0 && " · "}
            {keywords.length > 0 && t("deckAbout.keywordsLine", { keywords: keywords.join(", ") })}
          </p>
        )}
        <button onClick={edit} disabled={busy}>
          {t("deckAbout.describeButton")}
        </button>
      </section>
    );
  }

  return (
    <form class="card-edit deck-about" aria-label={t("deckAbout.label")} onSubmit={handleSubmit}>
      <LangTextField
        id="deck-description"
        label={t("deckAbout.description")}
        role="description"
        draft={draft.description}
        suggestions={Object.keys({ ...deck.description, ...deck.title })}
        multiline
        translationsOpen
        required
        disabled={busy}
        missing={missing}
        errorId="deck-description-error"
        onChange={(description) => {
          clear();
          setDraft({ ...draft, description });
        }}
      />
      <ErrorMessage
        id="deck-description-error"
        error={
          missing === undefined
            ? null
            : errorText(new AppError("textNeedsLanguage", { field: t("language.field.description") }))
        }
      />
      <fieldset class="library-topics">
        <legend>{t("deckAbout.topics")}</legend>
        {TOPICS.concepts.map((topic) => (
          <label key={topic.iri} class="checkbox-option">
            <input
              type="checkbox"
              checked={draft.topics.includes(topic.iri)}
              onChange={(e) => toggleTopic(topic.iri, e.currentTarget.checked)}
              disabled={busy}
            />
            <ReaderText text={topic.label} />
          </label>
        ))}
      </fieldset>
      <LangTextField
        id="deck-keywords"
        label={t("deckAbout.keywords")}
        role="keywords"
        draft={draft.keywords}
        suggestions={Object.keys({ ...deck.keywords, ...deck.description, ...deck.title }).filter((tag) => tag !== "")}
        hint={
          <p id="deck-keywords-hint" class="hint field-hint">
            {t("deckAbout.keywordsHint")}
          </p>
        }
        describedBy="deck-keywords-hint"
        translationsOpen={draft.keywords.length > 1}
        disabled={busy}
        missing={keywordsQuestion.missing}
        errorId="deck-keywords-error"
        onChange={(keywords) => {
          keywordsQuestion.clear();
          setDraft({ ...draft, keywords });
        }}
      />
      <ErrorMessage
        id="deck-keywords-error"
        error={
          keywordsQuestion.missing === undefined
            ? null
            : errorText(new AppError("textNeedsLanguage", { field: t("language.field.keywords") }))
        }
      />
      <div class="edit-actions">
        <button type="submit" disabled={busy}>
          {t("deckAbout.saveButton")}
        </button>
        <button
          type="button"
          aria-label={t("deckAbout.cancelLabel")}
          onClick={() => {
            clear();
            keywordsQuestion.clear();
            setDraft(null);
          }}
          disabled={busy}
        >
          {t("deckAbout.cancelButton")}
        </button>
      </div>
    </form>
  );
}

/** Keywords as a field edits them: each language's keywords comma-separated. */
function joinedKeywords(keywords: LangTexts | undefined): Record<string, string> {
  return Object.fromEntries(
    Object.entries(keywords ?? {})
      .filter(([, list]) => list.length > 0)
      .map(([tag, list]) => [tag, list.join(", ")]),
  );
}

/**
 * The keywords a draft says, per language: each entry's keywords
 * (parseKeywords) under its language, an entry with none left out —
 * clearing one language's keywords leaves the others'. The entry,
 * instead, whose keywords need their language: one with none chosen yet,
 * or one of untagged keywords ("") that are not only some of those
 * `saved` has untagged, for the app asks the user rather than guess.
 */
function keywordsOfDraft(
  draft: LangTextDraft,
  saved: LangTexts | undefined,
): { keywords: LangTexts } | { missing: DraftEntry } {
  const keywords: Record<string, string[]> = {};
  const savedUntagged = saved?.[""] ?? [];
  for (const entry of draft) {
    const list = parseKeywords(entry.value);
    if (list.length === 0) continue;
    if (entry.tag === null || (entry.tag === "" && list.some((keyword) => !savedUntagged.includes(keyword)))) {
      return { missing: entry };
    }
    keywords[entry.tag] = list;
  }
  return { keywords };
}
