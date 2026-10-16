# Markdown

Markdown is a simple way to format text with plain
characters, such as `**strong**` for strong emphasis or a dash at the
start of a line for a list item. Cards and courses can be written in
it. This page says which Markdown Solid Memo reads, which texts may
use it, how each place shows it, and why showing it is always safe.

How Solid Memo reads and shows text written in Markdown: the dialect,
which texts may be in it, how each place in the app shows it, and why
showing it is safe whatever a pod or library holds.

The data side, the `sm:textFormat` marker and the `sm:TextFormats`
concepts, is in [vocab.md](vocab.md#text-formats). This page is the
render policy, which may change without touching data.

## The dialect

`sm:markdown` is [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)
with [GitHub Flavored Markdown pipe tables](https://github.github.com/gfm/#tables-extension-)
and CJK-friendly emphasis, and nothing else: no strikethrough,
autolink literals (`www.x`), task lists or footnotes, which show as
typed. Wider Markdown would be a new concept, since it would change how
text already written reads.

CJK-friendly emphasis is the
[markdown-cjk-friendly](https://github.com/tats-u/markdown-cjk-friendly)
amendment to CommonMark's flanking rules. CommonMark closes `*` or `**`
after punctuation only when a space or punctuation follows, so in
Korean, where a particle follows a word directly,
`**스크립트(script)**라고` and `*‘사과’*를` would keep their asterisks.
The amendment counts a Chinese, Japanese or Korean character next to
the delimiter like a space or punctuation, so both are emphasis, as are
`**強調。**この文` and its like. For text without those characters it
changes one thing: `a**"b"**c` keeps its asterisks, as in CommonMark,
but an emoji or other character outside the Basic Multilingual Plane is
now read as one character, where the parser alone saw the two halves of
a surrogate pair, neither space nor punctuation. An emoji is a symbol,
which CommonMark counts as punctuation, so emphasis next to one now
follows the specification:
`*😀*a` and `a**😀**b` keep their asterisks, as `*★*a` always did,
though the app showed them as emphasis before it took this amendment.
`_` inside a word still never emphasizes, in Korean as in English:
`__사람__들` shows as typed, so use `**사람**들`.

CommonMark has no invalid documents, so nothing is ever refused: what a
place cannot show is shown as text.

GFM and the CJK-friendly amendment are not formal standards;
[standards.md](standards.md#drafts-and-de-facto-specifications) says why
they do not stand in the way of reading the text elsewhere.

## What is Markdown

Only text whose subject says `sm:textFormat sm:markdown`. Absent,
`sm:plainText`, or a concept this app does not know: the text is plain,
shown exactly as before 1.15.

| Subject | Markdown when marked | Always plain |
|---|---|---|
| `sm:Card` | `front`, `back`, `frontNote`, `backNote`, `frontLabel`, `backLabel`, and its distractors' `distractorText` and `distractorNote` | the pictures' descriptions (their `alt` text) |
| `sm:Step` | `theory` | |
| `sm:Chapter` | `dcterms:description` | `dcterms:title` (headings, links, the window title) |
| deck, release, series, group, catalog | | every text: DCAT readers and library search read them |

Each language's value is its own document, and its language tag still
says what language its prose is in; a code block in `@en` text stays
`@en`, and a code-only back may be `@zxx`.

## The package

`@solid-memo/markdown` (`packages/markdown/`) is the only code that
touches the parser, `mdast-util-from-markdown` with
`micromark-extension-gfm-table`, `mdast-util-gfm-table` and
`micromark-extension-cjk-friendly` (syntax only: its emphasis is
CommonMark's, so it needs no tree extension), and only in
`src/parse.ts`. Everything else sees the package's own tree, already
folded to what the app shows:

| In the text | In the tree |
|---|---|
| a heading | a paragraph in bold: data never adds to the page's outline |
| raw HTML, block or inline | its source, as text |
| a picture, inline or by reference | its alt text: never loaded or linked |
| a reference link | a link to its definition's URL (the first definition of a label wins); definitions themselves show nothing |
| a code block's info string | its first word, lower-cased, when it matches `[a-z0-9+#-]{1,20}`; else none |
| hidden characters in code or link text: every format character (Unicode category Cf, such as the bidi controls U+202A–202E and U+2066–2069, the zero-width characters U+200B–200F, U+2060 and U+FEFF, the soft hyphen U+00AD, the invisible operators U+2061–2064 and the tag characters U+E0000–E007F), and characters that show nothing or look blank yet count (the Hangul fillers U+115F, U+1160, U+3164 and U+FFA0, the combining grapheme joiner U+034F, Khmer's U+17B4–17B5, and the variation selectors U+180B–180F, U+FE00–FE0F and U+E0100–E01EF), (a picture's alt text in a link included) | a visible marker such as `⟨U+202E⟩` ("Trojan Source": code that reads other than it runs) |
| a table body row's cells past the header's | dropped, as GFM has it; a short row is not padded |

| Function | Module | What it gives |
|---|---|---|
| `parseMarkdown(text)` | `parse` | the blocks: paragraph, code, list, quote, rule, table |
| `parseDocument(text)` | `parse` | the repository's own Markdown as blocks, its headings kept at their level, or a `DocumentError` ([repository Markdown](#repository-markdown)) |
| `parseInlineMarkdown(text)` | `inline` | one line of phrasing: text, code spans, emphasis, strong |
| `plainText(text)` | `plainText` | the text as plain text |
| `labelText(text, max?)` | `plainText` | a short name: the plain text of its first block that shows any |
| `liveLink(url)` | `links` | whether a link is followed, and its host |
| `inspectMarkdown(text)` | `parse` | whether the text is one paragraph as written (a heading is not), and notes of what the tree folds away or a check looks at: raw HTML, pictures, links (an autolink told apart), code outside a link, character references, what nests too deep and would not show as written, a table past its caps, a heading underlined with dashes |
| `markdownProblems(text, rule)` | `problems` | what would not show as its author meant, by the [rules for a release](#rules-for-a-release), in a field held to `SIDE`, `OPTION` or `PROSE` |
| `chunksOf(blocks)` | `chunks` | the [chunks](#chunks) blocks are shown in, split at their top-level rules |
| `splitAtRules(blocks)` | `chunks` | the pieces between top-level rules, empty ones included |
| `inspectChunks(text)` | `chunks` | how many chunks a text is shown in, and how many empty pieces its rules make |

### Limits

Every entry point for data is bounded, for a pod or library may hold
anything ([repository Markdown](#repository-markdown) lifts only
`MAX_CHARS`):

- **`MAX_CHARS`, 20,000 characters.** A longer text is plain. The
  longest course text is about 2,600.
- **`MAX_LINE_NESTING`, 16 containers opened on one line, and
  `MAX_DELIMITERS`, 2,000 `*` and `_` in a text.** The parser takes
  time quadratic in either (`- - - - …` at 20,000 characters takes it
  tens of seconds), so a text past them is plain. No text people write
  comes near them, and its source still reads.
- **`MAX_NESTED_LINES`, 300 quotes or list items opened inside a list
  item** (`- - a`, `- > a`, or an item indented under another), and
  **`MAX_LAZY_LINES`, 200 lines in a row that continue a quote's or
  item's paragraph without its `>` or indentation.** The parser is
  quadratic in both (`- a` followed by 10,000 such lines takes it over a
  second), so a text past them is plain.
- **`MAX_UNDERLINES`, 200 lines that could underline a heading** (`===`,
  `---`, with up to three spaces before and white space after). The
  parser is quadratic in setext headings too (`a\n=\n…` at 20,000
  characters takes over a second), so a text with more is plain.
- **`MAX_DEPTH`, 8.** Blocks and phrasing nested deeper are shown as
  their source, so every walker of the tree recurses at most 8 deep.
  Each quote, list item, paragraph, emphasis and link is a level, so
  seven quotes hold a paragraph whose text is the eighth level, and
  shows as written; markup there would show as its source.
- **Tables:** more than 20 columns (the header's) or 2,000 cells, and
  the table is shown as its source. A body row's cells past the header's
  are dropped, so no row is wider; short rows are not padded.
- **`labelText`** reads a run of lines up to a blank line at a time,
  going on to the next only while what it has read shows no text (a
  rule, a definition), and at most 2,000 characters in all, so a label
  costs the same however long the text. A reference whose definition
  comes after a blank line is not resolved there, and reads as written.

The package's tests include the cmark and commonmark.js pathological
inputs, each at the length cap, within a time budget.

### Chunks

A step's theory in Markdown is read a chunk at a time
([courses.md](courses.md#the-learners-flow)), and its thematic breaks
(`---`, `***` or `___` on a line of their own) are where one chunk
ends and the next begins. Nowhere else does a break split anything: in
a note or a chapter's description it shows as a rule.

- **Only a break at the top level splits.** One inside a list item or a
  block quote is part of that block, and shows there as a rule.
- **The parsed tree is split, not the source** (`chunksOf`), so a
  reference link in one chunk resolves by a definition in another, and
  a `---` line in a code block splits nothing. A `---` right under a
  line of text underlines it as a heading instead: leave a blank line
  before it. The checks name such a heading (`dashHeading`, in the
  [rules for a release](#rules-for-a-release)), wherever it is.
- **The breaks are not shown.** A chunk is the blocks between two of
  them. Empty chunks, from a break first, last or right after another,
  are dropped; the library refuses them
  ([deck-library.md](deck-library.md#markdown-rules)).
- **One chunk** is what a text without a top-level break is, and a text
  past the [limits](#limits), shown as plain text, and plain theory,
  whatever it holds.

## Where it is shown: the profiles

The renderer is `packages/ui/src/ui/Markdown.tsx`, reached through
`DataText.tsx` (`DataText`, `DataProse` for a step's theory, `DataLine`);
nothing else in the app renders text from data as Markdown. Which profile a text gets depends only on the place, never on
the deck or course it comes from.

| Construct | **Block** profile (`DataText`, `MarkdownBlocks`) | **Inline** profile (`DataLine`) |
|---|---|---|
| Text, emphasis, strong, code spans | as such | as such |
| Paragraphs, hard breaks | `<p>`, `<br>` | joined by a space |
| Lists, block quotes, thematic breaks | as such, but for a step's theory, which is split at its top-level breaks ([chunks](#chunks)) | items joined by "; ", the rest flattened |
| Code blocks | `<pre><code translate="no">` in a region that scrolls sideways, its language as a small label | one code span, white space collapsed |
| Tables | in a region that scrolls sideways, alignment as `md-align-*` classes | cells joined by " · " |
| Links | followed only by `liveLink` (below) | their text |

- **Block** is for card faces and notes, a step's theory, a chapter's
  description and why an option is wrong. A text that is a single
  paragraph renders as the very `<p>` plain text renders as, so it keeps
  a face's size and centring; anything more becomes a `div.md`, left
  aligned, at a reading size on a card's face (a note's blocks as quiet
  as its paragraph) and at the size of the place it is in elsewhere. A
  step's theory (`DataProse`) is always a `div.course-theory`: plain
  theory split into paragraphs at its blank lines, Markdown as the
  blocks of the [chunk](#chunks) shown.
- **Inline** is for a multiple-choice option (in a `<label>`) and a
  card's labels.
- **Plain** (`labelText`) is for places that take only text: a Browser
  row (cut to 120 characters, after the marks are gone, so never inside
  them), the card's name in breadcrumbs, the window title and
  confirmations (`cardName`), and a picture's name taken from the back.

Plain text still renders byte for byte as it did before Markdown.

### Keys and screen readers

- A code block or table is a region with a name ("Code", "Table") and
  `tabIndex=0`, so it can be scrolled from the keyboard. The keys of the
  screen around it — Space to reveal and a grade's number in study,
  Enter for Next after a course question — leave such a region, and a
  link, alone (`inDataRegion`).
- A course question in Markdown may hold a code block or a table, too
  much to name its options by. Its options are named by "Question:", the
  question's picture as the question names it (its description, else
  "Picture on the front of the card"), and its `labelText`, from a
  `hidden` element, so a screen reader reading on does not hear the
  question twice; when the question is more than one paragraph, the
  whole question describes them too. A plain question names them by the
  whole question, as before.

## An example

A card's back, with "Format with Markdown" on:

~~~markdown
Make a branch with `git switch -c`, then:

- *stage* the files
- **commit** them

```sh
git add .
git commit
```
~~~

- **Block**, on the card's face in study and in the editor's preview: a
  paragraph with a code span, a list of two items with emphasis and
  strong emphasis, and a code block labeled `sh` in a region named
  "Code" that scrolls sideways. It is more than one paragraph, so it
  is a left-aligned `div.md`.
- **Inline**, were the card a course's question, with the back as one
  of its options: one line, the list items joined by "; " and the code
  block as one code span. The editor says so under the back: "This
  card's back is one of the options of a question: keep it to one
  paragraph, as the others are." (`notOneParagraph`, from
  `markdownProblems(text, OPTION)`).
- **Plain**, in the Browser's Back column (and in the breadcrumb, were
  it the front): the first block that shows any text, marks dropped,
  `Make a branch with git switch -c, then:` (`labelText`). The whole
  text as plain text (`plainText`) keeps the code as written:
  `stage the files; commit them` for the list, the code block's lines
  as they are.

What a place cannot show is not refused, only shown as typed, with a
hint while the card is edited. On a card's side,
`See <b>this</b> and [the docs](https://example.org).` gets three: one
for each HTML tag ("HTML such as `<b>` shows as typed. Put it in
backticks to show it as code.") and one for the link ("No links here,
where they would be in the way of studying: … Put a link in a note.").
In a note, where links are followed, only the two about HTML remain.

## Repository Markdown

The repository's own Markdown, its docs, is read by the same package in
the same dialect, so a page of the docs reads as the app reads a card.
`parseDocument(text)` is its profile, for trusted input read at build
time only, never for data:

- **Headings keep their level** (`{ type: "heading", depth, line }`),
  for a page's outline, and the line they are on, for a message about
  one. Every other block is as `parseMarkdown` gives it.
- **`MAX_CHARS` is lifted, and only it.** A page is longer than data
  may be: `studio.md` is about 130 KB, `data-model.md` about 70 KB. The
  other [limits](#limits) stay; the docs come nowhere near them.
- **What data would fold, it refuses.** Raw HTML, a picture, a link
  reference definition, what nests past `MAX_DEPTH`, a table past its
  caps, and a text past `MAX_LINE_NESTING`, `MAX_NESTED_LINES`,
  `MAX_LAZY_LINES`, `MAX_DELIMITERS` or `MAX_UNDERLINES` each throw a
  `DocumentError`, with the line it starts on when one says it. So a page
  shows as it is written, or its build fails and says where.

## Diagrams

The docs' Mermaid blocks are drawn to SVG at build time by the package's
node tooling, [diagrams.ts](../packages/markdown/tooling/diagrams.ts)
and [drawDiagrams.ts](../packages/markdown/tooling/drawDiagrams.ts):
the official Mermaid, in Chromium through Playwright, so a drawing comes
from the same parser family and layout engine as GitHub's. GitHub runs
its own Mermaid version, with HTML labels, so a diagram is still checked
on GitHub after an edit ([style.md](style.md#docs)).

- **What a block must have.** `diagramsOf(file, text, inputs)` finds a
  page's fenced `mermaid` blocks and checks each: a `flowchart`,
  `graph`, `sequenceDiagram` or `stateDiagram-v2`; an `accTitle` (the
  drawing's alternative text) and an `accDescr` (a sentence that says
  what it shows); no `%%{…}%%` directive, which would change how it is
  drawn; and, wherever it draws text, only characters the font has
  (`FONT_CHARS`, [below](#the-diagrams-font)). It throws one
  `DiagramError` that lists every problem of the page, each with its
  file and line.
- **How it is drawn.** Light (Mermaid's `default` theme) and dark, with
  labels as SVG text rather than HTML (`htmlLabels: false`, so a
  drawing has no `<foreignObject>`), ids that do not change from build
  to build, and a node label wrapped at 400 pixels, so no word of the
  docs' labels is split. Mermaid wraps an edge label at 200 pixels
  whatever it is told, so an edge label has no longer word than that.
  `drawDiagrams` launches one browser and draws in a page per theme. A
  block Mermaid refuses fails the drawing with Mermaid's message, its
  context lines kept, at the page's line: "Parse error on line 4" in a
  block whose fence is at `srs.md:55` is `docs/srs.md:59`.
- **The cache.** Each drawing is kept in
  `node_modules/.cache/solid-memo-docs-diagrams/` under a key that
  hashes all it depends on: Mermaid's version, `playwright`'s (which
  fixes the Chromium build), the theme's settings, the font, its
  license, the drawing code itself (both modules' sources) and the
  block. When every drawing is there, no browser is launched. A drawing
  is written under a temporary name and then renamed, so a build that
  draws at the same time never reads half a file; one read from the
  cache passes the same check as a new one
  ([below](#a-drawing-is-safe-to-serve)), or is drawn again. A
  drawing's file name is the page's name and the first 8 digits of its
  hash (such as `srs-1f0e9a3c.svg` and `srs-1f0e9a3c.dark.svg`): a
  changed diagram gets a new name, so no browser shows a stale drawing.
- **Chromium.** `npm run browsers` installs it once: the headless
  shell, without `sudo`. On Linux, a machine that lacks the system
  libraries it needs gets them with `sudo npx playwright install-deps
  chromium` (the [dev container](../.devcontainer/devcontainer.json)
  has them).
  Without it, drawing fails with a message that names that command.
  With `DOCS_DIAGRAMS=skip` (`diagramMode`), drawing warns and returns
  no drawings instead, without starting a browser or reading the cache,
  so what a build makes depends on the setting alone, in CI too. It is
  for `npm run build` and `npm start` on a machine without Chromium
  ([configuration.md](configuration.md#docs_diagrams)); `npm run dev`
  needs none of it ([below](#the-docs-as-a-site)). `npm run check`
  fails under it, by design: the test that draws in the real browser is
  skipped, and the package's coverage drops below 100%.

### A drawing is safe to serve

A drawing is only ever shown through `<img>`, where nothing in it runs,
but its address can be opened on its own, on the app's origin, and
GitHub Pages lets the site set no Content Security Policy header.
`checkSvg` does not read a drawing as leniently as a browser would: it
takes only what Mermaid writes, and refuses the rest. Every `<` opens a
plain tag of an element Mermaid draws the docs' diagram types with, with
no namespace prefix, each attribute one Mermaid writes (or `data-…`,
`aria-…`, and the SVG and XLink namespaces at their own addresses),
each value in quotes with no `<` inside, and the tags closed in order.
So there is no `<script>`, no event handler, no HTML
(`<foreignObject>`), no animation (which could set a link), no document
type, no comment, and no CDATA. A character reference is one of XML's
five (`&amp;` and the like), so the text checked is the text the
browser reads. No style or attribute value can load anything
(`cssProblem`): no `@import`, no `image-set(`, no backslash (which
could spell any of them), no string with `:` or `/`, and an `href` or
`url(` only to `#…` in the drawing itself. An SVG in `<img>` loads
nothing from elsewhere, so the font is inside it: the one exception is
a single `@font-face` from a `data:` WOFF2, the embedded font, and only
with its notice, the one comment, right after the opening tag.

### The diagrams' font

The diagrams are set in Fredoka, the app's own font
([vendor-code.md](vendor-code.md)), from `@fontsource-variable/fredoka`'s
Latin file. Each drawing embeds it, as one `data:` `@font-face`, so it
looks the same on every machine and its text fits its boxes: a font of
the viewer's own would be measured otherwise. Its glyphs are printable
ASCII, Latin-1 but the soft hyphen, and `– — ‘ ’ “ ” … −`. That is
`FONT_CHARS`, written out and held to the file's own table by a test;
the package's `unicode-range` declares more than the file has, `↑` and
`↓` among them. A character outside it would be drawn and measured in
another font, so a block that draws one fails, naming it.

Fredoka is under the SIL Open Font License 1.1 (OFL), which lets the
font be bundled and embedded in software on these conditions: it is not
sold by itself; each copy carries its copyright notice and the license,
as a file of its own, a human-readable header, or metadata the user can
easily see; a modified version does not use a Reserved Font Name; and
the font stays under the OFL, though a document made with it need not.
Fredoka names no Reserved Font Name, and the file is embedded unchanged.
The file holds its copyright but not the license's text, so each
drawing starts with a comment (`fontNotice`) that quotes the copyright
line, the first of the package's `LICENSE` read at build time; names
the license; says the font stays under it and the drawing does not; and
points to `OFL-Fredoka.txt`, the package's `LICENSE` byte for byte,
which goes beside the drawings wherever they are published. `checkSvg`
refuses the font without that comment. Nothing under the OFL is in the
repository, so `REUSE.toml` and `LICENSES/` do not name it.

## The docs as a site

The docs are also rendered to static pages, by the package's node
tooling: `renderDocsSite` in
[docsSite.ts](../packages/markdown/tooling/docsSite.ts) reads each page
of `docs/` with `parseDocument`, so a page shows as the app would show
it, and writes it out as HTML with an emitter of its own, which escapes
every text and has no way to write raw HTML.
[publishDocs.ts](../packages/markdown/tooling/publishDocs.ts) is the
Vite plugin that emits the pages under `docs/` with a build, and in dev
renders a page anew on each request, so an edit shows on reload. The
site's build ([vite.config.ts](../apps/web/vite.config.ts)) uses it, so
every build, every release among them, publishes its own docs at
`/docs/` ([deployment.md](deployment.md#what-the-artifact-contains)).
It hands the plugin the repository's address from the site's checked
settings (`VITE_REPO_URL`), the commit built, which the links name (or
`main`, with a warning, when it is not known), the version, and the
site's origin from `CNAME`, for each page's canonical address.

- **Addresses.** The README is `docs/`, every other page
  `docs/<page>/`, so `configuration.md` is `docs/configuration/`.
  Every address a page names is relative, so the pages work from any
  folder. A page may not be named like a version (`2.2.0.md`),
  `versions.md` or `diagrams.md`, which are folders of the site.
- **Links.** A link to another page leads to its address, and a link
  to a heading to the heading's id, which is GitHub's (`slug.ts`), so
  `configuration.md#vite_repo_url` leads to the same heading on both.
  A link out of `docs/` leads to the file on the repository's host at
  the built commit (`blob/` for a file, `tree/` for a folder), or at
  the release's tag in an archive. An address on the web stays as it
  is.
- **A page** has the About page's Content Security Policy, but with
  styles from its one stylesheet, `docs.css`, alone (`style-src
  'self'`), and runs no script. Its title and description are its
  heading of level 1 and the paragraph after it. Its header names the
  version and links the list of versions (`docs/versions/`), which a
  build writes with its own version and the releases page, and the
  deploy writes again with every release
  ([deployment.md](deployment.md#each-releases-docs)); its
  sections are listed under "On this page"; the previous and next pages
  are in the README's order; and its footer links its source, the
  issues, the license and the commit. `checkPage` holds a page to what
  it is written as: after the doctype, only plain tags of the elements
  and attributes the pages have, with no script, style, event handler
  or comment; the policy in the head before any address, with only
  `<html>`, `<head>` and `<meta>` tags and whitespace before it, so no
  text or element can open the body first and the browser drop it; and
  no address from the site's root or of a scheme other than http(s).
  Every page the package writes passes it, and the deploy checks an
  archived page with it, and a stylesheet with `checkStylesheet` (no
  `@import`, `url(`, `image-set(`, backslash or address in a string),
  before it serves them.
- **A diagram** is a figure: its light and dark drawings through
  `<img>` in a `<picture>`, sized from the drawing so the page does not
  move as it loads, its `accTitle` as their alternative text, its
  `accDescr` as the caption, and its source under it. The drawings go
  to `docs/diagrams/`, with the font's license beside them
  ([above](#the-diagrams-font)), and a page with a figure says in its
  footer which font they are set in. When the diagrams were not drawn
  (`DOCS_DIAGRAMS=skip`), a figure shows its caption and its source,
  open, and says so. In dev, the browser is started on the first
  drawing and kept until the server closes; without Chromium, the
  pages show the source and the server says why, once.
- **An archive** (a release's docs, served under its version) is the
  same pages one folder deeper, at the release's tag, never indexed
  (`noindex`, no canonical address), each with a note that links the
  latest docs. `npm run docs:archive -- X.Y.Z` packs one, every
  diagram drawn, and every GitHub release carries its own
  ([deployment.md](deployment.md#a-releases-docs-as-an-archive)), which
  the deploy serves at `/docs/X.Y.Z/` once it has checked it
  ([deployment.md](deployment.md#each-releases-docs)).

What a page holds that would not show as written, or would lead
nowhere, fails: `renderDocsSite` throws one `DocsSiteError` that lists
every problem with its file and line. That is what `parseDocument`
refuses ([Repository Markdown](#repository-markdown)); a page that does
not open with its one heading of level 1 and a paragraph; a heading
whose id the page already has; a task list item (`[ ]`, `[x]`); a page
the README does not link to; a link to a page, heading, file or folder
that is not there, out of the repository, from the site's root, or to
a scheme other than `http:` and `https:`; a diagram's problems
([above](#diagrams)); and a Mermaid block in a list or quote, which is
not drawn. The package's tests render the repository's own docs, so
`npm run check` fails on any of these.

## Safety

Pods and libraries are untrusted: anyone's data may be opened, and most
of it never passed `npm run library:check`. Script on solid-memo.com
holds the user's Solid-OIDC session. So every safety rule holds when the
text is rendered, and none relies on a check of the data.

| Threat | Rule |
|---|---|
| Raw HTML, `<script>`, `<img onerror>` | Text: the tree has no HTML node. |
| An HTML sink | None. The renderer turns each node into one fixed element with fixed attributes; data only becomes text children, never markup, a class, a style, an id or a handler. No `dangerouslySetInnerHTML`, no sanitizer. |
| `javascript:`, `data:`, `http:`, `mailto:`, relative and `#/route` links, a URL with a user name or password | Shown as their text: only an absolute `https:` URL without credentials is followed (`liveLink`), so data can neither run script, steer the app, fill in a mail, nor hide its host behind `user@`. (`isLinkableUrl`, for the source links decks state, is unchanged.) |
| Link spoofing | A followed link opens in a new tab, says so, and when its text is not its own URL, or its host is an international one, the host it leads to follows it in sight: "the spec (solidproject.org)", punycode kept, so `<https://bаnk.example>` with a Cyrillic "а" shows "(xn--bnk-6cd.example)". The link and its host are each isolated, so a bidi override in the text before them cannot reorder them: the host, and an address shown as itself, run left to right (`dir="ltr"`), other link text in the direction of its first letter (`dir="auto"`), so a link in Arabic reads right to left. |
| Tracking pictures | Never loaded: alt text only. Pictures belong in `sm:frontImage`/`sm:backImage`, with a description. |
| Trojan Source | Bidi controls, zero-width and other hidden characters in code and link text shown as markers; links isolated from the text around them. |
| Denial of service | The limits above, at every entry point for data, and each text parsed once (`markdownCache.ts` keeps the last 500, and a theory's chunks are split from its cached blocks, the plain text of every card of the deck the Studio's workbench searches, and the problems of the last 500 texts of each field rule the Studio's release check reads). |

[`parseDocument`](#repository-markdown) lifts `MAX_CHARS`, so it is
never given data: it reads the repository's own files at build time,
and no code that reads a pod or library calls it.

Two checks of the built site hold this (`apps/web/src/build.test.ts`,
over every chunk, the [Studio](studio.md)'s included):

- **No HTML sink.** The production bundle's only module with
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `dangerouslySetInnerHTML`, `createContextualFragment`, `srcdoc` or
  `document.write` is Preact's own diff, which only a
  `dangerouslySetInnerHTML` prop reaches, and no other module names one.
  The parser's entity decoder has a browser build that decodes `&name;`
  by writing to `innerHTML`; `apps/web/vite.config.ts` aliases it to
  its plain build, a lookup table, and so do
  `packages/ui/vitest.config.ts`, `apps/web/vitest.config.ts` and
  `apps/studio/vitest.config.ts` for the component tests.
- **A Content Security Policy**, as a meta tag in `index.html` (GitHub
  Pages sets no headers): `script-src 'self'` and the inline theme
  script by its hash, `object-src 'none'`, `base-uri 'none'`,
  `form-action 'none'`. The test checks the hash still matches the
  script. `img-src` stays open, since card pictures come from pods;
  `style-src` waits until the inline styles in `packages/ui/src/ui` are reviewed.

## Rules for a release

CommonMark has no invalid documents, and the app shows any text safely,
so nothing in a pod is ever refused for its Markdown. A library release
is held to more, for text that shows as its author meant:
`markdownProblems(text, rule)` names what would not, and
`npm run library:check` reports it, field by field, for every card, step
and chapter of a release that states `sm:textFormat sm:markdown`
([deck-library.md](deck-library.md#markdown-rules)). The card editor
shows the same problems as hints, never as a block
([writing Markdown in the app](#writing-markdown-in-the-app)).

| Problem (`code`) | Why |
|---|---|
| Raw HTML (`html`), such as `git clone <url>` | It shows as its source. Write it as code, or escape its `<`. |
| A picture (`image`) | It is never shown, only its alt text. A card shows a picture by `sm:frontImage`/`sm:backImage`, with a description. |
| A link where none may be (`link`): a card's `front`, `back`, `frontLabel` and `backLabel` and a distractor's `distractorText` (fields `SIDE` and `OPTION`), an autolink `<ex:title>` or `<http://…>` included | A link there is in the way of the keys that reveal and grade, and of the `<label>` an option sits in; an autolink also loses its angle brackets. Write it as code. |
| A link the app does not follow (`linkNotFollowed`), in a note, a step's theory or a chapter's description (field `PROSE`) | Only `https:` without a user name or password is followed; any other shows as text. |
| Link text that reads as an address or a host name other than the link's (`linkHost`) | Misleading text. The named host must be the link's, give or take a `www.`: `[solidproject.org](https://www.solidproject.org/)` is fine, `[bank.example](https://evil.example/)` is not, and neither is `[github.io](https://evil.github.io/)`, for a domain the host is in says nothing of who runs it. The test is by shape, a dotted word ending in letters, so text that reads as a host name but is none counts too: "Node.js", and a file's name such as `package.json`, `v1.ttl` or `README.md`, even as code. Word it otherwise ("npm's documentation of package.json"). This is a check of the data only: the defense against a link that misleads is the host the app shows beside it ([safety](#safety)). |
| A bidi control, zero-width or other hidden character in code or a link (`hiddenControl`) | Code that reads other than it runs ("Trojan Source"); the app shows them as markers. |
| A character reference outside code (`characterReference`), such as `&aring;` | CommonMark decodes it: it shows as "å". Write it as code, or escape its `&` (`\&aring;`). An unknown name, `&nosuchname;`, is text and passes. |
| A heading underlined with dashes (`dashHeading`): a line of text with `---` right under it, no blank line between | It reads like a line of text over a thematic break, which it would be with a blank line before the `---`; in a step's theory that break would end a [chunk](#chunks). Leave the blank line, or write the heading with `##`. Underlined with `===`, a heading is no such look-alike, and passes. |
| An option that is not one paragraph (`notOneParagraph`): a distractor's `distractorText`, and the `back` of a card with distractors (field `OPTION`) | Options show on one line, in the inline profile, and must look alike, or the odd one out gives the answer away. A heading is no paragraph: it would show bold on a revealed back. |
| Past the [limits](#limits): longer than `MAX_CHARS` (`tooLong`), past the parser's others (`tooComplex`), nested past `MAX_DEPTH` (`tooDeep`, unless it is plain text that shows as written anyway), a table past its caps (`largeTable`) | The text, or that part of it, shows as plain text or as its source. |

A step's theory is held to its [chunks](#chunks) too: none of them
empty, and as many in each language, so a learner who switches language
keeps their place
([deck-library.md](deck-library.md#markdown-rules)).

None of these is a safety rule: the [safety](#safety) rules hold when
text is rendered, whether or not a check ran.

## Writing Markdown in the app

A user's own card is plain text unless its writer says otherwise: the
card editor (`CardContentFields.tsx`, with `MarkdownEditing.tsx`) has a
"Format with Markdown" checkbox, **off for a new card**, since Markdown
would surprise someone who types `2 * 3 * 4` or `<tag>`. Every new card
starts off, the next one in a run too, though it keeps the added card's
languages.

- **What it writes.** Switched on, the card says `sm:textFormat
  sm:markdown`. Switched off on a card in Markdown, it says
  `sm:plainText`, which tells a deliberate choice from a marker an older
  app lost (the library upgrade keeps such a card as the user has it,
  [migrations.md](migrations.md)). A card the user does not switch keeps
  what it has: no marker stays none, and a format this app does not know
  is kept, the box showing it as not Markdown (`textFormatOfDraft`).
- **Text as typed.** The editor leaves tidying the sides and notes to
  the domain (`validateCardContent`), which keeps the spaces a Markdown
  text starts with, an indented code block, and trims plain text as
  always. The labels and the pictures' descriptions, single lines that
  never hold a block, it trims itself.
- **Fields.** On, the sides and both notes are textareas, where Enter
  starts a line and Ctrl+Enter (⌘+Enter) saves; once a textarea, a field
  stays one in that editor, so switching off loses no line. The labels
  and the pictures' descriptions stay single lines: a label is one line
  in study, and a description, the picture's `alt`, is always plain.
- **Hints, never blocks.** Under each text in Markdown, each language's
  under its own entry (a translation's by the translation): what
  `markdownProblems` names, with the card's sides and labels held to
  `SIDE`, the notes to `PROSE`, and the back to `OPTION` when the card
  has wrong options (a course's question); and "This shows no text as
  Markdown" for a text of marks alone. Each list describes its own text
  (`aria-describedby`), so it is read as that text is reached; it is
  not announced as it changes, which while typing would be noise. A
  card is never refused for its Markdown, as in a pod nothing is. The
  Studio's [health](studio.md#health) screen lists the same hints for
  every card of a deck, its wrong options' text and notes too, each a
  link to its field.
- **Switching on.** Text Markdown reads otherwise (`readsDifferently`:
  its plain text is not what was typed, white space aside) is noted at
  the moment the box is checked (`switchMarkdown`), and a status under
  the checkbox, a polite live region that also describes it, says so
  while that text is as it was: "check the preview" when a main text
  is among it, and "check them" when only translations are, which the
  preview does not show. Markdown typed after switching on is meant and
  says nothing; nor does switching off, or a card already in Markdown.
- **Formatting help.** A cheat sheet behind a disclosure under the
  checkbox: what to type, as code, and what it gives. No toolbar.
- **Preview.** Under the fields, the card as it will be studied
  (`CardPreview`, through `CardFace` and `DataText`, so what is
  previewed is what is studied): each text's main entry, the one being
  written, in its language. Pictures are left out, so a URL half typed
  is never fetched. A card with wrong options also shows its back as an
  option, on one line. It is a disclosure, open from the start on a
  screen at least 34rem wide and closed on a narrower one.

Wrong options, a step's theory and a chapter's description have no
in-app editor ([courses.md](courses.md)).

## Outside readers

Other Solid apps, and schema.org or DCAT readers of a library, see the
Markdown source as the literal's value, which is readable by design.
A reader with plain CommonMark shows the asterisks of emphasis that
only the [CJK-friendly rule](#the-dialect) reads. An
app before 1.15 does too ([migrations.md](migrations.md)).
