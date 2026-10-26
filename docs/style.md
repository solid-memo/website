# Style

How Solid Memo's code, data and docs are written. Most of it describes
what the code already does, so new code reads like the code around it.
When this page and the code disagree, follow the code nearby and fix
this page.

## Formatting

- Two spaces to indent, never tabs; LF line endings; UTF-8; a newline at
  the end of every file; no spaces at the end of a line.
  [`.editorconfig`](../.editorconfig) tells editors so, and
  [`.gitattributes`](../.gitattributes) keeps git to it on every system.
- Four spaces in Turtle, as its house style has it ([below](#turtle)),
  and in Python, as PEP 8 has it.
- TypeScript: double quotes, a semicolon after every statement, a
  trailing comma in a literal or call that spans lines, and parentheses
  around an arrow function's parameters, even one: `(card) => card.id`.
- Lines up to 100 characters.
- JSON: one item a line in an object or a list, as npm writes
  `package.json`; a trailing comma only in JSON with comments (`.jsonc`).

[Biome](https://biomejs.dev/) formats and lints the TypeScript,
JavaScript, JSON and CSS as [`biome.jsonc`](../biome.jsonc) says, and
`npm run check` fails on a file it would change. It leaves alone what
is written by tools (the generated vocabulary, the lock files), the
vendored files, and the Turtle in `decks/` and `ns/`, which has
[its own formatter](#turtle).

```sh
npm run format   # rewrite the files as Biome formats them, and apply its safe fixes
npm run lint     # check them, as npm run check does: formatting and lint rules
```

Biome's recommended lint rules are on. A rule that fires on code that is
right as it is, is turned off in `biome.jsonc` with its reason beside it;
a problem it finds is fixed. It is turned off only where its reason
holds: for the files it names, in an `overrides` entry, and for the
whole repository only when the reason applies everywhere. Otherwise a
new mistake in any other file would pass the lint too.

Rules beyond the recommended ones are on as well:

- `noImportCycles` fails on modules that import each other in a circle,
  where one may read an import before it is set: what both need moves to
  a module of its own.
- `noExcessiveCognitiveComplexity` fails on a function too tangled to
  follow, as Biome scores its
  [cognitive complexity](https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/).
  Its limit, `maxAllowedComplexity`, started at the score of the most
  complex function there was. A change that splits up the functions over
  a lower limit lowers it too, so the code only gets simpler; a function
  is split up, never excused with a `biome-ignore` comment.

**In an editor**, install Biome's extension (`biomejs.biome` for VS Code,
which [`.vscode/extensions.json`](../.vscode/extensions.json) and the dev
container recommend; others are listed on [biomejs.dev](https://biomejs.dev/)),
and make it the formatter for these files, on save if you like. It
reads the same `biome.jsonc`, so the editor and the check agree.

The code was reformatted with Biome in one commit, which changed nothing
else. [`.git-blame-ignore-revs`](../.git-blame-ignore-revs) lists it, so
GitHub's blame looks past it; locally, run
`git config blame.ignoreRevsFile .git-blame-ignore-revs` once. The file
names a commit by its SHA, and the merge queue merges every pull request
with a merge commit, which keeps its commits' SHAs
([testing.md](testing.md#the-merge-queue)). So a pull request that adds
a formatting commit can list its SHA in the file before it is merged.

## TypeScript

The compiler holds the code to most of the rules
([`tsconfig.base.json`](../tsconfig.base.json)): `strict`, no unused
variables or parameters, no case falling through to the next in a
`switch`, and `verbatimModuleSyntax`, so a type is imported with
`import type` or `type X` in the import list.

- **Imports** follow the layers in [boundaries.md](boundaries.md), which
  `npm run check:boundaries` checks. A package is imported by its name
  and module (`@solid-memo/domain/deck`), never by a relative path out
  of its folder.
- **Pure where it can be.** The domain is plain types and pure functions;
  input and output happen behind the application's ports
  ([architecture.md](architecture.md)).
- **Plain data.** Interfaces and type aliases for data, `readonly` where
  data is not meant to change, functions over it rather than classes. A
  class is for something with a lifetime: an adapter, a store, an error.
- **Errors the user may see** are an `AppError` with a code, whose text
  every language has ([appError.ts](../packages/domain/src/appError.ts));
  an error only a programming mistake can cause stays a plain `Error`.
  A read that fails with an `AppError` or a lasting 4xx from the pod
  (any but 408 and 429, such as 401, 403 or 404) is shown at once, not
  retried. A network failure, a plain `Error`, or a 5xx, 408 or 429,
  an `AppError` carrying one in `vars.status` too, is tried three times
  more first ([retryable.ts](../packages/ui/src/ui/retryable.ts)).
- **Avoid `any`**, and use a non-null assertion (`!`) only where the code just
  made sure of the value, or in a test.
- **Tests** sit beside the module they test, as `name.test.ts`, and keep
  every package at 100% coverage ([testing.md](testing.md)). Code no
  test can reach is removed, not excluded.

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
writes. In short:

- `@base` first, then the prefixes, aligned in one block; under a
  `@base` that is a folder (ending in `/`, as the docs' index's is), an
  IRI in it is written relative to it, `<srs.md>`;
- every subject on a line of its own, then one predicate per line,
  indented four spaces, and further objects aligned under the first;
- a blank line between subjects;
- lists and blank nodes inline;
- text with a line break as a long string, `"""…"""`, written verbatim.

`npm run format:turtle` rewrites the files and
`npm run format:turtle:check` fails on any that differ. A comment stays
with the subject it comes before. A published version (`vN.ttl` under
`decks/` and `ns/shapes/`) is formatted once, before it is published,
and never changes after; `vendor/` is not ours and is never reformatted.

## Comments

- Every module starts, after its [license header](#licenses), with a
  `/** … */` block that says what it is for and why it exists. An
  exported function, type or constant has one too, unless its name says
  all there is.
- A comment says why, or what is not obvious: the rule the code follows,
  the case it guards against, the server it works around. It does not
  repeat what the code says.
- A comment links the docs page that explains more, by its path in the
  repository: `(docs/migrations.md)`.
- A comment is kept true: a change to the code changes its comment in
  the same commit.

## Licenses

Every file says who holds its copyright and under which license it may
be reused, as the [REUSE specification](https://reuse.software/spec-3.3/)
has it, so a file copied out of the repository still says so. A file
that can carry a comment does, in a header at its top:

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
- A test's `// @vitest-environment node` stays on the first line too, and
  a blank line comes between it and the header. reuse takes a comment
  that touches the header for part of it, and drops it the next time it
  rewrites the header.

The files that cannot carry a header, or must not be edited, are
licensed in [REUSE.toml](../REUSE.toml) instead: the Markdown (kept
free of headers so that it reads cleanly), the HTML (whose doctype
comes first), JSON, pictures, test fixtures, the generated vocabulary,
the published Turtle in `decks/` and `ns/`, and the vendored shapes,
which keep their authors' licenses. A new file of one of those kinds
is covered by the pattern that matches it. The text of each license is
in [LICENSES/](../LICENSES/).

A library deck is under the license it states in `dcterms:license`, so
`REUSE.toml` lists each deck under its license, and a new deck is added
there under its own. `npm run check:reuse`, part of `npm run check`,
fails when a version's `dcterms:license` is not the license
`REUSE.toml` gives it ([testing.md](testing.md#the-repositorys-own-checks)).
A deck under a license no deck has used yet needs its SPDX identifier
in [checkReuse.ts](../scripts/checkReuse.ts) and its text in
`LICENSES/` (`reuse download <SPDX id>`).

`reuse lint` checks that every file in the repository has both, in CI's
docs job ([testing.md](testing.md#documentation)), not in
`npm run check`; `npm run lint:reuse` runs it locally with
[reuse](https://reuse.software/) installed, at the version CI pins
(`pip install -r scripts/requirements-lint.txt`), and
`uv run --no-project --with-requirements scripts/requirements-lint.txt reuse lint`
runs it without installing it.

## Docs

- Each part of the app has a page in [docs/](README.md), listed in its
  index, [docs.ttl](docs.ttl), in a group and with one line on what it
  covers ([markdown.md](markdown.md#the-docs-index)). A new page is added
  to the index in the same commit, and `npm run format:turtle` lays the
  index out.
- A page starts with what it is about in a sentence or two, then links
  the code: a page says how and why, the code says what.
- A change that changes what a page says updates the page in the same
  commit.
- Examples are real: a command that runs, a path that exists, Turtle
  from the repository.
- The docs are written in the app's own Markdown dialect
  ([markdown.md](markdown.md#the-dialect)), so they read the same
  wherever that dialect is rendered. It has no autolink literals: a URL
  is a link, or is written in `<…>` (markdownlint's MD034 checks it),
  and a local address that is not meant to be followed, such as
  `http://localhost:4173`, is a code span. It has no task lists either:
  a checklist item starts with its state in bold, **Done.** or
  **Open.** The docs use no images and no raw HTML.
- A diagram is a Mermaid `flowchart`, `graph`, `sequenceDiagram` or
  `stateDiagram-v2` block. It starts with an `accTitle:` (a short name)
  and an `accDescr:` (one sentence that says what it shows), for
  readers who cannot see it, and has no `%%{…}%%` directive: every
  diagram is drawn with the same settings
  ([markdown.md](markdown.md#diagrams)).
- A diagram's text uses only printable ASCII, Latin-1 without the soft
  hyphen, and `– — ‘ ’ “ ” … −`. That rules out arrows, which the app's
  font, Fredoka, lacks, so a word says it (`to`, `and back`). A label
  never holds a `;` outside quotes, since Mermaid ends the statement
  there: a state diagram's transition label, which cannot be quoted, is
  cut short and stray states are drawn, without an error. A label with
  other punctuation Mermaid reads, such as a `.` in a dotted edge or
  parentheses in a node, is quoted (`-. "main.tsx only" .->`,
  `D["round(x)"]`), and `>=` is written in words, since Mermaid can
  drop the `>`. A word in an edge label is at most about 25 characters
  wide, since Mermaid wraps an edge label at 200 pixels and splits a
  longer word: a long address is shortened to its host
  (`guest.solid-memo.invalid`). `npm run check` names any other
  character, with its file and line.
- The docs are also rendered as pages
  ([markdown.md](markdown.md#the-docs-as-a-site)), and `npm run check`
  renders them: a page opens with one heading of level 1, then a
  paragraph that says what it is about; no two headings of a page have
  the same text; every page is listed in the docs' index,
  [docs.ttl](docs.ttl); and every link leads to a page, heading, file or
  folder that is there.
- After a diagram is changed, check on GitHub that it still draws as
  meant: GitHub's Mermaid version and label mode differ from other
  renderers', and a diagram one of them accepts another can reject or
  draw differently.

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

The rules for the docs' prose are all on this page: no outside style
guide applies. The user guide and the pages beside it in "Using the app"
are written for a learner. Every other page is written for a new
contributor, who knows TypeScript but not this codebase or Solid.

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
- **Voice.** Tutorials and how-tos address the reader as "you" and give
  the steps as imperatives. Reference and explanation pages stay
  neutral and name who acts: "the learner", "a contributor", "the
  check". **Checked:** "you" and "your" are errors on reference and
  explanation pages.
- **Contractions** everywhere: "don't", "isn't", "can't". **Checked:**
  "do not", "is not", "cannot" and the other negations are errors, each
  with its contraction.
- **No "we" or "our".** The project, or what acts, is named instead:
  "Solid Memo's servers". **Checked.**
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

The [Docs](#docs) and [Language](#language) sections apply as well:
plain English, American spelling (`npm run lint:spelling`), examples
that are real.

## The prose check

`npm run lint:prose` reads every page in `docs/` against the rules in
[prose.json](../prose.json), each with its reason as its message. [checkProse.ts](../scripts/checkProse.ts) runs
it, and [prose.ts](../packages/site/src/prose.ts) holds the rules'
logic. It's the project's own code: it runs offline, and no package's
update changes what it accepts.

```sh
npm run lint:prose                    # every page
npm run lint:prose -- docs/srs.md     # the pages it names
```

- **What it reads:** paragraphs, list items, block quotes and table
  cells. It leaves out code blocks and code spans, link addresses, text
  in double quotes (a message the app shows, a quoted title), and
  headings, which links lead to by their text.
- **Kinds:** a rule names the page kinds it applies to; a rule that
  names none applies to every page. Each page's kind comes from
  `docs/docs.ttl`, so no list of pages is kept by hand.
- **A problem** is printed as `docs/<page>:<line>: <what> (<rule>)`, and
  any problem fails the check.
- **A rule that's wrong** for text that's right is changed in
  `prose.json`, for every page. A page has no way to switch a rule off.

## Language

English is the authoritative language of the code, the docs, commit
messages, issues and pull requests. The app's messages are translated
into the other languages it speaks ([i18n.md](i18n.md)); English is
their source.

- **Plain English.** Short sentences in the active voice, as
  [Writing](#writing) says; everyday words over jargon. A term a newcomer may not know (pod, WebID, SHACL) is
  explained or linked the first time a page uses it.
- **American spelling** is the one standard: license, color, organize,
  catalog, behavior, toward, canceled, learned; a box is checked, not
  given a tick. It holds for the docs, the comments, the English
  messages and the test titles alike, and
  `npm run lint:spelling` ([cspell](https://cspell.org/), part of
  `npm run check`) checks the Markdown, `en.json` and the docs' index
  (`docs/docs.ttl`, its text, not its addresses) for it
  ([testing.md](testing.md#documentation)). What is not ours to respell
  keeps the spelling it has: the published Turtle in `decks/` and `ns/`,
  which never changes; a term of a data format or an IRI; a message key
  every catalog shares; an ARIA name (`aria-labelledby`); and the title
  of something external, quoted as it is.
- **Say what is**: describe what the code does now, not what it used to
  do or what it may do one day.

## Commits

A commit is one change, whole: the code, its tests and its docs
together, with `npm run check` passing. A file generated from another
(`packages/vocab/src/*.generated.ts` from `ns/`) is committed with the
change that generated it.

A commit message follows Conventional Commits, as
[CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages) says, and has:

- a **header**, `type(scope): subject`, its subject in the imperative,
  lowercase, saying what the project or its users gain, not which files
  changed: "feat(i18n): keep a deck's title in every language, shown in
  the reader's", not "Update deck.ts"; the whole header is at most 100
  characters;
- after a blank line, a **body** that says why: the problem, the choice
  made and what it rules out, wrapped at 72 characters;
- a `Closes: #12` line naming the issue the change finishes, or a
  `Refs: #12` line for one it only relates to, and a `BREAKING CHANGE:`
  line for a breaking change.

`git log` shows many examples; the commits before version 1.0.0 have
the same body, under a header in sentence case, almost always with no
type.
