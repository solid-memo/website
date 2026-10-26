// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type ProseRule, proseProblems, readProseRules } from "./prose.ts";

const FILLER: ProseRule = {
  check: "words",
  id: "filler",
  message: "cut it",
  terms: ["just", "in order to"],
};

/** The problems' lines and messages, as `line: what (rule)`. */
function found(source: string, rules: readonly ProseRule[], kind = "reference" as const) {
  return proseProblems(source, kind, rules).map(
    ({ line, rule, what }) => `${line}: ${what} (${rule})`,
  );
}

describe("readProseRules", () => {
  it("reads the rules in prose.json", () => {
    const text = readFileSync(new URL("../../../prose.json", import.meta.url), "utf8");
    expect(readProseRules(text).length).toBeGreaterThan(0);
  });

  it("says what is wrong with a rule", () => {
    const wrong = (rule: unknown) => () => readProseRules(JSON.stringify({ rules: [rule] }));
    expect(() => readProseRules("{}")).toThrow("prose.json has no list of rules");
    expect(wrong({ check: "words" })).toThrow("a rule needs an id and a message");
    expect(wrong({ id: "a", message: "m", check: "spell" })).toThrow(
      "a: check is not one of words, pattern, sentence, linkText, linkOnce",
    );
    expect(wrong({ ...FILLER, kinds: ["guide"] })).toThrow("filler: kinds are not page kinds");
    expect(wrong({ ...FILLER, kinds: "reference" })).toThrow("filler: kinds are not page kinds");
    expect(wrong({ ...FILLER, terms: "just" })).toThrow("filler: terms are not a list of words");
    expect(wrong({ ...FILLER, terms: null })).toThrow("filler: terms are not a list of words");
    expect(wrong({ ...FILLER, terms: { a: 1 } })).toThrow("filler: terms are not a list of words");
    expect(wrong({ id: "l", message: "m", check: "linkText", terms: { a: "b" } })).toThrow(
      "l: terms are not a list of words",
    );
    expect(wrong({ id: "p", message: "m", check: "pattern" })).toThrow(
      "p: a pattern rule needs a pattern",
    );
    expect(wrong({ id: "s", message: "m", check: "sentence", maxWords: "40" })).toThrow(
      "s: a sentence rule needs maxWords, a whole number",
    );
  });

  it("takes each kind of rule", () => {
    const rules = [
      { ...FILLER, kinds: ["reference"], perSection: 1 },
      { ...FILLER, terms: { "do not": "don't" } },
      { id: "p", message: "m", check: "pattern", pattern: "!" },
      { id: "s", message: "m", check: "sentence", maxWords: 40 },
      { id: "t", message: "m", check: "linkText", terms: ["here"] },
      { id: "o", message: "m", check: "linkOnce" },
    ];
    expect(readProseRules(JSON.stringify({ rules }))).toEqual(rules);
  });
});

describe("proseProblems", () => {
  it("finds a word in any case, at its line, whole words only", () => {
    const page = "# Page\n\nIt runs, adjusting.\nJust once, in\norder to see.\n";
    expect(found(page, [FILLER])).toEqual([
      '4: "Just": cut it (filler)',
      '4: "in order to": cut it (filler)',
    ]);
  });

  it("suggests what to write instead", () => {
    const rule: ProseRule = { ...FILLER, terms: { "do not": "don't" } };
    expect(found("# Page\n\nIt does not, so do not.\n", [rule])).toEqual([
      '3: "do not": write "don\'t"; cut it (filler)',
    ]);
  });

  it("reads lists, quotes and tables, and leaves out code, quoted text and headings", () => {
    const page = [
      "# Just a heading",
      "",
      "- an item, just so",
      "  - a nested one, `just` code",
      "",
      "> quoted, just here",
      "",
      'It says "just wait" and “just so”, and',
      '"just',
      'again".',
      "",
      "```",
      "just code",
      "```",
      "",
      "---",
      "",
      "| Word | Note |",
      "|---|---|",
      "| `x` | just one |",
      "| | |",
      "",
    ].join("\n");
    expect(found(page, [FILLER])).toEqual([
      '3: "just": cut it (filler)',
      '6: "just": cut it (filler)',
      '20: "just": cut it (filler)',
    ]);
  });

  it("allows a word a number of times a section", () => {
    const rule: ProseRule = { ...FILLER, terms: ["also"], perSection: 1 };
    const page = "# Page\n\nIt also runs. It also stops.\n\n## Next\n\nIt also waits.\n";
    expect(found(page, [rule])).toEqual(['3: "also": cut it (filler)']);
  });

  it("applies a rule to the kinds it names", () => {
    const rule: ProseRule = { ...FILLER, terms: ["you"], kinds: ["reference"] };
    expect(found("# Page\n\nThen you’re done, you see.\n", [rule])).toEqual([
      '3: "you": cut it (filler)',
    ]);
    expect(proseProblems("# Page\n\nThen you see.\n", "tutorial", [rule])).toEqual([]);
  });

  it("matches a pattern outside quotes and code", () => {
    const rule: ProseRule = {
      check: "pattern",
      id: "dash",
      message: "space it",
      pattern: "\\S—|—\\S",
    };
    expect(found('# Page\n\nOne — two, three—four, "five—six", `a—b`.\n', [rule])).toEqual([
      '3: "e—": space it (dash)',
    ]);
  });

  it("counts a sentence's words, a code span as one, and splits at each stop", () => {
    const rule: ProseRule = { check: "sentence", id: "long", message: "split it", maxWords: 4 };
    const page = [
      "# Page",
      "",
      "One two three four. One two three",
      "four five. `a b c` runs here now. (Five words in a row.) node-solid-server",
      "reads it. [one](a.md) two.",
      "",
      "| one two three four five six |",
      "|---|",
      "",
    ].join("\n");
    expect(found(page, [rule])).toEqual([
      "3: a sentence of 5 words, over 4: split it (long)",
      "4: a sentence of 5 words, over 4: split it (long)",
    ]);
  });

  it("finds a link whose text doesn't say where it leads", () => {
    const rule: ProseRule = {
      check: "linkText",
      id: "text",
      message: "say where",
      terms: ["here"],
    };
    expect(found("# Page\n\nSee [the guide](a.md), or\n[Here.](b.md)\n", [rule])).toEqual([
      '4: a link that says "Here.": say where (text)',
    ]);
  });

  it("finds an address linked twice in a section", () => {
    const rule: ProseRule = { check: "linkOnce", id: "once", message: "once" };
    const page = [
      "# Page",
      "",
      "[a](a.md) and [b](b.md), then",
      "[*a*](a.md) again.",
      "",
      "## Next",
      "",
      "[a](a.md) once here.",
      "",
    ].join("\n");
    expect(found(page, [rule])).toEqual(["4: a.md is linked again in this section: once (once)"]);
  });

  it("puts a unit it can't find at the line of the one before", () => {
    const page = "# Page\n\nFirst line.\n\n&amp; just\n";
    expect(found(page, [FILLER])).toEqual(['3: "just": cut it (filler)']);
  });

  it("sorts the problems by line, and reads a line break", () => {
    const rule: ProseRule = { check: "pattern", id: "bang", message: "no", pattern: "!" };
    expect(found("# Page\n\nOne!\\\nJust two\n", [rule, FILLER])).toEqual([
      '3: "!": no (bang)',
      '4: "Just": cut it (filler)',
    ]);
  });
});
