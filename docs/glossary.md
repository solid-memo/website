# Glossary

The terms and abbreviations these docs use, each in a sentence, with a
link to its specification where it has one and to the page that uses
it most. The specifications' versions and status are in
[standards.md](standards.md).

## Solid and the web

- **ACL** (access control list): the document that says who may read or
  write a resource on a pod that uses WAC.
  [Specification](https://solidproject.org/TR/wac).
- **ACP** (Access Control Policy): one of Solid's two ways for a pod to
  say who may read or write a resource; the other is WAC.
  [Specification](https://solidproject.org/TR/acp). Used when a
  release is made public ([standards.md](standards.md#solid)).
- **ACR** (Access Control Resource): the document that says who may
  read or write a resource on a pod that uses ACP; what an ACL is for
  WAC. [Specification](https://solidproject.org/TR/acp#access-control-resource);
  [data-model.md](data-model.md).
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
- **WCAG** (Web Content Accessibility Guidelines): W3C's rules for
  making web pages usable by everyone, people with disabilities
  included. Solid Memo aims at version 2.2, level AA.
  [Specification](https://www.w3.org/TR/WCAG22/);
  [accessibility.md](accessibility.md).
- **WebID**: a web address that names you, such as
  `https://alice.example/profile/card#me`. Its document, your profile,
  says where your pod and your identity provider are.
  [Specification](https://www.w3.org/2005/Incubator/webid/spec/identity/);
  [authentication.md](authentication.md).

## Linked data

- **Data theme**: one of the European Union's broad subjects for data
  sets, from its data theme table, such as `EDUC` (Education, culture
  and sport), which every library deck states.
  [Table](https://op.europa.eu/en/web/eu-vocabularies/concept-scheme/-/resource?uri=http://publications.europa.eu/resource/authority/data-theme);
  [deck-library.md](deck-library.md#a-version).
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
- **Desired retention**: the chance of recalling a card when it comes
  back that FSRS-6 schedules for, from 70% to 97%, 90% by default; set
  in the preferences. [srs.md](srs.md#fsrs-6).
- **Difficulty**: FSRS-6's measure of how hard a card is, from 1
  (easiest) to 10 (hardest); the harder, the slower its stability
  grows. [srs.md](srs.md#fsrs-6-state).
- **Ease factor**: SM-2's measure of how easy a card is; the interval
  grows by it. It starts at 2.5 and never goes below 1.3.
  [srs.md](srs.md#the-sm-2-transition).
- **FSRS-6** (Free Spaced Repetition Scheduler, version 6): the
  scheduling algorithm Solid Memo recommends, and a new instance starts
  on, by Jarrett Ye and the Open Spaced Repetition project; it
  schedules each review for when the chance of recall falls to the
  desired retention.
  [The Algorithm](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm);
  [srs.md](srs.md#fsrs-6), [policy.md](policy.md#fsrs-6).
- **Grade** (quality): how well you knew an answer, from 0 (blackout)
  to 5 (perfect). [srs.md](srs.md#the-sm-2-transition).
- **Interval**: the number of days until a card is due again.
- **Lapse**: a review forgotten: an answer graded below 3 to a card
  already introduced, its first that study day, recalled and graded
  (not a course answer). Every grade below 3 starts the card's
  repetitions over, but only these are counted.
  [srs.md](srs.md#the-sm-2-transition),
  [statistics.md](statistics.md#what-the-figures-count).
- **Leech**: a card with four lapses or more, in either direction,
  which the Studio points out. [studio.md](studio.md#a-decks-schedule).
- **Prompt**: one card seen from one side, front to back or back to
  front, scheduled on its own. [srs.md](srs.md#prompts-and-directions).
- **Retrievability**: the chance, under FSRS-6, of recalling a card
  now: 90% after as many days as its stability, falling as days go by.
  [srs.md](srs.md#fsrs-6).
- **Review state**: what Solid Memo knows of a prompt's schedule: its
  ease factor, interval, repetitions and due day; under FSRS-6, also
  its stability and difficulty, in a state of its own.
  [srs.md](srs.md#review-state).
- **Scheduler**: the algorithm that sets the due days, FSRS-6 or SM-2,
  chosen in the preferences or from the deck list's invitation to
  switch. [srs.md](srs.md#switching-the-scheduler).
- **Scheduler invitation**: the deck list's offer, to a learner on SM-2,
  to switch to FSRS-6; "Not now" is kept in the preferences.
  [srs.md](srs.md#the-invitation-to-switch).
- **SM-2** (SuperMemo 2): the scheduling algorithm Solid Memo used
  alone before FSRS-6, and still uses for an instance made before then
  until its learner switches, published by Piotr Woźniak in 1990.
  [Description](https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method);
  [srs.md](srs.md), [policy.md](policy.md#sm-2).
- **Stability**: FSRS-6's measure of how long a card's memory lasts:
  the days until the chance of recalling it falls to 90%.
  [srs.md](srs.md#fsrs-6-state).
- **SRS** (spaced repetition system): software that shows you a card
  just before you would forget it, at longer and longer intervals.
  [srs.md](srs.md).
- **Study day**: a day as the schedule counts it, which ends at 4 in
  the morning by default, not at midnight.
  [srs.md](srs.md#study-days-and-the-queue).

## Code and tools

- **Adapter**: code that connects the app to something outside it,
  such as a pod or the browser's storage, behind a port.
  [architecture.md](architecture.md#key-objects).
- **Biome**: the tool that formats and lints the TypeScript, JSON and
  CSS. [biomejs.dev](https://biomejs.dev/);
  [style.md](style.md#formatting).
- **CI** (continuous integration): the checks GitHub Actions runs on
  every pull request and every push to `main`. A change is merged only
  when they pass. [testing.md](testing.md#continuous-integration).
- **`ci-ok`**: the one CI check a merge to `main` waits for, which
  passes only when every other job passed.
  [testing.md](testing.md#continuous-integration).
- **commitlint**: the tool that checks that a commit message follows
  Conventional Commits. CI runs it on a pull request's commits.
  [commitlint.js.org](https://commitlint.js.org/);
  [CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages).
- **Composition root**: the one place where the layers meet, the
  `composition` package. It puts each adapter behind its port and gives
  the app its use cases. [architecture.md](architecture.md).
- **Conventional Commits**: a format for commit messages,
  `type(scope): subject`, whose type says what kind of change it is,
  such as `feat` or `fix`, so that a program can read it.
  [conventionalcommits.org](https://www.conventionalcommits.org/en/v1.0.0/);
  [CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages).
- **Deploy key**: an SSH key that gives access to one repository
  alone. The release pushes its commit and tag to `main` with one.
  [releasing.md](releasing.md#the-deploy-key).
- **Docker**: runs a program in a container of its own, apart from the
  rest of the computer. The end-to-end tests and the user journeys start
  their Solid servers in it. [docker.com](https://www.docker.com/);
  [testing.md](testing.md).
- **DOI** (Digital Object Identifier): a lasting name for a published
  work, such as `10.5281/zenodo.23351087`, which `https://doi.org/`
  turns into a link to it. Zenodo gives each release one.
  [doi.org](https://www.doi.org/); [releasing.md](releasing.md).
- **End-to-end test** (e2e): a test of the app's use cases and Solid
  adapters against real Solid servers, in `e2e/pod/`.
  [testing.md](testing.md).
- **Environment**: a GitHub setting that a job of a workflow names, and
  that lets it run only on the branches it allows: `github-pages`, to
  deploy the site, `release`, whose secret is the release's deploy key,
  and `labour-market-deck`, whose secret is the taxonomy app's key, all
  three for `main` alone. [releasing.md](releasing.md#the-deploy-key),
  [deck-library.md](deck-library.md#the-taxonomy-app).
- **ETag**: a server's tag for one version of a document, which changes
  whenever the document does. The app sends it back, so that it does
  not write over a newer version or read again what it already has.
  [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#name-etag);
  [migrations.md](migrations.md).
- **Hexagonal architecture** (ports and adapters): a layout in which the
  core of the app knows only ports, and adapters connect them to the
  world outside, so each part can be replaced or tested alone.
  [architecture.md](architecture.md).
- **Node.js**: runs JavaScript outside the browser. The site is built
  and tested with version 24, as `.nvmrc` says.
  [nodejs.org](https://nodejs.org/);
  [README](../README.md#develop).
- **npm**: the package manager that comes with Node.js. It installs the
  dependencies and runs the scripts in `package.json`, such as
  `npm run check`. [npm Docs](https://docs.npmjs.com/);
  [testing.md](testing.md#commands).
- **Port**: an interface the core of the app defines for something it
  needs from outside, such as storing a deck. An adapter implements
  it. [architecture.md](architecture.md#key-objects).
- **pySHACL**: a SHACL engine written in Python. CI uses it to check
  what Solid Memo publishes a second time, apart from the engine the
  browser runs. [pySHACL](https://github.com/RDFLib/pySHACL);
  [validation.md](validation.md#the-ci-cross-check).
- **REUSE**: rules from the Free Software Foundation Europe for stating
  every file's copyright and license so that a program can read them.
  [reuse.software](https://reuse.software/);
  [style.md](style.md#licenses).
- **semantic-release**: the tool that releases each version: it
  chooses the number from the commits' Conventional Commits types,
  writes the changelog, tags the commit and makes the GitHub release.
  [semantic-release's docs](https://semantic-release.gitbook.io/);
  [releasing.md](releasing.md).
- **SemVer** (Semantic Versioning): version numbers of the form
  MAJOR.MINOR.PATCH, where the part that goes up says what kind of
  change it is. [semver.org](https://semver.org/);
  [releasing.md](releasing.md).
- **SPDX**: a standard list of short license names, such as `MIT`, and
  the header that names a file's license with one
  (`SPDX-License-Identifier: MIT`).
  [SPDX License List](https://spdx.org/licenses/);
  [style.md](style.md#licenses).
- **Turborepo**: the tool that runs each workspace package's tasks in
  the right order, and remembers results it can reuse.
  [turborepo.com](https://turborepo.com/);
  [architecture.md](architecture.md#tasks).
- **Use case**: one thing the app does for its user, such as recording
  an answer. The UI reaches the rest of the app only through them.
  [architecture.md](architecture.md#key-objects).
- **User journey**: a test that uses the built app in a browser as a
  person would, step by step. [testing.md](testing.md#user-journeys).
- **Vite**: the tool that builds the site, and serves it while you work
  on it (`npm run dev`). [vite.dev](https://vite.dev/);
  [configuration.md](configuration.md).
- **Workspace package**: one of the npm packages the repository is made
  of, each a layer with its own `package.json`, such as `packages/ui/`.
  [architecture.md](architecture.md#packages).

## Solid Memo's own terms

- **Catalog** (`catalog.ttl`): the document that lists an instance's
  decks, or the deck library's index of its decks. The published
  shapes and vocabulary, which never change, keep its British spelling
  in their text. [data-model.md](data-model.md#the-catalog).
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
- **Pod fence**: what refuses, before it is sent, a write to an address
  Solid Memo never writes to, such as another resource's access
  control. [boundaries.md](boundaries.md#the-pod-fence).
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
