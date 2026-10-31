# Markdown

Markdown formats text with plain characters, such as `**strong**` for
strong emphasis or a dash before a list item. Cards and courses can be
written in it. This page covers the Markdown Solid Memo reads, the texts
that may use it, how each place in the app shows it, and why showing it
is safe whatever a pod or library holds.

The data side, the `sm:textFormat` marker and the `sm:TextFormats`
concepts, is in [vocab.md](vocab.md#text-formats). This page is the
render policy, which may change without touching data.

## The dialect

`sm:markdown` is [CommonMark 0.31.2](https://spec.commonmark.org/0.31.2/)
with [GitHub Flavored Markdown pipe tables](https://github.github.com/gfm/#tables-extension-)
and CJK-friendly emphasis, and nothing else. Strikethrough, autolink
literals (`www.x`), task lists and footnotes show as typed. Wider
Markdown would be a new concept.

CJK-friendly emphasis is the
[markdown-cjk-friendly](https://github.com/tats-u/markdown-cjk-friendly)
amendment to CommonMark's flanking rules. CommonMark closes `*` or `**`
after punctuation only when a space or punctuation follows, so Korean,
where a particle follows a word directly, would keep the asterisks of
`**스크립트(script)**라고` and `*‘사과’*를`. The amendment counts a
Chinese, Japanese or Korean character next to the delimiter as a space
or punctuation, so both are emphasis, as is `**強調。**この文`.

Text without those characters reads as in CommonMark (`a**"b"**c`
keeps its asterisks), with one change: the amendment reads a character
outside the Basic Multilingual Plane, such as an emoji, as one
character. The parser alone saw two surrogate halves, neither space nor
punctuation. An emoji is a symbol, which CommonMark counts as
punctuation, so `*😀*a` and `a**😀**b` keep their asterisks, as `*★*a`
always did. Before the amendment, the app showed them as emphasis. `_`
inside a word never emphasizes: `__사람__들` shows as typed, and
`**사람**들` works.

CommonMark has no invalid documents, so nothing is refused: what a
place can't show is shown as text.

GFM and the CJK-friendly amendment aren't formal standards;
[standards.md](standards.md#drafts-and-de-facto-specifications) says why
they don't stand in the way of reading the text elsewhere.

## What is Markdown

Only text whose subject says `sm:textFormat sm:markdown` is Markdown.
When the marker is absent, `sm:plainText`, or a concept this app
doesn't know, the text is plain, shown exactly as before 1.15.

| Subject | Markdown when marked | Always plain |
|---|---|---|
| `sm:Card` | `front`, `back`, `frontNote`, `backNote`, `frontLabel`, `backLabel`, and its distractors' `distractorText` and `distractorNote` | the pictures' descriptions (their `alt` text) |
| `sm:Step` | `theory` | |
| `sm:Chapter` | `dcterms:description` | `dcterms:title` (headings, links, the window title) |
| deck, release, series, group, catalog | | every text: DCAT readers and library search read them |

Each language's value is its own document, and its language tag still
names its prose's language: a code block in `@en` text stays `@en`, and
a code-only back may be `@zxx`.

## The package

`@solid-memo/markdown` (`packages/markdown/`) is the only code that
touches the parser, and only in `src/parse.ts`. The parser is
`mdast-util-from-markdown` with `micromark-extension-gfm-table`,
`mdast-util-gfm-table` and `micromark-extension-cjk-friendly`, syntax
only: its emphasis is CommonMark's, so it needs no tree extension. Everything else sees the
package's own tree, folded to what the app shows:

| In the text | In the tree |
|---|---|
| a heading | a paragraph in bold: data never adds to the page's outline |
| raw HTML, block or inline | its source, as text |
| a picture, inline or by reference | its alt text: never loaded or linked |
| a reference link | a link to its definition's URL (the first definition of a label wins); definitions show nothing |
| a code block's info string | its first word, lower-cased, when it matches `[a-z0-9+#-]{1,20}`; else none |
| hidden characters in code or link text: every format character (Unicode category Cf, such as the bidi controls U+202A–202E and U+2066–2069, the zero-width characters U+200B–200F, U+2060 and U+FEFF, the soft hyphen U+00AD, the invisible operators U+2061–2064 and the tag characters U+E0000–E007F), and characters that show nothing or look blank yet count (the Hangul fillers U+115F, U+1160, U+3164 and U+FFA0, the combining grapheme joiner U+034F, Khmer's U+17B4–17B5, and the variation selectors U+180B–180F, U+FE00–FE0F and U+E0100–E01EF), a picture's alt text in a link included | a visible marker such as `⟨U+202E⟩` ("Trojan Source": code that reads other than it runs) |
| a table body row's cells past the header's | dropped, as GFM has it; a short row isn't padded |

| Function | Module | What it gives |
|---|---|---|
| `parseMarkdown(text)` | `parse` | the blocks: paragraph, code, list, quote, rule, table |
| `parseDocument(text)` | `parse` | the repository's own Markdown as blocks, its headings kept at their level, or a `DocumentError` ([repository Markdown](#repository-markdown)) |
| `parseInlineMarkdown(text)` | `inline` | one line of phrasing: text, code spans, emphasis, strong |
| `plainText(text)` | `plainText` | the text as plain text |
| `labelText(text, max?)` | `plainText` | a short name: the plain text of its first block that shows any |
| `liveLink(url)` | `links` | whether a link is followed, and its host |
| `inspectMarkdown(text)` | `parse` | whether the text is one paragraph as written (a heading isn't), and notes of what the tree folds away or a check looks at: raw HTML, pictures, links (an autolink told apart), code outside a link, character references, what nests too deep to show as written, a table past its caps, a heading underlined with dashes |
| `markdownProblems(text, rule)` | `problems` | what wouldn't show as its author meant, by the [rules for a release](#rules-for-a-release), in a field held to `SIDE`, `OPTION` or `PROSE` |
| `chunksOf(blocks)` | `chunks` | the [chunks](#chunks) blocks are shown in, split at their top-level rules |
| `splitAtRules(blocks)` | `chunks` | the pieces between top-level rules, empty ones included |
| `inspectChunks(text)` | `chunks` | how many chunks a text is shown in, and how many empty pieces its rules make |

### Limits

Every entry point for data is bounded, and a text past a limit is
plain, its source still readable, unless the limit says otherwise.
[Repository Markdown](#repository-markdown) lifts only `MAX_CHARS`.
The limits count lines as the parser does: a line ends at a line
feed, a carriage return, or both, and only spaces and tabs make it
blank.

- **`MAX_CHARS`, 20,000 characters.** The longest course text is about
  2,600.
- **`MAX_LINE_NESTING`, 16 containers opened on one line, and
  `MAX_DELIMITERS`, 2,000 `*` and `_` in a text.** The parser is
  quadratic in either (`- - - - …` at 20,000 characters takes tens of
  seconds). No text people write comes near them.
- **`MAX_NESTED_LINES`, 300 quotes or list items opened inside a list
  item** (`- - a`, `- > a`, or an item indented under another), and
  **`MAX_LAZY_LINES`, 200 lines that continue a quote's or item's
  paragraph without its `>` or indentation.** The parser is quadratic
  in both (`- a` followed by 10,000 such lines takes over a second).
  The count runs for the whole paragraph. A line of only `>`s and text
  goes on with it, and so does a list item that can't interrupt a
  paragraph (`2.`, or an item with nothing after its marker). So does a
  marker indented four or more columns past the content of the item
  around the paragraph, or past the line's start in a quote: it's the
  paragraph's text. Only a blank line, a fence, a thematic break, a
  line of only the `>`s it starts with or a list item that can
  interrupt a paragraph starts it again. A run of backticks with
  another backtick after it on the line isn't a fence, as CommonMark
  has it, so it goes on with the paragraph. In a quote, an indented line
  counts too; in a list item, a line indented less than the item's
  content does.
- **`MAX_QUOTES`, 200 block quotes a text opens**, side by side or
  apart, in a list item or in another quote. A quote's next line that
  starts with the same `>`s opens none, so one long quote at a line's
  start counts once; a `>` after four columns of white space is code,
  and opens none either. The count doesn't follow fenced code, HTML
  or list items, so it can be off either way. Mostly it errs high. A
  `>` on a line indented less than the one above counts as a quote of
  its own, as that line may have left a list item. A code block of
  many `>` lines that each follow one without, or a long quote in a list
  item, may count past the limit and show as plain text. It errs low
  only after a line it takes for a quote's that the parser doesn't,
  such as an HTML block's last line: the quote the next line opens goes
  uncounted. That is at most one for each quote it counts, so a text it
  lets through opens at most about twice `MAX_QUOTES`, still a bounded
  cost. The parser is quadratic in them too.
- **`MAX_UNDERLINES`, 200 lines that could underline a heading** (`===`,
  `---`, with up to three spaces before and white space after). The
  parser is quadratic in setext headings too (`a\n=\n…` at 20,000
  characters takes over a second).
- **`MAX_DEPTH`, 8.** Blocks and phrasing nested deeper show as their
  source, so every walker of the tree recurses at most 8 deep. Each
  quote, list item, paragraph, emphasis and link is a level: in seven
  quotes, a paragraph's text is the eighth level and shows as written,
  but markup there shows as its source.
- **Tables:** a table of more than 20 columns (the header's) or 2,000
  cells shows as its source.
- **`labelText`** reads one run of lines up to a blank line at a time,
  going on only while what it has read shows no text (a rule, a
  definition), at most 2,000 characters in all. A label costs the same
  however long the text. A reference defined after a blank line isn't
  resolved there, and reads as written. The label of each text's
  first 2,000 characters is kept, so a long list such as a draft's
  outline reads none of its labels again when it's shown again. It's
  kept under a copy of those characters alone, so a lookup costs the
  same however many texts there are. The labels kept are of at most 64 Mi
  characters of those starts in all (`LABEL_CACHE_CHARS`, as many as
  the app reads of a release's terms), and the one used longest ago
  goes first.

The package's tests include the cmark and commonmark.js pathological
inputs, each at the length cap, within a time budget.

### Chunks

A step's theory in Markdown is read a chunk at a time
([courses.md](courses.md#the-learners-flow)), split at its thematic
breaks (`---`, `***` or `___` on a line of their own). Nowhere else
does a break split: in a note or a chapter's description it shows as a
rule.

- **Only a break at the top level splits.** One in a list item or a
  block quote shows there as a rule.
- **The parsed tree is split, not the source** (`chunksOf`). A
  reference link in one chunk resolves by a definition in another, and
  a `---` line in a code block splits nothing. A `---` right under a
  line of text underlines it as a heading, so a blank line goes before
  it. The checks name such a heading wherever it is (`dashHeading`, in
  the [rules for a release](#rules-for-a-release)).
- **The breaks aren't shown.** A chunk is the blocks between two.
  Empty chunks, from a break first, last or right after another, are
  dropped; the library refuses them
  ([deck-library.md](deck-library.md#markdown-rules)).
- **One chunk** holds all of a text without a top-level break, of a
  text past the [limits](#limits) (shown as plain text), and of plain
  theory, whatever it holds.

## Where it is shown: the profiles

The renderer is `packages/ui/src/ui/Markdown.tsx`, reached through
`DataText.tsx` (`DataText`, `DataProse` for a step's theory,
`DataLine`); nothing else renders text from data as Markdown. A text's
profile depends only on the place, never on its deck or course.

| Construct | **Block** profile (`DataText`, `MarkdownBlocks`) | **Inline** profile (`DataLine`) |
|---|---|---|
| Text, emphasis, strong, code spans | as such | as such |
| Paragraphs, hard breaks | `<p>`, `<br>` | joined by a space |
| Lists, block quotes, thematic breaks | as such, but for a step's theory, which is split at its top-level breaks ([chunks](#chunks)) | items joined by "; ", the rest flattened |
| Code blocks | `<pre><code translate="no">` in a region that scrolls sideways, its language as a small label | one code span, white space collapsed |
| Tables | in a region that scrolls sideways, alignment as `md-align-*` classes | cells joined by " · " |
| Links | followed only by `liveLink` (below) | their text |

- **Block** is for card faces and notes, a step's theory, a chapter's
  description and why an option is wrong. A single paragraph renders as
  the same `<p>` plain text does, keeping a face's size and centering.
  More becomes a left-aligned `div.md`, at a reading size on a card's
  face (a note's blocks as quiet as its paragraph), elsewhere at its
  place's size. A step's theory (`DataProse`) is always a
  `div.course-theory`: plain theory as paragraphs split at its blank
  lines, Markdown as the shown chunk's blocks.
- **Inline** is for a multiple-choice option (in a `<label>`) and a
  card's labels.
- **Plain** (`labelText`) is for text-only places: a Browser row (cut
  to 120 characters after the marks are gone, never inside them), a
  breadcrumb's card name, the window title and confirmations
  (`cardName`), and a picture's name from the back.

Plain text still renders byte for byte as it did before Markdown.

### Keys and screen readers

- A code block or table is a region with a name ("Code", "Table") and
  `tabIndex=0`, scrollable from the keyboard. The keys of the screen
  around it leave such a region, and a link, alone (`inDataRegion`):
  Space to reveal and a grade's number in study, Enter for Next after a
  course question.
- A course question in Markdown may hold a code block or a table, too
  much to name its options by. A `hidden` element names them instead:
  "Question:", the question's picture as the question names it (by its
  description, else "Picture on the front of the card"), and its
  `labelText`. A screen reader reading on doesn't hear the question
  twice. A question of more than one paragraph describes the options
  too; a plain question names them by the whole question, as before.

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

- **Block**, on the card's face in study and in the editor's preview:
  more than one paragraph, so a left-aligned `div.md`. It holds a
  paragraph with a code span, a list of two items with emphasis and
  strong emphasis, and a code block labeled `sh` in a region named
  "Code" that scrolls sideways.
- **Inline**, were the back an option of a course's question: one line,
  the list items joined by "; " and the code block one code span. The
  editor says so under the back: "This card's back is one of the
  options of a question: keep it to one paragraph, as the others are."
  (`notOneParagraph`, from `markdownProblems(text, OPTION)`).
- **Plain**, in the Browser's Back column (and the breadcrumb, were it
  the front): the first block that shows text, marks dropped,
  `Make a branch with git switch -c, then:` (`labelText`). The whole
  text as plain text (`plainText`) keeps the code as written:
  `stage the files; commit them`, then the code block's lines.

On a card's side, `See <b>this</b> and [the docs](https://example.org).`
shows as typed, with three hints while the card is edited: one for
each HTML tag ("HTML such as `<b>` shows as typed. Put it in
backticks to show it as code.") and one for the link ("No links here,
where they would be in the way of studying: … Put a link in a note.").
In a note, where links are followed, only the two about HTML remain.

## Repository Markdown

The repository's own Markdown, its docs, is read by the same package in
the same dialect. `parseDocument(text)` is its profile, for trusted
input at build time only, never for data:

- **Headings keep their level** (`{ type: "heading", depth, line }`)
  and their line, for a message about one. Other blocks are as
  `parseMarkdown` gives them.
- **`MAX_CHARS` is lifted, and only it.** `studio.md` is about 130 KB,
  `data-model.md` about 70 KB. The docs come nowhere near the other
  [limits](#limits).
- **What data would fold, it refuses.** Raw HTML, a picture, a link
  reference definition, what nests past `MAX_DEPTH`, a table past its
  caps, and a text past `MAX_LINE_NESTING`, `MAX_NESTED_LINES`,
  `MAX_LAZY_LINES`, `MAX_QUOTES`, `MAX_DELIMITERS` or `MAX_UNDERLINES`
  each throw a `DocumentError`, naming the problem's first line when
  known. A page shows as written, or its build fails and says where.

## Diagrams

The site's build in `@solid-memo/site` (`packages/site/`) draws the
docs' Mermaid blocks to SVG at build time, in Node:
[diagrams.ts](../packages/site/src/diagrams.ts) and
[drawDiagrams.ts](../packages/site/src/drawDiagrams.ts). It runs the
official Mermaid in Chromium through Playwright, the same parser family
and layout engine as GitHub's. GitHub's own Mermaid version and HTML
labels differ, so a diagram is still checked there after an edit
([style.md](style.md#docs)).

- **What a block must have.** `diagramsOf(file, text, inputs)` checks
  each fenced `mermaid` block of a page. It's a `flowchart`, `graph`,
  `sequenceDiagram` or `stateDiagram-v2`, with an `accTitle` (the
  drawing's alternative text) and an `accDescr` (a sentence on what it
  shows). It has no `%%{…}%%` directive, which would change the
  drawing, and wherever it draws text, only characters the font has
  (`FONT_CHARS`, [below](#the-diagrams-font)). It throws one
  `DiagramError` listing every problem of the page, each with its file
  and line.
- **How it is drawn.** A block is drawn light (Mermaid's `default`
  theme) and dark, with labels as SVG text (`htmlLabels: false`, no
  `<foreignObject>`), and ids stable across builds. A node label wraps
  at 400 pixels, so no word of the docs' labels splits. Mermaid wraps
  an edge label at 200 pixels regardless, so no word in one is longer.
  `drawDiagrams` launches one browser and draws in a page per theme. A
  block Mermaid refuses fails the drawing with Mermaid's message and
  context lines, at the page's line: "Parse error on line 4" in a block
  whose fence is at `srs.md:55` is `docs/srs.md:59`.
- **The cache.** Each drawing is kept in
  `node_modules/.cache/solid-memo-docs-diagrams/` under a key
  hashing Mermaid's version, `playwright`'s (which fixes the Chromium
  build), the theme's settings, the font, its license, the drawing code
  (both modules' sources) and the block. When every drawing is there,
  no browser is launched. A drawing is written under a temporary name
  and renamed, so a build drawing at the same time never reads half a
  file. A cached drawing passes the same check as a new one
  ([below](#a-drawing-is-safe-to-serve)), or is drawn again. Its file
  name is the page's name and the first 8 digits of its hash
  (`srs-1f0e9a3c.svg`, `srs-1f0e9a3c.dark.svg`), so a changed diagram
  gets a new name and no browser shows a stale one.
- **Chromium.** `npm run browsers` installs it once: the headless
  shell, without `sudo`. On Linux, a machine that lacks its system
  libraries gets them with `sudo npx playwright install-deps
  chromium`; the [dev container](../.devcontainer/devcontainer.json)
  has them. Without Chromium, drawing fails with a message naming those
  commands. Under `DOCS_DIAGRAMS=skip`
  ([configuration.md](configuration.md#docs_diagrams), `diagramMode`),
  drawing warns and returns no drawings without starting a browser or
  reading the cache, so a build's output depends on the setting alone.
  `npm run dev` needs none of it ([below](#the-docs-as-a-site)).
  `npm run check` fails under it: the test that draws in the real
  browser is skipped, and `site`'s coverage drops below 100%.

### A drawing is safe to serve

A drawing is only shown through `<img>`, where nothing in it runs, but
its address can be opened on its own, on the app's origin, and GitHub
Pages lets the site set no Content Security Policy header. `checkSvg`
takes only what Mermaid writes, and refuses the rest.

Every `<` opens a plain tag, with no namespace prefix, of an element
Mermaid draws the docs' diagram types with. Each attribute is one
Mermaid writes (or `data-…`, `aria-…`, and the SVG and XLink namespaces
at their own addresses), each value is in quotes with no `<` inside,
and the tags close in order. That rules out `<script>`, event handlers,
HTML (`<foreignObject>`), animation (which could set a link), a
document type, comments and CDATA. A character reference is one of
XML's five (`&amp;` and the like), so the text checked is the text the
browser reads.

No style or attribute value can load anything (`cssProblem`): no
`@import`, no `image-set(`, no backslash (which could spell any of
them), no string with `:` or `/`, and an `href` or `url(` only to `#…`
in the drawing. An SVG in `<img>` loads nothing from elsewhere, so the
font is inside it: the one exception is a single `@font-face` from a
`data:` WOFF2, allowed only with its notice, the one comment, right after the opening tag.

### The diagrams' font

The diagrams are set in Fredoka, the app's own font
([vendor-code.md](vendor-code.md)), from `@fontsource-variable/fredoka`'s
Latin file. Each drawing embeds it as one `data:` `@font-face`, so it
looks the same on every machine and its text fits its boxes. Its
glyphs, `FONT_CHARS`, are printable ASCII, Latin-1 but the soft hyphen,
and `– — ‘ ’ “ ” … −`, written out and held to the file's own table by
a test. The package's `unicode-range` declares more than the file has
(`↑` and `↓` among them). A character outside `FONT_CHARS` would be
drawn and measured in another font, so a block that draws one fails,
naming it.

Fredoka is under the SIL Open Font License 1.1 (OFL). It may be
bundled and embedded in software on four conditions. It isn't sold by
itself. Each copy carries its copyright notice and the license (as a
file, a human-readable header, or metadata the user can easily see). A
modified version uses no Reserved Font Name. The font stays under the
OFL, though a document made with it needn't. Fredoka names no
Reserved Font Name, and the file is embedded unchanged.

The file holds its copyright but not the license's text, so each
drawing starts with a comment (`fontNotice`). It quotes the copyright
line (the first of the package's `LICENSE`, read at build time), names
the license, and says the font stays under it and the drawing doesn't.
It points to `OFL-Fredoka.txt`, the package's `LICENSE` byte for byte,
published beside the drawings. `checkSvg`
refuses the font without that comment. Nothing under the OFL is in the
repository, so `REUSE.toml` and `LICENSES/` don't name it.

## The docs as a site

The site's build in `@solid-memo/site` renders the docs to static
pages. `renderDocsSite` in [docsSite.ts](../packages/site/src/docsSite.ts)
reads each page of `docs/` with `parseDocument`, and its own emitter
writes the HTML, escaping every text, with no way to write raw HTML.
[publishDocs.ts](../packages/site/src/publishDocs.ts), the Vite plugin
of the site's build ([vite.config.ts](../apps/web/vite.config.ts)),
emits the pages under `docs/`. Every build, each release's among them,
publishes its own docs at `/docs/`
([deployment.md](deployment.md#what-the-artifact-contains)); in dev, a
page is rendered anew on each request, so an edit shows on reload. The build hands the plugin the
repository's address (`VITE_REPO_URL`, from the site's checked
settings), the version, the commit the links name (`main`, with a
warning, when unknown), and the site's origin from [CNAME](../CNAME),
for each page's canonical address.

- **Addresses.** The README is `docs/`, followed there by the list of
  pages from [the docs' index](#the-docs-index); every other page is
  `docs/<page>/`, so `configuration.md` is `docs/configuration/`.
  Every address a page names is relative, so the pages work from any
  folder. No page may be named `diagrams.md`, a folder of the site.
- **Links.** A link to another page leads to its address, and one to a
  heading to the heading's id, which is GitHub's (`slug.ts`), so
  `configuration.md#vite_repo_url` leads to the same heading on both. A
  link out of `docs/` leads to the file on the repository's host at the
  built commit (`blob/` for a file, `tree/` for a folder), or at the
  release's tag in an archive. An address on the web stays as it is.
- **A page** has the About page's Content Security Policy, but with
  styles from its one stylesheet, `docs.css`, alone (`style-src
  'self'`), and runs no script. Its title and description are its
  heading of level 1 and the paragraph after it. Its header names the
  version and every page under "All pages", a disclosure in the
  index's groups with the page itself marked. Its sections are under
  "On this page". The previous and next pages follow the index's order,
  the README first. Its footer links its source (on the README, the
  index's too), the issues, the license and the commit.
- **A diagram** is a figure. Its light and dark drawings go through
  `<img>` in a `<picture>`, sized from the drawing so the page doesn't
  move as it loads. Its `accTitle` is their alternative text, its
  `accDescr` the caption, and its source sits under it. The drawings go
  to `docs/diagrams/`, with the font's license beside them
  ([above](#the-diagrams-font)), and a page with a figure names their
  font in its footer. When not drawn (`DOCS_DIAGRAMS=skip`), a figure
  shows its caption and its source, open, and says so. In dev, the browser
  starts on the first drawing and stays until the server closes;
  without Chromium, the pages show the source and the server says why,
  once.
- **An archive**, a release's docs that `npm run docs:archive -- X.Y.Z`
  packs for its GitHub release
  ([deployment.md](deployment.md#a-releases-docs-as-an-archive)), is
  the same pages at the release's tag, every diagram drawn, with no
  icon and never indexed (`noindex`, no canonical address). It's read
  wherever it's unpacked: its note links the latest docs and its header
  links the site, both at the site's origin from `CNAME` (neither
  without one). The site serves no archive
  ([deployment.md](deployment.md#older-releases-docs)).

`renderDocsSite` throws one `DocsSiteError` listing, each with its file
and line, every problem that wouldn't show as written or would lead
nowhere:

- what `parseDocument` refuses ([Repository Markdown](#repository-markdown))
- a page that doesn't open with its one heading of level 1 and a
  paragraph
- a heading whose id the page already has
- a task list item (`[ ]`, `[x]`)
- a page the index doesn't list, and anything wrong with the index
  (below)
- a link to a page, heading, file or folder that isn't there; a link
  out of the repository or from the site's root; a link to a scheme
  other than `http:` and `https:`
- a diagram's problems ([above](#diagrams))
- a Mermaid block in a list or quote, which isn't drawn

`site`'s tests render the repository's own docs, so `npm run check`
fails on any of these.

### The docs' index

Which pages the docs have, in which group and order, and what each
covers, is said in one place: [docs.ttl](docs.ttl), hand-written
Turtle. The README holds the title and the introduction and links to
it, so GitHub, a tag or a clone shows the list as that file; the site
shows it on `docs/`, under the README's text. Nothing made from it is
committed: it exists in the build and in each release's archive.

~~~turtle
@base <https://solid-memo.com/docs/> .

@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix schema:  <https://schema.org/> .

<>
    a schema:Collection ;
    dcterms:title "Docs"@en .

<#the-code>
    a schema:Collection ;
    dcterms:title "The code"@en ;
    schema:isPartOf <> ;
    schema:position 20 .

<boundaries.md>
    a schema:TechArticle ;
    schema:isPartOf <#the-code> ;
    schema:position 20 ;
    schema:learningResourceType "reference" ;
    dcterms:abstract "the import rules between packages, as `npm run check:boundaries` enforces them."@en .
~~~

- **`<>`** is the docs, a `schema:Collection` whose `dcterms:title` is
  the README's heading of level 1.
- **A group** is `<#id>`, a `schema:Collection` that is
  `schema:isPartOf <>`, with a `dcterms:title` and a `schema:position`.
  Its id is lowercase words and hyphens and is its heading's id on
  `docs/`, so it may not be one of the README's.
- **A page** is its file's name, `<srs.md>`, a `schema:TechArticle`
  that is `schema:isPartOf` one group, with a `schema:position` in it,
  a `schema:learningResourceType`, its kind (`"tutorial"`, `"how-to"`,
  `"reference"` or `"explanation"`, [style.md](style.md#page-kinds)),
  and a `dcterms:abstract`, the line on what it covers. Its title is
  its own heading, never written here.
- **Order** is a whole number from 0 on each group and page, as a
  course orders its chapters ([courses.md](courses.md#order)); no
  `rdf:List`. Two in one group may not share one. Positions keep gaps
  of 10, so a new page goes between two without moving the rest.
- **Texts** are in English (`"…"@en`). A summary is Markdown, read
  with `parseDocument`: one line of phrasing, with code, emphasis and
  strong, and no link or line break (the link checks read only
  Markdown files). The index is the build's input, not a published
  format: no vocabulary term marks it as Markdown, and it has no shape.
  `readDocsIndex` in [docsIndex.ts](../packages/site/src/docsIndex.ts)
  checks everything it may say, and refuses any other subject or
  property.

`npm run check:docs` checks that the index lists every page in
`docs/`, and only those, and prints the block to add for a page it
doesn't list. `npm run format:turtle` formats the file, like the Turtle
in `ns/` and `decks/`. Its license is stated in `REUSE.toml`, as the
formatter keeps a comment only before a subject.

## Safety

Pods and libraries are untrusted: anyone's data may be opened, and most
of it never passed `npm run library:check`. Script on solid-memo.com
holds the user's Solid-OIDC session. Every safety rule holds when the
text is rendered, and none relies on a check of the data.

| Threat | Rule |
|---|---|
| Raw HTML, `<script>`, `<img onerror>` | Text: the tree has no HTML node. |
| An HTML sink | None. The renderer turns each node into one fixed element with fixed attributes; data only becomes text children, never markup, a class, a style, an id or a handler. No `dangerouslySetInnerHTML`, no sanitizer. |
| `javascript:`, `data:`, `http:`, `mailto:`, relative and `#/route` links, a URL with a user name or password | Shown as their text: only an absolute `https:` URL without credentials is followed (`liveLink`). Data can't run script, steer the app, fill in a mail, or hide its host behind `user@`. An address in a plain-text description follows the same rule. A deck's source and license links are followed for `http:` too, as sources carry it, but never with `user@` (`DataLink`), and so is the "Report a mistake" link of a release from a link. Any other address the app shows from a pod or a profile, such as a subject on the Validation, Repair or Health screens, is followed for `http:` and `mailto:` too, but never with a user name or password (`ExternalLink`). |
| Link spoofing | A followed link opens in a new tab and says so. When its text isn't its own URL, or its host is an international one, the host follows it in sight: "the spec (solidproject.org)", punycode kept, so `<https://bаnk.example>` with a Cyrillic "а" shows "(xn--bnk-6cd.example)". Text counts as its own URL only when each label of its host is the one the URL parser reads, give or take case, or an international one the parser writes in punycode, and its port is the same (`writtenHost`). A percent escape, an ideographic or full-width dot or letter, an IPv4 address in short form or a default port written out shows the host the link opens. An address in a plain-text description does the same, with its hidden characters as markers, as does a deck's source. Any other address the app shows from a pod or a profile reads with its hidden characters as markers, and as the URL parser has it, punycode kept, when it doesn't name its host as the parser reads it or that host is an international one (`ExternalLink`). For a deck's source, a title beside its link counts as text that isn't its URL. A license gets a short name such as "CC BY 4.0" only at its address on the Creative Commons or GNU site; any other shows its URL, with its host when it needs one. The link and its host are each isolated against a bidi override in the text before them. The host, and an address shown as itself, run left to right (`dir="ltr"`); other link text takes its first letter's direction (`dir="auto"`), so a link in Arabic reads right to left. |
| Tracking pictures | Never loaded: alt text only. Pictures belong in `sm:frontImage`/`sm:backImage`, with a description. |
| Trojan Source | Hidden characters in code and link text shown as markers ([the package](#the-package)); links isolated from the text around them. |
| Denial of service | The limits above, at every entry point for data, and each text parsed once. `markdownCache.ts` keeps the last 500 texts' blocks; the blocks of every chapter description of the last 8 courses whose page was opened, by release (`COURSES_KEPT`), so opening a course again parses none of them again, for as long as the app is open, which can be much of 8 releases' size; a theory's chunks, split from its cached blocks; the plain text of every card of the deck the Studio's workbench searches; the problems of every text of each field rule the Studio's release check reads, for the last draft it checked; and `labelText` keeps the label of each text's start, so a draft's outline shown again reads none of them again. No cache is keyed by a whole text: V8's `Map` hashes a long string by its length alone, and would compare a lookup with every long text of that length. The chapter descriptions' are kept by position, the labels by a text's start, and the others under a hash of all of a text's characters (`textHash`, from a seed drawn once a page), each lookup compared with the one text kept there. |

[`parseDocument`](#repository-markdown) lifts `MAX_CHARS` and is never
given data: it reads the repository's own files at build time, and no
code that reads a pod or library calls it.

Two checks of the built site hold this (`apps/web/src/build.test.ts`,
over every chunk, the [Studio](studio.md)'s included):

- **No HTML sink.** The production bundle's only module with
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `dangerouslySetInnerHTML`, `createContextualFragment`, `srcdoc` or
  `document.write` is Preact's own diff. Only a
  `dangerouslySetInnerHTML` prop reaches it, and no other module names
  one. The parser's entity decoder has a browser build that decodes
  `&name;` by writing to `innerHTML`; `apps/web/vite.config.ts` aliases
  it to its plain build, a lookup table, as do
  `packages/ui/vitest.config.ts`, `apps/web/vitest.config.ts` and
  `apps/studio/vitest.config.ts` for the component tests.
- **A Content Security Policy**, as a meta tag in `index.html` (GitHub
  Pages sets no headers): `script-src 'self'` and the inline theme
  script by its hash, `object-src 'none'`, `base-uri 'none'`,
  `form-action 'none'`. The test checks the hash still matches the
  script. `img-src` stays open, as card pictures come from pods;
  `style-src` waits until the inline styles in `packages/ui/src/ui` are
  reviewed.

## Rules for a release

A library release is held to more than a pod, so its text shows as its
author meant: `markdownProblems(text, rule)` names what wouldn't.
`npm run library:check` reports it field by field, for every card,
step and chapter of a release that states `sm:textFormat sm:markdown`
([deck-library.md](deck-library.md#markdown-rules)). The card editor
shows the same problems as hints, never as a block
([writing Markdown in the app](#writing-markdown-in-the-app)).

| Problem (`code`) | Why |
|---|---|
| Raw HTML (`html`), such as `git clone <url>` | It shows as its source. Write it as code, or escape its `<`. |
| A picture (`image`) | Only its alt text shows. A card shows a picture by `sm:frontImage`/`sm:backImage`, with a description. |
| A link where none may be (`link`): a card's `front`, `back`, `frontLabel` and `backLabel` and a distractor's `distractorText` (fields `SIDE` and `OPTION`), an autolink `<ex:title>` or `<http://…>` included | It's in the way of the keys that reveal and grade, and of an option's `<label>`; an autolink loses its angle brackets too. The fix is code. |
| A link the app doesn't follow (`linkNotFollowed`), in a note, a step's theory or a chapter's description (field `PROSE`) | Only `https:` without a user name or password is followed; any other shows as text. |
| Link text that reads as an address or a host name other than the link's (`linkHost`) | Misleading text: the named host, as written, must be the link's, port included, give or take a `www.`. A percent escape or a full-width dot in it fails. `[solidproject.org](https://www.solidproject.org/)` passes; `[bank.example](https://evil.example/)` and `[github.io](https://evil.github.io/)` don't. The test is by shape, a dotted word ending in letters: "Node.js" and a file's name such as `package.json`, `v1.ttl` or `README.md` count, even as code. Other wording avoids it ("npm's documentation of package.json"). It checks data only; the defense is the host shown beside a link ([safety](#safety)). |
| A bidi control, zero-width or other hidden character in code or a link (`hiddenControl`) | Code that reads other than it runs ("Trojan Source"); the app shows them as markers. |
| A character reference outside code (`characterReference`), such as `&aring;` | CommonMark decodes it: it shows as "å". As code, or with its `&` escaped (`\&aring;`), it shows as typed. An unknown name, `&nosuchname;`, is text and passes. |
| A heading underlined with dashes (`dashHeading`): a line of text with `---` right under it, no blank line between | It looks like text over a thematic break, which a blank line before the `---` makes it (ending a [chunk](#chunks) in a step's theory). That blank line, or a `##` heading, avoids it; `===` underlining passes. |
| An option that isn't one paragraph (`notOneParagraph`): a distractor's `distractorText`, and the `back` of a card with distractors (field `OPTION`) | Options show on one line, in the inline profile, and must look alike, or the odd one out gives the answer away. A heading is no paragraph: it shows bold on a revealed back. |
| Past the [limits](#limits): longer than `MAX_CHARS` (`tooLong`), past the parser's others (`tooComplex`), nested past `MAX_DEPTH` (`tooDeep`, unless it's plain text that shows as written anyway), a table past its caps (`largeTable`) | The text, or that part of it, shows as plain text or as its source. |

A step's theory is held to its chunks too: none of them empty, and as
many in each language, so a learner who switches language keeps their
place (`deck-library.md`). None of these is a safety rule: the safety rules hold
when text is rendered, whether or not a check ran.

## Writing Markdown in the app

A user's own card is plain text unless its writer says otherwise. The
card editor (`CardContentFields.tsx`, with `MarkdownEditing.tsx`) has a
"Format with Markdown" checkbox, **off for a new card** (so
`2 * 3 * 4` or `<tag>` stays as typed), the next one in a run too,
which keeps the added card's languages.

- **What it writes.** Switched on, the card says `sm:textFormat
  sm:markdown`; switched off on a card in Markdown, `sm:plainText`,
  which tells a deliberate choice from a marker an older app lost. The
  library upgrade keeps such a card as the user has it
  ([migrations.md](migrations.md)). A card the user doesn't switch
  keeps what it has: no marker stays none, and a format this app
  doesn't know is kept, the box showing it as not Markdown
  (`textFormatOfDraft`).
- **Text as typed.** The domain tidies the sides and notes
  (`validateCardContent`): it keeps a Markdown text's leading spaces
  and an indented code block, and trims plain text as always. The
  editor trims the labels and the pictures' descriptions, single lines
  that never hold a block.
- **Fields.** On, the sides and both notes are textareas, where Enter
  starts a line and Ctrl+Enter (⌘+Enter) saves. Once a textarea, a
  field stays one in that editor, so switching off loses no line. The
  labels and the pictures' descriptions stay single lines: a label is
  one line in study, and a description, the picture's `alt`, is always
  plain.
- **Hints, never blocks.** Under each text in Markdown, the editor
  lists what `markdownProblems` names, each language's under its own
  entry (a translation's by the translation). It holds the sides and
  labels to `SIDE`, the notes to `PROSE`, and the back to `OPTION` when
  the card has wrong options (a course's question). A text of marks
  alone gets "This shows no text as Markdown". Each list describes its
  own text (`aria-describedby`), read as that text is reached and not
  announced as it changes. A card is never refused for its Markdown.
  The Studio's [health](studio.md#health) screen lists the same hints
  for every card of a deck, its wrong options' text and notes too, each
  a link to its field.
- **Switching on.** Text Markdown reads otherwise (`readsDifferently`:
  its plain text isn't what was typed, white space aside) is noted the
  moment the box is checked (`switchMarkdown`). A status under the
  checkbox, a polite live region that describes the checkbox too, says
  so while that text is as it was. It says "check the preview" when a main
  text is among it, and "check them" when only translations, which the
  preview doesn't show, are. Markdown typed after switching on,
  switching off, and a card already in Markdown say nothing.
- **Formatting help.** A cheat sheet behind a disclosure under the
  checkbox: what to type, as code, and what it gives. No toolbar.
- **Preview.** Under the fields, the card as it's studied
  (`CardPreview`, through `CardFace` and `DataText`), so what's
  previewed is what's studied. It shows each
  text's main entry, the one being written, in its language. Pictures
  are left out, so a half-typed URL is never fetched. A card with wrong
  options shows its back as an option too, on one line. The preview is
  a disclosure, open from the start on a screen at least 34rem wide and
  closed on a narrower one.

Wrong options, a step's theory and a chapter's description have no
in-app editor ([courses.md](courses.md)).

## Outside readers

Other Solid apps, and schema.org or DCAT readers of a library, see the
Markdown source as the literal's value, which is readable by design. A
reader with plain CommonMark shows the asterisks of emphasis that only
the [CJK-friendly rule](#the-dialect) reads. So does an app before 1.15
([migrations.md](migrations.md)).
