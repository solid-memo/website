import { describe, expect, it } from "vitest";
import { MAX_CHARS } from "./parse";
import { LABEL_PREFIX, labelText, plainText } from "./plainText";

describe("plainText", () => {
  it("keeps code, drops marks, and shows a link as its text and a picture as its alt", () => {
    expect(plainText("Run `git diff --staged`, *then* **commit** ([docs](https://x.example)) ![a cat](c.png)")).toBe(
      "Run git diff --staged, then commit (docs) a cat",
    );
  });

  it("puts blocks and hard breaks on lines of their own, list items joined by '; ' and table cells by ' | '", () => {
    expect(
      plainText(
        "# Title\n\npara  \nnext\n\n```sh\nls -l\n```\n\n- a\n- b\n\n  more b\n\n> quoted\n\n---\n\n| h | i |\n|-|-|\n| 1 | 2 |",
      ),
    ).toBe("Title\npara\nnext\nls -l\na; b more b\nquoted\nh | i\n1 | 2");
  });

  it("returns a text above MAX_CHARS as it is", () => {
    const long = `*${"a".repeat(MAX_CHARS)}*`;
    expect(plainText(long)).toBe(long);
  });
});

describe("labelText", () => {
  it("is the plain text of the first block, its white space collapsed", () => {
    expect(labelText("Which command shows **staged**\nchanges?\n\n```\ngit diff\n```")).toBe(
      "Which command shows staged changes?",
    );
    expect(labelText("```sh\ngit   diff\n--staged\n```")).toBe("git diff --staged");
    expect(labelText("- a\n- b\n\n- c")).toBe("a; b");
  });

  it("skips blank lines before the text", () => {
    expect(labelText("\n  \r\n\nfirst\r\n\r\nsecond")).toBe("first");
  });

  it("is empty for text that shows nothing", () => {
    expect(labelText("")).toBe("");
    expect(labelText("[r]: https://x.example")).toBe("");
    expect(labelText("---\n\n* * *\n\n  ")).toBe("");
  });

  it("is the first block that shows text, past a rule", () => {
    expect(labelText("---\nWhat is X?")).toBe("What is X?");
    expect(labelText("* * *\n\n[r]: https://x.example\n\nQuestion\n\nmore")).toBe("Question");
  });

  it("reads no further than LABEL_PREFIX characters looking for text", () => {
    expect(labelText(`${"---\n\n".repeat(LABEL_PREFIX / 4)}late`)).toBe("");
  });

  it("cuts at a word, after the marks are gone, to at most max characters", () => {
    expect(labelText("**one** two three four", 12)).toBe("one two…");
    expect(labelText("one two", 7)).toBe("one two");
    expect(labelText("abcdefghij", 5)).toBe("abcd…");
  });

  it("is the start of text too costly to read as Markdown, as written", () => {
    expect(labelText(`${"- ".repeat(20)}*a*\n\nmore`)).toBe(`${"- ".repeat(20)}*a*`);
  });

  it("reads only up to LABEL_PREFIX characters", () => {
    expect(labelText(`${"a".repeat(LABEL_PREFIX)}*b*`)).toBe("a".repeat(LABEL_PREFIX));
  });

  it("reads a reference whose definition comes after a blank line as written", () => {
    expect(labelText("[x][r]\n\n[r]: https://x.example")).toBe("[x][r]");
  });
});
