# Standards

Every standard and specification Solid Memo uses, with its version,
status, where it's published and where the code uses it. The
[glossary](glossary.md) explains unfamiliar terms; rules beyond these
formats, such as SM-2 and FSRS-6, are in [policy.md](policy.md).

**Open** means anyone may read and implement the specification, free of
charge and royalties, and no single vendor decides who may use it.
Every specification below is open; the drafts and de facto ones are in
[Drafts and de facto specifications](#drafts-and-de-facto-specifications).

## Solid

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [Solid Protocol](https://solidproject.org/TR/protocol) | 0.11.0 | W3C Solid Community Group draft | Reading and writing the pod: [`packages/solid/src/`](../packages/solid/src/) through `@inrupt/solid-client`; the storage found by `pim:storage` ([data-model.md](data-model.md#discovery-chain)) | Yes (draft) |
| [Solid-OIDC](https://solidproject.org/TR/oidc) | 0.1.0 | W3C Solid Community Group draft | Login and session restore: [`solidSessionGateway.ts`](../packages/solid/src/solidSessionGateway.ts) through `@inrupt/solid-client-authn-browser`, and the site's Client ID Document, which [`clientId.ts`](../packages/site/src/clientId.ts) writes ([authentication.md](authentication.md#the-client-id-document)) | Yes (draft) |
| [WebID](https://www.w3.org/2005/Incubator/webid/spec/identity/) and the [Solid WebID Profile](https://solid.github.io/webid-profile/) | WebID 1.0 (2014); Solid WebID Profile 1.0.0 | W3C Incubator Group editor's draft; W3C Solid Community Group draft | The user's identity; the profile gives the issuer, storage and type indexes ([authentication.md](authentication.md), [onboarding.md](onboarding.md), `data-model.md`) | Yes (draft) |
| [Type Indexes](https://solid.github.io/type-indexes/) | 1.0.0 | Editor's draft | Finding and registering an instance: [`typeIndex.ts`](../packages/solid/src/typeIndex.ts) ([data-model.md](data-model.md#registrations)) | Yes (draft) |
| [Web Access Control](https://solidproject.org/TR/wac) and [Access Control Policy](https://solidproject.org/TR/acp) | WAC 1.0.0; ACP 0.9.0 | W3C Solid Community Group drafts | Making a published release public: [`solidReleasePublisher.ts`](../packages/solid/src/solidReleasePublisher.ts), through `@inrupt/solid-client`'s universal access, which speaks whichever the pod uses ([boundaries.md](boundaries.md)) | Yes (draft) |
| [Linked Data Platform](https://www.w3.org/TR/ldp/) | 1.0 | W3C Recommendation | Containers in the pod and the guest's pod: [`localPod.ts`](../packages/solid/src/localPod.ts) ([guest-mode.md](guest-mode.md)) | Yes |

## Linked data

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [RDF](https://www.w3.org/TR/rdf11-concepts/) | 1.1 | W3C Recommendation | All data in the pod, the vocabulary, the shapes and the deck library | Yes |
| [Turtle](https://www.w3.org/TR/turtle/) | 1.1 | W3C Recommendation | Every document Solid Memo writes, through N3.js: [`packages/turtle/`](../packages/turtle/) ([architecture.md](architecture.md)) | Yes |
| [JSON-LD](https://www.w3.org/TR/json-ld11/) | 1.1 | W3C Recommendation | A deck saved as a file ([data-model.md](data-model.md#decks-as-files), [`deckFile.ts`](../packages/domain/src/deckFile.ts)); the site's description in [`apps/web/index.html`](../apps/web/index.html); the site's Client ID Document, written by [`clientId.ts`](../packages/site/src/clientId.ts) ([authentication.md](authentication.md#the-client-id-document)) | Yes |
| [SPARQL 1.1 Update](https://www.w3.org/TR/sparql11-update/) | 1.1 | W3C Recommendation | Pod edits, a `PATCH` of `DELETE DATA` and `INSERT DATA` blocks ([`datasets.ts`](../packages/solid/src/datasets.ts)), which the guest's pod accepts too ([`localPod.ts`](../packages/solid/src/localPod.ts)); not N3 Patch, the Solid Protocol's own format | Yes |
| [RDF Schema](https://www.w3.org/TR/rdf11-schema/) | 1.1 | W3C Recommendation | Solid Memo's vocabulary, [`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) ([vocab.md](vocab.md)) | Yes |
| [OWL 2](https://www.w3.org/TR/owl2-overview/) | 2 | W3C Recommendation | The vocabulary's classes and properties, and `owl:deprecated` on a retired card (`vocab.md`) | Yes |
| [XML Schema datatypes](https://www.w3.org/TR/xmlschema11-2/) | 1.1 | W3C Recommendation | Typed literals (`xsd:dateTime`, `xsd:integer`, …) | Yes |
| [SHACL](https://www.w3.org/TR/shacl/) | 1.0 (2017) | W3C Recommendation | The shapes in [`ns/shapes/`](../ns/shapes/), checked in the browser by rdf-validate-shacl and in CI by pySHACL ([shapes.md](shapes.md), [validation.md](validation.md)) | Yes |
| [DCAT](https://www.w3.org/TR/vocab-dcat-3/) | 3 | W3C Recommendation | Decks, releases and the library's catalog ([deck-library.md](deck-library.md), [`releaseModel.ts`](../packages/domain/src/release/releaseModel.ts)) | Yes |
| [DCAT-AP](https://semiceu.github.io/DCAT-AP/releases/3.0.1/) | 3.0.1 | SEMIC (European Commission) specification | Profile validation of decks and the library, with the vendored shapes in [`packages/vocab/vendor/dcat-ap/3.0.1/`](../packages/vocab/vendor/) ([validation.md](validation.md#profiles-dcat-ap-and-skos)) | Yes |
| [ADMS](https://www.w3.org/TR/vocab-adms/) | 1.0 | W3C Working Group Note | `adms:versionNotes` on a release ([deck-library.md](deck-library.md#a-version)) | Yes |
| [SKOS](https://www.w3.org/TR/skos-reference/) | 2009 | W3C Recommendation | The concept schemes in [`ns/vocab/`](../ns/vocab/) ([vocab.md](vocab.md#concept-schemes)), checked with the vendored SkoHub shapes | Yes |
| [PROV-O](https://www.w3.org/TR/prov-o/) | 2013 | W3C Recommendation | How a release was made, and the sources it derives from ([deck-library.md](deck-library.md#provenance), [`provenanceRules.ts`](../packages/domain/src/release/provenanceRules.ts)) | Yes |
| [SPDX](https://spdx.github.io/spdx-spec/v2.3/) RDF terms | 2.3 | Linux Foundation specification (SPDX 2.2.1 is ISO/IEC 5962:2021) | The SHA-256 `spdx:checksum` of the script that made a deck, in its provenance ([`decks/swedish-labour-market-taxonomy-occupation-names/v2.ttl`](../decks/swedish-labour-market-taxonomy-occupation-names/v2.ttl)), checked by DCAT-AP's checksum shape; the `spdx:` prefix a release is written with ([`solidReleaseDraftRepository.ts`](../packages/solid/src/solidReleaseDraftRepository.ts)) | Yes |
| [DCMI Metadata Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) | 2020 | DCMI Recommendation (ISO 15836-2) | Titles, descriptions, creators, licenses and dates (`dcterms:`); a library card's subject (`dcterms:subject`) and its replacement in its source (`dcterms:isReplacedBy`) ([deck-library.md](deck-library.md#what-a-card-is-about)) | Yes |
| [FOAF](http://xmlns.com/foaf/spec/) | 0.99 | Specification by its authors, stable since 2014 | Agents: creators and the publisher ([`agentRecord.ts`](../packages/domain/src/agentRecord.ts)) | Yes |
| [vCard Ontology](https://www.w3.org/TR/vcard-rdf/) | 2014 | W3C Interest Group Note | A deck version's contact, a `vcard:Kind` with the project's issue tracker as its `vcard:hasURL` ([deck-library.md](deck-library.md#contact)), checked by [`deckLibrary.ts`](../packages/shacl/node/deckLibrary.ts) | Yes |
| [schema.org](https://schema.org/) | current release, unpinned ([releases](https://schema.org/docs/releases.html)) | W3C Community Group vocabulary, de facto | Courses, chapters, steps, wrong options ([courses.md](courses.md#why-schemaorg)); the site's description in `apps/web/index.html` | Yes (de facto) |
| [EU Vocabularies authority tables](https://op.europa.eu/en/web/eu-vocabularies/authority-tables) | as referenced in [`ns/vocab/external.ttl`](../ns/vocab/external.ttl) | Publications Office of the European Union reference data | A deck's languages and its data theme `EDUC` (`deck-library.md`) | Yes |
| [IANA media types](https://www.iana.org/assignments/media-types/) | registry | IANA registry | `dcat:mediaType` of a deck's distribution | Yes |

## Text and languages

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [CommonMark](https://spec.commonmark.org/0.31.2/) | 0.31.2 | Specification by the CommonMark project | Text in Markdown: [`packages/markdown/`](../packages/markdown/) ([markdown.md](markdown.md#the-dialect)) | Yes |
| [GitHub Flavored Markdown](https://github.github.com/gfm/), pipe tables only | 0.29-gfm | Specification by GitHub, de facto | Tables in Markdown text, through `micromark-extension-gfm-table` (`markdown.md`) | Yes (de facto) |
| [markdown-cjk-friendly](https://github.com/tats-u/markdown-cjk-friendly) | through `micromark-extension-cjk-friendly` ^2.0.2 | Proposed amendment to CommonMark | Emphasis next to Chinese, Japanese and Korean text (`markdown.md`) | Yes (proposal) |
| [BCP 47](https://www.rfc-editor.org/info/bcp47) | RFC 5646 and RFC 4647 | IETF Best Current Practice | Language tags on text, deck languages and the app's locales: [`languageTag.ts`](../packages/domain/src/languageTag.ts), [`locale.ts`](../packages/domain/src/locale.ts) ([vocab.md](vocab.md), [i18n.md](i18n.md)) | Yes |
| [Unicode CLDR plural rules](https://cldr.unicode.org/index/cldr-spec/plural-rules) | the browser's CLDR | Unicode Consortium | Plural messages, through `Intl.PluralRules` (`i18n.md`, [policy.md](policy.md#cldr-plural-rules)) | Yes |
| [ECMAScript Internationalization API](https://tc39.es/ecma402/) | the browser's | Ecma International standard (ECMA-402) | Plural rules, number and date formats: [`i18n.tsx`](../packages/ui/src/ui/i18n.tsx) | Yes |
| [Unicode Normalization Forms](https://unicode.org/reports/tr15/) | UAX #15 | Unicode Standard Annex | Text in normalization form C in the deck library and in search ([deck-library.md](deck-library.md#checks)) | Yes |
| [Unicode Bidirectional Algorithm](https://www.unicode.org/reports/tr9/) | UAX #9 | Unicode Standard Annex | Right-to-left text keeps its own direction: isolated between U+2068 and U+2069 in a message ([`langText.ts`](../packages/domain/src/langText.ts)), and by the style sheet (`i18n.md`) | Yes |
| [Unicode Text Segmentation](https://www.unicode.org/reports/tr29/) | UAX #29, the runtime's | Unicode Standard Annex | Characters counted as grapheme clusters, through `Intl.Segmenter`, in the deck library's checks ([`deckLibrary.ts`](../packages/shacl/node/deckLibrary.ts)) | Yes |
| [Unicode Collation Algorithm](https://www.unicode.org/reports/tr10/) | UTS #10, the browser's | Unicode Technical Standard | Sorting and comparing cards and decks, through `Intl.Collator` ([`cardQuery.ts`](../packages/domain/src/cardQuery.ts), [`deckTable.ts`](../packages/domain/src/deckTable.ts)) | Yes |
| [CSS Writing Modes](https://www.w3.org/TR/css-writing-modes-4/) | Level 4 | W3C Candidate Recommendation | `direction` and `unicode-bidi: isolate` for right-to-left languages, under `:lang()` in [`style.css`](../packages/ui/src/style.css) (`i18n.md`) | Yes |
| [CSV](https://www.rfc-editor.org/rfc/rfc4180) | RFC 4180 | IETF RFC (Informational) | The answers a learner downloads from the statistics: [`answerCsv.ts`](../packages/domain/src/answerCsv.ts) ([statistics.md](statistics.md)) | Yes |

## The web

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html) and [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749) | 1.0; RFC 6749 | OpenID Foundation final specification; IETF RFC | Under Solid-OIDC ([authentication.md](authentication.md)) | Yes |
| [DPoP](https://www.rfc-editor.org/rfc/rfc9449) | RFC 9449 | IETF RFC | Under Solid-OIDC: tokens bound to the browser's key | Yes |
| [HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) | RFC 9110 | IETF Internet Standard | Conditional writes to the pod and the guest's pod: `If-Match` the ETag read, `If-None-Match: *` to create ([`solidDeckRepository.ts`](../packages/solid/src/solidDeckRepository.ts), [`localPod.ts`](../packages/solid/src/localPod.ts), [migrations.md](migrations.md)) | Yes |
| [Web Linking](https://www.rfc-editor.org/rfc/rfc8288) | RFC 8288 | IETF RFC (Proposed Standard) | The `Link` header with `rel="type"` that finds the storage, walking up from the WebID ([`solidStorageGateway.ts`](../packages/solid/src/solidStorageGateway.ts), [data-model.md](data-model.md#discovery-chain)) | Yes |
| [UUID](https://www.rfc-editor.org/rfc/rfc9562) | RFC 9562, version 4 | IETF RFC (Proposed Standard) | New deck and card names (`deck-<uuid>`, `card-<uuid>`, part of pod IRIs) and the guest's pod's ETags, through `crypto.randomUUID()` (`solidDeckRepository.ts`, [`appUseCases.ts`](../packages/composition/src/appUseCases.ts)) | Yes |
| [Content Security Policy](https://www.w3.org/TR/CSP3/) | Level 3 | W3C Working Draft | The policy meta tag in [`apps/web/index.html`](../apps/web/index.html), checked by [`build.test.ts`](../apps/web/src/build.test.ts) ([markdown.md](markdown.md)); the docs pages' policy, written by [`docsSite.ts`](../packages/site/src/docsSite.ts) ([markdown.md](markdown.md#the-docs-as-a-site)) | Yes |
| [Media Queries](https://www.w3.org/TR/mediaqueries-5/) | Level 5 | W3C Working Draft | `prefers-color-scheme` for the theme and `prefers-reduced-motion` for motion ([`theme.tsx`](../packages/ui/src/ui/theme.tsx), [`motion.ts`](../packages/ui/src/ui/motion.ts), [`style.css`](../packages/ui/src/style.css)) | Yes |
| [CSS Color](https://www.w3.org/TR/css-color-4/) | Level 4 | W3C Candidate Recommendation | Palettes of one's own: opaque sRGB `#rrggbb` colors, required by the shape [`ns/shapes/color-set/v1.ttl`](../ns/shapes/color-set/v1.ttl) and read by [`customPalette.ts`](../packages/domain/src/customPalette.ts) ([theme.md](theme.md#palettes-of-ones-own)) | Yes |
| [SVG](https://www.w3.org/TR/SVG11/) | 1.1 (Second Edition) | W3C Recommendation | The docs' diagrams, drawn by the build into `docs/diagrams/` and limited by `checkSvg` to Mermaid's output ([`diagrams.ts`](../packages/site/src/diagrams.ts), [markdown.md](markdown.md#a-drawing-is-safe-to-serve)); the Studio's graph ([`GraphView.tsx`](../apps/studio/src/ui/graph/GraphView.tsx), [studio.md](studio.md#graph)); and the statistics charts ([`BarChart.tsx`](../packages/ui/src/ui/charts/BarChart.tsx), [`LineChart.tsx`](../packages/ui/src/ui/charts/LineChart.tsx), [statistics.md](statistics.md)) | Yes |
| [WOFF](https://www.w3.org/TR/WOFF2/) | 2.0 | W3C Recommendation | The app's self-hosted fonts ([vendor-code.md](vendor-code.md)) and Fredoka, embedded in each docs diagram ([markdown.md](markdown.md#the-diagrams-font)) | Yes |
| [IndexedDB](https://www.w3.org/TR/IndexedDB/) | 3.0 | W3C specification | The guest's pod: [`indexedDbResourceStore.ts`](../packages/browser/src/indexedDbResourceStore.ts) ([guest-mode.md](guest-mode.md)) | Yes |
| [Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html) | HTML Living Standard | WHATWG standard | Choices kept on the device ([privacy.md](privacy.md#in-the-browser)) | Yes |
| [Web Locks](https://www.w3.org/TR/web-locks/) | W3C Working Draft | W3C Working Draft | Keeping tabs apart while the guest's pod is written or moved (`guest-mode.md`) | Yes |
| [Open Graph](https://ogp.me/) | — | De facto, published by Meta | Link previews in `apps/web/index.html` | Yes (de facto) |
| [Sitemaps](https://www.sitemaps.org/protocol.html) | 0.9 | De facto, by the major search engines | `sitemap.xml`, written by the build ([`siteMap.ts`](../packages/site/src/siteMap.ts)) | Yes (de facto) |
| [robots.txt](https://www.rfc-editor.org/rfc/rfc9309) | RFC 9309 | IETF RFC | `robots.txt`, written by the build (`siteMap.ts`) | Yes |
| [GraphQL](https://spec.graphql.org/October2021/) | October 2021 | Specification by the GraphQL Foundation (Joint Development Foundation) | Reading every version of the JobTech taxonomy for the taxonomy deck: [`taxonomy_deck.py`](../scripts/taxonomy_deck.py) ([deck-library.md](deck-library.md#the-taxonomy-deck)) | Yes |
| [JSON](https://www.rfc-editor.org/rfc/rfc8259) | RFC 8259 | IETF Internet Standard (STD 90) | The taxonomy's answers, read by `taxonomy_deck.py`, and the normalized snapshot whose checksum the deck's provenance records (`deck-library.md`) | Yes |
| [WCAG](https://www.w3.org/TR/WCAG22/) | 2.2 | W3C Recommendation | Level AA for the web app and the Studio, checked with axe on every screen the journeys visit ([accessibility.md](accessibility.md)), including the Studio's minimum target size and its single-key shortcuts, which can be turned off ([studio.md](studio.md#layout)) | Yes |

Of the rest of the web platform (HTML, CSS, the DOM, Fetch,
ECMAScript), a part is listed only when the app's data or what the
reader sees depends on it.

Deck metadata names a license by its own IRI, such as
`https://creativecommons.org/licenses/by/4.0/`, typed
`dcterms:LicenseDocument` ([deck-library.md](deck-library.md#a-version)).

## The project

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [REUSE](https://reuse.software/spec-3.3/) | 3.3 | Specification by the Free Software Foundation Europe | Every file's copyright and license, in its SPDX header or in [`REUSE.toml`](../REUSE.toml), checked by `reuse lint` in CI ([style.md](style.md#licenses), [testing.md](testing.md)) | Yes |
| [SPDX License List](https://spdx.org/licenses/) | current release, unpinned | Linux Foundation reference data | License identifiers in the files' `SPDX-License-Identifier` headers and in [`LICENSES/`](../LICENSES/); `dcterms:license <https://spdx.org/licenses/MIT>` on the topics scheme ([vocab.md](vocab.md#license)) | Yes |
| [publiccode.yml](https://yml.publiccode.tools/) | `publiccodeYmlVersion: "0"` | Specification by Developers Italia, de facto | [`publiccode.yml`](../publiccode.yml), checked by the publiccode.yml parser in CI (`testing.md`) | Yes (de facto) |
| [Citation File Format](https://citation-file-format.github.io/) | 1.2.0 | Specification by its authors, de facto | [`CITATION.cff`](../CITATION.cff), its version and date set by each release ([releasing.md](releasing.md#what-a-release-does)) | Yes (de facto) |
| [Zenodo deposit metadata](https://developers.zenodo.org/#representation) | — | Zenodo's own format, de facto | [`.zenodo.json`](../.zenodo.json), the metadata Zenodo gives each archived release, in place of `CITATION.cff` (`releasing.md`) | Yes (de facto) |
| [Semantic Versioning](https://semver.org/spec/v2.0.0.html) | 2.0.0 | Specification by its authors, de facto | The app's versions from 1.0.0, chosen by semantic-release from the commits' types ([releasing.md](releasing.md#the-scheme)) | Yes (de facto) |
| [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) | 1.0.0 | Specification by its authors, de facto | Every commit message from 1.0.0 on, checked by commitlint in CI ([CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages)) | Yes (de facto) |
| [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct.html) | 2.1 | Code of conduct by its authors, de facto | [`CODE_OF_CONDUCT.md`](../CODE_OF_CONDUCT.md) | Yes (de facto) |
| [EditorConfig](https://editorconfig.org/) | — | De facto, by its authors | The repository's whitespace: [`.editorconfig`](../.editorconfig) ([style.md](style.md#formatting)) | Yes (de facto) |

## Drafts and de facto specifications

None of these is a formal standard, but each is open, so none stands in
the way of others working with Solid Memo's code or data.

- **The Solid specifications** (the Solid Protocol, Solid-OIDC, the
  Solid WebID Profile, WAC and ACP), which the W3C
  [Linked Web Storage Working Group](https://www.w3.org/groups/wg/lws/)
  is taking toward a Recommendation, are what every Solid server and
  app implements. Solid Memo's tests run against several servers
  ([testing.md](testing.md)). Its code for them, through the Inrupt
  client libraries, is all in one package, `@solid-memo/solid`
  ([vendor-code.md](vendor-code.md)), so a change in the
  specifications is a change there.
- **The type indexes** are how Solid apps find each other's data
  today; Solid Memo finds and advertises its instances through them.
  An instance can also be attached by its URL, without a type index
  ([discovery chain](data-model.md#discovery-chain)).
- **schema.org** is read by search engines and learning tools and free
  to use (CC BY-SA 3.0). Its terms only add to Solid Memo's own
  ([courses.md](courses.md#why-schemaorg)), so a tool that doesn't
  know schema.org still reads the data.
- **GitHub Flavored Markdown**: Solid Memo takes only its pipe tables,
  which most Markdown tools read.
- **markdown-cjk-friendly**, by one author, changes only emphasis next
  to Chinese, Japanese and Korean text; a CommonMark reader without it
  shows some asterisks as typed. The `sm:markdown` concept fixes both
  dialects; a wider or different one is a new concept
  ([markdown.md](markdown.md#the-dialect)), so written text keeps its
  meaning.
- **SM-2** (SuperMemo) and **FSRS-6** (Open Spaced Repetition) are
  published algorithms, not standards. SM-2's description is public
  ([srs.md](srs.md), [policy.md](policy.md#sm-2)), and so are FSRS-6's
  formulas and default parameters, with a BSD-3-Clause reference
  implementation ([srs.md](srs.md#fsrs-6), [policy.md](policy.md#fsrs-6)).
  A review state names its scheduler (`sm:scheduler`,
  [vocab.md](vocab.md#review-states)), so the two live side by side and
  another can join them.
- **Open Graph** and **Sitemaps** serve link previews and search
  engines; **publiccode.yml, the Citation File Format, Zenodo's deposit
  metadata, Semantic Versioning, Conventional Commits, the Contributor
  Covenant and EditorConfig** describe the project to people and tools.
  Nothing in the app or its data depends on any of them.
