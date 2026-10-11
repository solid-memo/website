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
- Four spaces in Turtle and Python, as their own styles have it.
- TypeScript: double quotes, a semicolon after every statement, a
  trailing comma in a literal or call that spans lines, and parentheses
  around an arrow function's parameters, even one: `(card) => card.id`.
- Lines up to 100 characters. Older code was wrapped at 80, and some is
  longer; leave it until the formatter changes it.

[Biome](https://biomejs.dev/) will enforce the TypeScript, JSON and CSS
formatting with a line width of 100, as part of `npm run check`. Until
it does, these rules are kept by hand and by review.

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

The hand-written Turtle in `ns/`, `decks/` and the vocab package's
`fixtures/` has a house style, which
[formatTurtle.ts](../packages/turtle/src/formatTurtle.ts) defines and
writes. In short:

- `@base` first, then the prefixes, aligned in one block;
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

- Every module starts with a `/** … */` block that says what it is for
  and why it exists. An exported function, type or constant has one too,
  unless its name says all there is.
- A comment says why, or what is not obvious: the rule the code follows,
  the case it guards against, the server it works around. It does not
  repeat what the code says.
- A comment links the docs page that explains more, by its path in the
  repository: `(docs/migrations.md)`.
- A comment is kept true: a change to the code changes its comment in
  the same commit.

## Docs

- Each part of the app has a page in [docs/](README.md), listed in its
  index with one sentence. A new page is added to the index in the same
  commit.
- A page starts with what it is about in a sentence or two, then links
  the code: a page says how and why, the code says what.
- A change that changes what a page says updates the page in the same
  commit.
- Examples are real: a command that runs, a path that exists, Turtle
  from the repository.

## Language

English is the authoritative language of the code, the docs, commit
messages, issues and pull requests. The app's messages are translated
into the other languages it speaks ([i18n.md](i18n.md)); English is
their source.

- **Plain English.** Short sentences in the active voice; everyday words
  over jargon. A term a newcomer may not know (pod, WebID, SHACL) is
  explained or linked the first time a page uses it.
- **American spelling** is the one standard: license, color, organize,
  catalog, behavior. Older text may still use British spelling; change
  it when you change the text around it. An identifier keeps the spelling
  it has (`dcterms:license`, a message key, a CSS property), since
  renaming it is a change of its own.
- **Say what is**: describe what the code does now, not what it used to
  do or what it may do one day.

## Commits

A commit is one change, whole: the code, its tests and its docs
together, with `npm run check` passing. A file generated from another
(`packages/vocab/src/*.generated.ts` from `ns/`) is committed with the
change that generated it.

A commit message has:

- a **subject** in the imperative, saying what the project or its users
  gain, not which files changed: "Keep a deck's title in every language,
  shown in the reader's", not "Update deck.ts";
- after a blank line, a **body** that says why: the problem, the choice
  made and what it rules out, wrapped at 72 characters;
- a `Refs: #12` or `Fixes: #12` line when an issue or a discussion
  exists.

`git log` shows many examples.
