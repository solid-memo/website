import { useState } from "preact/hooks";
import type { LangText } from "@solid-memo/domain/langText";
import { plainText } from "@solid-memo/markdown/plainText";
import { markdownProblems, type FieldRule, type MarkdownProblem } from "@solid-memo/markdown/problems";
import { CardFace } from "./CardFace";
import { DataLine } from "./DataText";
import { useI18n, type I18n, type MessageKey } from "./i18n";
import type { LangTextDraft } from "./LangTextField";

export type { MarkdownProblem };

/** The width from which the card editor's preview starts open: narrower, it starts as a closed disclosure. */
export const WIDE_EDITOR = "(min-width: 34rem)";

/** White space collapsed, for comparing what text says rather than how it is laid out. */
function collapsed(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Whether a text, typed as plain text, would read otherwise as Markdown
 * (`M87*` would not, `**bold**` would): what switching Markdown on
 * changes in it.
 */
export function readsDifferently(value: string): boolean {
  return collapsed(plainText(value)) !== collapsed(value);
}

/**
 * The hints for one text written in Markdown, one language's, in a field
 * held to `rule` (markdownProblems), in this language: what would not
 * show as its writer means, each hint once; and that it shows no text at
 * all, when it holds only marks (a rule alone). None for a text with no
 * words. Hints, never a reason to refuse the card: a user's own card may
 * hold anything.
 */
export function markdownHints(value: string, rule: FieldRule, t: I18n["t"]): string[] {
  if (value.trim() === "") return [];
  const hints = new Set(markdownProblems(value, rule).map((problem) => problemText(problem, t)));
  if (plainText(value).trim() === "") hints.add(t("markdownProblem.noText"));
  return [...hints];
}

/** A problem of Markdown text (markdownProblems) as a hint to its writer. */
export function problemText(problem: MarkdownProblem, t: I18n["t"]): string {
  switch (problem.code) {
    case "tooLong":
      return t("markdownProblem.tooLong", { length: problem.length });
    case "tooComplex":
      return t("markdownProblem.tooComplex");
    case "tooDeep":
      return t("markdownProblem.tooDeep");
    case "largeTable":
      return t("markdownProblem.largeTable");
    case "html":
      return t("markdownProblem.html", { source: problem.source });
    case "image":
      return t("markdownProblem.image");
    case "link":
      return problem.autolink
        ? t("markdownProblem.autolink", { source: problem.source })
        : t("markdownProblem.link", { source: problem.source });
    case "linkNotFollowed":
      return t("markdownProblem.linkNotFollowed", { url: problem.url });
    case "linkHost":
      return t("markdownProblem.linkHost", { text: problem.text, host: problem.host });
    case "hiddenControl":
      return t("markdownProblem.hiddenControl", { controls: problem.controls.join(" ") });
    case "characterReference":
      return t("markdownProblem.characterReference", { source: problem.source });
    case "notOneParagraph":
      return t("markdownProblem.notOneParagraph");
    case "dashHeading":
      return t("markdownProblem.dashHeading");
  }
}

/** One line of the formatting help: what to type, and what it gives. */
const HELP: readonly { write: string; gives: MessageKey }[] = [
  { write: "*emphasis*", gives: "markdownHelp.emphasis" },
  { write: "**strong**", gives: "markdownHelp.strong" },
  { write: "`code`", gives: "markdownHelp.code" },
  { write: "```\ncode\n```", gives: "markdownHelp.codeBlock" },
  { write: "- item\n- item", gives: "markdownHelp.list" },
  { write: "1. first\n2. second", gives: "markdownHelp.numbered" },
  { write: "> quoted", gives: "markdownHelp.quote" },
  { write: "| a | b |\n|---|---|\n| 1 | 2 |", gives: "markdownHelp.table" },
  { write: "[text](https://…)", gives: "markdownHelp.link" },
  { write: "\\*", gives: "markdownHelp.escape" },
];

/**
 * A cheat sheet of the Markdown a card may be written in, behind a
 * disclosure: what to type, as code, and what it gives. No toolbar: the
 * syntax is typed, as anywhere else Markdown is written.
 */
export function MarkdownHelp() {
  const { t } = useI18n();
  return (
    <details class="markdown-help">
      <summary>{t("markdownHelp.summary")}</summary>
      <p>{t("markdownHelp.intro")}</p>
      <table>
        <thead>
          <tr>
            <th scope="col">{t("markdownHelp.write")}</th>
            <th scope="col">{t("markdownHelp.gives")}</th>
          </tr>
        </thead>
        <tbody>
          {HELP.map(({ write, gives }) => (
            <tr key={write}>
              <td>
                <pre>
                  <code translate={false}>{write}</code>
                </pre>
              </td>
              <td>{t(gives)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** The text of a draft the preview shows: its main entry, in its language (none yet: untagged), when it has words. */
function previewText(draft: LangTextDraft): LangText | undefined {
  const { value, tag } = draft[0]!;
  return value.trim() === "" ? undefined : { [tag ?? ""]: value };
}

/** Whether the preview starts open: on a wide screen. */
function startsOpen(): boolean {
  return matchMedia(WIDE_EDITOR).matches;
}

/**
 * A card being written in Markdown as it looks in study (CardFace), as
 * the user types: each text's main entry, the one they are writing,
 * shown as the card will show it. Pictures are left out, so a URL half
 * typed is never fetched. A card asked as a multiple-choice question
 * (`asOption`, it has wrong options) also shows its back as an option
 * shows it, on one line. A disclosure, open from the start on a wide
 * screen and closed on a narrow one, where it would push the form away.
 */
export function CardPreview({
  front,
  back,
  frontNote,
  backLabel,
  backNote,
  textFormat,
  asOption,
}: {
  front: LangTextDraft;
  back: LangTextDraft;
  frontNote: LangTextDraft;
  backLabel: LangTextDraft;
  backNote: LangTextDraft;
  textFormat: string;
  asOption: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(startsOpen);
  const backText = previewText(back);
  return (
    <details
      class="card-preview"
      open={open}
      onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{t("cardContentFields.preview")}</summary>
      <div class="practice-card">
        <CardFace side="front" text={previewText(front) ?? {}} note={previewText(frontNote)} textFormat={textFormat} />
        <CardFace
          side="back"
          text={backText ?? {}}
          label={previewText(backLabel)}
          note={previewText(backNote)}
          textFormat={textFormat}
        />
      </div>
      {asOption && backText !== undefined && (
        <p class="card-preview-option">
          <span class="card-preview-option-name">{t("cardContentFields.previewOption")}</span>{" "}
          <DataLine text={backText} markdown />
        </p>
      )}
    </details>
  );
}
