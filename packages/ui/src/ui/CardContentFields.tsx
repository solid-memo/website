import { useLayoutEffect, useRef } from "preact/hooks";
import { AppError } from "@solid-memo/domain/appError";
import { isMarkdown, validateCardContent, type CardContent, type CardTextPart } from "@solid-memo/domain/deck";
import type { DeckLanguages } from "@solid-memo/domain/deckLanguages";
import type { LangText } from "@solid-memo/domain/langText";
import { OPTION, PROSE, SIDE, type FieldRule } from "@solid-memo/markdown/problems";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { ErrorMessage } from "./ErrorMessage";
import { useI18n, type MessageKey } from "./i18n";
import {
  draftOf as textDraftOf,
  LangTextField,
  languageButtonId,
  rememberLanguages,
  textOfDraft,
  type DraftEntry,
  type LangTextDraft,
} from "./LangTextField";
import type { LanguageRole } from "./LanguagePicker";
import { CardPreview, MarkdownHelp, markdownHints, readsDifferently } from "./MarkdownEditing";
import { recentLanguages } from "./remembered";

/**
 * The fields of a card as typed: each text as LangTextField edits it, in
 * the languages the user states, and each picture's URL (empty when
 * unset). `touched` lists the texts the user changed, their words or
 * their language. `markdown` says whether the card's texts are written
 * in Markdown, as its toggle shows it; `readOtherwise`, the texts that
 * read otherwise as Markdown at the moment it was switched on.
 */
export interface CardDraft {
  front: LangTextDraft;
  back: LangTextDraft;
  frontImageUrl: string;
  frontImageDescription: LangTextDraft;
  frontNote: LangTextDraft;
  backImageUrl: string;
  backImageDescription: LangTextDraft;
  backLabel: LangTextDraft;
  backNote: LangTextDraft;
  touched: readonly CardTextPart[];
  markdown: boolean;
  readOtherwise: readonly SwitchedText[];
}

/**
 * A text as it was when Markdown was switched on: its part, its entry
 * (one language's text) and the words it had then.
 */
export interface SwitchedText {
  part: CardTextPart;
  id: number;
  value: string;
}

/**
 * Texts that take their language from the same evidence: the fronts, the
 * backs, and the user's own text (notes, the label, the pictures'
 * descriptions), which is in one language however many fields it fills.
 */
export type LanguageGroup = "front" | "back" | "own";

/** The language each group's new text starts in, where there is evidence of one. */
export type CardLanguageDefaults = Partial<Record<LanguageGroup, string>>;

/** What the forms offer of a deck's languages: a default per group, and the languages its pickers suggest first. */
export interface CardLanguageHints {
  defaults: CardLanguageDefaults;
  suggestions: Record<LanguageGroup, string[]>;
}

/** The card's texts, as the form shows them. */
const TEXT_PARTS: readonly CardTextPart[] = [
  "front",
  "frontImageDescription",
  "frontNote",
  "backLabel",
  "back",
  "backImageDescription",
  "backNote",
];

function groupOf(part: CardTextPart): LanguageGroup {
  return part === "front" || part === "back" ? part : "own";
}

const FIELD_IDS: Record<CardTextPart, string> = {
  front: "card-front",
  back: "card-back",
  frontImageDescription: "card-front-image-description",
  frontNote: "card-front-note",
  backImageDescription: "card-back-image-description",
  backLabel: "card-back-label",
  backNote: "card-back-note",
};

const ROLES: Record<CardTextPart, LanguageRole> = {
  front: "front",
  back: "back",
  frontImageDescription: "pictureDescription",
  frontNote: "frontNote",
  backImageDescription: "pictureDescription",
  backLabel: "backLabel",
  backNote: "backNote",
};

/** How an error names each text ("Choose the language of {field}."). */
const FIELD_NOUNS: Record<CardTextPart, MessageKey> = {
  front: "language.field.front",
  back: "language.field.back",
  frontImageDescription: "language.field.frontImageDescription",
  frontNote: "language.field.frontNote",
  backImageDescription: "language.field.backImageDescription",
  backLabel: "language.field.backLabel",
  backNote: "language.field.backNote",
};

