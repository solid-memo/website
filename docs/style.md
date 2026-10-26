# Style

How Solid Memo's code, data and docs are written. Most of it describes
what the code already does. Where the two disagree, the code nearby
wins and this page is fixed.

## Formatting

- Two spaces to indent, never tabs; LF line endings; UTF-8; a newline at
  the end of every file; no spaces at the end of a line.
  [`.editorconfig`](../.editorconfig) sets this for editors, and
  [`.gitattributes`](../.gitattributes) for git on every system.
- Four spaces in Turtle ([below](#turtle)) and in Python (PEP 8).
- TypeScript: double quotes, a semicolon after every statement, a
  trailing comma in a literal or call that spans lines, and parentheses
  around an arrow function's parameters, even one: `(card) => card.id`.
- Lines up to 100 characters.
- JSON: one item a line in an object or a list, as npm writes
  `package.json`; a trailing comma only in JSON with comments (`.jsonc`).

[Biome](https://biomejs.dev/) formats and lints the TypeScript,
JavaScript, JSON and CSS as [`biome.jsonc`](../biome.jsonc) says, and
`npm run check` fails on a file it would change. It skips what tools
write (the generated vocabulary, the lock files), the vendored files,
and the Turtle in `decks/` and `ns/`, which has its own formatter.

```sh
npm run format   # rewrite the files as Biome formats them, and apply its safe fixes
npm run lint     # check them, as npm run check does: formatting and lint rules
```

Biome's recommended lint rules are on, and a problem one finds is
fixed. A rule that fires on code that's right is turned off in
`biome.jsonc`, with its reason beside it, only for the files the reason
holds for (an `overrides` entry), or for the whole repository when it
holds everywhere. Beyond the recommended rules:

- `noImportCycles` fails on modules that import each other in a circle
  (one may read an import before it's set). What both need moves to a
  module of its own.
- `noExcessiveCognitiveComplexity` fails on a function over its limit,
  as Biome scores its
  [cognitive complexity](https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/).
  The limit, `maxAllowedComplexity`, started at the most complex
  function's score, and a change that splits up the functions over a
  lower limit lowers it. A function is split up, never excused with a
  `biome-ignore` comment.

**In an editor**, Biome's extension (`biomejs.biome` for VS Code, which
[`.vscode/extensions.json`](../.vscode/extensions.json) and the dev
container recommend; Biome's website lists the others) formats these
files by the same `biome.jsonc` once it's set as their formatter,
optionally on save.

[`.git-blame-ignore-revs`](../.git-blame-ignore-revs) lists the SHA of
the one commit in which Biome reformatted the code, and nothing else,
so GitHub's blame skips it. Running
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once does the
same locally. The merge queue merges every pull request with a merge
commit, which keeps its commits' SHAs
([testing.md](testing.md#the-merge-queue)), so a pull request that adds
a formatting commit can list its SHA before it's merged.

## TypeScript

The compiler holds the code to most of the rules
([`tsconfig.base.json`](../tsconfig.base.json)): `strict`, no unused
variables or parameters, and no case falling through in a `switch`.
With `verbatimModuleSyntax`, a type is imported with `import type` or
`type X` in the import list.

- **Imports** follow the layers in [boundaries.md](boundaries.md),
  which `npm run check:boundaries` checks. A package is imported by its
  name and module (`@solid-memo/domain/deck`), never by a relative path out
  of its folder.
- **Pure where it can be.** The domain is plain types and pure functions;
  input and output happen behind the application's ports
  ([architecture.md](architecture.md)).
- **Plain data.** Interfaces and type aliases for data, `readonly` where
  it isn't meant to change, and functions over it rather than classes. A
  class is for something with a lifetime: an adapter, a store, an error.
- **Errors the user may see** are an `AppError` with a code, whose text
  every language has ([appError.ts](../packages/domain/src/appError.ts)).
  An error only a programming mistake can cause stays a plain `Error`.
  A read that fails with an `AppError` or a lasting 4xx from the pod
  (any but 408 and 429) is shown at once, not
  retried. A network failure, a plain `Error`, or a 5xx, 408 or 429
  (alone or as an `AppError`'s `vars.status`) is tried three times more
  first ([retryable.ts](../packages/ui/src/ui/retryable.ts)).
- **Avoid `any`**, and use a non-null assertion (`!`) only where the code
  has checked the value right before, or in a test.
- **Tests** sit beside their module, as `name.test.ts`, and keep every
  package at 100% coverage ([testing.md](testing.md)). Code no test can
  reach is removed, not excluded.

## Naming

| What | How | Example |
|---|---|---|
| A module | camelCase, named for what it holds | `deckPace.ts`, `cardHistory.ts` |
| A Preact component, and its file | PascalCase | `AddCardForm.tsx` |
| A function, a variable | camelCase, a function named for what it does or returns | `pickLocale`, `shapesRuleset` |
| A type, an interface | PascalCase, no `I` prefix | `UseCases`, `DeckInsight` |
| A constant that is configuration or a table | UPPER_SNAKE_CASE | `LOCALES`, `ERROR_TEMPLATES` |
| An error code; a message key | camelCase, read as a short sentence; a key grouped by where it shows, with dots | `deckNeedsDescription`; `footer.createdBy` |
| An RDF term | camelCase for properties, PascalCase for classes | `sm:formatVersion`, `sm:Deck` |
| A docs page | lowercase, hyphenated | `deck-library.md` |

Names are whole words in the language of the domain (deck, card, review,
release), not abbreviations: `description`, not `desc`.

## Turtle

The hand-written Turtle in `ns/`, `decks/`, `docs/` (the docs' index)
and the vocab package's `fixtures/` has a house style, which
[formatTurtle.ts](../packages/turtle/src/formatTurtle.ts) defines and
writes:

- `@base` first, then the prefixes, aligned in one block; under a
  `@base` that's a folder (ending in `/`, as the docs' index's is), an
  IRI in it is written relative to it, `<srs.md>`;
- every subject on a line of its own, then one predicate per line,
  indented four spaces, and further objects aligned under the first;
- a blank line between subjects;
- lists and blank nodes inline;
- text with a line break as a long string, `"""…"""`, written verbatim.

`npm run format:turtle` rewrites the files and
`npm run format:turtle:check` fails on any that differ. A comment stays
with the subject it comes before. A published version (`vN.ttl` under
`decks/` and `ns/shapes/`) is formatted once, before it's published,
and never changes after. `vendor/`, other projects' files, is never
reformatted.

## Comments

- Every module starts, after its [license header](#licenses), with a
  `/** … */` block that says what it's for and why it exists. An
  exported function, type or constant has one too, unless its name says
  all there is.
- A comment says why, or what isn't obvious (the rule the code follows,
  the case it guards against, the server it works around), never what
  the code says.
- A comment links the docs page that explains more by its path:
  `(docs/migrations.md)`.
- A change to the code updates its comment in the same commit.

## Licenses

Every file states its copyright holder and license
([REUSE specification](https://reuse.software/spec-3.3/)), in a header
at its top when it can carry a comment:

```ts
// SPDX-FileCopyrightText: 2026 Anton Wiklund and Solid Memo contributors
//
// SPDX-License-Identifier: MIT
```

A new file starts with that header, in its own kind of comment (`#` in
YAML, a Dockerfile or a shell script, `/* … */` in CSS). The
[reuse tool](https://reuse.software/) writes it:

```sh
reuse annotate --copyright "Anton Wiklund and Solid Memo contributors" --year 2026 --license MIT <file>
```

- A shebang stays on the first line, and the header follows it.
- A test's `// @vitest-environment node` stays on the first line too,
  with a blank line before the header (reuse drops a comment that
  touches the header on its next rewrite).

A file that can't carry a header, or mustn't be edited, is licensed in
[REUSE.toml](../REUSE.toml), whose patterns cover new files of its
kind. These are the Markdown (kept free of headers), the HTML (whose
doctype comes first), JSON, pictures, test fixtures, the generated
vocabulary, the published Turtle in `decks/` and `ns/`, and the
vendored shapes, under their authors' licenses. Each license's text is
in [LICENSES/](../LICENSES/).

A library deck is under the license its `dcterms:license` states, and
`REUSE.toml` lists each deck, a new one included, under that license.
`npm run check:reuse`, part of `npm run check`, fails when a version's
`dcterms:license` isn't the license `REUSE.toml` gives it
([testing.md](testing.md#the-repositorys-own-checks)).
A deck under a license no deck has used yet needs its SPDX identifier
in [checkReuse.ts](../scripts/checkReuse.ts) and its text in
`LICENSES/` (`reuse download <SPDX id>`).

`reuse lint` checks that every file has both. It runs in CI's docs
job, not in `npm run check`; `npm run lint:reuse` runs it locally
([testing.md](testing.md#documentation) says how to install it).

## Docs

- Each part of the app has a page in [docs/](README.md), listed in its
  index, [docs.ttl](docs.ttl), in a group and with one line on what it
  covers ([markdown.md](markdown.md#the-docs-index)). A new page joins
  the index in the same commit (`npm run format:turtle` lays it out).
- A page's opening paragraph says what it's about, in a sentence or
  two, and the page links the code: the page says how and why, the code
  what.
- A change that makes a page wrong updates the page in the same commit.
- Examples are real: a command that runs, a path that exists, Turtle
  from the repository.
- The docs are written in the app's own Markdown dialect
  ([markdown.md](markdown.md#the-dialect)). It has no autolink
  literals: a URL is a link, or is written in `<…>` (markdownlint's
  MD034 checks it). A local address not meant to be followed, such as
  `http://localhost:4173`, is a code span. It has no task lists either:
  a checklist item starts with its state in bold, **Done.** or
  **Open.** The docs use no images and no raw HTML.
- A diagram is a Mermaid `flowchart`, `graph`, `sequenceDiagram` or
  `stateDiagram-v2` block. It starts with an `accTitle:` (a short name)
  and an `accDescr:` (one sentence on what it shows), and has no
  `%%{…}%%` directive, so every diagram is drawn with the same settings
  ([markdown.md](markdown.md#diagrams)).
- Its text uses only the characters of Fredoka, the app's font
  ([markdown.md](markdown.md#the-diagrams-font) lists them), so no
  arrows: a word says it (`to`, `and back`). `npm run check` names any
  other character, with its file and line.
- A label never holds a `;` outside quotes, where Mermaid ends the
  statement. In a state diagram's transition label, which can't be
  quoted, a `;` silently cuts it short and draws stray states. A
  label with other punctuation Mermaid reads, such as a `.` in a dotted
  edge or parentheses in a node, is quoted (`-. "main.tsx only" .->`,
  `D["round(x)"]`). `>=` is written in words (Mermaid can drop the
  `>`). A word in an edge label is at most about 25 characters wide
  (Mermaid splits a longer one), so a long address there is shortened
  to its host (`guest.solid-memo.invalid`).
- `npm run check` renders the docs as pages
  ([markdown.md](markdown.md#the-docs-as-a-site)). It fails on a page
  that doesn't open with one heading of level 1 and a paragraph, and on
  two headings of a page with the same text. It fails on a page the
  index doesn't list, and on a link to a page, heading, file or folder
  that isn't there.
- After a diagram changes, a contributor checks on GitHub that it still
  draws as meant: GitHub's Mermaid version and label mode differ from
  other renderers'.

## Page kinds

Each page in `docs/` is one of four kinds, which its entry in the docs'
index names (`schema:learningResourceType`,
[markdown.md](markdown.md#the-docs-index)). The kind decides the page's
voice, and which rules of the [prose check](#the-prose-check) apply to
it. `npm run check:docs` fails on a page without one.

| Kind | What it's for | Voice |
|---|---|---|
| `tutorial` | Takes a newcomer through the app or the code, step by step. | "you", and imperatives for the steps |
| `how-to` | The steps for one task. | "you", and imperatives for the steps |
| `reference` | The rules and facts: what a part does, and the limits that apply. | Neutral |
| `explanation` | Why a part is designed the way it is. | Neutral |

A page that mixes kinds takes the kind of most of its text. The README,
the docs' own page, isn't in the index and is a reference page.

## Writing

All the docs' prose rules are on this page; no outside style guide
applies. The user guide and the pages beside it in "Using the app"
are written for a learner, every other page for a new contributor, who
knows TypeScript but not this codebase or Solid.

**Checked** marks a rule that `npm run lint:prose` checks, and
**Review** a rule only a reviewer can judge.

- **One idea per sentence**, in the active voice and the present tense.
  **Checked:** a sentence has at most 40 words, and "will", "won't",
  "shall" and "going to" are errors. **Review:** the active voice, and
  one idea per sentence.
- **No filler.** A word that adds nothing is cut. **Checked:** "just",
  "simply", "really", "very", "actually", "of course", "in order to",
  "note that" and the rest of the `filler` list are errors, and "also",
  "as well", "itself" and "themselves" appear at most once a section.
- **Voice** is the page kind's ([above](#page-kinds)). A neutral page
  names who acts: "the learner", "a contributor", "the check".
  **Checked:** "you" and "your" are errors on neutral pages.
- **Contractions** everywhere: "don't", "isn't", "can't". **Checked:**
  "do not", "is not", "cannot" and the other negations are errors, each
  with its contraction.
- **No "we" or "our".** The project, or what acts, is named instead:
  "Solid Memo's servers".
  **Checked.**
- **Plain words.** "for example" and "that is", not "e.g." and "i.e.";
  no exclamation marks. **Checked.**
- **Links.** A page or file is linked once a section, at its first
  mention. Later mentions are code spans (`testing.md`) or plain words.
  A link's text says where it leads, never "here" or "this".
  **Checked.**
- **Reasoning.** A reference page states the rule and its result, not
  the argument for why it holds. An explanation page is where a design
  is argued. **Review.**
- **Em dashes** have a space on each side — like this. **Checked.**
- **Every fact kept.** A shorter text keeps what the longer one said.
  **Review.**

The [Docs](#docs) and [Language](#language) sections apply as well.

## The prose check

`npm run lint:prose`, part of `npm run check`, checks every page in
`docs/` against the rules in [prose.json](../prose.json), each with its reason as its message.
[checkProse.ts](../scripts/checkProse.ts) runs it, and
[prose.ts](../packages/site/src/prose.ts) holds the rules' logic: the
project's own code, so it runs offline, and no package's update
changes what it accepts.

```sh
npm run lint:prose                    # every page
npm run lint:prose -- docs/srs.md     # the pages it names
```

- **What it reads:** paragraphs, list items, block quotes and table
  cells. It leaves out code blocks and code spans, link addresses, text
  in double quotes (a message the app shows, a quoted title), and
  headings.
- **Kinds:** a rule names the page kinds it applies to; a rule that
  names none applies to every page. Each page's kind comes from
  `docs/docs.ttl`, and no list of pages is kept by hand.
- **A problem** is printed as `docs/<page>:<line>: <what> (<rule>)`, and
  any problem fails the check.
- **A rule that's wrong** for text that's right is changed in
  `prose.json`, for every page. A page can't switch a rule off.

## Language

English is the authoritative language of the code, the docs, commit
messages, issues and pull requests, and the source of the app's
messages in its other languages ([i18n.md](i18n.md)).

- **Plain English** ([Writing](#writing)): everyday words over jargon.
  A term a newcomer may not know (pod, WebID, SHACL) is explained or
  linked at its first use on a page.
- **American spelling** in the docs, comments, English messages and
  test titles: license, color, organize, catalog, behavior, toward,
  canceled, learned; a box is checked, not given a tick.
  `npm run lint:spelling` ([cspell](https://cspell.org/), part of
  `npm run check`) checks the Markdown, `en.json` and the text of
  `docs/docs.ttl` ([testing.md](testing.md#documentation)). What can't
  be respelled keeps its spelling: the published Turtle in `decks/` and
  `ns/`, a term of a data format or an IRI, a message key every catalog
  shares, an ARIA name (`aria-labelledby`), and a quoted external
  title.
- **Say what is**: what the code does now, not what it used to do or
  may do one day.

## Commits

A commit is one whole change: the code, its tests and its docs, with
`npm run check` passing, and a generated file
(`packages/vocab/src/*.generated.ts` from `ns/`) with the change that
generated it. Its message follows Conventional Commits, as
[CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages) says: a header
`type(scope): subject` of at most 100 characters, a body that says why,
wrapped at 72 characters, a `Closes:` or `Refs:` line, and a
`BREAKING CHANGE:` line for a breaking change. `git log` has many
examples. The commits before version 1.0.0 have the same body, under a
header in sentence case, almost always with no type.
