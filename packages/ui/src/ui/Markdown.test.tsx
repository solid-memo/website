import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/preact";
import { parseMarkdown } from "@solid-memo/markdown/parse";
import type { Locale } from "@solid-memo/domain/locale";
import { I18nProvider } from "./i18n";
import { inDataRegion, MarkdownBlocks } from "./Markdown";

/** The Markdown rendered as the app renders it, in a container of its own. */
function rendered(markdown: string, locale: Locale = "en") {
  return render(
    <I18nProvider locale={locale} onChoose={() => undefined}>
      <div class="md">
        <MarkdownBlocks blocks={parseMarkdown(markdown)!} />
      </div>
    </I18nProvider>,
  ).container.querySelector(".md")!;
}

describe("MarkdownBlocks", () => {
  it("renders paragraphs, emphasis, strong, code spans and hard breaks", () => {
    expect(rendered("One *two* **three** `four`  \nfive\n\nsix").innerHTML).toBe(
      '<p>One <em>two</em> <strong>three</strong> <code class="md-inline-code" translate="no">four</code><br>five</p><p>six</p>',
    );
  });

  it("lets text wrap after a slash, but never code", () => {
    expect(rendered("a/b `c/d`").innerHTML).toBe('<p>a/<wbr>b <code class="md-inline-code" translate="no">c/d</code></p>');
  });

  it("renders a heading as a bold paragraph, never a heading", () => {
    const md = rendered("# Title");
    expect(md.innerHTML).toBe("<p><strong>Title</strong></p>");
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("renders a code block as a named region that takes the focus, its language a label", () => {
    const md = rendered("```http\nGET / HTTP/1.1\n\nHost: x\n```\n\n    plain");
    const [labelled, plain] = md.querySelectorAll(".md-code");
    expect(labelled!.querySelector(".md-code-lang")).toHaveTextContent("http");
    const region = screen.getAllByRole("region", { name: "Code" })[0]!;
    expect(region.tagName).toBe("PRE");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.querySelector("code")).toHaveAttribute("translate", "no");
    expect(region.textContent).toBe("GET / HTTP/1.1\n\nHost: x");
    expect(plain!.querySelector(".md-code-lang")).toBeNull();
  });

  it("names the regions in Swedish", () => {
    rendered("```\nx\n```\n\n| a |\n|-|", "sv");
    expect(screen.getByRole("region", { name: "Kod" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tabell" })).toBeInTheDocument();
  });

  it("renders lists: tight ones' items bare, loose ones' in paragraphs, an ordered one from its start", () => {
    expect(rendered("- a\n- b\n  1. c").innerHTML).toBe("<ul><li>a</li><li>b<ol><li>c</li></ol></li></ul>");
    expect(rendered("3. a\n\n4. b").innerHTML).toBe('<ol start="3"><li><p>a</p></li><li><p>b</p></li></ol>');
  });

  it("renders block quotes and thematic breaks", () => {
    expect(rendered("> a\n\n---").innerHTML).toBe("<blockquote><p>a</p></blockquote><hr>");
  });

  it("renders a table in a named, focusable region, its alignment as classes and a short row unpadded", () => {
    const md = rendered("| a | b | c |\n|:-|-:|---|\n| 1 |\n| x | *y* | z |");
    const region = screen.getByRole("region", { name: "Table" });
    expect(region).toHaveClass("md-table");
    expect(region).toHaveAttribute("tabindex", "0");
    expect(md.querySelector("thead")!.innerHTML).toBe(
      '<tr><th class="md-align-left">a</th><th class="md-align-right">b</th><th>c</th></tr>',
    );
    expect(md.querySelector("tbody")!.innerHTML).toBe(
      '<tr><td class="md-align-left">1</td></tr>' +
        '<tr><td class="md-align-left">x</td><td class="md-align-right"><em>y</em></td><td>z</td></tr>',
    );
  });

  it("drops a body row's cells past the header's, as GFM does", () => {
    const md = rendered("| a |\n|:-|\n| b | c | d |");
    expect(md.querySelector("tbody")!.innerHTML).toBe('<tr><td class="md-align-left">b</td></tr>');
  });
});

describe("Markdown from data stays text", () => {
  it.each([
    ["a script", "<script>alert(1)</script>"],
    ["an image with a handler", '<img src=x onerror="alert(1)">'],
    ["inline HTML", "a <b onclick=alert(1)>b</b>"],
    ["an iframe", '<iframe src="https://evil.example"></iframe>'],
  ])("renders %s as its source", (_, source) => {
    const md = rendered(source);
    expect(md.querySelector("script, img, iframe, b")).toBeNull();
    expect(md.textContent).toContain(source.split("\n")[0]);
  });

  it("never loads a picture, showing its alt text", () => {
    const md = rendered("![a tracker](https://tracker.example/p.gif) ![ref][r]\n\n[r]: https://tracker.example/q.gif");
    expect(md.querySelector("img")).toBeNull();
    expect(md.textContent).toBe("a tracker ref");
  });

  it.each([
    ["javascript:", "[x](javascript:alert(1))"],
    ["data:", "[x](data:text/html,<script>alert(1)</script>)"],
    ["http:", "[x](http://example.org)"],
    ["mailto:", "[x](mailto:a@example.org)"],
    ["a relative link", "[x](/decks)"],
    ["an app route", "[x](#/decks/1)"],
    ["a user name", "[x](https://user@example.org)"],
    ["a password", "[x](https://user:pass@example.org)"],
    ["a reference to javascript:", "[x][r]\n\n[r]: javascript:alert(1)"],
    ["an autolink", "<javascript:alert(1)>"],
  ])("shows a link to %s as its text", (_, source) => {
    const md = rendered(source);
    expect(md.querySelector("a")).toBeNull();
  });

  it("follows an https link in a new tab, saying where it leads when its text is not its address", () => {
    const md = rendered("[the spec](https://bücher.example/spec) and <https://solidproject.org/TR/protocol>");
    const [named, bare] = screen.getAllByRole("link");
    expect(named).toHaveAttribute("href", "https://xn--bcher-kva.example/spec");
    expect(named).toHaveAttribute("target", "_blank");
    expect(named).toHaveAttribute("rel", "noopener noreferrer");
    expect(named).toHaveAccessibleName("the spec (opens in a new tab)");
    expect(md.querySelector(".md-link-host")).toHaveTextContent("(xn--bcher-kva.example)");
    expect(bare).toHaveAttribute("href", "https://solidproject.org/TR/protocol");
    expect(md.querySelectorAll(".md-link-host")).toHaveLength(1);
  });

  it("shows the host of a link whose text looks like another address", () => {
    const md = rendered("[https://bank.example](https://evil.example) [`code` *x*  \ny](https://evil.example)");
    expect([...md.querySelectorAll(".md-link-host")].map((host) => host.textContent)).toEqual([
      " (evil.example)",
      " (evil.example)",
    ]);
  });

  it("shows the punycode host of an address written with international letters", () => {
    const md = rendered("<https://bаnk.example> <https://bücher.example/>");
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "https://xn--bnk-6cd.example/");
    expect([...md.querySelectorAll(".md-link-host")].map((host) => host.textContent)).toEqual([
      " (xn--bnk-6cd.example)",
      " (xn--bcher-kva.example)",
    ]);
  });

  it("isolates a link and its host from a bidi override in the text before them", () => {
    const md = rendered("See \u202E<https://evil.example/#moc.knab//:sptth> and [moc.knab.xyz](https://moc.knab.xyz.example)");
    const [bare, named] = screen.getAllByRole("link");
    expect(bare).toHaveAttribute("dir", "ltr");
    expect(named).toHaveAttribute("dir", "ltr");
    expect(md.querySelector(".md-link-host")).toHaveAttribute("dir", "ltr");
  });

  it("never puts a link in a link, so the host shown is where the text leads", () => {
    const md = rendered("[<https://bank.example.evil.example/login>](https://bank.example/)");
    expect(md.querySelectorAll("a a")).toHaveLength(0);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://bank.example/");
    expect([...md.querySelectorAll(".md-link-host")].map((host) => host.textContent)).toEqual([" (bank.example)"]);
  });

  it("follows a reference link like any other", () => {
    rendered("[docs][d]\n\n[d]: https://docs.example/");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://docs.example/");
  });

  it("shows bidi controls in code as visible markers", () => {
    expect(rendered("`a‮b`").textContent).toBe("a⟨U+202E⟩b");
  });
});

describe("inDataRegion", () => {
  it("is true within a link, a code block or a table region, and false elsewhere", () => {
    const md = rendered("[x](https://x.example) plain\n\n```\ncode\n```\n\n| a |\n|-|");
    expect(inDataRegion(md.querySelector("a")!)).toBe(true);
    expect(inDataRegion(md.querySelector("pre code")!)).toBe(true);
    expect(inDataRegion(md.querySelector("th")!)).toBe(true);
    expect(inDataRegion(md.querySelector("p")!)).toBe(false);
  });
});
