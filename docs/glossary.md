# Glossary

The terms and abbreviations these docs use, each in a sentence, with a
link to its specification where it has one and to the page that uses
it most. The specifications' versions and status are in
[standards.md](standards.md).

## Solid and the web

- **ACP** (Access Control Policy): one of Solid's two ways for a pod to
  say who may read or write a resource; the other is WAC.
  [Specification](https://solidproject.org/TR/acp). Used when a
  release is made public ([standards.md](standards.md#solid)).
- **CSP** (Content Security Policy): a list of what a page may load and
  run, which the browser enforces.
  [Specification](https://www.w3.org/TR/CSP3/);
  [markdown.md](markdown.md).
- **DPoP** (Demonstrating Proof of Possession): ties a login's tokens to
  a key the browser holds, so a stolen token is of no use elsewhere.
  [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449).
- **IdP** (identity provider): the server you log in with, which tells
  apps that you own your WebID. Also called the OIDC issuer.
  [authentication.md](authentication.md).
- **IndexedDB**: a database inside the browser. A guest's pod is kept
  in it. [Specification](https://www.w3.org/TR/IndexedDB/);
  [guest-mode.md](guest-mode.md).
- **LDP** (Linked Data Platform): the rules for containers (folders) of
  linked data on a server, which a Solid pod follows.
  [Specification](https://www.w3.org/TR/ldp/).
- **OIDC** (OpenID Connect): a standard way to log in with an account
  from another site. [Specification](https://openid.net/specs/openid-connect-core-1_0.html).
- **Pod**: your own store of data on a Solid server, which you control
  and which apps read and write with your permission. Solid Memo keeps
  everything you study in yours. [data-model.md](data-model.md).
- **Solid**: a set of open specifications for storing your data in a
  pod you choose, apart from the apps that use it.
  [solidproject.org](https://solidproject.org/TR/);
  [architecture.md](architecture.md).
- **Solid-OIDC**: how Solid apps log you in, OpenID Connect with your
  WebID. [Specification](https://solidproject.org/TR/oidc);
  [authentication.md](authentication.md).
- **Type index**: a document in your pod that lists where each kind of
  data is, so an app can find it; a private one for you alone and a
  public one. [Specification](https://solid.github.io/type-indexes/);
  [data-model.md](data-model.md#discovery-chain).
- **WAC** (Web Access Control): one of Solid's two ways for a pod to say
  who may read or write a resource, with `.acl` documents.
  [Specification](https://solidproject.org/TR/wac).
- **WebID**: a web address that names you, such as
  `https://alice.example/profile/card#me`. Its document, your profile,
  says where your pod and your identity provider are.
  [Specification](https://www.w3.org/2005/Incubator/webid/spec/identity/);
  [authentication.md](authentication.md).

## Linked data

- **DCAT** (Data Catalog Vocabulary): W3C's terms for describing data
  sets and catalogs. A deck is described with it.
  [Specification](https://www.w3.org/TR/vocab-dcat-3/);
  [deck-library.md](deck-library.md).
- **DCAT-AP** (DCAT Application Profile): the European Union's rules for
  using DCAT, which the deck library is checked against.
  [Specification](https://semiceu.github.io/DCAT-AP/releases/3.0.1/);
  [validation.md](validation.md#profiles-dcat-ap-and-skos).
- **IRI**: a web address used as a name in linked data, which may hold
  characters beyond ASCII.
- **JSON-LD**: linked data written as JSON. A deck can be saved as a
  JSON-LD file. [Specification](https://www.w3.org/TR/json-ld11/);
  [data-model.md](data-model.md#decks-as-files).
- **Profile** (of a vocabulary): extra rules for using a vocabulary,
  such as DCAT-AP for DCAT. Not to be confused with a WebID profile.
- **PROV-O**: W3C's terms for saying where something came from and how
  it was made. A release says it of itself.
  [Specification](https://www.w3.org/TR/prov-o/);
  [deck-library.md](deck-library.md#provenance).
- **RDF** (Resource Description Framework): data as statements of
  subject, predicate and object, each named by an IRI. All of Solid
  Memo's data is RDF. [Specification](https://www.w3.org/TR/rdf11-concepts/).
- **schema.org**: a vocabulary search engines read. Solid Memo uses its
  terms for courses. [schema.org](https://schema.org/);
  [courses.md](courses.md#why-schemaorg).
- **SHACL** (Shapes Constraint Language): a language for the shape data
  must have, such as "a card has one front". Solid Memo's shapes are in
  `ns/shapes/`. [Specification](https://www.w3.org/TR/shacl/);
  [shapes.md](shapes.md).
- **Shape**: one SHACL description of a kind of subject, such as a card,
  at one version. [shapes.md](shapes.md).
- **SKOS** (Simple Knowledge Organization System): W3C's terms for
  lists of concepts, such as the study directions or the topics.
  [Specification](https://www.w3.org/TR/skos-reference/);
  [vocab.md](vocab.md#concept-schemes).
- **Turtle**: a plain-text way to write RDF, which Solid Memo writes
  every document in. [Specification](https://www.w3.org/TR/turtle/).
- **Vocabulary**: a set of terms for linked data. Solid Memo's own is
  in `ns/vocab/`, prefix `sm:`. [vocab.md](vocab.md).

## Text and languages

- **BCP 47**: the standard for language tags such as `en`, `sv` or
  `pt-BR`. [Specification](https://www.rfc-editor.org/info/bcp47);
  [vocab.md](vocab.md#the-language-of-text).
- **CJK**: Chinese, Japanese and Korean, written without spaces between
  some words, which matters for where Markdown emphasis ends.
  [markdown.md](markdown.md#the-dialect).
- **CLDR** (Unicode Common Locale Data Repository): data on how each
  language writes numbers, dates and plurals. The app's plural messages
  follow its plural rules.
  [CLDR](https://cldr.unicode.org/index/cldr-spec/plural-rules);
  [i18n.md](i18n.md), [policy.md](policy.md#cldr-plural-rules).
- **CommonMark**: a precise specification of Markdown.
  [Specification](https://spec.commonmark.org/0.31.2/);
  [markdown.md](markdown.md).
- **GFM** (GitHub Flavored Markdown): GitHub's extensions to CommonMark.
  Solid Memo takes only its tables.
  [Specification](https://github.github.com/gfm/);
  [markdown.md](markdown.md#the-dialect).
- **Hangul**: the Korean alphabet. Its letters are written together in
  syllable blocks, such as 한.
- **Jamo**: the single letters of Hangul, such as ㅎ, ㅏ and ㄴ. A
  syllable can be stored as one character or as its jamo, which look
  the same but are different text; see NFC.
- **Locale**: a language the app's own text is shown in, such as `en`
  or `ko`. [i18n.md](i18n.md).
- **Markdown**: a plain-text way to write headings, emphasis, lists and
  tables. [markdown.md](markdown.md).
- **NFC** (Normalization Form C): the Unicode form in which each letter
  is stored composed, "é" as one character rather than "e" and an
  accent. The deck library's text must be in it.
  [Specification](https://unicode.org/reports/tr15/);
  [deck-library.md](deck-library.md#checks).

## Spaced repetition

- **Answer log**: the record of every answer, kept in your pod, which
  the statistics are drawn from. [data-model.md](data-model.md#the-answer-log).
- **Answer scale**: the buttons you grade an answer with, the full 0 to
  5 or Again, Hard, Good and Easy. [srs.md](srs.md#answer-scales).
- **Ease factor**: SM-2's measure of how easy a card is; the interval
  grows by it. It starts at 2.5 and never goes below 1.3.
  [srs.md](srs.md#the-sm-2-transition).
- **Grade** (quality): how well you knew an answer, from 0 (blackout)
  to 5 (perfect). [srs.md](srs.md#the-sm-2-transition).
- **Interval**: the number of days until a card is due again.
- **Lapse**: an answer graded below 3, which starts the card's
  repetitions over. [srs.md](srs.md#the-sm-2-transition).
- **Leech**: a card forgotten four times or more, which the Studio
  points out. [studio.md](studio.md#a-decks-schedule).
- **Prompt**: one card seen from one side, front to back or back to
  front, scheduled on its own. [srs.md](srs.md#prompts-and-directions).
- **Review state**: what Solid Memo knows of a prompt's schedule: its
  ease factor, interval, repetitions and due day.
  [srs.md](srs.md#review-state).
- **SM-2** (SuperMemo 2): the scheduling algorithm Solid Memo uses,
  published by Piotr Woźniak in 1990.
  [Description](https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method);
  [srs.md](srs.md), [policy.md](policy.md#sm-2).
- **SRS** (spaced repetition system): software that shows you a card
  just before you would forget it, at longer and longer intervals.
  [srs.md](srs.md).
- **Study day**: a day as the schedule counts it, which ends at 4 in
  the morning by default, not at midnight.
  [srs.md](srs.md#study-days-and-the-queue).

## Solid Memo's own terms

- **Catalog** (`catalog.ttl`): the document that lists an instance's
  decks, or the deck library's index of its decks. Older pages spell it
  "catalogue". [data-model.md](data-model.md#the-catalogue).
- **Course**: a library deck with chapters and steps that teach before
  they ask. [courses.md](courses.md).
- **Deck**: a set of cards studied together. [data-model.md](data-model.md#decks-and-cards).
- **Deck library**: the ready-made decks in `decks/`, published with
  the site. [deck-library.md](deck-library.md).
- **Digest**: a document in the instance that remembers what Solid Memo
  learned of the others, so a visit can skip what has not changed.
  [data-model.md](data-model.md#the-digest).
- **Distractor** (wrong option): a wrong answer a course offers beside
  the right one. [courses.md](courses.md#the-model).
- **Draft**: a deck or course being written in the Studio, before it is
  published as a release. [studio.md](studio.md#drafts).
- **Format version**: the version of the shape a document is written
  in. The app brings older documents up to the one it writes.
  [migrations.md](migrations.md).
- **Guest**: someone trying the app before logging in, with a pod kept
  in the browser. [guest-mode.md](guest-mode.md).
- **Instance**: one Solid Memo folder in a pod, with its own decks,
  reviews and preferences. A pod may hold several.
  [data-model.md](data-model.md#instance-layout).
- **Receipt**: a note in the digest that a document, at one version,
  conformed to the shapes, so it need not be checked again.
  [data-model.md](data-model.md#the-digest).
- **Release**: one published version of a deck, frozen once published.
  [deck-library.md](deck-library.md#a-version).
- **Retired**: a card, chapter or step marked `owl:deprecated true`. It
  is kept, with its history, but no longer studied.
- **Series**: all the releases of one deck, which the library's index
  names. [deck-library.md](deck-library.md).
- **Studio** (Solid Memo Studio): the second app, for managing decks in
  bulk and writing and publishing releases. [studio.md](studio.md).
- **Write fence**: what keeps an instance read-only while it is being
  moved or copied, so nothing is written halfway.
  [guest-mode.md](guest-mode.md).
