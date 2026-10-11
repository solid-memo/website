# Standards

Every standard and specification Solid Memo uses, with its version, its
status, a link to where it is published, and where the code uses it.
A term you do not know is in the [glossary](glossary.md). The rules the
code follows beyond these formats, such as SM-2, are in
[policy.md](policy.md).

**Open** means the specification is published for anyone to read and
implement, free of charge and of royalties, with no single vendor
deciding who may use it. Every specification below is open in that
sense. Some are drafts or de facto specifications rather than formal
standards; [Drafts and de facto specifications](#drafts-and-de-facto-specifications)
says which, and why each one does not stand in the way of reuse.

## Solid

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [Solid Protocol](https://solidproject.org/TR/protocol) | 0.11.0 | W3C Solid Community Group draft | Reading and writing the pod: [`packages/solid/src/`](../packages/solid/src/) through `@inrupt/solid-client`; the storage found by `pim:storage` ([data-model.md](data-model.md#discovery-chain)) | Yes (draft) |
| [Solid-OIDC](https://solidproject.org/TR/oidc) | 0.1.0 | W3C Solid Community Group draft | Login and session restore: [`solidSessionGateway.ts`](../packages/solid/src/solidSessionGateway.ts) through `@inrupt/solid-client-authn-browser` ([authentication.md](authentication.md)) | Yes (draft) |
| [WebID](https://www.w3.org/2005/Incubator/webid/spec/identity/) and the [Solid WebID Profile](https://solid.github.io/webid-profile/) | WebID 1.0 (2014); Solid WebID Profile 1.0.0 | W3C Incubator Group editor's draft; W3C Solid Community Group draft | The user's identity and the profile the app reads the issuer, storage and type indexes from ([authentication.md](authentication.md), [onboarding.md](onboarding.md), [data-model.md](data-model.md#discovery-chain)) | Yes (draft) |
| [Type Indexes](https://solid.github.io/type-indexes/) | 1.0.0 | Editor's draft | Finding and registering an instance: [`typeIndex.ts`](../packages/solid/src/typeIndex.ts) ([data-model.md](data-model.md#registrations)) | Yes (draft) |
| [Web Access Control](https://solidproject.org/TR/wac) and [Access Control Policy](https://solidproject.org/TR/acp) | WAC 1.0.0; ACP 0.9.0 | W3C Solid Community Group drafts | Making a published release public: [`solidReleasePublisher.ts`](../packages/solid/src/solidReleasePublisher.ts), through `@inrupt/solid-client`'s universal access, which speaks whichever the pod uses ([boundaries.md](boundaries.md)) | Yes (draft) |
| [Linked Data Platform](https://www.w3.org/TR/ldp/) | 1.0 | W3C Recommendation | Containers in the pod and in the guest's pod: [`localPod.ts`](../packages/solid/src/localPod.ts) ([guest-mode.md](guest-mode.md)) | Yes |

## Linked data

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [RDF](https://www.w3.org/TR/rdf11-concepts/) | 1.1 | W3C Recommendation | All data in the pod, the vocabulary, the shapes and the deck library | Yes |
| [Turtle](https://www.w3.org/TR/turtle/) | 1.1 | W3C Recommendation | Every document Solid Memo writes, read and written with N3.js: [`packages/turtle/`](../packages/turtle/) ([architecture.md](architecture.md)) | Yes |
| [JSON-LD](https://www.w3.org/TR/json-ld11/) | 1.1 | W3C Recommendation | A deck saved as a file ([data-model.md](data-model.md#decks-as-files), [`deckFile.ts`](../packages/domain/src/deckFile.ts)); the site's description in [`apps/web/index.html`](../apps/web/index.html) | Yes |
| [RDF Schema](https://www.w3.org/TR/rdf11-schema/) | 1.1 | W3C Recommendation | Solid Memo's vocabulary, [`ns/vocab/v1.ttl`](../ns/vocab/v1.ttl) ([vocab.md](vocab.md)) | Yes |
| [OWL 2](https://www.w3.org/TR/owl2-overview/) | 2 | W3C Recommendation | The vocabulary's classes and properties, and `owl:deprecated` on a retired card ([vocab.md](vocab.md)) | Yes |
| [XML Schema datatypes](https://www.w3.org/TR/xmlschema11-2/) | 1.1 | W3C Recommendation | Typed literals (`xsd:dateTime`, `xsd:integer`, …) | Yes |
| [SHACL](https://www.w3.org/TR/shacl/) | 1.0 (W3C Recommendation, 2017) | W3C Recommendation | The shapes in [`ns/shapes/`](../ns/shapes/), checked in the browser by rdf-validate-shacl and in CI by pySHACL ([shapes.md](shapes.md), [validation.md](validation.md)) | Yes |
| [DCAT](https://www.w3.org/TR/vocab-dcat-3/) | 3 | W3C Recommendation | Decks, releases and the library's catalog ([deck-library.md](deck-library.md), [`releaseModel.ts`](../packages/domain/src/release/releaseModel.ts)) | Yes |
| [DCAT-AP](https://semiceu.github.io/DCAT-AP/releases/3.0.1/) | 3.0.1 | SEMIC (European Commission) specification | Profile validation of decks and the library, with the vendored shapes in [`packages/vocab/vendor/dcat-ap/3.0.1/`](../packages/vocab/vendor/) ([validation.md](validation.md#profiles-dcat-ap-and-skos)) | Yes |
| [ADMS](https://www.w3.org/TR/vocab-adms/) | 1.0 | W3C Working Group Note | `adms:versionNotes` on a release ([deck-library.md](deck-library.md#a-version)) | Yes |
| [SKOS](https://www.w3.org/TR/skos-reference/) | 2009 | W3C Recommendation | The concept schemes in [`ns/vocab/`](../ns/vocab/) ([vocab.md](vocab.md#concept-schemes)), checked with the vendored SkoHub shapes | Yes |
| [PROV-O](https://www.w3.org/TR/prov-o/) | 2013 | W3C Recommendation | How a release was made, and the sources it was derived from ([deck-library.md](deck-library.md#provenance), [`provenanceRules.ts`](../packages/domain/src/release/provenanceRules.ts)) | Yes |
| [DCMI Metadata Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) | 2020 | DCMI Recommendation (ISO 15836-2) | Titles, descriptions, creators, licenses and dates (`dcterms:`) | Yes |
| [FOAF](http://xmlns.com/foaf/spec/) | 0.99 | Specification by its authors, stable since 2014 | Agents: creators and the publisher ([`agentRecord.ts`](../packages/domain/src/agentRecord.ts)) | Yes |
| [schema.org](https://schema.org/) | current release, unpinned ([releases](https://schema.org/docs/releases.html)) | W3C Community Group vocabulary, de facto | Courses, chapters, steps and wrong options ([courses.md](courses.md#why-schemaorg)); the site's description in [`apps/web/index.html`](../apps/web/index.html) | Yes (de facto) |
| [EU Vocabularies authority tables](https://op.europa.eu/en/web/eu-vocabularies/authority-tables) | as referenced in [`ns/vocab/external.ttl`](../ns/vocab/external.ttl) | Publications Office of the European Union reference data | A deck's languages and its data theme `EDUC` ([deck-library.md](deck-library.md#a-version)) | Yes |
| [IANA media types](https://www.iana.org/assignments/media-types/) | registry | IANA registry | `dcat:mediaType` of a deck's distribution | Yes |

## Text and languages

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [CommonMark](https://spec.commonmark.org/0.31.2/) | 0.31.2 | Specification by the CommonMark project | Text in Markdown: [`packages/markdown/`](../packages/markdown/) ([markdown.md](markdown.md#the-dialect)) | Yes |
| [GitHub Flavored Markdown](https://github.github.com/gfm/), pipe tables only | 0.29-gfm | Specification by GitHub, de facto | Tables in Markdown text, through `micromark-extension-gfm-table` ([markdown.md](markdown.md#the-dialect)) | Yes (de facto) |
| [markdown-cjk-friendly](https://github.com/tats-u/markdown-cjk-friendly) | through `micromark-extension-cjk-friendly` ^2.0.2 | Proposed amendment to CommonMark | Emphasis next to Chinese, Japanese and Korean text ([markdown.md](markdown.md#the-dialect)) | Yes (proposal) |
| [BCP 47](https://www.rfc-editor.org/info/bcp47) | RFC 5646 and RFC 4647 | IETF Best Current Practice | Language tags on text, deck languages and the app's locales: [`languageTag.ts`](../packages/domain/src/languageTag.ts), [`locale.ts`](../packages/domain/src/locale.ts) ([vocab.md](vocab.md), [i18n.md](i18n.md)) | Yes |
| [Unicode CLDR plural rules](https://cldr.unicode.org/index/cldr-spec/plural-rules) | the browser's CLDR | Unicode Consortium | Plural messages, through `Intl.PluralRules` ([i18n.md](i18n.md), [policy.md](policy.md#cldr-plural-rules)) | Yes |
| [ECMAScript Internationalization API](https://tc39.es/ecma402/) | the browser's | Ecma International standard (ECMA-402) | Plural rules, number and date formats: [`i18n.tsx`](../packages/ui/src/ui/i18n.tsx) | Yes |
| [Unicode Normalization Forms](https://unicode.org/reports/tr15/) | UAX #15 | Unicode Standard Annex | Text in normalization form C in the deck library and in search ([deck-library.md](deck-library.md#checks)) | Yes |

## The web

| Standard | Version | Status | Where used | Open |
|---|---|---|---|---|
| [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html) and [OAuth 2.0](https://www.rfc-editor.org/rfc/rfc6749) | 1.0; RFC 6749 | OpenID Foundation final specification; IETF RFC | Under Solid-OIDC ([authentication.md](authentication.md)) | Yes |
| [DPoP](https://www.rfc-editor.org/rfc/rfc9449) | RFC 9449 | IETF RFC | Under Solid-OIDC: tokens bound to the browser's key | Yes |
| [Content Security Policy](https://www.w3.org/TR/CSP3/) | Level 3 | W3C Working Draft | The policy meta tag in [`apps/web/index.html`](../apps/web/index.html), checked by [`build.test.ts`](../apps/web/src/build.test.ts) ([markdown.md](markdown.md)) | Yes |
| [IndexedDB](https://www.w3.org/TR/IndexedDB/) | 3.0 | W3C specification | The guest's pod: [`indexedDbResourceStore.ts`](../packages/browser/src/indexedDbResourceStore.ts) ([guest-mode.md](guest-mode.md)) | Yes |
| [Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html) | HTML Living Standard | WHATWG standard | Choices kept on the device ([privacy.md](privacy.md#in-the-browser)) | Yes |
| [Web Locks](https://www.w3.org/TR/web-locks/) | W3C Working Draft | W3C Working Draft | Keeping tabs apart while the guest's pod is written or moved ([guest-mode.md](guest-mode.md)) | Yes |
| [Open Graph](https://ogp.me/) | — | De facto, published by Meta | Link previews in [`apps/web/index.html`](../apps/web/index.html) | Yes (de facto) |
| [Sitemaps](https://www.sitemaps.org/protocol.html) | 0.9 | De facto, by the major search engines | [`apps/web/public/sitemap.xml`](../apps/web/public/sitemap.xml) | Yes (de facto) |
| [robots.txt](https://www.rfc-editor.org/rfc/rfc9309) | RFC 9309 | IETF RFC | [`apps/web/public/robots.txt`](../apps/web/public/robots.txt) | Yes |

Licenses in deck metadata are named by their own IRIs, such as
`https://creativecommons.org/licenses/by/4.0/`, typed
`dcterms:LicenseDocument` ([deck-library.md](deck-library.md#a-version)).

## Drafts and de facto specifications

These are not formal standards. Each one is published openly and may be
implemented by anyone, free of charge, so none of them stands in the
way of others working with Solid Memo's code or data.

- **The Solid specifications** (the Solid Protocol, Solid-OIDC, the
  Solid WebID Profile, WAC and ACP) are drafts of the W3C Solid
  Community Group, not W3C Recommendations. The W3C
  [Linked Web Storage Working Group](https://www.w3.org/groups/wg/lws/)
  is now taking them toward a Recommendation. They are what every
  Solid server and app implements, and Solid Memo is tested against
  several servers ([testing.md](testing.md)). The Inrupt client
  libraries keep the code that speaks them in one package,
  `@solid-memo/solid` ([vendor-code.md](vendor-code.md)), so a change in
  the specifications is a change there.
- **The type indexes** are an editor's draft. They are how Solid apps
  find each other's data today. Solid Memo uses them to find its
  instances and to tell other apps where its data is. An instance can
  also be attached by its URL, without a type index
  ([discovery chain](data-model.md#discovery-chain)).
- **schema.org** is a vocabulary run by a W3C Community Group, with no
  formal standing, but it is the vocabulary search engines and learning
  tools read, and it is free to use (CC BY-SA 3.0). Its terms are extra
  types and properties beside Solid Memo's own
  ([courses.md](courses.md#why-schemaorg)), so a tool that does not know
  schema.org still reads the data.
- **GitHub Flavored Markdown** is GitHub's own specification. Solid
  Memo takes only its pipe tables, which most Markdown tools read.
- **markdown-cjk-friendly** is a proposed amendment to CommonMark, by
  one author. It changes only where emphasis starts and ends next to
  Chinese, Japanese and Korean text. A CommonMark reader without it
  still reads the text, and shows some asterisks as typed.
  Both are fixed by the `sm:markdown` concept: a wider or different
  dialect would be a new concept ([markdown.md](markdown.md#the-dialect)),
  so text already written keeps its meaning.
- **SM-2** is an algorithm published by SuperMemo, not a standard. Its
  description is public and anyone may implement it
  ([srs.md](srs.md), [policy.md](policy.md#sm-2)). A review state says
  which scheduler wrote it (`sm:scheduler`, [vocab.md](vocab.md#review-states)),
  so another scheduler can be added beside it.
- **Open Graph** and **Sitemaps** are de facto web conventions for link
  previews and search engines. Nothing in the app depends on them.