/** The id of the form's validation error, shown under the fields. */
export const CARD_FIELDS_ERROR_ID = "card-fields-error";

/** The field each of validateCardContent's errors about no text of the card is about. */
const FIELD_OF_ERROR: Partial<Record<string, string>> = {
  cardFrontImageNotWebUrl: "card-front-image",
  cardBackImageNotWebUrl: "card-back-image",
  cardFrontEmpty: "card-front",
  cardBackEmpty: "card-back",
};

/**
 * Why a card's draft is refused: the error, the text it is about, if
 * any, and the entry of that text whose language is asked for, if it is.
 */
export interface CardFieldsError {
  error: AppError;
  part?: CardTextPart;
  entry?: DraftEntry;
}

/** The field an error is about: the text it names, else the field its code is about. */
function fieldOf(invalid: CardFieldsError): string | undefined {
  return invalid.part === undefined ? FIELD_OF_ERROR[invalid.error.code] : FIELD_IDS[invalid.part];
}

/**
 * What a deck's cards say of their languages (deckLanguages), as the
 * forms use it: the language new text of each group starts in — the one
 * the deck's cards usually have, and for the user's own text, failing
 * that, the one last chosen for it on this device — and the languages
 * each group's pickers suggest first: that one, then the deck name's.
 */
export function cardLanguageHints(languages: DeckLanguages, title: LangText): CardLanguageHints {
  const defaults: CardLanguageDefaults = {
    front: languages.front,
    back: languages.back,
    own: languages.own ?? recentLanguages("own")[0],
  };
  const suggest = (group: LanguageGroup) => [...(defaults[group] === undefined ? [] : [defaults[group]]), ...Object.keys(title)];
  return { defaults, suggestions: { front: suggest("front"), back: suggest("back"), own: suggest("own") } };
}

/** The texts that are Markdown in a card in Markdown: all but the pictures' descriptions, which are a picture's alt text. */
const MARKDOWN_PARTS: readonly CardTextPart[] = ["front", "frontNote", "backLabel", "back", "backNote"];

/**
 * The texts a textarea suits once the card is in Markdown: the sides and
 * the notes, which may hold blocks, and so are kept as typed for the
 * domain to tidy (their leading spaces may be a code block).
 */
const BLOCK_PARTS: readonly CardTextPart[] = ["front", "back", "frontNote", "backNote"];

/**
 * An empty draft whose texts each start in the language `tagOf` gives,
 * if any; plain text, as every new card starts, Markdown being its
 * writer's to switch on.
 */
function emptyDraft(tagOf: (part: CardTextPart) => string | undefined): CardDraft {
  const texts = Object.fromEntries(TEXT_PARTS.map((part) => [part, textDraftOf(undefined, [], { tag: tagOf(part) ?? null })]));
  return {
    ...(texts as Record<CardTextPart, LangTextDraft>),
    frontImageUrl: "",
    backImageUrl: "",
    touched: [],
    markdown: false,
    readOtherwise: [],
  };
}

/** A new card's draft: empty, each text in its group's default language, else in none yet. */
export function newDraft(defaults: CardLanguageDefaults): CardDraft {
  return emptyDraft((part) => defaults[groupOf(part)]);
}

/**
 * The next card's draft once one is added: empty, each text in the
 * language the added card's had (or was to have), so a run of cards
 * takes no choosing; else in its group's default. Plain text, as every
 * new card starts, whatever the added card was.
 */
export function nextDraft(draft: CardDraft, defaults: CardLanguageDefaults): CardDraft {
  return emptyDraft((part) => {
    const { tag } = draft[part][0]!;
    return tag === null || tag === "" ? defaults[groupOf(part)] : tag;
  });
}

/** Whether a text is empty and alone: no words, no translations. */
function isBlank(text: LangTextDraft): boolean {
  return text.length === 1 && text[0]!.value === "";
}

