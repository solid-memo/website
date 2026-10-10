# Markdown

How Solid Memo reads and shows text written in Markdown: the dialect,
which texts may be in it, how each place in the app shows it, and why
showing it is safe whatever a pod or library holds.

The data side, the `sm:textFormat` marker and the `sm:TextFormats`
concepts, is in [vocab.md](vocab.md#text-formats). This page is the
render policy, which may change without touching data.

## The dialect

`sm:markdown` is CommonMark 0.31.2 with GitHub Flavored Markdown pipe
tables and CJK-friendly emphasis, and nothing else: no strikethrough,
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
`_` inside a word still never emphasises, in Korean as in English:
`__사람__들` shows as typed, so use `**사람**들`.

CommonMark has no invalid documents, so nothing is ever refused: what a
place cannot show is shown as text.

## What is Markdown

Only text whose subject says `sm:textFormat sm:markdown`. Absent,
`sm:plainText`, or a concept this app does not know: the text is plain,
shown exactly as before 1.15.

| Subject | Markdown when marked | Always plain |
|---|---|---|
| `sm:Card` | `front`, `back`, `frontNote`, `backNote`, `backLabel`, and its distractors' `distractorText` and `distractorNote` | the pictures' descriptions (their `alt` text) |
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

Every entry point is bounded, for a pod or library may hold anything:

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

The renderer is `apps/web/src/ui/Markdown.tsx`, reached through
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
  card's label.
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

## Safety

Pods and libraries are untrusted: anyone's data may be opened, and most
of it never passed `npm run library:check`. Script on solid-memo.com
holds the user's Solid-OIDC session. So every safety rule holds when the
text is rendered, and none relies on a check of the data.

| Threat | Rule |
|---|---|
| Raw HTML, `<script>`, `<img onerror>` | Text: the tree has no HTML node. |
| An HTML sink | None. The renderer turns each node into one fixed element with fixed attributes; data only becomes text children, never markup, a class, a style, an id or a handler. No `dangerouslySetInnerHTML`, no sanitiser. |
| `javascript:`, `data:`, `http:`, `mailto:`, relative and `#/route` links, a URL with a user name or password | Shown as their text: only an absolute `https:` URL without credentials is followed (`liveLink`), so data can neither run script, steer the app, fill in a mail, nor hide its host behind `user@`. (`isLinkableUrl`, for the source links decks state, is unchanged.) |
| Link spoofing | A followed link opens in a new tab, says so, and when its text is not its own URL, or its host is an international one, the host it leads to follows it in sight: "the spec (solidproject.org)", punycode kept, so `<https://bаnk.example>` with a Cyrillic "а" shows "(xn--bnk-6cd.example)". The link and its host are each isolated (`dir="ltr"`), so a bidi override in the text before them cannot reorder them. |
| Tracking pictures | Never loaded: alt text only. Pictures belong in `sm:frontImage`/`sm:backImage`, with a description. |
| Trojan Source | Bidi controls, zero-width and other hidden characters in code and link text shown as markers; links isolated from the text around them. |
| Denial of service | The limits above, at every entry point, and each text parsed once (`markdownCache.ts` keeps the last 500, and a theory's chunks are split from its cached blocks). |

Two checks of the built site hold this (`apps/web/src/build.test.ts`):

- **No HTML sink.** The production bundle's only module with
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
  `dangerouslySetInnerHTML`, `createContextualFragment`, `srcdoc` or
  `document.write` is Preact's own diff, which only a
  `dangerouslySetInnerHTML` prop reaches, and no other module names one.
  The parser's entity decoder has a browser build that decodes `&name;`
  by writing to `innerHTML`; `vite.config.ts` aliases it to its plain
  build, a lookup table.
- **A Content Security Policy**, as a meta tag in `index.html` (GitHub
  Pages sets no headers): `script-src 'self'` and the inline theme
  script by its hash, `object-src 'none'`, `base-uri 'none'`,
  `form-action 'none'`. The test checks the hash still matches the
  script. `img-src` stays open, since card pictures come from pods;
  `style-src` waits until the inline styles in `src/ui` are reviewed.

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
| A link where none may be (`link`): a card's `front`, `back` and `backLabel` and a distractor's `distractorText` (fields `SIDE` and `OPTION`), an autolink `<ex:title>` or `<http://…>` included | A link there is in the way of the keys that reveal and grade, and of the `<label>` an option sits in; an autolink also loses its angle brackets. Write it as code. |
| A link the app does not follow (`linkNotFollowed`), in a note, a step's theory or a chapter's description (field `PROSE`) | Only `https:` without a user name or password is followed; any other shows as text. |
| Link text that reads as an address or a host name other than the link's (`linkHost`) | Misleading text. The named host must be the link's, give or take a `www.`: `[solidproject.org](https://www.solidproject.org/)` is fine, `[bank.example](https://evil.example/)` is not, and neither is `[github.io](https://evil.github.io/)`, for a domain the host is in says nothing of who runs it. The test is by shape, a dotted word ending in letters, so text that reads as a host name but is none counts too: "Node.js", and a file's name such as `package.json`, `v1.ttl` or `README.md`, even as code. Word it otherwise ("npm's documentation of package.json"). This is a check of the data only: the defence against a link that misleads is the host the app shows beside it ([safety](#safety)). |
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
  always. The label and the pictures' descriptions, single lines that
  never hold a block, it trims itself.
- **Fields.** On, the sides and both notes are textareas, where Enter
  starts a line and Ctrl+Enter (⌘+Enter) saves; once a textarea, a field
  stays one in that editor, so switching off loses no line. The label
  and the pictures' descriptions stay single lines: a label is one line
  in study, and a description, the picture's `alt`, is always plain.
- **Hints, never blocks.** Under each text in Markdown, each language's
  under its own entry (a translation's by the translation): what
  `markdownProblems` names, with the card's sides and label held to
  `SIDE`, the notes to `PROSE`, and the back to `OPTION` when the card
  has wrong options (a course's question); and "This shows no text as
  Markdown" for a text of marks alone. Each list describes its own text
  (`aria-describedby`), so it is read as that text is reached; it is
  not announced as it changes, which while typing would be noise. A
  card is never refused for its Markdown, as in a pod nothing is.
- **Switching on.** Text Markdown reads otherwise (`readsDifferently`:
  its plain text is not what was typed, white space aside) is noted at
  the moment the box is ticked (`switchMarkdown`), and a status under
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
