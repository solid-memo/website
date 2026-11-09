// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook, screen } from "@testing-library/preact";
import { MAX_CHARS, MAX_DEPTH, MAX_TABLE_COLUMNS } from "@solid-memo/markdown/parse";
import { OPTION, PROSE, SIDE } from "@solid-memo/markdown/problems";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { createI18n, I18nProvider } from "./i18n";
import type { LangTextDraft } from "./LangTextField";
import {
  CardPreview,
  MarkdownHelp,
  markdownHints,
  readsDifferently,
  useEntryHints,
} from "./MarkdownEditing";

const checks = vi.hoisted(() => ({ count: 0 }));

vi.mock("@solid-memo/markdown/problems", async (original) => {
  const real = await original<typeof import("@solid-memo/markdown/problems")>();
  return {
    ...real,
    markdownProblems: (...args: Parameters<typeof real.markdownProblems>) => {
      checks.count++;
      return real.markdownProblems(...args);
    },
  };
});

afterEach(() => vi.restoreAllMocks());

const { t } = createI18n("en");

/** A text's draft of these values, the first the main one, each in English but the first. */
function draftOf(...values: string[]): LangTextDraft {
  return values.map((value, id) => ({ id, value, tag: id === 0 ? "en" : `x-${id}` }));
}

describe("useEntryHints", () => {
  const entries = draftOf(...Array.from({ length: 501 }, (_, i) => `*text* ${i}`));

  it("checks each entry once, however many there are, and again once its text changes", () => {
    const { result } = renderHook(() => useEntryHints());
    const hints = result.current("field", SIDE);
    for (const entry of entries) expect(hints(entry)).toEqual([]);
    checks.count = 0;
    for (const entry of entries) hints(entry);
    expect(checks.count).toBe(0);
    expect(hints({ ...entries[3]!, value: "---" })).toEqual(["This shows no text as Markdown."]);
    expect(checks.count).toBe(1);
  });

  it("keeps a field's entries apart from another's, and checks an entry anew under another rule", () => {
    const { result } = renderHook(() => useEntryHints());
    const entry = { id: 0, value: "<b>raw</b> one", tag: "en" };
    const other = { id: 0, value: "plain two", tag: "en" };
    const hinted = result.current("one", SIDE)(entry);
    expect(hinted).not.toEqual([]);
    expect(result.current("two", SIDE)(other)).toEqual([]);
    expect(result.current("one", SIDE)(entry)).toBe(hinted);
    expect(result.current("one", OPTION)(entry)).not.toBe(hinted);
  });

  it("says its hints in the language spoken now", () => {
    let locale: "en" | "sv" = "en";
    const { result, rerender } = renderHook(() => useEntryHints(), {
      wrapper: ({ children }) => <I18nProvider locale={locale}>{children}</I18nProvider>,
    });
    const entry = { id: 0, value: "---", tag: "en" };
    expect(result.current("field", SIDE)(entry)).toEqual(["This shows no text as Markdown."]);
    locale = "sv";
    rerender();
    expect(result.current("field", SIDE)(entry)).not.toEqual(["This shows no text as Markdown."]);
  });
});

describe("markdownHints", () => {
  it("says nothing of Markdown that shows as meant, or of no text", () => {
    expect(markdownHints("Run `git diff`:\n\n```sh\ngit diff\n```", SIDE, t)).toEqual([]);
    expect(markdownHints("", SIDE, t)).toEqual([]);
    expect(markdownHints("  ", SIDE, t)).toEqual([]);
  });

  it("names each problem as a hint, each hint once", () => {
    expect(markdownHints("&aring; <url> <url>", SIDE, t)).toEqual([
      "&aring; shows as the character it names. Write \\&aring; to show it as typed.",
      "HTML such as <url> shows as typed. Put it in backticks to show it as code.",
    ]);
  });

  it("says when a text shows nothing, all marks", () => {
    expect(markdownHints("---", SIDE, t)).toEqual(["This shows no text as Markdown."]);
  });

  it("words every problem markdownProblems names", () => {
    const hint = (text: string, rule = PROSE) => markdownHints(text, rule, t);
    expect(hint(`a${"b".repeat(MAX_CHARS)}`)).toEqual([
      `Too long to read as Markdown (${(MAX_CHARS + 1).toLocaleString("en")} characters): it shows as plain text.`,
    ]);
    expect(hint(`a\n${">>>>\na\n".repeat(400)}`)).toEqual([
      "Too complex to read as Markdown: it shows as plain text.",
    ]);
    expect(hint(`${"> ".repeat(MAX_DEPTH)}*a*`)).toEqual([
      "Nested too deeply: the innermost part shows as typed.",
    ]);
    expect(
      hint(`|${" a |".repeat(MAX_TABLE_COLUMNS + 1)}\n|${"-|".repeat(MAX_TABLE_COLUMNS + 1)}`),
    ).toEqual(["A table this large shows as typed: at most 20 columns and 2,000 cells."]);
    expect(hint("a ![b](https://b.example/b.png)")).toEqual([
      "Pictures in Markdown are not shown, only their description: add one with the side's picture field.",
    ]);
    expect(hint("[a](https://a.example/)", SIDE)).toEqual([
      "No links here, where they would be in the way of studying: [a](https://a.example/) shows as its text. Put a link in a note.",
    ]);
    expect(hint('"<ex:title>"', SIDE)).toEqual([
      "<ex:title> reads as a link, shown without its angle brackets. Put it in backticks to show it as typed.",
    ]);
    expect(hint("[a](http://a.example/)")).toEqual([
      "Only https links are followed: http://a.example/ shows as text.",
    ]);
    expect(hint("[bank.example](https://evil.example/)")).toEqual([
      'The link text "bank.example" names another site than the one it leads to, evil.example.',
    ]);
    expect(hint("`a‮b​c`")).toEqual([
      "Hidden characters in code or a link show as markers: ⟨U+202E⟩ ⟨U+200B⟩.",
    ]);
    expect(hint("a\n\nb", OPTION)).toEqual([
      "This card's back is one of the options of a question: keep it to one paragraph, as the others are.",
    ]);
    expect(hint("a\n---")).toEqual([
      "A line with --- right under it shows as a heading. For a line across instead, leave a blank line before the ---; for a heading, start the line with ##.",
    ]);
  });
});