/**
 * The draft with each text the user has not touched, empty and in no
 * language yet or in its group's `previous` default, in its group's
 * default: the defaults may come once the deck's cards are read, and
 * what they say outranks the device's recent choice they stood on
 * before. The same draft when nothing changes.
 */
export function withDefaults(
  draft: CardDraft,
  defaults: CardLanguageDefaults,
  previous: CardLanguageDefaults = {},
): CardDraft {
  let next = draft;
  for (const part of TEXT_PARTS) {
    const group = groupOf(part);
    const tag = defaults[group];
    const current = draft[part][0]!.tag;
    const replaceable = current === null || current === previous[group];
    if (tag !== undefined && tag !== current && !draft.touched.includes(part) && isBlank(draft[part]) && replaceable) {
      next = { ...next, [part]: textDraftOf(undefined, [], { tag }) };
    }
  }
  return next;
}

/**
 * The draft to start editing an existing card from, for a reader who
 * prefers `readerLanguages`: each text as LangTextField shows it, an
 * empty one in its group's default language.
 */
export function draftOf(
  content: CardContent,
  readerLanguages: readonly string[],
  { defaults = {} }: { defaults?: CardLanguageDefaults } = {},
): CardDraft {
  const texts = Object.fromEntries(
    TEXT_PARTS.map((part) => [
      part,
      textDraftOf(content[part], readerLanguages, { tag: defaults[groupOf(part)] ?? null }),
    ]),
  );
  return {
    ...(texts as Record<CardTextPart, LangTextDraft>),
    frontImageUrl: content.frontImageUrl ?? "",
    backImageUrl: content.backImageUrl ?? "",
    touched: [],
    markdown: isMarkdown(content.textFormat),
    readOtherwise: [],
  };
}

/**
 * The text format a draft states for the card (`sm:textFormat`), against
 * the card `saved`, if any: Markdown switched on is `sm:markdown`, and
 * switched off on a card in Markdown `sm:plainText`, which says it was
 * switched off on purpose (a library upgrade keeps such a card as the
 * user has it). Otherwise none: the card keeps the format it has, absent
 * or one this app does not know, and a new card states none, which is
 * plain text.
 */
export function textFormatOfDraft(draft: CardDraft, saved?: CardContent): string | undefined {
  const was = isMarkdown(saved?.textFormat);
  if (draft.markdown === was) return undefined;
  return draft.markdown ? SM.markdown : SM.plainText;
}

/** Outcome of checking a card's draft: its content, validated, or why it is refused. */
export type CardDraftCheck = { ok: true; content: CardContent } | { ok: false; invalid: CardFieldsError };

/**
 * A draft switched to Markdown, or from it (`on`): on, it notes the
 * texts that read otherwise as Markdown at that moment (readsDifferently),
 * in every language, for the editor to say so while they stay as they
 * were; off, none.
 */
export function switchMarkdown(draft: CardDraft, on: boolean): CardDraft {
  const readOtherwise = on
    ? MARKDOWN_PARTS.flatMap((part) =>
        draft[part]
          .filter((entry) => readsDifferently(entry.value))
          .map(({ id, value }) => ({ part, id, value })),
      )
    : [];
  return { ...draft, markdown: on, readOtherwise };
}

/**
 * Where the texts that read otherwise as Markdown when it was switched
 * on (the draft's `readOtherwise`) still are as they were: in a main
 * text, which the preview shows; only in translations, which it does
 * not; or nowhere, once each is changed, or Markdown switched off.
 */
export function stillReadOtherwise(draft: CardDraft): "main" | "translation" | undefined {
  const unchanged = draft.readOtherwise.filter(({ part, id, value }) =>
    draft[part].some((entry) => entry.id === id && entry.value === value),
  );
  if (unchanged.some(({ part, id }) => draft[part][0]!.id === id)) return "main";
  return unchanged.length > 0 ? "translation" : undefined;
}

