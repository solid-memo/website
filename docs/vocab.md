# Vocabulary

Solid Memo's own RDF terms, where they are defined, how they are
versioned and how the app's constants are produced from them. The
namespace is `https://solid-memo.com/ns/vocab/v1.ttl#` — declared as
`solid-memo:` in the Turtle files, abbreviated to `sm:` in these docs;
no existing vocabulary covers spaced repetition.

## Source of truth

The vocabulary lives in this repository's [`ns/vocab/`](../ns/vocab/)
folder and is published with the site at
`https://solid-memo.com/ns/vocab/` ([ns.ts](../packages/vocab/src/ns.ts),
[deployment.md](deployment.md)). Its documents are `v1.ttl` (the
ontology), `topics.ttl` (the topics scheme) and `external.ttl`
(reference data), each at an address that is also its IRI and its
`@base`, so every term IRI is a fragment of the document that defines
it. Changes to them go through git and CI like any other change
([ns.yml](../.github/workflows/ns.yml)).

[`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) is an RDFS/OWL ontology: the
`owl:Ontology` subject carries `owl:versionInfo` and a `skos:changeNote`
per release, and every term is an `owl:Class`, `owl:DatatypeProperty`
(literal-valued, with an `xsd:` range) or `owl:ObjectProperty`
(IRI-valued) with `rdfs:label`, `rdfs:comment`, `rdfs:domain` where it
has one class, `rdfs:range`, `rdfs:isDefinedBy` and a
`skos:historyNote` saying when it arrived.

```mermaid
flowchart LR
    ttl["ns/vocab/v1.ttl"] -->|npm run generate| ts["src/vocab.generated.ts<br/>SM constants"]
    ttl -->|npm run build| dist["dist/ns/vocab/v1.ttl"]
    ts --> app["mappers, tooling"]
    dist -->|read at runtime| refs["reference data<br/>(profile checks)"]
```

`SM` in [vocab.ts](../packages/solid/src/vocab.ts) is a re-export
of the generated constants; the external vocabularies there (Solid, PIM,
Dublin Core, RDF, RDFS, FOAF) are not ours to publish and stay
hand-written. The generator copies each term's comment and history note
into the constant's JSDoc, so the meaning is one hover away.

## Concept schemes

Where a value is one of a fixed set, it is a SKOS concept, not a
string, so other applications can look up what it means:

| Scheme | Where | Concepts | Used by |
|---|---|---|---|
| `sm:StudyDirections` | [`v1.ttl`](../ns/vocab/v1.ttl) | `sm:frontToBack`, `sm:backToFront`, `sm:bidirectional` | `sm:studyDirection` on a deck |
| `sm:InvalidDataPolicies` | [`v1.ttl`](../ns/vocab/v1.ttl) | `sm:blockInstance` (default), `sm:blockSubject`, `sm:warnOnly` | `sm:invalidDataPolicy` in preferences |
| `sm:Themes` | [`v1.ttl`](../ns/vocab/v1.ttl) | `sm:systemTheme` (default), `sm:lightTheme`, `sm:darkTheme` | `sm:theme` in preferences ([theme.md](theme.md)) |
| Topics (`https://solid-memo.com/ns/vocab/topics.ttl`) | [`topics.ttl`](../ns/vocab/topics.ttl) | languages (swedish), geography, computing, science (chemistry), art, labour-market | `dcat:theme` on a deck, next to the EU data theme `EDUC` |

- Every scheme has a `dcterms:title` and a `skos:definition`; every
  concept a `skos:prefLabel` and `skos:definition` in each language the
  scheme's title is in (English always; the topics in English and
  Swedish, the app's languages) and its `skos:inScheme`. The generator
  refuses a concept that misses one. Top concepts say `skos:topConceptOf`, narrower ones
  `skos:broader`. The files are held to SKOS, SkoHub's best practice
  included (see [validation.md](validation.md#profiles-dcat-ap-and-skos)).
- A concept that replaces a string the app used before carries that
  string as its `skos:notation` (`sm:frontToBack` is `"front-to-back"`),
  so the mapping between them is data.
- `npm run generate` renders every scheme into
  `packages/vocab/src/concepts.generated.ts` (`STUDY_DIRECTIONS`,
  `INVALID_DATA_POLICIES`, `TOPICS`), which the app lists and labels
  from, in the language the user reads; [concepts.ts](../packages/domain/src/concepts.ts) looks concepts up by
  IRI or notation.
- Concepts are only ever added. One that should go is deprecated
  (`owl:deprecated`), never removed: decks point at it.

## Versioning policy

- **Within v1, terms are only ever added.** An addition bumps
  `owl:versionInfo` (1.0 → 1.1 → …) and appends to the change note. A
  term's meaning, datatype or range never changes. A term that should no
  longer be written is deprecated (`owl:deprecated true`, with
  `dcterms:isReplacedBy`), not removed: `sm:direction` gave way to
  `sm:studyDirection` in 1.6. The generated constant carries
  `@deprecated`.
- **An optional term may join a shape's current format without a format
  bump** when a reader that ignores it loses nothing: the deck's own
  study caps (`sm:deckNewCardsPerDay`, `sm:deckMaxReviewsPerDay`, 1.7)
  and the description of a card's pictures (`sm:frontImageDescription`,
  `sm:backImageDescription`, 1.12) are such terms. The vocabulary still
  moves to the next 1.x.
- **A breaking change is a new namespace** (`ns/vocab/v2.ttl#`, with
  `owl:priorVersion` pointing back), never an edit of v1: the v1 IRIs
  are baked into every pod that ever wrote them.
- The [shapes](shapes.md) say which terms a subject of a given class and
  format version uses; the vocabulary only says what each term means.

## The language of text

Solid Memo's text properties (`sm:front`, `sm:back`, `sm:frontNote`,
`sm:backLabel`, `sm:backNote`, `sm:frontImageDescription`,
`sm:backImageDescription`, and `dcterms:title` and
`dcterms:description` on a deck) say their language with the literal's
own language tag (`"Huvudstäder"@sv`), one value per language, not
with a term of ours. A deck's keywords (`dcat:keyword`) are tagged the
same way, the one text with several values per language
(`"capitals"@en, "countries"@en, "huvudstäder"@sv`). Tags are BCP 47, stored in lower case. Text in no
language — codes, numbers, symbols ("404", "Fe") — is tagged `zxx`,
BCP 47's "no linguistic content", rather than with a language it is
not in; a page shows it with no `lang`. A card side saved untagged
(`xsd:string`), or a keyword saved before deck format 6, says nothing about its language: it is not known, not
none. Which formats require which tags is the [shapes](shapes.md)'
business.

There is no term for a deck's languages: the app works out which
languages to offer from the tags the deck's text already uses (see
[i18n.md](i18n.md#text-in-the-users-languages)). Optional
`sm:frontLanguage` / `sm:backLanguage` defaults could join without a
format bump, as above, should that prove too weak. `dcterms:language`
is used only on library releases, for DCAT-AP: it names EU
authority-table languages and cannot tell a card's front from its back.

## What dereferences

| IRI | What is served |
|---|---|
| `https://solid-memo.com/ns/vocab/v1.ttl#Deck` (any term) | The ontology, `…/ns/vocab/v1.ttl`, as Turtle: the term is a subject of it. |
| `https://solid-memo.com/ns/vocab/topics.ttl#geography` (any topic) | The topics scheme, `…/ns/vocab/topics.ttl`. |
| `https://solid-memo.com/ns/vocab/external.ttl` | Reference data, not terms of ours: the external terms (EU authority-table entries, media types) Solid Memo data points at, typed so [profile validation](validation.md#profiles-dcat-ap-and-skos) can check them. |

GitHub Pages serves each as `text/turtle` with
`Access-Control-Allow-Origin: *`, so any application reads it
directly. It negotiates no content: the documents are Turtle only, and
an IRI without the `.ttl` would be a 404, which is why the namespace
keeps the extension. The `turtleDirectoryPlugin` in
[packages/vocab/tooling/publishTurtle.ts](../packages/vocab/tooling/publishTurtle.ts)
emits them into the build and serves them in dev.

## Adding a term

1. Add it to [`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) with every
   annotation; bump the version and the change note.
2. `npm run generate` (CI runs `npm run generate:check` and fails on
   drift; the drift test in `packages/vocab/tooling/generate.test.ts`
   does too).
3. Use it in a [shape](shapes.md) — the fixture test checks that every
   `sm:` predicate a shape uses is declared here.