describe("readsDifferently", () => {
  it("tells text Markdown reads otherwise from text it shows as typed", () => {
    for (const same of ["M87* ln|x|", "a\nb", "", "  "]) expect(readsDifferently(same)).toBe(false);
    for (const other of ["**bold**", "2. place"]) expect(readsDifferently(other)).toBe(true);
  });
});

describe("MarkdownHelp", () => {
  it("is a closed disclosure of what to type, as code, and what it gives", () => {
    const { container } = render(<MarkdownHelp />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Formatting help").tagName).toBe("SUMMARY");
    const rows = [...container.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(10);
    expect(rows[0]!.querySelector("code")).toHaveTextContent("*emphasis*");
    expect(rows[0]!.querySelector("code")).toHaveAttribute("translate", "no");
    expect(rows[3]!.querySelector("code")!.textContent).toBe("```\ncode\n```");
    expect(rows[3]).toHaveTextContent("a block of code, its lines as typed");
    expect(screen.getByRole("columnheader", { name: "Type" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Gives" })).toBeInTheDocument();
  });
});

describe("CardPreview", () => {
  const empty = draftOf("");
  const preview = (overrides: Partial<Parameters<typeof CardPreview>[0]> = {}) =>
    render(
      <CardPreview
        front={draftOf("Which command shows **staged** changes?", "unused")}
        back={draftOf("`git diff --staged`")}
        frontLabel={empty}
        frontNote={empty}
        backLabel={empty}
        backNote={draftOf("- a\n- b")}
        textFormat={SM.markdown}
        asOption={false}
        {...overrides}
      />,
    );

  it("shows the main texts as the card will show them, open on a wide screen", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { container } = preview();
    expect(container.querySelector("details.card-preview")).toHaveAttribute("open");
    expect(container.querySelector(".card-front strong")).toHaveTextContent("staged");
    expect(container.querySelector(".card-front")).not.toHaveTextContent("unused");
    expect(container.querySelector(".card-back p code")).toHaveTextContent("git diff --staged");
    expect(container.querySelectorAll(".card-back .card-note li")).toHaveLength(2);
    expect(container.querySelector(".card-label")).toBeNull();
    expect(container.querySelector(".card-preview-option")).toBeNull();
  });

  it("starts closed on a narrow screen, and opens as asked", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    const { container } = preview();
    const details = container.querySelector("details")!;
    expect(details).not.toHaveAttribute("open");
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(details).toHaveAttribute("open");
  });

  it("shows text with no language yet, and the back as an option when the card is asked as one", () => {
    const { container } = preview({
      front: [{ id: 0, value: "*Which?*", tag: null }],
      backLabel: draftOf("Command"),
      asOption: true,
    });
    expect(container.querySelector(".card-front em")).toHaveTextContent("Which?");
    expect(container.querySelector(".card-label")).toHaveTextContent("Command");
    expect(container.querySelector(".card-preview-option")).toHaveTextContent(
      "As an option: git diff --staged",
    );
  });

  it("shows no option for a back with no text", () => {
    const { container } = preview({ back: empty, asOption: true });
    expect(container.querySelector(".card-preview-option")).toBeNull();
  });
});