/**
 * The card content a draft says, validated (validateCardContent; `saved`
 * the card edited, if any, whose untagged sides may stay untouched),
 * with the text format it states (textFormatOfDraft). Text with no
 * language chosen is refused first, at the entry that needs one: the app
 * asks rather than guess. A picture's description counts only with a
 * picture to describe. The sides and notes are tidied by
 * validateCardContent alone, which keeps the spaces a Markdown text
 * starts with; the label and the descriptions, single lines that never
 * hold a block, are trimmed here.
 */
export function checkDraft(draft: CardDraft, saved?: CardContent): CardDraftCheck {
  const texts: Partial<Record<CardTextPart, LangText>> = {};
  for (const part of TEXT_PARTS) {
    if (part === "frontImageDescription" && draft.frontImageUrl.trim() === "") continue;
    if (part === "backImageDescription" && draft.backImageUrl.trim() === "") continue;
    const result = textOfDraft(draft[part], { trim: !BLOCK_PARTS.includes(part) });
    if ("missing" in result) {
      return { ok: false, invalid: { error: new AppError("textNeedsLanguage", { field: part }), part, entry: result.missing } };
    }
    texts[part] = result.text;
  }
  const textFormat = textFormatOfDraft(draft, saved);
  const validation = validateCardContent(
    {
      ...texts,
      front: texts.front!,
      back: texts.back!,
      frontImageUrl: draft.frontImageUrl,
      backImageUrl: draft.backImageUrl,
      ...(textFormat === undefined ? {} : { textFormat }),
    },
    saved,
  );
  if (validation.ok) return validation;
  const { error, part } = validation;
  if (part === undefined) return { ok: false, invalid: { error } };
  return { ok: false, invalid: { error, part, entry: draft[part].find((entry) => entry.tag === "") } };
}

/** Notes the languages of the user's own text a saved card states, as this device's latest choices for it. */
export function rememberCardLanguages(content: CardContent, draft: CardDraft): void {
  for (const part of TEXT_PARTS) {
    if (groupOf(part) === "own") rememberLanguages("own", content[part] ?? {}, draft[part]);
  }
}

/**
 * Whether a saved text has a line break in any of its languages, a line
 * feed or a carriage return alone: its field is then a textarea, which
 * keeps the breaks a single-line field would drop as the text is saved
 * again.
 */
function hasLineBreak(text: LangText | undefined): boolean {
  return Object.values(text ?? {}).some((value) => /[\r\n]/.test(value));
}

/** The form's message for an error in its draft, under CARD_FIELDS_ERROR_ID; the text it names named in this language. */
export function CardFieldsErrorMessage({ invalid }: { invalid: CardFieldsError | null }) {
  const { t, errorText } = useI18n();
  const error =
    invalid?.part !== undefined && invalid.error.code === "textNeedsLanguage"
      ? new AppError("textNeedsLanguage", { field: t(FIELD_NOUNS[invalid.part]) })
      : invalid?.error;
  return <ErrorMessage id={CARD_FIELDS_ERROR_ID} error={errorText(error)} />;
}

/**
 * Text, picture, picture description and note fields for both sides of
 * a card and the back's label, shared by the card creator and the card
 * page, each text in the languages the user states (LangTextField).
 * Nothing is `required`: a side may be a picture only, so a hint ahead of
 * the fields says what a side needs, and it is checked on submit
 * (checkDraft), its message shown by the form under CARD_FIELDS_ERROR_ID,
 * which describes the field it is about; for a language still to choose,
 * that text's picker, which takes the focus.
 *
 * Choosing the language of an empty text chooses it for the empty texts
 * of its group the user has not touched: a card's notes and label are
 * mostly in one language.
 *
 * A text `saved` with a line break, in any language, is edited in a
 * textarea, so the break is kept: a single-line field would drop it.
 * That holds for every text, the label and the picture descriptions
 * included, so editing never drops a break. It is what was saved that
 * decides, not the draft, and a field once a textarea stays one, so it
 * stays what it is (focus and all) while the user types and saves.
 *
 * "Format with Markdown" (the draft's `markdown`; off for a new card)
 * says the card's texts are Markdown (docs/markdown.md). On, the sides
 * and notes are textareas too, for Markdown's blocks take lines; each
 * text in Markdown, each language's, is hinted at under it where it
 * would not show as meant (markdownHints), never refused; a cheat sheet sits under the toggle,
 * and a preview of the card as it will be studied under the fields
 * (CardPreview). Switched on over text that reads otherwise as Markdown,
 * a status under the toggle says so, while that text is unchanged
 * (switchMarkdown); not of Markdown typed afterwards, which is meant. The label and the pictures' descriptions stay single
 * lines: a label is one line in study, and a description is plain text.
 */
