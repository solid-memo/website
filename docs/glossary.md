# Glossary

The terms and abbreviations these docs use, each linked to its
specification, if any, and the page using it most.
[standards.md](standards.md) gives the specifications' versions and
status.

## Solid and the web

- **ACL** (access control list): the document saying who may read or
  write a resource on a WAC pod.
  [Specification](https://solidproject.org/TR/wac).
- **ACP** (Access Control Policy): Solid's access control beside WAC,
  which Solid Memo uses to make a release public.
  [Specification](https://solidproject.org/TR/acp);
  [standards.md](standards.md#solid).
- **ACR** (Access Control Resource): an ACP pod's counterpart of an
  ACL. [Specification](https://solidproject.org/TR/acp#access-control-resource);
  [data-model.md](data-model.md).
- **CSP** (Content Security Policy): what the browser lets a page load
  and run.
  [Specification](https://www.w3.org/TR/CSP3/);
  [markdown.md](markdown.md).
- **DPoP** (Demonstrating Proof of Possession): ties a login's tokens to
  a key the browser holds, so a stolen token is useless elsewhere.
  [RFC 9449](https://www.rfc-editor.org/rfc/rfc9449).
- **IdP** (identity provider), or OIDC issuer: the server a learner
  logs in with, which vouches that the learner owns their WebID.
  [authentication.md](authentication.md).
- **IndexedDB**: the browser's database, which holds a guest's pod.
  [Specification](https://www.w3.org/TR/IndexedDB/);
  [guest-mode.md](guest-mode.md).
- **LDP** (Linked Data Platform): rules for a server's containers
  (folders) of linked data, which Solid pods follow.
  [Specification](https://www.w3.org/TR/ldp/).
- **OIDC** (OpenID Connect): a standard for logging in with another
  site's account.
  [Specification](https://openid.net/specs/openid-connect-core-1_0.html).
- **Pod**: a learner-controlled data store on a Solid server, which
  apps use with permission, and where Solid Memo keeps all their study.
  `data-model.md`.
- **Solid**: open specifications for keeping data in a pod its owner
  chooses, apart from the apps.
  [solidproject.org](https://solidproject.org/TR/);
  [architecture.md](architecture.md).
- **Solid-OIDC**: Solid's login, OpenID Connect with the learner's
  WebID. [Specification](https://solidproject.org/TR/oidc);
  `authentication.md`.
- **Type index**: a pod document listing where each kind of data is;
  one private, one public.
  [Specification](https://solid.github.io/type-indexes/);
  [data-model.md](data-model.md#discovery-chain).
- **WAC** (Web Access Control): Solid's other access control, with
  `.acl` documents; specification under ACL.
- **WCAG** (Web Content Accessibility Guidelines): W3C's rules for web
  pages usable by everyone, people with disabilities included. Solid
  Memo aims at version 2.2, level AA.
  [Specification](https://www.w3.org/TR/WCAG22/);
  [accessibility.md](accessibility.md).
- **WebID**: a web address naming a person, such as
  `https://alice.example/profile/card#me`, whose profile document
  names their pod and identity provider.
  [Specification](https://www.w3.org/2005/Incubator/webid/spec/identity/);
  `authentication.md`.

## Linked data

- **Data theme**: a broad subject from the European Union's data theme
  table, such as `EDUC` (Education, culture and sport); every library
  deck states one.
  [Table](https://op.europa.eu/en/web/eu-vocabularies/concept-scheme/-/resource?uri=http://publications.europa.eu/resource/authority/data-theme);
  [deck-library.md](deck-library.md#a-version).
- **DCAT** (Data Catalog Vocabulary): W3C's terms for data sets and
  catalogs, used in each deck's description.
  [Specification](https://www.w3.org/TR/vocab-dcat-3/);
  [deck-library.md](deck-library.md).
- **DCAT-AP** (DCAT Application Profile): the European Union's rules
  for DCAT, which the deck library is checked against.
  [Specification](https://semiceu.github.io/DCAT-AP/releases/3.0.1/);
  [validation.md](validation.md#profiles-dcat-ap-and-skos).
- **IRI**: a web address naming something in linked data, possibly
  non-ASCII.
- **JSON-LD**: linked data as JSON; a deck can be saved as a JSON-LD
  file. [Specification](https://www.w3.org/TR/json-ld11/);
  [data-model.md](data-model.md#decks-as-files).
- **Profile** (of a vocabulary): extra rules for a vocabulary, such as
  DCAT-AP for DCAT; not a WebID profile.
- **PROV-O**: W3C's terms for where something came from and how it
  was made, which each release states of itself.
  [Specification](https://www.w3.org/TR/prov-o/);
  [deck-library.md](deck-library.md#provenance).
- **RDF** (Resource Description Framework): data as subject, predicate
  and object statements named by IRIs; all of Solid Memo's data.
  [Specification](https://www.w3.org/TR/rdf11-concepts/).
- **schema.org**: a vocabulary search engines read, whose course terms
  Solid Memo uses. [schema.org](https://schema.org/);
  [courses.md](courses.md#why-schemaorg).
- **SHACL** (Shapes Constraint Language): describes the shape data must
  have, such as "a card has one front"; Solid Memo's are in
  `ns/shapes/`. [Specification](https://www.w3.org/TR/shacl/);
  [shapes.md](shapes.md).
- **Shape**: one versioned SHACL description of a kind of subject, such
  as a card. `shapes.md`.
- **SKOS** (Simple Knowledge Organization System): W3C's terms for
  concept lists, such as the study directions or the topics.
  [Specification](https://www.w3.org/TR/skos-reference/);
  [vocab.md](vocab.md#concept-schemes).
- **Turtle**: the plain-text RDF syntax of every Solid Memo document.
  [Specification](https://www.w3.org/TR/turtle/).
- **Vocabulary**: a set of linked data terms; Solid Memo's is in
  `ns/vocab/`, prefix `sm:`. [vocab.md](vocab.md).

## Text and languages

- **BCP 47**: the standard for language tags such as `en`, `sv` or
  `pt-BR`. [Specification](https://www.rfc-editor.org/info/bcp47);
  [vocab.md](vocab.md#the-language-of-text).
- **CJK**: Chinese, Japanese and Korean, whose missing spaces between
  some words affect where Markdown emphasis ends.
  [markdown.md](markdown.md#the-dialect).
- **CLDR** (Unicode Common Locale Data Repository): how each language
  writes numbers, dates and plurals; the app's plural messages follow
  its plural rules.
  [CLDR](https://cldr.unicode.org/index/cldr-spec/plural-rules);
  [i18n.md](i18n.md), [policy.md](policy.md#cldr-plural-rules).
- **CommonMark**: a precise Markdown specification.
  [Specification](https://spec.commonmark.org/0.31.2/);
  [markdown.md](markdown.md).
- **GFM** (GitHub Flavored Markdown): GitHub's extensions to CommonMark,
  of which Solid Memo takes only tables.
  [Specification](https://github.github.com/gfm/);
  `markdown.md#the-dialect`.
- **Hangul**: the Korean alphabet, written in syllable blocks such as
  한.
- **Jamo**: Hangul's single letters, such as ㅎ, ㅏ and ㄴ. A syllable
  as one character and as jamo looks alike but is different text (see
  NFC).
- **Locale**: a language of the app's own text, such as `en` or `ko`.
  `i18n.md`.
- **Markdown**: a plain-text way to write headings, emphasis, lists and
  tables. `markdown.md`.
- **NFC** (Normalization Form C): the Unicode form with letters
  composed: "é" as one character, not "e" and an accent. Required of
  the deck library's text.
  [Specification](https://unicode.org/reports/tr15/);
  [deck-library.md](deck-library.md#checks).

## Spaced repetition

- **Answer log**: every answer, recorded in the pod; the statistics'
  source. [data-model.md](data-model.md#the-answer-log).
- **Answer scale**: the buttons for grading an answer: the full 0 to 5,
  or Again, Hard, Good and Easy. [srs.md](srs.md#answer-scales).
- **Cram**: studying the leeches of one deck or all, now and as often
  as liked, recording nothing: no due date, statistic or leech changes.
  [srs.md](srs.md#cramming-the-leeches).
- **Desired retention**: the recall chance FSRS-6 schedules a card's
  return for: 70% to 97%, 90% by default, set in the preferences.
  [srs.md](srs.md#fsrs-6).
- **Difficulty**: FSRS-6's card hardness, 1 (easiest) to 10
  (hardest); the harder, the slower stability grows.
  [srs.md](srs.md#fsrs-6-state).
- **Ease factor**: SM-2's card ease, which the interval grows by;
  starts at 2.5, minimum 1.3.
  [srs.md](srs.md#the-sm-2-transition).
- **FSRS-6** (Free Spaced Repetition Scheduler, version 6): the
  recommended algorithm new instances start on, by Jarrett Ye and the
  Open Spaced Repetition project. It schedules a review for when recall
  falls to the desired retention.
  [The Algorithm](https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm);
  `srs.md#fsrs-6`, [policy.md](policy.md#fsrs-6).
- **Grade** (quality): how well the learner knew an answer, from 0
  (blackout) to 5 (perfect). `srs.md#the-sm-2-transition`.
- **Interval**: the days until a card is due again.
- **Lapse**: a study day's first answer to an introduced, recalled
  card graded below 3 (not a course answer). Any grade below 3
  restarts repetitions; only these count as lapses.
  `srs.md#the-sm-2-transition`,
  [statistics.md](statistics.md#what-the-figures-count).
- **Leech**: a card with four or more lapses, in either direction,
  flagged in the Studio. [studio.md](studio.md#a-decks-schedule).
- **Prompt**: one card seen from one side, front to back or back to
  front, scheduled on its own. [srs.md](srs.md#prompts-and-directions).
- **Retrievability**: under FSRS-6, the chance of recalling a card
  now: 90% after as many days as its stability, then falling.
  `srs.md#fsrs-6`.
- **Review state**: a prompt's ease factor, interval, repetitions and
  due day, plus FSRS-6's stability and difficulty in their own state.
  [srs.md](srs.md#review-state).
- **Scheduler**: FSRS-6 or SM-2, setting due days, chosen in the
  preferences or from the deck list's invitation.
  [srs.md](srs.md#switching-the-scheduler).
- **Scheduler invitation**: the deck list's offer to an SM-2 learner
  to switch to FSRS-6. The preferences keep a "Not now".
  [srs.md](srs.md#the-invitation-to-switch).
- **SM-2** (SuperMemo 2): Piotr Woźniak's 1990 algorithm, Solid Memo's
  only one before FSRS-6. Older instances keep it until their learner
  switches.
  [Description](https://www.supermemo.com/en/blog/application-of-a-computer-to-improve-the-results-obtained-in-working-with-the-supermemo-method);
  [srs.md](srs.md), [policy.md](policy.md#sm-2).
- **Stability**: under FSRS-6, the days until a card's recall falls to
  90%. `srs.md#fsrs-6-state`.
- **SRS** (spaced repetition system): software showing a card right
  before it's forgotten, at ever longer intervals.
  `srs.md`.
- **Study day**: the schedule's day, ending by default at 4 in the
  morning, not midnight.
  [srs.md](srs.md#study-days-and-the-queue).

## Code and tools

- **Adapter**: code behind a port connecting the app to the outside,
  such as a pod or the browser's storage.
  [architecture.md](architecture.md#key-objects).
- **Biome**: formats and lints the TypeScript, JSON and CSS.
  [biomejs.dev](https://biomejs.dev/);
  [style.md](style.md#formatting).
- **CI** (continuous integration): the checks GitHub Actions runs on
  every pull request and push to `main`; a change merges only if they
  pass. [testing.md](testing.md#continuous-integration).
- **`ci-ok`**: the one CI check a merge to `main` waits for, passing
  only if every other job passed or was skipped by CI's gate
  ([releasing.md](releasing.md#what-each-stage-checks)).
  `testing.md#continuous-integration`.
- **commitlint**: checks that a commit message follows Conventional
  Commits; CI runs it on a pull request's commits.
  [commitlint.js.org](https://commitlint.js.org/);
  [CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages).
- **Composition root**: the `composition` package, the one place the
  layers meet: it puts each adapter behind its port and gives the app
  its use cases. [architecture.md](architecture.md).
- **Conventional Commits**: the commit message format
  `type(scope): subject`, whose machine-readable type, such as `feat`
  or `fix`, says the kind of change.
  [conventionalcommits.org](https://www.conventionalcommits.org/en/v1.0.0/);
  `CONTRIBUTING.md#commit-messages`.
- **Deploy key**: an SSH key for one repository alone, with which the
  release pushes its commit and tag to `main`.
  [releasing.md](releasing.md#the-deploy-key).
- **Docker**: runs programs in isolated containers; the end-to-end
  tests and user journeys start their Solid servers in it.
  [docker.com](https://www.docker.com/);
  [testing.md](testing.md).
- **DOI** (Digital Object Identifier): a lasting name for a published
  work, such as `10.5281/zenodo.23351087`, which `https://doi.org/`
  resolves. Zenodo gives each release one.
  [doi.org](https://www.doi.org/); [releasing.md](releasing.md).
- **End-to-end test** (e2e): a test of the use cases and Solid
  adapters against real Solid servers, in `e2e/pod/`. `testing.md`.
- **Environment**: a GitHub setting a workflow job names, which lets
  the job run only on the branches it allows. Three exist, each for
  `main` alone: `github-pages`, for deploying the site; `release`,
  whose secret is the release's deploy key; and `labour-market-deck`,
  whose secret is the taxonomy app's key. `releasing.md#the-deploy-key`,
  [deck-library.md](deck-library.md#the-taxonomy-app).
- **ETag**: a server's tag for one version of a document, which
  changes whenever the document does. The app sends it back so it
  doesn't overwrite a newer version or reread what it already has.
  [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#name-etag);
  [migrations.md](migrations.md).
- **Hexagonal architecture** (ports and adapters): a core knowing only
  ports, which adapters connect outside; each part can be replaced or
  tested alone. `architecture.md`.
- **Node.js**: runs JavaScript outside the browser; the site is built
  and tested with version 24 (`.nvmrc`).
  [nodejs.org](https://nodejs.org/);
  [README](../README.md#develop).
- **npm**: Node.js's package manager, installing dependencies and
  running `package.json` scripts such as `npm run check`.
  [npm Docs](https://docs.npmjs.com/);
  [testing.md](testing.md#commands).
- **Port**: a core interface for an outside need, such as storing a
  deck, which an adapter implements.
  `architecture.md#key-objects`.
- **pySHACL**: a Python SHACL engine, with which CI checks Solid Memo's
  published data again, independent of the browser's engine.
  [pySHACL](https://github.com/RDFLib/pySHACL);
  [validation.md](validation.md#the-ci-cross-check).
- **REUSE**: the Free Software Foundation Europe's rules for stating
  every file's copyright and license machine-readably.
  [reuse.software](https://reuse.software/);
  [style.md](style.md#licenses).
- **semantic-release**: picks each version's number from the commits'
  Conventional Commits types, writes the changelog, tags the commit
  and makes the GitHub release.
  [semantic-release's docs](https://semantic-release.gitbook.io/);
  `releasing.md`.
- **SemVer** (Semantic Versioning): version numbers MAJOR.MINOR.PATCH,
  where the part that goes up says the kind of change.
  [semver.org](https://semver.org/); `releasing.md`.
- **SPDX**: standard short license names, such as `MIT`, and the
  header naming a file's license (`SPDX-License-Identifier: MIT`).
  [SPDX License List](https://spdx.org/licenses/);
  `style.md#licenses`.
- **Turborepo**: runs each workspace package's tasks in order and
  reuses remembered results. [turborepo.com](https://turborepo.com/);
  [architecture.md](architecture.md#tasks).
- **Use case**: one thing the app does, such as recording an answer;
  the UI reaches the rest of the app only through these.
  `architecture.md#key-objects`.
- **User journey**: a test using the built app in a browser, step by
  step, like a person. [testing.md](testing.md#user-journeys).
- **Vite**: builds the site and serves it during development
  (`npm run dev`). [vite.dev](https://vite.dev/);
  [configuration.md](configuration.md).
- **Workspace package**: one of the repository's npm packages, a layer
  with its own `package.json`, such as `packages/ui/`.
  [architecture.md](architecture.md#packages).

## Solid Memo's own terms

- **Catalog** (`catalog.ttl`): the list of an instance's decks, or the
  deck library's index. The published shapes and vocabulary, which
  never change, keep the term's British spelling in their text.
  [data-model.md](data-model.md#the-catalog).
- **Connected screen**: the post-login screen saying "Your Pod is
  connected.", which the learner may skip from then on.
  [onboarding.md](onboarding.md#skipping-the-connected-screen).
- **Course**: a library deck whose chapters and steps teach before
  they ask. [courses.md](courses.md).
- **Deck**: a set of cards studied together.
  [data-model.md](data-model.md#decks-and-cards).
- **Deck library**: the ready-made decks in `decks/`, published with
  the site. [deck-library.md](deck-library.md).
- **Digest**: an instance document remembering what Solid Memo learned
  of the others, so a visit skips the unchanged.
  [data-model.md](data-model.md#the-digest).
- **Distractor** (wrong option): a wrong answer a course offers beside
  the right one. [courses.md](courses.md#the-model).
- **Draft**: a deck or course being written in the Studio, before its
  release. [studio.md](studio.md#drafts).
- **Format version**: a document's shape version; the app upgrades
  older documents to the one it writes.
  [migrations.md](migrations.md).
- **Guest**: someone trying the app before logging in, with a
  browser-kept pod. [guest-mode.md](guest-mode.md).
- **Instance**: one Solid Memo folder in a pod, with its own decks,
  reviews and preferences; a pod may hold several.
  [data-model.md](data-model.md#instance-layout).
- **Pod fence**: the guard refusing, before sending, a write to an
  address Solid Memo never writes, such as another resource's access
  control. [boundaries.md](boundaries.md#the-pod-fence).
- **Receipt**: a digest entry recording that a document version
  conformed to the shapes, so it needn't be rechecked.
  `data-model.md#the-digest`.
- **Release**: one published version of a deck, frozen once published.
  [deck-library.md](deck-library.md#a-version).
- **Retired**: a card, chapter or step marked `owl:deprecated true`:
  kept, with its history, but not studied.
- **Series**: all the releases of one deck, named in the library's
  index. `deck-library.md`.
- **Studio** (Solid Memo Studio): the second app, for bulk deck
  management and writing and publishing releases. [studio.md](studio.md).
- **Write fence**: the guard keeping an instance read-only while moved
  or copied, so nothing is written halfway. `guest-mode.md`.
