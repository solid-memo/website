import { describe, expect, it } from "vitest";
import { render } from "@testing-library/preact";
import type { LangText } from "@solid-memo/domain/langText";
import { MAX_CHARS } from "@solid-memo/markdown/parse";
import { SM } from "@solid-memo/vocab/vocab.generated";
import { cardName, cardNameText, DataLine, DataProse, DataText, plainDataText, useProseChunks } from "./DataText";
import { I18nProvider } from "./i18n";

function html(children: preact.ComponentChildren): string {
  return render(
    <I18nProvider locale="en" onChoose={() => undefined}>
      <div id="out">{children}</div>
    </I18nProvider>,
  ).container.querySelector("#out")!.innerHTML;
}

describe("DataText", () => {
  it("renders plain text as it always has, Markdown marks and all", () => {
    expect(html(<DataText text={{ en: "*a*/b" }} markdown={false} />)).toBe("<p>*a*/b</p>");
    expect(html(<DataText text={{ sv: "*a*/b" }} markdown={false} breaks class="card-note" />)).toBe(
      '<p class="card-note" lang="sv">*a*/<wbr>b</p>',
    );
  });

  it("renders Markdown that is one paragraph as that same paragraph", () => {
    expect(html(<DataText text={{ sv: "Kör `git diff`" }} markdown class="card-note" />)).toBe(
      '<p class="card-note" lang="sv">Kör <code class="md-inline-code" translate="no">git diff</code></p>',
    );
  });

  it("renders Markdown of other blocks, or several, in a div.md", () => {
    expect(html(<DataText text={{ en: "- a" }} markdown />)).toBe('<div class="md"><ul><li>a</li></ul></div>');
    expect(html(<DataText text={{ de: "a\n\nb" }} markdown class="card-note" />)).toBe(
      '<div class="md card-note" lang="de"><p>a</p><p>b</p></div>',
    );
  });

  it("shows Markdown past the parser's limits as plain text", () => {
    const long = `*${"a".repeat(MAX_CHARS)}*`;
    expect(html(<DataText text={{ en: long }} markdown />)).toBe(`<p>${long}</p>`);
  });
});

describe("DataProse", () => {
  it("splits plain text into paragraphs at its blank lines, Markdown marks and all", () => {
    expect(html(<DataProse class="course-theory" text={{ sv: " *a*\n \n\nb\n" }} markdown={false} />)).toBe(
      '<div class="course-theory" lang="sv"><p>*a*</p><p>b</p></div>',
    );
  });

  it("renders Markdown as its blocks, one paragraph too, in a div.md", () => {
    expect(html(<DataProse class="course-theory" text={{ en: "*a*" }} markdown />)).toBe(
      '<div class="course-theory md"><p><em>a</em></p></div>',
    );
  });

  it("shows Markdown past the parser's limits as plain paragraphs", () => {
    const long = `*${"a".repeat(MAX_CHARS)}*`;
    expect(html(<DataProse class="course-theory" text={{ en: `${long}\n\nb` }} markdown />)).toBe(
      `<div class="course-theory"><p>${long}</p><p>b</p></div>`,
    );
  });

  it("shows Markdown a chunk at a time, split at its top-level rules, the first unless told", () => {
    const text = { en: "---\n\n*a*\n\n- b\n\n  ---\n\n---\n\n---\n\nc\n\n---" };
    expect(html(<DataProse class="course-theory" text={text} markdown />)).toBe(
      '<div class="course-theory md"><p><em>a</em></p><ul><li>b<hr></li></ul></div>',
    );
    expect(html(<DataProse class="course-theory" text={text} markdown chunk={1} />)).toBe(
      '<div class="course-theory md"><p>c</p></div>',
    );
  });

  it("shows plain text whole, rules and all", () => {
    expect(html(<DataProse class="course-theory" text={{ en: "a\n\n---\n\nb" }} markdown={false} />)).toBe(
      '<div class="course-theory"><p>a</p><p>---</p><p>b</p></div>',
    );
  });
});