export function CardContentFields({
  draft,
  saved,
  busy,
  invalid = null,
  suggestions,
  arrival,
  onChange,
}: {
  draft: CardDraft;
  /** The card edited, if any. */
  saved?: CardContent;
  busy: boolean;
  /** Why the draft was refused, if it was: its field is marked invalid and described by it. */
  invalid?: CardFieldsError | null;
  suggestions: Record<LanguageGroup, string[]>;
  /** The text the screen was opened at (a link to it): where the user arrives. */
  arrival?: CardTextPart;
  onChange: (draft: CardDraft) => void;
}) {
  const { t } = useI18n();
  const invalidField = invalid === null ? undefined : fieldOf(invalid);
  const languageError = invalid?.entry !== undefined;
  /** The texts edited in a textarea: once one, always one in this editor. */
  const multiline = useRef(new Set<CardTextPart>());
  for (const part of TEXT_PARTS) if (hasLineBreak(saved?.[part])) multiline.current.add(part);
  if (draft.markdown) for (const part of BLOCK_PARTS) multiline.current.add(part);
  /** How a text in Markdown is held: the back is an option when the card has wrong options to show it among. */
  const ruleOf = (part: CardTextPart): FieldRule =>
    part === "frontNote" || part === "backNote"
      ? PROSE
      : part === "back" && (saved?.distractors?.length ?? 0) > 0
        ? OPTION
        : SIDE;
  /** Text there was when Markdown was switched on, and that reads otherwise as Markdown; not once the card is saved so. */
  const readOtherwise = isMarkdown(saved?.textFormat) ? undefined : stillReadOtherwise(draft);

  // A language asked for: its picker takes the focus, saying so.
  useLayoutEffect(() => {
    if (invalid?.part === undefined || invalid.entry === undefined) return;
    document.getElementById(languageButtonId(FIELD_IDS[invalid.part], invalid.entry))?.focus();
  }, [invalid]);

  function changeText(part: CardTextPart, text: LangTextDraft) {
    const touched = draft.touched.includes(part) ? draft.touched : [...draft.touched, part];
    let next: CardDraft = { ...draft, [part]: text, touched };
    const { tag } = text[0]!;
    if (isBlank(draft[part]) && isBlank(text) && tag !== null && tag !== draft[part][0]!.tag) {
      for (const other of TEXT_PARTS) {
        if (other !== part && groupOf(other) === groupOf(part) && !touched.includes(other) && isBlank(next[other])) {
          next = { ...next, [other]: textDraftOf(undefined, [], { tag }) };
        }
      }
    }
    onChange(next);
  }

  /**
   * A text's field, described by its hints, and by the form's message
   * when that is about its text; `hint` (its id and text) is shown under
   * its text.
   */
  const textField = (part: CardTextPart, label: string, hintIds: string[], hint?: { id: string; text: string }) => {
    const id = FIELD_IDS[part];
    const textInvalid = id === invalidField && !languageError;
    const inMarkdown = draft.markdown && MARKDOWN_PARTS.includes(part);
    return (
      <LangTextField
        id={id}
        label={label}
        role={ROLES[part]}
        draft={draft[part]}
        suggestions={suggestions[groupOf(part)]}
        multiline={multiline.current.has(part)}
        placeholder={
          part === "front"
            ? t("cardContentFields.frontPlaceholder")
            : part === "back"
              ? t("cardContentFields.backPlaceholder")
              : undefined
        }
        disabled={busy}
        invalid={textInvalid}
        describedBy={[
          ...(textInvalid ? [CARD_FIELDS_ERROR_ID] : []),
          ...hintIds,
          ...(hint ? [hint.id] : []),
        ].join(" ")}
        hint={
          hint && (
            <p id={hint.id} class="hint field-hint">
              {hint.text}
            </p>
          )
        }
        entryHints={inMarkdown ? (entry) => markdownHints(entry.value, ruleOf(part), t) : undefined}
        missing={invalid?.part === part ? invalid.entry : undefined}
        errorId={CARD_FIELDS_ERROR_ID}
        arrival={part === arrival}
        onChange={(text) => changeText(part, text)}
      />
    );
  };
  const image = (id: string, key: "frontImageUrl" | "backImageUrl") => ({
    id,
    type: "url" as const,
    placeholder: t("cardContentFields.imagePlaceholder"),
    value: draft[key],
    onInput: (e: { currentTarget: { value: string } }) => onChange({ ...draft, [key]: e.currentTarget.value }),
    disabled: busy,
    "aria-invalid": id === invalidField,
    "aria-describedby": id === invalidField ? CARD_FIELDS_ERROR_ID : undefined,
  });
  return (
    <>
      <p id="card-sides-hint" class="hint">
        {t("cardContentFields.sidesHint")}
      </p>
      <div class="markdown-toggle">
        <label>
          <input
            type="checkbox"
            checked={draft.markdown}
            onChange={(e) => onChange(switchMarkdown(draft, e.currentTarget.checked))}
            aria-describedby={readOtherwise ? "card-markdown-hint card-markdown-differs" : "card-markdown-hint"}
            disabled={busy}
          />
          {t("cardContentFields.markdown")}
        </label>
        <p id="card-markdown-hint" class="hint field-hint">
          {t("cardContentFields.markdownHint")}
        </p>
        <div role="status">
          {readOtherwise && (
            <p id="card-markdown-differs" class="hint field-hint">
              {t(readOtherwise === "main" ? "cardContentFields.markdownDiffers" : "cardContentFields.markdownDiffersTranslation")}
            </p>
          )}
        </div>
        {draft.markdown && <MarkdownHelp />}
      </div>
      {textField("front", t("cardContentFields.front"), ["card-sides-hint"])}
      <label for="card-front-image">{t("cardContentFields.frontImage")}</label>
      <input {...image("card-front-image", "frontImageUrl")} />
      {textField("frontImageDescription", t("cardContentFields.frontImageDescription"), [], {
        id: "card-front-image-description-hint",
        text: t("cardContentFields.imageDescriptionHint"),
      })}
      {textField("frontNote", t("cardContentFields.frontNote"), [], {
        id: "card-front-note-hint",
        text: t("cardContentFields.frontNoteHint"),
      })}
      {textField("backLabel", t("cardContentFields.backLabel"), [], {
        id: "card-back-label-hint",
        text: t("cardContentFields.backLabelHint"),
      })}
      {textField("back", t("cardContentFields.back"), ["card-sides-hint"])}
      <label for="card-back-image">{t("cardContentFields.backImage")}</label>
      <input {...image("card-back-image", "backImageUrl")} />
      {textField("backImageDescription", t("cardContentFields.backImageDescription"), [], {
        id: "card-back-image-description-hint",
        text: t("cardContentFields.imageDescriptionHint"),
      })}
      {textField("backNote", t("cardContentFields.backNote"), [], {
        id: "card-back-note-hint",
        text: t("cardContentFields.backNoteHint"),
      })}
      {draft.markdown && (
        <CardPreview
          front={draft.front}
          back={draft.back}
          frontNote={draft.frontNote}
          backLabel={draft.backLabel}
          backNote={draft.backNote}
          textFormat={SM.markdown}
          asOption={ruleOf("back") === OPTION}
        />
      )}
    </>
  );
}
