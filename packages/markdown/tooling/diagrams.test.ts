// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT

import { readFile } from "node:fs/promises";
import { brotliDecompressSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import {
  cacheKey,
  checkSvg,
  cssProblem,
  type Diagram,
  DiagramError,
  type DrawInputs,
  diagramHash,
  diagramsOf,
  diagramTheme,
  embedFont,
  FONT_CHARS,
  fontFace,
  fontNotice,
  mermaidError,
  rendererHash,
} from "./diagrams.ts";
import { drawInputs, FONT_LICENSE_FILE } from "./drawDiagrams.ts";

const inputs: DrawInputs = {
  mermaid: "12.2.0",
  playwright: "1.64.1",
  font: new Uint8Array([1, 2, 3]),
  license:
    "Copyright 2016 The Fredoka Project Authors (https://example.org/fredoka)\n\nThe license.",
  renderer: "renderer",
};

const page = (...blocks: string[]) => blocks.join("\n\n");
const fence = (...lines: string[]) => ["```mermaid", ...lines, "```"].join("\n");
const flowchart = (...lines: string[]) =>
  fence("flowchart LR", "  accTitle: A title", "  accDescr: What it shows.", ...lines);

/** The problems diagramsOf finds in a text, as `line: what`. */
function problemsOf(text: string): string[] {
  try {
    diagramsOf("docs/page.md", text, inputs);
  } catch (error) {
    if (error instanceof DiagramError)
      return error.problems.map(({ file, line, what }) => `${file}:${line}: ${what}`);
    throw error;
  }
  return [];
}

/**
 * The code points a WOFF2 font's `cmap` maps to a glyph. Its tables are
 * one Brotli stream after the table directory; `cmap` is never
 * transformed, so it is read as it is in a TrueType file (formats 4 and
 * 12, Unicode).
 */
function woff2CodePoints(font: Uint8Array): Set<number> {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const known = (
    "cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT EBLC gasp " +
    "hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC COLR CPAL " +
    "SVG_ sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar mort morx " +
    "opbd prop trak Zapf Silf Glat Gloc Feat Sill"
  )
    .split(" ")
    .map((tag) => tag.replace("_", " "));
  let offset = 48;
  const base128 = () => {
    let value = 0;
    for (;;) {
      const byte = font[offset++]!;
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
  };
  const tables: { tag: string; length: number }[] = [];
  for (let index = 0; index < view.getUint16(12); index++) {
    const flags = font[offset++]!;
    let tag = known[flags & 63];
    if ((flags & 63) === 63) {
      tag = String.fromCharCode(...font.subarray(offset, offset + 4));
      offset += 4;
    }
    const version = flags >> 6;
    const original = base128();
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    tables.push({ tag: tag!, length: transformed ? base128() : original });
  }
  const data = brotliDecompressSync(font.subarray(offset, offset + view.getUint32(20)));
  let at = 0;
  for (const table of tables) {
    if (table.tag === "cmap") return cmapCodePoints(data.subarray(at, at + table.length));
    at += table.length;
  }
  throw new Error("no cmap");
}

function cmapCodePoints(cmap: Uint8Array): Set<number> {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const points = new Set<number>();
  for (let index = 0; index < view.getUint16(2); index++) {
    const start = view.getUint32(4 + index * 8 + 4);
    const format = view.getUint16(start);
    if (format === 12) addFormat12(view, start, points);
    else if (format === 4) addFormat4(view, start, points);
  }
  return points;
}

/** Adds the code points of a format 12 subtable at `start` to `points`. */
function addFormat12(view: DataView, start: number, points: Set<number>): void {
  for (let group = 0; group < view.getUint32(start + 12); group++) {
    const at = start + 16 + group * 12;
    const [first, last, glyph] = [
      view.getUint32(at),
      view.getUint32(at + 4),
      view.getUint32(at + 8),
    ];
    for (let code = first; code <= last; code++) if (glyph + code - first !== 0) points.add(code);
  }
}

/** Adds the code points of a format 4 subtable at `start` to `points`. */
function addFormat4(view: DataView, start: number, points: Set<number>): void {
  const segments = view.getUint16(start + 6) / 2;
  const ends = start + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const offsets = deltas + segments * 2;
  for (let segment = 0; segment < segments; segment++) {
    const first = view.getUint16(starts + segment * 2);
    const last = view.getUint16(ends + segment * 2);
    const delta = view.getUint16(deltas + segment * 2);
    const rangeOffset = view.getUint16(offsets + segment * 2);
    for (let code = first; code <= last && code !== 0xffff; code++) {
      let glyph = code;
      if (rangeOffset !== 0) {
        glyph = view.getUint16(offsets + segment * 2 + rangeOffset + (code - first) * 2);
        if (glyph === 0) continue;
      }
      if ((glyph + delta) % 65536 !== 0) points.add(code);
    }
  }
}

describe("FONT_CHARS", () => {
  it("has a glyph in the installed Fredoka file for every character it allows", async () => {
    const cmap = woff2CodePoints((await drawInputs()).font);
    const missing = [...FONT_CHARS].filter((code) => !cmap.has(code));
    expect(missing.map((code) => code.toString(16))).toEqual([]);
    // The file's own table, not its package's unicode-range: ↑ and ↓ are declared, not there.
    expect([0x41, 0x2191, 0x2193, 0xad].map((code) => cmap.has(code))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("allows Latin-1 and the dashes, quotes and minus, but not the soft hyphen or arrows", () => {
    for (const char of "Aé×·–—‘’“”…−") expect(FONT_CHARS.has(char.codePointAt(0)!)).toBe(true);
    for (const char of "­→↗↔↑↓\t") expect(FONT_CHARS.has(char.codePointAt(0)!)).toBe(false);
  });
});

describe("diagramsOf", () => {
  it("finds each Mermaid block with its title, description, line, name and keys", () => {
    const text = page(
      "# A page",
      flowchart("  A --> B"),
      "```ts\nconst a = 1;\n```",
      fence(
        "%% a comment",
        "sequenceDiagram",
        "  accTitle:   Logging in  ",
        "  accDescr {",
        "    The user logs in,",
        "    and is back.",
        "  }",
        "  User->>UI: log in",
      ),
    );
    const [first, second] = diagramsOf("docs/the-page.md", text, inputs);
    expect(first).toMatchObject({
      file: "docs/the-page.md",
      line: 3,
      title: "A title",
      description: "What it shows.",
      source: "flowchart LR\n  accTitle: A title\n  accDescr: What it shows.\n  A --> B",
    });
    expect(first!.hash).toBe(diagramHash(inputs, first!.source));
    expect(first!.name).toBe(`the-page-${first!.hash.slice(0, 8)}`);
    expect(first!.keys).toEqual({
      light: cacheKey(first!.hash, "light"),
      dark: cacheKey(first!.hash, "dark"),
    });
    expect(second).toMatchObject({
      line: 14,
      title: "Logging in",
      description: "The user logs in, and is back.",
    });
  });

  it("reads an accDescr block on one line, and every diagram type the docs use", () => {
    for (const type of ["flowchart TD", "graph LR", "sequenceDiagram", "stateDiagram-v2"]) {
      const [diagram] = diagramsOf(
        "docs/a.md",
        fence(type, "accTitle: T", "accDescr { One line. }", "x"),
        inputs,
      );
      expect(diagram!.description).toBe("One line.");
    }
  });

  it("skips what is not a Mermaid block: other fences, a block inside a longer fence, a backtick info string", () => {
    const text = [
      "````md",
      "```mermaid",
      "pie",
      "```",
      "````",
      "~~~ Mermaid extra words",
      "graph LR",
      "  accTitle: Tilde",
      "  accDescr: With tildes.",
      "~~~",
      "``` mermaid `x`",
      "not a fence",
    ].join("\n");
    const diagrams = diagramsOf("docs/a.md", text, inputs);
    expect(diagrams.map((diagram) => [diagram.line, diagram.title])).toEqual([[6, "Tilde"]]);
  });

  it("takes an unclosed fence to the end of the page", () => {
    const [diagram] = diagramsOf(
      "docs/a.md",
      "```mermaid\ngraph LR\naccTitle: T\naccDescr: D\nA --> B",
      inputs,
    );
    expect(diagram!.source.endsWith("A --> B")).toBe(true);
  });

  it("gives an identical diagram the same name, and another source another", () => {
    const one = diagramsOf(
      "docs/a.md",
      page(flowchart("A"), flowchart("A"), flowchart("B")),
      inputs,
    );
    expect(one[0]!.name).toBe(one[1]!.name);
    expect(one[2]!.name).not.toBe(one[0]!.name);
  });

  it("finds nothing in a page without Mermaid", () => {
    expect(diagramsOf("docs/a.md", "# Title\n\nText.\n", inputs)).toEqual([]);
  });

  it("names every problem of a page, at its line", () => {
    const text = page(
      "# A page",
      fence("graph LR", "  A --> B"),
      fence("pie", "  accTitle: T", "  accDescr: D"),
      flowchart("  A[go → there] --> B[↑\tup]", "  B --> C[↑]"),
      fence("%%{init: {'theme': 'forest'}}%%", "flowchart LR", "accTitle: T", "accDescr: D"),
      fence("accTitle: Only a title", "accDescr: →"),
      fence("graph LR", "accTitle:", "accDescr {", "}"),
    );
    expect(problemsOf(text)).toEqual([
      "docs/page.md:3: no accTitle: the drawing's alternative text",
      "docs/page.md:3: no accDescr: the sentence that says what the diagram shows",
      `docs/page.md:9: a "pie" diagram: the docs draw only flowchart, graph, sequenceDiagram, stateDiagram-v2`,
      `docs/page.md:18: "→" (U+2192) is not in the diagrams' font`,
      `docs/page.md:18: "↑" (U+2191) is not in the diagrams' font`,
      "docs/page.md:18: (U+0009) is not in the diagrams' font",
      `docs/page.md:19: "↑" (U+2191) is not in the diagrams' font`,
      "docs/page.md:23: a directive (%%{…}%%), which would change how the diagram is drawn",
      "docs/page.md:29: an empty diagram",
      "docs/page.md:34: no accTitle: the drawing's alternative text",
      "docs/page.md:34: no accDescr: the sentence that says what the diagram shows",
    ]);
  });

  it("throws a DiagramError whose message lists each problem", () => {
    expect(() => diagramsOf("docs/x.md", fence("pie"), inputs)).toThrow(
      /^docs\/x\.md:2: a "pie" diagram.*\ndocs\/x\.md:1: no accTitle/,
    );
  });
});

describe("the hashes", () => {
  it("change with every input a drawing depends on", () => {
    const base = diagramHash(inputs, "graph LR");
    const changed = [
      diagramHash({ ...inputs, mermaid: "12.2.1" }, "graph LR"),
      diagramHash({ ...inputs, playwright: "1.65.0" }, "graph LR"),
      diagramHash({ ...inputs, font: new Uint8Array([1, 2, 4]) }, "graph LR"),
      diagramHash({ ...inputs, license: `${inputs.license}!` }, "graph LR"),
      diagramHash({ ...inputs, renderer: "other" }, "graph LR"),
      diagramHash(inputs, "graph TD"),
    ];
    expect(new Set([base, ...changed]).size).toBe(7);
  });

  it("give each theme its own cache key", () => {
    expect(cacheKey("hash", "light")).not.toBe(cacheKey("hash", "dark"));
    expect(cacheKey("hash", "light")).toBe(cacheKey("hash", "light"));
  });

  it("change the renderer's when either source changes", () => {
    const base = rendererHash(["diagrams", "draw"]);
    expect(rendererHash(["diagrams!", "draw"])).not.toBe(base);
    expect(rendererHash(["diagrams", "draw!"])).not.toBe(base);
    expect(rendererHash(["diagramsd", "raw"])).not.toBe(base);
  });

  it("read the renderer's from this code", async () => {
    const sources = await Promise.all(
      ["./diagrams.ts", "./drawDiagrams.ts"].map((name) =>
        readFile(new URL(name, import.meta.url), "utf8"),
      ),
    );
    expect((await drawInputs()).renderer).toBe(rendererHash(sources));
  });
});

describe("diagramTheme", () => {
  it("draws labels as SVG text in Fredoka, wide enough, with ids that stay the same", () => {
    const light = diagramTheme("light");
    expect(light).toMatchObject({
      htmlLabels: false,
      deterministicIds: true,
      securityLevel: "strict",
      theme: "default",
      fontFamily: '"Fredoka"',
      themeVariables: { fontFamily: '"Fredoka"' },
      flowchart: { wrappingWidth: 400 },
    });
    expect(diagramTheme("dark")).toMatchObject({ theme: "dark" });
  });
});

describe("mermaidError", () => {
  const diagram = { file: "docs/srs.md", line: 55 } as Diagram;

  it("puts Mermaid's line on the page's, keeping its context lines", () => {
    const message = "Parse error on line 4:\n...B{q >= 3?}\n-----^\nExpecting 'SQE', got 'PS'";
    expect(mermaidError(message, diagram)).toEqual({
      file: "docs/srs.md",
      line: 59,
      what: "Parse error:\n...B{q >= 3?}\n-----^\nExpecting 'SQE', got 'PS'",
    });
  });

  it("puts a message without a line at the fence", () => {
    expect(mermaidError("No diagram type detected", diagram)).toEqual({
      file: "docs/srs.md",
      line: 55,
      what: "No diagram type detected",
    });
  });
});

describe("fontNotice", () => {
  let license: string;
  beforeAll(async () => {
    license = await readFile(FONT_LICENSE_FILE, "utf8");
  });

  it("quotes the installed font's copyright line and names its license", () => {
    const notice = fontNotice(license);
    expect(notice).toContain(license.split("\n")[0]!.trim());
    expect(notice).toContain("SIL Open Font License, Version 1.1");
    expect(notice).toContain("OFL-Fredoka.txt");
    expect(notice).toMatch(/^<!-- Font: Fredoka, embedded below\. Copyright .* -->$/);
    expect(notice).not.toMatch(/href|url\(/);
  });

  it("refuses a license that does not start with a copyright line, or would end the comment", () => {
    expect(() => fontNotice("This Font Software is licensed")).toThrow(/copyright line/);
    expect(() => fontNotice("Copyright 2016 A -- B")).toThrow(/copyright line/);
  });
});

describe("embedFont and checkSvg", () => {
  const notice = fontNotice(inputs.license);
  const drawing =
    '<svg id="d" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>#d{font-family:"Fredoka";}</style>' +
    '<g marker-end="url(#arrow)"><use href="#x"/><use xlink:href="#y"/><text>a &lt; b</text></g></svg>';
  const embedded = embedFont(drawing, inputs.font, notice);

  it("puts the notice after the opening tag and the font first in the style", () => {
    expect(embedded).toBe(
      `<svg id="d" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${notice}<style>${fontFace(inputs.font)}#d{font-family:"Fredoka";}</style>` +
        drawing.slice(drawing.indexOf("</style>") + 8),
    );
    expect(fontFace(inputs.font)).toContain("url(data:font/woff2;base64,AQID)");
  });

  it("refuses a drawing without a root or a style", () => {
    expect(() => embedFont("<g/>", inputs.font, notice)).toThrow(/no <svg> root/);
    expect(() => embedFont("<svg></svg>", inputs.font, notice)).toThrow(/no <style>/);
  });

  it("passes a drawing with only local references, with or without the embedded font", () => {
    expect(checkSvg(drawing)).toBeNull();
    expect(checkSvg(`${embedded}\n`)).toBeNull();
  });

  it.each([
    ["<g/>", "does not start with <svg>"],
    ["<svg><script>alert(1)</script></svg>", "has a <script> element"],
    ["<svg><svg:script/></svg>", "has a <svg:script> element"],
    [
      '<svg xmlns="http://www.w3.org/2000/svg"><a.b:script xmlns:a.b="http://www.w3.org/1999/xhtml">alert(document.domain)</a.b:script></svg>',
      "has a <a.b:script> element",
    ],
    ["<svg><foreignObject/></svg>", "has a <foreignObject> element"],
    ['<svg><g><set attributeName="href" to="javascript:x"/></g></svg>', "has a <set> element"],
    ["<svg><animateMotion/></svg>", "has a <animateMotion> element"],
    ["<svg><a/></svg>", "has a <a> element"],
    [
      '<svg><!DOCTYPE svg [<!ENTITY a "b">]></svg>',
      'has markup that is not a plain tag ("<!DOCTYPE svg [<!ENT")',
    ],
    ["<svg><!-- a note --></svg>", 'has markup that is not a plain tag ("<!-- a note --></svg")'],
    [
      '<svg><?xml-stylesheet href="x.css"?></svg>',
      'has markup that is not a plain tag ("<?xml-stylesheet hre")',
    ],
    [
      "<svg><style><![CDATA[g{}]]></style></svg>",
      'has markup that is not a plain tag ("<![CDATA[g{}]]></sty")',
    ],
    ["<svg><style><g/></style></svg>", "has a style that holds markup"],
    ['<svg><g onload="x()"/></svg>', "has an event handler (onload)"],
    [
      '<svg xmlns="http://www.w3.org/2000/svg" data-x=">" onload="alert(document.domain)"></svg>',
      "has an event handler (onload)",
    ],
    ['<svg data-x=">" href="javascript:alert(1)"></svg>', 'links to "javascript:alert(1)"'],
    ['<svg><g data-x="<"/></svg>', 'has markup that is not a plain tag ("<g data-x="<"/></svg")'],
    ["<svg><g id=x/></svg>", 'has markup that is not a plain tag ("<g id=x/></svg>")'],
    ['<svg><g id="a" id="b"/></svg>', "has the attribute id twice on <g>"],
    ['<svg><g foo="1"/></svg>', "has an attribute foo on <g>"],
    [
      '<svg xmlns="http://www.w3.org/1999/xhtml"></svg>',
      'declares xmlns="http://www.w3.org/1999/xhtml"',
    ],
    ['<svg xmlns:h="http://www.w3.org/1999/xhtml"></svg>', "has an attribute xmlns:h on <svg>"],
    ['<svg><g data-x="&#106;"/></svg>', "has a character reference other than XML's own five"],
    ["<svg><text>&nbsp;</text></svg>", "has a character reference other than XML's own five"],
    ["<svg><text>a & b</text></svg>", "has a character reference other than XML's own five"],
    ["<svg><g></svg>", "closes <svg> out of order"],
    ["<svg><g>", "leaves <g> open"],
    ['<svg></g x="1">', "has a closing tag that is not plain (</g>)"],
    ["<svg></svg>text", "has text outside its root"],
    ["<svg></svg><svg></svg>", "has more than one root"],
    ['<svg><a href="https://example.org/">x</a></svg>', "has a <a> element"],
    ['<svg><use href="https://example.org/"/></svg>', 'links to "https://example.org/"'],
    ['<svg><use xlink:href="other.svg#a"/></svg>', 'links to "other.svg#a"'],
    ["<svg><style>@import 'x.css';</style></svg>", "has an @import"],
    [
      "<svg><style>@&#105;mport 'https://example.org/x.css';</style></svg>",
      "has a character reference other than XML's own five",
    ],
    [
      '<svg><g style="fill:u&#114;l(https://example.org/a)"/></svg>',
      "has a character reference other than XML's own five",
    ],
    ['<svg><g style="fill:url(https://example.org/a)"/></svg>', 'loads "https://example.org/a"'],
    ["<svg><style>g{fill:URL( 'x.svg#a' )}</style></svg>", 'loads "x.svg#a"'],
    ["<svg><g fill='url(x.svg#a)'/></svg>", 'loads "x.svg#a"'],
    [
      '<svg><style>g{background:image-set("https://example.org/x.png" 1x)}</style></svg>',
      "loads a file (image-set())",
    ],
    [
      '<svg><g style="fill:-webkit-image-set(&quot;x.png&quot; 1x)"/></svg>',
      "loads a file (image-set())",
    ],
    [
      '<svg><style>g{content:"https://example.org/"}</style></svg>',
      'has an address in a string ("https://example.org/")',
    ],
    ["<svg><style>g{fill:\\75 rl(x)}</style></svg>", "has a backslash"],
    [
      "<svg><style>@font-face{src:url(https://example.org/f.woff2)}</style></svg>",
      "has an @font-face other than the embedded font",
    ],
    [
      `<svg><style>${fontFace(inputs.font)}${fontFace(inputs.font)}</style></svg>`,
      "has more than one @font-face",
    ],
  ])("refuses %s", (svg, why) => {
    expect(checkSvg(svg)).toBe(why);
  });

  it("refuses the embedded font without its notice, or with the notice elsewhere", () => {
    expect(checkSvg(embedded.replace(notice, ""))).toBe("embeds the font without its notice");
    expect(checkSvg(embedded.replace(notice, "").replace("<g ", `${notice}<g `))).toBe(
      `has markup that is not a plain tag ("${notice.slice(0, 20)}")`,
    );
  });

  it("checks what remains beside the embedded font", () => {
    expect(checkSvg(embedded.replace("url(#arrow)", "url(x.svg)"))).toBe('loads "x.svg"');
  });
});

describe("cssProblem", () => {
  it.each([
    ["g{fill:url(#a)}", true, null],
    ["g{fill:url(#a)}", false, "loads a file (url())"],
    ["/* the docs' rule: */ g{content:'a'}", true, null],
    ['g{content:"a"} /* "b:c" */ g{content:"d:e"}', true, 'has an address in a string ("d:e")'],
    ["g{content:'a\nb:c'}", true, null],
  ])("checks %s, local %s", (css, local, problem) => {
    expect(cssProblem(css, local)).toBe(problem);
  });
});