describe("useProseChunks", () => {
  function Count({ text, markdown }: { text: LangText; markdown: boolean }) {
    return <>{useProseChunks(text, markdown)}</>;
  }

  it("counts the chunks DataProse shows a text in, in the reader's language", () => {
    const text = { en: "a\n\n---\n\nb\n\n---\n\nc", sv: "a\n\n---\n\nb" };
    expect(html(<Count text={text} markdown />)).toBe("3");
    const swedish = render(
      <I18nProvider locale="sv" onChoose={() => undefined}>
        <Count text={text} markdown />
      </I18nProvider>,
    );
    expect(swedish.container).toHaveTextContent("2");
  });

  it("is one for plain text and for text past the parser's limits", () => {
    expect(html(<Count text={{ en: "a\n\n---\n\nb" }} markdown={false} />)).toBe("1");
    expect(html(<Count text={{ en: `a\n\n---\n\n${"b".repeat(MAX_CHARS)}` }} markdown />)).toBe("1");
  });
});

describe("DataLine", () => {
  it("renders plain text as ReaderText does, marked with its language when not the page's", () => {
    expect(html(<DataLine text={{ en: "a/b *c*" }} markdown={false} />)).toBe("a/<wbr>b *c*");
    expect(html(<DataLine text={{ sv: "a" }} markdown={false} />)).toBe('<span lang="sv">a</span>');
  });

  it("renders Markdown as one line of it, links and blocks flattened", () => {
    expect(html(<DataLine text={{ sv: "`x` [*y*](https://y.example)\n\n- z" }} markdown />)).toBe(
      '<span lang="sv"><code class="md-inline-code" translate="no">x</code> <em>y</em> z</span>',
    );
  });

  it("shows Markdown past the parser's limits as plain text", () => {
    const long = `*${"a".repeat(MAX_CHARS)}*`;
    expect(html(<DataLine text={{ en: long }} markdown />)).toBe(long);
  });
});

describe("plainDataText", () => {
  it("is plain text as it is, and Markdown's label, cut when asked", () => {
    expect(plainDataText("*a* b", false)).toBe("*a* b");
    expect(plainDataText("*a* b\n\nmore", true)).toBe("a b");
    expect(plainDataText("**one** two three", true, 8)).toBe("one…");
  });
});

describe("cardName", () => {
  const readerText = (text: Record<string, string>) => text.en ?? "";
  it("names a card by its front, else its back, as plain text even in Markdown", () => {
    expect(cardName({ id: "c", front: { en: "`ls`\n\n```\nls -l\n```" }, back: { en: "b" } }, readerText)).toBe(
      "`ls`\n\n```\nls -l\n```",
    );
    expect(
      cardName({ id: "c", front: { en: "`ls`\n\n```\nls -l\n```" }, back: { en: "b" }, textFormat: SM.markdown }, readerText),
    ).toBe("ls");
    expect(cardName({ id: "c", front: {}, back: { en: "**b**" }, textFormat: SM.markdown }, readerText)).toBe("b");
    expect(cardName({ id: "c", front: {}, back: {}, textFormat: SM.markdown }, readerText)).toBe("c");
  });

  it("names a Markdown card past a front or back that shows no text", () => {
    expect(cardName({ id: "c", front: { en: "---\nWhat is X?" }, back: { en: "b" }, textFormat: SM.markdown }, readerText)).toBe(
      "What is X?",
    );
    expect(cardName({ id: "c", front: { en: "* * *" }, back: { en: "*b*" }, textFormat: SM.markdown }, readerText)).toBe("b");
    expect(cardName({ id: "c", front: { en: "---" }, back: { en: "***" }, textFormat: SM.markdown }, readerText)).toBe("c");
  });
});

describe("cardNameText", () => {
  const readerText = (text: Record<string, string>) => text.en ?? text.sv ?? "";
  it("gives the side the name comes from, so its language marks the name", () => {
    const front = { sv: "---" };
    const back = { en: "*b*" };
    expect(cardNameText({ front, back, textFormat: SM.markdown }, readerText)).toBe(back);
    expect(cardNameText({ front, back }, readerText)).toBe(front);
    expect(cardNameText({ front: { en: "a" }, back, textFormat: SM.markdown }, readerText)).toEqual({ en: "a" });
    expect(cardNameText({ front, back: { en: "***" }, textFormat: SM.markdown }, readerText)).toBe(front);
  });
});
