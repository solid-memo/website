# Changelog

What changed in Solid Memo from one version to the next, newest first.
Each version's entry is written by semantic-release when it releases
the version, from the messages of the commits it contains, which follow
[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
The versions follow [Semantic Versioning](https://semver.org/), as
[docs/releasing.md](docs/releasing.md) applies it to an app that keeps
its data in pods. The first version, 1.0.0, is summed up in full at the
end of the file.

This file covers the app. The vocabulary, the shapes and the library's
decks are versioned on their own, each version published once and never
changed: see [docs/vocab.md](docs/vocab.md),
[docs/shapes.md](docs/shapes.md) and
[docs/deck-library.md](docs/deck-library.md).

<!-- The entries from here to the first version's summary are written by semantic-release. -->
<!-- Their lists start with "*"; the summary's, as everywhere else, with "-". -->
<!-- markdownlint-configure-file { "MD004": { "style": "dash" } } -->
<!-- markdownlint-disable -->
<!-- cspell:disable -->

## [6.21.0](https://github.com/solid-memo/website/compare/v6.20.4...v6.21.0) (2026-10-31)

### Features

* **decks:** add a course on open source and open content licenses ([9339c86](https://github.com/solid-memo/website/commit/9339c86a279528f0bc27025705941ee9ee9bd956)), closes [#425](https://github.com/solid-memo/website/issues/425)
* **decks:** add a course on reading Hangul ([9dbf268](https://github.com/solid-memo/website/commit/9dbf268c6168b4e12002d9270c3f493826d73312)), closes [#423](https://github.com/solid-memo/website/issues/423)

### Bug Fixes

* **solid:** read only release addresses from a creator's links ([368f9fe](https://github.com/solid-memo/website/commit/368f9fef3e0a98cfc0e476326167c28403b3f3bf))

## [6.20.4](https://github.com/solid-memo/website/compare/v6.20.3...v6.20.4) (2026-10-31)

### Bug Fixes

* **domain:** leave an error's details out of the report link ([eda612e](https://github.com/solid-memo/website/commit/eda612e7d0979541d743b6e9ef5fa13588153b98))
* **domain:** renumber a draft's outline in one pass ([bc4ab04](https://github.com/solid-memo/website/commit/bc4ab048550c7b2bb60a2d8d53021fc077d2e7c9))
* **studio:** walk each node once when breaking graph layout cycles ([e127676](https://github.com/solid-memo/website/commit/e12767615f5d043dd1d6bee71e4fba8a9a8e1e15))

## [6.20.3](https://github.com/solid-memo/website/compare/v6.20.2...v6.20.3) (2026-10-31)

### Bug Fixes

* **domain:** find a bulk edit's cards, states and free ids in one pass ([8bd630e](https://github.com/solid-memo/website/commit/8bd630e9f9b08a7b5f20901c331ab1f159dfd9d3))
* **domain:** find a release's authors among its agents by id ([c78b238](https://github.com/solid-memo/website/commit/c78b238690727819a4f930738ed7c8c474b72723))
* **studio:** find the draft cards table's places in one pass ([8391522](https://github.com/solid-memo/website/commit/839152203c405e1f3c81d412d5267268e7e7f476))

## [6.20.2](https://github.com/solid-memo/website/compare/v6.20.1...v6.20.2) (2026-10-31)

### Bug Fixes

* **markdown:** show a text with too many block quotes as plain text ([b9dc67c](https://github.com/solid-memo/website/commit/b9dc67c99c482dcba19c3df3ff2022a6e3f42c63))
* **solid:** never write one deck's author over another's agent node ([d0e2459](https://github.com/solid-memo/website/commit/d0e2459c659c2f9ba35613ea8ed60c7bc410d620))
* **statistics:** write formula-like text in the answers csv as text ([28e14e8](https://github.com/solid-memo/website/commit/28e14e8a3c3bbc650c926bce627e6cbeeb9dfe44))

## [6.20.1](https://github.com/solid-memo/website/compare/v6.20.0...v6.20.1) (2026-10-31)

### Bug Fixes

* **domain:** read a month summary only when its days are of its month ([58e1ccd](https://github.com/solid-memo/website/commit/58e1ccd28a51e4480c5a25cc8a32222425191a1b))
* **shacl:** check decimal and floating-point literals in linear time ([345030c](https://github.com/solid-memo/website/commit/345030cd2be4ab3ed7b73c8d9ae640d76cf94d40))
* **studio:** keep only a release's own statements in a draft of it ([05aa7f3](https://github.com/solid-memo/website/commit/05aa7f35df85a024a7f80719a3664c71dab54049))

## [6.20.0](https://github.com/solid-memo/website/compare/v6.19.0...v6.20.0) (2026-10-31)

### Features

* **ui:** preview a course by its chapters, theory before questions ([816d9df](https://github.com/solid-memo/website/commit/816d9dfac06f274c1f746818465288efb7b633fa)), closes [#428](https://github.com/solid-memo/website/issues/428)

## [6.19.0](https://github.com/solid-memo/website/compare/v6.18.2...v6.19.0) (2026-10-31)

### Features

* **ui:** fold a long list of sources on a library deck's page ([e09fe41](https://github.com/solid-memo/website/commit/e09fe415120e76f59aa254eb0b2fe755d388f088)), closes [#426](https://github.com/solid-memo/website/issues/426)

## [6.18.2](https://github.com/solid-memo/website/compare/v6.18.1...v6.18.2) (2026-10-31)

### Bug Fixes

* **solid:** give up on a pod read the server never answers ([4c03fc7](https://github.com/solid-memo/website/commit/4c03fc75798776ce5afb555e49f9b02330d31f97)), closes [#419](https://github.com/solid-memo/website/issues/419)

## [6.18.1](https://github.com/solid-memo/website/compare/v6.18.0...v6.18.1) (2026-10-31)

### Bug Fixes

* **decks:** show The Night Café again in Famous paintings ([b4b6487](https://github.com/solid-memo/website/commit/b4b648747ca9659c7828386de594fd24b14d8d23)), closes [#397](https://github.com/solid-memo/website/issues/397)

## [6.18.0](https://github.com/solid-memo/website/compare/v6.17.34...v6.18.0) (2026-10-31)

### Features

* **ui:** link a login stopped for safety to its security advisory ([4237875](https://github.com/solid-memo/website/commit/4237875f0732895acfd5180724a641e4b5cc12da))

## [6.17.34](https://github.com/solid-memo/website/compare/v6.17.33...v6.17.34) (2026-10-31)

### Bug Fixes

* **deps:** update dependency preact to ^11.1.0 ([171a860](https://github.com/solid-memo/website/commit/171a86037814dcc97968c4b6b823b877b8d14d1b))

## [6.17.33](https://github.com/solid-memo/website/compare/v6.17.32...v6.17.33) (2026-10-31)

### Bug Fixes

* **domain:** refuse a card transfer between decks over one document ([d0d0027](https://github.com/solid-memo/website/commit/d0d0027240a5a1c97c7c5b2030e056a03d24876a))
* **studio:** look up a draft's subjects once per draft ([069704d](https://github.com/solid-memo/website/commit/069704d04aa9972604d2ef18accf7e24e147045a))

## [6.17.32](https://github.com/solid-memo/website/compare/v6.17.31...v6.17.32) (2026-10-31)

### Bug Fixes

* **solid:** remove only distractors a card no longer names ([652f6f8](https://github.com/solid-memo/website/commit/652f6f8b2fe2db99424b3d0886e4be1c69ef6b98))

## [6.17.31](https://github.com/solid-memo/website/compare/v6.17.30...v6.17.31) (2026-10-31)

### Bug Fixes

* **studio:** link a draft's release only at a release's address ([8bd995d](https://github.com/solid-memo/website/commit/8bd995dd294f10310ed462ebdbdc0dfa01c87c91))

## [6.17.30](https://github.com/solid-memo/website/compare/v6.17.29...v6.17.30) (2026-10-31)

### Bug Fixes

* **ui:** key the Markdown caches by a hash, not by the whole text ([86ae5fc](https://github.com/solid-memo/website/commit/86ae5fc70125ce33fd9a0971184dce516beddc96))

## [6.17.29](https://github.com/solid-memo/website/compare/v6.17.28...v6.17.29) (2026-10-31)

### Bug Fixes

* **domain:** read a draft's statements once for the release check ([83666e6](https://github.com/solid-memo/website/commit/83666e6c322556bec6c06bdd54450e41f4011d07))
* **domain:** read out-of-range day boundaries and limits as defaults ([eebe03b](https://github.com/solid-memo/website/commit/eebe03b3ec37342900066d2f45ff1e8a758e54f2))
* **solid:** match a deck document's write to its read in any spelling ([8865787](https://github.com/solid-memo/website/commit/8865787aadb70051a34a877147cfe13f54b4f835))
* **solid:** write and remove many cards in one pass ([433d112](https://github.com/solid-memo/website/commit/433d112c9d4b7f9a2c471ab18c2eeccd6e20fe7f))

## [6.17.28](https://github.com/solid-memo/website/compare/v6.17.27...v6.17.28) (2026-10-30)

### Bug Fixes

* **domain:** gather lists under a key in place, not by copying them ([aa925bc](https://github.com/solid-memo/website/commit/aa925bc503aa0f4694bbe95bedbcf22cd61705e8))
* **ui:** parse each course chapter description once ([6a6c4be](https://github.com/solid-memo/website/commit/6a6c4bed2b5db1517944b7db4da22dbc1d41cedb))

## [6.17.27](https://github.com/solid-memo/website/compare/v6.17.26...v6.17.27) (2026-10-30)

### Bug Fixes

* **markdown:** remember each text's label ([c9cb8ee](https://github.com/solid-memo/website/commit/c9cb8ee1ec0daa950d83a220ba31539e5022285a))
* **solid:** keep card and distractor ids of a deck apart ([be6f7de](https://github.com/solid-memo/website/commit/be6f7deb899ca9596cebc918f6fab5f3877baf8b))

## [6.17.26](https://github.com/solid-memo/website/compare/v6.17.25...v6.17.26) (2026-10-30)

### Bug Fixes

* **domain:** keep sm-2 ease factor and interval within bounds ([c0439df](https://github.com/solid-memo/website/commit/c0439df7e33c7aa09113d9aa8e84d521f1bca17f))
* **domain:** link a deck author only to a bare address ([38dafcc](https://github.com/solid-memo/website/commit/38dafcca6f589a3375ce1b9258baf16f622a450f))
* **solid-memo-client:** log out without waiting for a token refresh ([039916e](https://github.com/solid-memo/website/commit/039916ed79453bb4dd11bdcf6b1c8d54b3fbadc4))

## [6.17.25](https://github.com/solid-memo/website/compare/v6.17.24...v6.17.25) (2026-10-30)

### Bug Fixes

* **solid:** check, show and import one read of a linked release ([c655172](https://github.com/solid-memo/website/commit/c655172d44bd7a51f1a88f9cdf8875b02ad3f907))

## [6.17.24](https://github.com/solid-memo/website/compare/v6.17.23...v6.17.24) (2026-10-30)

### Bug Fixes

* **solid:** check a pod document against its shapes in linear time ([ba6d631](https://github.com/solid-memo/website/commit/ba6d631377b6ee74c37ffbfff8b54756efa4261f))

## [6.17.23](https://github.com/solid-memo/website/compare/v6.17.22...v6.17.23) (2026-10-30)

### Bug Fixes

* **solid:** refuse a write from a read that a save has written over ([2448697](https://github.com/solid-memo/website/commit/244869704ed5557df581aa8a4c46dc57e9a03087))
* **statistics:** bound the study days the charts walk ([3d30b73](https://github.com/solid-memo/website/commit/3d30b739ea9c8ff20e1036b0b4da3fa949802f26))

## [6.17.22](https://github.com/solid-memo/website/compare/v6.17.21...v6.17.22) (2026-10-30)

### Bug Fixes

* **solid:** read a release's parts from its own document alone ([1820d1e](https://github.com/solid-memo/website/commit/1820d1eac365ab25983f7d674383f5111ac33f16))

## [6.17.21](https://github.com/solid-memo/website/compare/v6.17.20...v6.17.21) (2026-10-29)

### Bug Fixes

* **deps:** lock every package to the newest version its range allows ([71653cc](https://github.com/solid-memo/website/commit/71653cc638031a57d5e949c9ecd5a67cdbfef927)), closes [#379](https://github.com/solid-memo/website/issues/379)

## [6.17.20](https://github.com/solid-memo/website/compare/v6.17.19...v6.17.20) (2026-10-29)

### Bug Fixes

* **solid:** complete only a login redirect this tab set off ([2b12f64](https://github.com/solid-memo/website/commit/2b12f64c693cb0d1d42f65c20e037c9dc1473623))
* **studio:** stop the graph's settling as the graph goes ([275a8f7](https://github.com/solid-memo/website/commit/275a8f708398296eed73eab4aa2c88ecad708112)), closes [#375](https://github.com/solid-memo/website/issues/375) [#375](https://github.com/solid-memo/website/issues/375)

## [6.17.19](https://github.com/solid-memo/website/compare/v6.17.18...v6.17.19) (2026-10-29)

### Bug Fixes

* **solid:** refuse JSON-LD terms defined by more than an IRI ([e1b823a](https://github.com/solid-memo/website/commit/e1b823ae3f64e0bd901d1e483332c4b4c5212664))

## [6.17.18](https://github.com/solid-memo/website/compare/v6.17.17...v6.17.18) (2026-10-29)

### Bug Fixes

* **domain:** lay out drafts in one pass however long their chains ([364c573](https://github.com/solid-memo/website/commit/364c5738bdd4550d065529f29f8c8e4f082bc89c))

## [6.17.17](https://github.com/solid-memo/website/compare/v6.17.16...v6.17.17) (2026-10-29)

### Bug Fixes

* **solid-memo-client:** check the provider's endpoint URLs before use ([9bcca8d](https://github.com/solid-memo/website/commit/9bcca8d38c04ccd8f1043f0f09a596b672122aaa))

## [6.17.16](https://github.com/solid-memo/website/compare/v6.17.15...v6.17.16) (2026-10-29)

### Bug Fixes

* **domain:** group cards that say the same without copying the groups ([9c45c5e](https://github.com/solid-memo/website/commit/9c45c5e7be15b460be1c0e9bea62ef80dc930ebe))
* **studio:** bound how deep the graph view hangs a node ([9ba838f](https://github.com/solid-memo/website/commit/9ba838f8e865f652dea2dc3f55796f473268ede1))
* **ui:** show a pod address as the link reads it and refuse user@ ([fbeed07](https://github.com/solid-memo/website/commit/fbeed071ff3641ea11d943f045fffffc5369cc2e))

## [6.17.15](https://github.com/solid-memo/website/compare/v6.17.14...v6.17.15) (2026-10-29)

### Bug Fixes

* **solid:** write long blank-node chains without deep recursion ([bce6774](https://github.com/solid-memo/website/commit/bce67747e7f57935c61f8caa21e29e67a9d0fd44))

## [6.17.14](https://github.com/solid-memo/website/compare/v6.17.13...v6.17.14) (2026-10-29)

### Bug Fixes

* **solid:** read extended profiles as the user only in the profile's places ([f025f1d](https://github.com/solid-memo/website/commit/f025f1d22f7e62b6a31e26b4c3f48c90aa87ca0a))
* **solid:** require the issuer on every identity provider's answer ([eca1227](https://github.com/solid-memo/website/commit/eca1227151d669479573d8eedcc879b823739d52))

## [6.17.13](https://github.com/solid-memo/website/compare/v6.17.12...v6.17.13) (2026-10-29)

### Bug Fixes

* **ci:** build the deployed site without the Actions cache ([ff4261b](https://github.com/solid-memo/website/commit/ff4261b1172bbfc041ce39243a073aead90e5eb6))
* **decks:** check the taxonomy's ids and times before writing them ([dc24d64](https://github.com/solid-memo/website/commit/dc24d6481664be1bdda3de29ae0e5eda0e9f3366))

## [6.17.12](https://github.com/solid-memo/website/compare/v6.17.11...v6.17.12) (2026-10-29)

### Bug Fixes

* **shacl:** drop a document's rdfs:subClassOf statements before a check ([db7ea9a](https://github.com/solid-memo/website/commit/db7ea9a2871a70ab32a91746dd3b74ee489fc0dc))

## [6.17.11](https://github.com/solid-memo/website/compare/v6.17.10...v6.17.11) (2026-10-28)

### Bug Fixes

* **library:** bound the releases read in between for an upgrade from a link ([f1c0922](https://github.com/solid-memo/website/commit/f1c0922f626ccbe77e5d37e4d93c35579776d1be))

## [6.17.10](https://github.com/solid-memo/website/compare/v6.17.9...v6.17.10) (2026-10-28)

### Bug Fixes

* **solid:** refuse release versions too large to number a draft ([459493f](https://github.com/solid-memo/website/commit/459493f3683d026e574c30655f764aee3c65e341))

## [6.17.9](https://github.com/solid-memo/website/compare/v6.17.8...v6.17.9) (2026-10-28)

### Bug Fixes

* **solid:** keep a release's back-link out of drafts and deck documents ([1796658](https://github.com/solid-memo/website/commit/17966587398b4a0b0c0f3ceba182e9ef2becff7e))
* **ui:** follow a release's contact link as its other links are followed ([e5cdded](https://github.com/solid-memo/website/commit/e5cddedad00b514a76442f12526cace6ac87c047))

## [6.17.8](https://github.com/solid-memo/website/compare/v6.17.7...v6.17.8) (2026-10-28)

### Bug Fixes

* **web:** serve a self-unregistering worker at the old trace viewer's address ([40a2f6f](https://github.com/solid-memo/website/commit/40a2f6fbe134541e4271ca8809203b96dc435f9a))

## [6.17.7](https://github.com/solid-memo/website/compare/v6.17.6...v6.17.7) (2026-10-28)

### Bug Fixes

* **domain:** build a course's outline in one pass over its steps ([880c551](https://github.com/solid-memo/website/commit/880c551a9e621af0a994d85f869c775af56c0ccc))

## [6.17.6](https://github.com/solid-memo/website/compare/v6.17.5...v6.17.6) (2026-10-28)

### Bug Fixes

* **application:** skip an unclaimed document in every spelling of its address ([c6367a9](https://github.com/solid-memo/website/commit/c6367a9709a462b4596522e54b957f960c7129bb))

## [6.17.5](https://github.com/solid-memo/website/compare/v6.17.4...v6.17.5) (2026-10-28)

### Bug Fixes

* **solid:** refuse JSON-LD contexts below the top level of a deck file ([2d41bc0](https://github.com/solid-memo/website/commit/2d41bc078b56cd884426a9592bcb22d973daa30f))

## [6.17.4](https://github.com/solid-memo/website/compare/v6.17.3...v6.17.4) (2026-10-28)

### Bug Fixes

* **solid-memo-client:** refresh only a stored session from the tab's own provider ([19e9b7d](https://github.com/solid-memo/website/commit/19e9b7d2e98c368cee278a008d629eecec05a450))

## [6.17.3](https://github.com/solid-memo/website/compare/v6.17.2...v6.17.3) (2026-10-28)

### Bug Fixes

* **ci:** restore nothing from the Actions cache in the release workflow ([342267a](https://github.com/solid-memo/website/commit/342267a42fc8cb0a2cbe4bb1c767716e0cb80089))
* **solid:** read a date-time only once it is wholly one ([f610e33](https://github.com/solid-memo/website/commit/f610e33fd210cc5a0905e6a92720e86b1f3ca007))

## [6.17.2](https://github.com/solid-memo/website/compare/v6.17.1...v6.17.2) (2026-10-28)

### Bug Fixes

* **solid:** bound what a release, a deck file and the deck groups take in ([66ebd85](https://github.com/solid-memo/website/commit/66ebd857620ac8fd65e828a147f8f7fbba84ee61))

## [6.17.1](https://github.com/solid-memo/website/compare/v6.17.0...v6.17.1) (2026-10-28)

### Bug Fixes

* **solid:** follow no redirect with the user's credentials ([d327d9c](https://github.com/solid-memo/website/commit/d327d9c3a7c811e3c5ce2d8e463c8e1105425b6d))
* **ui:** show where a link in deck text leads, as its address is written ([bbd322d](https://github.com/solid-memo/website/commit/bbd322d9bdee16eaab172f79ec2281d941c4ba02))

## [6.17.0](https://github.com/solid-memo/website/compare/v6.16.3...v6.17.0) (2026-10-28)

### Features

* **decks:** finish the Korean at the Table story in ten chapters ([48194b9](https://github.com/solid-memo/website/commit/48194b9b7deb2d762ce75d8a18d0697c9fe3eb25)), closes [#132](https://github.com/solid-memo/website/issues/132) [#132](https://github.com/solid-memo/website/issues/132)

### Bug Fixes

* **domain:** read a stated count in one pass ([3c32139](https://github.com/solid-memo/website/commit/3c321396bee9a46eb12008fbb88a33a20582ec81))
* **domain:** read an author literal in one pass ([dad6c8e](https://github.com/solid-memo/website/commit/dad6c8e29126d084785ad7d6226e49f48ecbeb13))

## [6.16.3](https://github.com/solid-memo/website/compare/v6.16.2...v6.16.3) (2026-10-28)

### Bug Fixes

* **domain:** ask only a course release's own cards as its questions ([b6f88fe](https://github.com/solid-memo/website/commit/b6f88fe70669f6703c320d4572f719f5beae4ce8))

## [6.16.2](https://github.com/solid-memo/website/compare/v6.16.1...v6.16.2) (2026-10-28)

### Bug Fixes

* **domain:** look language tags and draft ids up as data, not properties ([6284ac6](https://github.com/solid-memo/website/commit/6284ac6a44eb380f1113e11e9618d17133bc5b9c))
* **solid:** read JSON-LD with a parser that fetches no context ([3b9acf8](https://github.com/solid-memo/website/commit/3b9acf8f5b3da622b953955400db9b92d148df03))

## [6.16.1](https://github.com/solid-memo/website/compare/v6.16.0...v6.16.1) (2026-10-28)

### Bug Fixes

* **application:** fill in release languages only for library copies ([06e80d8](https://github.com/solid-memo/website/commit/06e80d82050145f9cf3403297aab230d6b14535a))
* **composition:** send credentials for an instance's data only into the user's own pod ([8b9b674](https://github.com/solid-memo/website/commit/8b9b67405ec20b1e983d4c0d4971072b3e6f28e6))
* **studio:** ask before making a release public ([68dff77](https://github.com/solid-memo/website/commit/68dff7712fbdadb9794abcde91ea8cf9284b76b5))
* **ui:** show no app inside another site's frame ([46d2378](https://github.com/solid-memo/website/commit/46d2378e5ddf727f39becb3245d52b93fef770e0))

## [6.16.0](https://github.com/solid-memo/website/compare/v6.15.0...v6.16.0) (2026-10-27)

### Features

* **solid-memo-client:** add a Solid client of the app's own ([ebc2f32](https://github.com/solid-memo/website/commit/ebc2f32c1fb02a0ba6acb868e73ced61fa0d6ee4)), closes [#331](https://github.com/solid-memo/website/issues/331)

## [6.15.0](https://github.com/solid-memo/website/compare/v6.14.3...v6.15.0) (2026-10-27)

### Features

* **decks:** add a course on DCAT, DCAT-AP and DCAT-AP-SE ([3a4762c](https://github.com/solid-memo/website/commit/3a4762c43861cdd83571f384fd1fa2910c65b812)), closes [#329](https://github.com/solid-memo/website/issues/329)

## [6.14.3](https://github.com/solid-memo/website/compare/v6.14.2...v6.14.3) (2026-10-26)

### Bug Fixes

* **solid:** refuse terms Turtle cannot write, so an import adds no statements ([8874a04](https://github.com/solid-memo/website/commit/8874a04af467784c8e7c168f5d1f18e11e85a830))

## [6.14.2](https://github.com/solid-memo/website/compare/v6.14.1...v6.14.2) (2026-10-26)

### Bug Fixes

* **composition:** read a release outside the user's own pod as no one ([c77f899](https://github.com/solid-memo/website/commit/c77f8999bf11546f6b5fff783da261b94736f53e))

## [6.14.1](https://github.com/solid-memo/website/compare/v6.14.0...v6.14.1) (2026-10-26)

### Bug Fixes

* **domain:** read a desired retention outside its range as the default ([010a784](https://github.com/solid-memo/website/commit/010a78491ec5c4ff9c78cdadc09dd113607bea09))
* **solid:** leave out an answer whose study day is not a real date ([ed96cb3](https://github.com/solid-memo/website/commit/ed96cb36c9979cf3450a1be9446f209b9d8bd6a7))
* **solid:** name a date the app cannot read in the instance check ([dae2562](https://github.com/solid-memo/website/commit/dae25625627094d06f933de4e5bf25c41d912f10))
* **solid:** read a date past the years a JavaScript date holds as none ([13f4dc6](https://github.com/solid-memo/website/commit/13f4dc6794b6de7c5b92739818ffbfda293f3e2b))

## [6.14.0](https://github.com/solid-memo/website/compare/v6.13.0...v6.14.0) (2026-10-26)

### Features

* **ui:** let the learner skip the Connected screen after logging in ([10b136e](https://github.com/solid-memo/website/commit/10b136e0a2db1d15561339f4990be7bb5325dd32)), closes [#317](https://github.com/solid-memo/website/issues/317)
* **vocab:** keep in the pod whether logging in skips the Connected screen ([342acbd](https://github.com/solid-memo/website/commit/342acbdbaf6e24a9ac0f33a3ec06194d7592b2b5)), closes [#317](https://github.com/solid-memo/website/issues/317)

## [6.13.0](https://github.com/solid-memo/website/compare/v6.12.0...v6.13.0) (2026-10-25)

### Features

* **ui:** choose a course's language from the course's page ([327abe7](https://github.com/solid-memo/website/commit/327abe70f47c53451c6a5d6897ca7ddb1fe6a305)), closes [#312](https://github.com/solid-memo/website/issues/312)
* **ui:** show a course's theory and titles in its course language ([6f1d58f](https://github.com/solid-memo/website/commit/6f1d58fd00d4ea90126994265a254fd56bedaaee)), closes [#312](https://github.com/solid-memo/website/issues/312)
* **vocab:** let a course's card language cover its theory and titles ([28acbc4](https://github.com/solid-memo/website/commit/28acbc47172aef4feddf2d3111e2117cb5299b6d)), closes [#312](https://github.com/solid-memo/website/issues/312)

## [6.12.0](https://github.com/solid-memo/website/compare/v6.11.0...v6.12.0) (2026-10-25)

### Features

* **decks:** learn the brain's regions and what they do ([d0e3470](https://github.com/solid-memo/website/commit/d0e347030d78c1bcfcf90119e09bb41803991136)), closes [#314](https://github.com/solid-memo/website/issues/314)
* **ui:** show what is new in a version at the top of the deck list ([8eff817](https://github.com/solid-memo/website/commit/8eff817c59bd8a853b9037b711f9c39a162e2257)), closes [#311](https://github.com/solid-memo/website/issues/311)
* **vocab:** describe psychology as a topic ([4ba9103](https://github.com/solid-memo/website/commit/4ba910353d2d35f6ba13927c993b68c5ae4938f3)), closes [#314](https://github.com/solid-memo/website/issues/314)

## [6.11.0](https://github.com/solid-memo/website/compare/v6.10.2...v6.11.0) (2026-10-25)

### Features

* **ui:** let the landing picture be the heading where it spells the name ([157146b](https://github.com/solid-memo/website/commit/157146b45a78ade6e9b02ae7e90698129121eafd)), closes [#308](https://github.com/solid-memo/website/issues/308)

## [6.10.2](https://github.com/solid-memo/website/compare/v6.10.1...v6.10.2) (2026-10-25)

### Bug Fixes

* **solid:** make a missing type index only in the user's own storage ([28776ed](https://github.com/solid-memo/website/commit/28776edef313156f0efd999767d7ec065b50bd44))
* **ui:** open the instance creator only with a storage the user chose ([4c1c87b](https://github.com/solid-memo/website/commit/4c1c87b94fa05ddd7e054b321a36f4a748a1cae6))

## [6.10.1](https://github.com/solid-memo/website/compare/v6.10.0...v6.10.1) (2026-10-25)

### Bug Fixes

* **solid:** keep a file's named graphs off Object.prototype ([b988164](https://github.com/solid-memo/website/commit/b988164af74db30a847255c0309b4ff63c05282f))

## [6.10.0](https://github.com/solid-memo/website/compare/v6.9.0...v6.10.0) (2026-10-25)

### Features

* **ui:** offer logging in on the landing page, before creating a Pod ([4f8017a](https://github.com/solid-memo/website/commit/4f8017a6f6a6c1a8160219d4acbe529855addf57)), closes [#299](https://github.com/solid-memo/website/issues/299)

## [6.9.0](https://github.com/solid-memo/website/compare/v6.8.0...v6.9.0) (2026-10-24)

### Features

* **solid:** log in with a Client ID Document on the site's domain ([f400731](https://github.com/solid-memo/website/commit/f400731d1bc2c741df916e2cc198d0c92dd22e6b)), closes [#295](https://github.com/solid-memo/website/issues/295)

## [6.8.0](https://github.com/solid-memo/website/compare/v6.7.0...v6.8.0) (2026-10-24)

### Features

* **decks:** add a script that gives label decks languages from Wikidata ([23f0a84](https://github.com/solid-memo/website/commit/23f0a84dcc5f3ae4ee13447185c52726c5ea747a)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the brightest stars deck's cards four more languages ([cba9d93](https://github.com/solid-memo/website/commit/cba9d932591591e12f782167d2290fb2e6cad743)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the capitals deck's cards four more languages ([d0aef71](https://github.com/solid-memo/website/commit/d0aef71c3bc5925e618cdaf9bc53664d6c2ca114)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the constellations deck's cards four more languages ([97e34ab](https://github.com/solid-memo/website/commit/97e34ab2acbfeb509d0b813e61d63ff1a9304a6c)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the EU member states deck's cards four more languages ([23af207](https://github.com/solid-memo/website/commit/23af207546205a20a8fbbc6aed78991b25d75f83)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the famous buildings deck's cards four more languages ([6386808](https://github.com/solid-memo/website/commit/638680878eba733cb0c31a874c26fb3f61a8bc2c)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the federal states deck's cards four more languages ([0de9e00](https://github.com/solid-memo/website/commit/0de9e00cb6eef04685984cf1ce3ed00f12b7eca4)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the highest points of Europe deck's cards four more languages ([62ea3cf](https://github.com/solid-memo/website/commit/62ea3cf8cd1764a2befb589e60469b6388d80878)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the Nordic birds deck's cards four more languages ([d67ce63](https://github.com/solid-memo/website/commit/d67ce6378ead8ea094b3a86da81341ae5b6b73a0)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the Nordic fish deck's cards four more languages ([4c530fd](https://github.com/solid-memo/website/commit/4c530fdfd818db86646c580684ba250d64d290a7)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the Nordic mammals deck's cards four more languages ([39fee82](https://github.com/solid-memo/website/commit/39fee8228fd5d409d1f2835071a9e23b49670b28)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the Nordic trees deck's cards four more languages ([ca16d8a](https://github.com/solid-memo/website/commit/ca16d8a9d54ebc7c16c9d8ed7a2a57d6276b26d5)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the Nordic World Heritage deck's cards four more languages ([e9157ce](https://github.com/solid-memo/website/commit/e9157ce26099a45b8595ecfe2dd57fcd00406b38)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the periodic table deck's cards four more languages ([754415c](https://github.com/solid-memo/website/commit/754415c244ac5ed80e0270e667d072b396c6dce4)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the solar system deck's cards four more languages ([9378957](https://github.com/solid-memo/website/commit/93789572d615e49b75f989f65b07023590a73175)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the US states deck's cards four more languages ([0ffe486](https://github.com/solid-memo/website/commit/0ffe486a8900480c9d16fd857281f7c9a9aabf4b)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the world currencies deck's cards four more languages ([8da3ef6](https://github.com/solid-memo/website/commit/8da3ef60c5dee27df81d176110147e58da77100b)), closes [#284](https://github.com/solid-memo/website/issues/284)
* **decks:** give the world rivers deck's cards four more languages ([97ef67f](https://github.com/solid-memo/website/commit/97ef67fa3aa07cfce228642d2958be28ddfd546e)), closes [#284](https://github.com/solid-memo/website/issues/284)

## [6.7.0](https://github.com/solid-memo/website/compare/v6.6.0...v6.7.0) (2026-10-24)

### Features

* **site:** drop the docs' list of versions ([47a6beb](https://github.com/solid-memo/website/commit/47a6bebcccf281b62e8f22a64404b664ccb089db)), closes [#280](https://github.com/solid-memo/website/issues/280)

### Bug Fixes

* **site:** link the site by its address from a release's archived docs ([051bd8b](https://github.com/solid-memo/website/commit/051bd8b0982f5601981691b25f3d810ee92364d9)), closes [#280](https://github.com/solid-memo/website/issues/280)

## [6.6.0](https://github.com/solid-memo/website/compare/v6.5.0...v6.6.0) (2026-10-24)

### Features

* **library:** name and filter by the languages of a deck's cards ([d8f931b](https://github.com/solid-memo/website/commit/d8f931b98c695ca413f5efddd74473060e517291)), closes [#282](https://github.com/solid-memo/website/issues/282)

### Bug Fixes

* **release:** count only `#` and a number as an issue a commit refers to ([5064209](https://github.com/solid-memo/website/commit/50642092a9dc6d8944c53b8f30074386fc42f143)), closes [#281](https://github.com/solid-memo/website/issues/281)

## [6.5.0](https://github.com/solid-memo/website/compare/v6.4.0...v6.5.0) (2026-10-24)

### Features

* **domain:** offer every suggested provider for creating a Pod ([bc566ff](https://github.com/solid-memo/website/commit/bc566ffe9f8444c0d275fb29100b7830dd19f74c)), closes [#283](https://github.com/solid-memo/website/issues/283)

### Bug Fixes

* **ci:** ask for a provider's sign-up page as a browser does ([4ea9ab8](https://github.com/solid-memo/website/commit/4ea9ab8acb527b7f031eca7fa05d2bc5c251c2b4)), closes [#283](https://github.com/solid-memo/website/issues/283)

## [6.4.0](https://github.com/solid-memo/website/compare/v6.3.3...v6.4.0) (2026-10-24)

### Features

* **courses:** keep on the deck that it is a course ([221b3ca](https://github.com/solid-memo/website/commit/221b3ca73476c515f78b166c5f6fd6b6c522089e)), closes [#262](https://github.com/solid-memo/website/issues/262)
* **statistics:** summarize past months in the digest for the today strip ([c1f65fe](https://github.com/solid-memo/website/commit/c1f65fe2412cc56ee5513a50f94d54220b4ed755)), closes [#259](https://github.com/solid-memo/website/issues/259)

## [6.3.3](https://github.com/solid-memo/website/compare/v6.3.2...v6.3.3) (2026-10-23)

### Performance Improvements

* **studio:** bring the Studio's messages with its chunk ([467e4c4](https://github.com/solid-memo/website/commit/467e4c4c41634456ff332248a113d7cbb4c52a0a)), closes [#257](https://github.com/solid-memo/website/issues/257)
* **ui:** fetch only the language the page speaks ([98c1867](https://github.com/solid-memo/website/commit/98c1867f6255b66e7929049e329307e032c0d19e)), closes [#257](https://github.com/solid-memo/website/issues/257)

## [6.3.2](https://github.com/solid-memo/website/compare/v6.3.1...v6.3.2) (2026-10-23)

### Performance Improvements

* **solid:** read the library index once a page ([a97a5c2](https://github.com/solid-memo/website/commit/a97a5c24013e815605cf27cf8aa67e797cbc0ef8)), closes [#256](https://github.com/solid-memo/website/issues/256)
* **ui:** keep every library query for the page ([6f71e8c](https://github.com/solid-memo/website/commit/6f71e8c454bdcaf059f6a981777b2fcb97efa2ae)), closes [#256](https://github.com/solid-memo/website/issues/256)

## [6.3.1](https://github.com/solid-memo/website/compare/v6.3.0...v6.3.1) (2026-10-23)

### Bug Fixes

* **ui:** show an error that won't go away at once instead of retrying ([2419b50](https://github.com/solid-memo/website/commit/2419b5025196310ce5be95402c0cd59ca42f3d49)), closes [#260](https://github.com/solid-memo/website/issues/260)

## [6.3.0](https://github.com/solid-memo/website/compare/v6.2.0...v6.3.0) (2026-10-23)

### Features

* **decks:** say the getting-started course runs alongside the library ([5368885](https://github.com/solid-memo/website/commit/536888578576d27e5a70e7c0e31dbf80f1db334b)), closes [#253](https://github.com/solid-memo/website/issues/253)
* **ui:** point to the deck library while only courses are on the list ([fee8ac3](https://github.com/solid-memo/website/commit/fee8ac3f4a746b17ad5613299b8fa6fd9c5a2876)), closes [#253](https://github.com/solid-memo/website/issues/253)

## [6.2.0](https://github.com/solid-memo/website/compare/v6.1.0...v6.2.0) (2026-10-23)

### Features

* **studio:** show a deck's cards in the language chosen for it ([7f36d91](https://github.com/solid-memo/website/commit/7f36d91e0f290889191b5ff49f7b8d4c59b838dd)), closes [#252](https://github.com/solid-memo/website/issues/252)
* **ui:** choose a deck's card language on its preferences page ([d0ae098](https://github.com/solid-memo/website/commit/d0ae098e1e4d54602931b9a4efa6908cae18d414)), closes [#252](https://github.com/solid-memo/website/issues/252)
* **ui:** show a deck's cards in the language chosen for it ([9254af3](https://github.com/solid-memo/website/commit/9254af3f17f0cdafe2e5206c27bd1816e64b8552)), closes [#252](https://github.com/solid-memo/website/issues/252)
* **vocab:** keep a deck's card language in the pod, in vocabulary 1.24 ([a759916](https://github.com/solid-memo/website/commit/a759916a6bcfefea8ecae71cd74ed1c22e315f42)), closes [#252](https://github.com/solid-memo/website/issues/252)

## [6.1.0](https://github.com/solid-memo/website/compare/v6.0.2...v6.1.0) (2026-10-23)

### Features

* **ui:** cram a deck's leeches without recording answers ([b6b67d9](https://github.com/solid-memo/website/commit/b6b67d9812718ce8fd16fef065069b37f1dc78c9)), closes [#250](https://github.com/solid-memo/website/issues/250)
* **ui:** cram the leeches of every deck from the statistics ([8fe68c7](https://github.com/solid-memo/website/commit/8fe68c7772559b74568e4b2547bfea6a3e6987af)), closes [#250](https://github.com/solid-memo/website/issues/250)

## [6.0.2](https://github.com/solid-memo/website/compare/v6.0.1...v6.0.2) (2026-10-23)

### Bug Fixes

* **ui:** name only what a format update adds since the oldest version ([1110310](https://github.com/solid-memo/website/commit/1110310d4354ed7f77417e8dc73dbf29c5c562be)), closes [#248](https://github.com/solid-memo/website/issues/248)

## [6.0.1](https://github.com/solid-memo/website/compare/v6.0.0...v6.0.1) (2026-10-23)

### Performance Improvements

* **ui:** show the courses to continue as soon as the decks ([666060d](https://github.com/solid-memo/website/commit/666060de758038fd8810c017ef1c206c7d89ec27)), closes [#246](https://github.com/solid-memo/website/issues/246)

## [6.0.0](https://github.com/solid-memo/website/compare/v5.4.0...v6.0.0) (2026-10-22)

### ⚠ BREAKING CHANGES

* **ns:** cards are written in card format 7. An older version of Solid Memo reads a format-7 card without what it is about and refuses to save over it, so after this version updates a pod, a tab or device still on an older version cannot edit those cards until it is reloaded. A library release with format-7 cards needs this version to be imported.

### Features

* **decks:** describe each famous painting for screen readers ([4fc68f4](https://github.com/solid-memo/website/commit/4fc68f4f12d618dc29940423cec228097cfe0b9b)), closes [#234](https://github.com/solid-memo/website/issues/234)
* **decks:** describe each flag for screen readers ([5bf52b1](https://github.com/solid-memo/website/commit/5bf52b120658f54767139d21356c75f98118a037)), closes [#234](https://github.com/solid-memo/website/issues/234)
* **decks:** describe each Rijksmuseum picture for screen readers ([dda6fdb](https://github.com/solid-memo/website/commit/dda6fdb3ed20979a25da6e5df251fe60f0bb63ef)), closes [#234](https://github.com/solid-memo/website/issues/234)
* **domain:** ask the library for a description of every picture ([7c760d2](https://github.com/solid-memo/website/commit/7c760d200b55d94cbbd682234a046ac0b4a4049c)), closes [#234](https://github.com/solid-memo/website/issues/234)
* **domain:** offer a library release that changes only what cards are about ([2e2fba5](https://github.com/solid-memo/website/commit/2e2fba50bfef667e4e0ac8897ee6c040d6222249)), closes [#236](https://github.com/solid-memo/website/issues/236)
* **ns:** keep what a card is about, in card format 7 ([d16a2cd](https://github.com/solid-memo/website/commit/d16a2cd6756634fa9c0080af960c54c521d5c181)), closes [#236](https://github.com/solid-memo/website/issues/236)
* **studio:** show what cards are about in a copy's update and a release's changes ([111cb70](https://github.com/solid-memo/website/commit/111cb70b42ea65ab96ea7e51a4a38e18925a7e34)), closes [#236](https://github.com/solid-memo/website/issues/236)

## [5.4.0](https://github.com/solid-memo/website/compare/v5.3.2...v5.4.0) (2026-10-22)

### Features

* **decks:** let a library card name what it is about ([8d9280b](https://github.com/solid-memo/website/commit/8d9280b44cd3fe6c17fd216d3acdcab98dd8402c)), closes [#236](https://github.com/solid-memo/website/issues/236)
* **decks:** link the taxonomy deck's cards to the concepts they are about ([767878d](https://github.com/solid-memo/website/commit/767878dc7f81fd948219788286dba49eaaf84240)), closes [#236](https://github.com/solid-memo/website/issues/236)
* **decks:** name the taxonomy concepts each card is about ([88d348e](https://github.com/solid-memo/website/commit/88d348edab5d57b7adf92c0078971c80f3cf1765)), closes [#236](https://github.com/solid-memo/website/issues/236)
* **decks:** write Git commands as code in Markdown ([3f9810c](https://github.com/solid-memo/website/commit/3f9810c1a7d9c92fdac4a402fdca7646d15fcd02)), closes [#235](https://github.com/solid-memo/website/issues/235)
* **decks:** write HTML elements and attributes as code in Markdown ([d4ff6d0](https://github.com/solid-memo/website/commit/d4ff6d065cecc5ac4ba6b0b43e4c596fe8e2548b)), closes [#235](https://github.com/solid-memo/website/issues/235)
* **decks:** write Python names and values as code in Markdown ([1d05741](https://github.com/solid-memo/website/commit/1d05741bf1dac27bd2d65f308468a2ff5f44acd8)), closes [#235](https://github.com/solid-memo/website/issues/235)
* **decks:** write shell commands as code in Markdown ([b626463](https://github.com/solid-memo/website/commit/b62646340ac15354a239bea42da1d5a2804ddc60)), closes [#235](https://github.com/solid-memo/website/issues/235)
* **decks:** write SQL statements and names as code in Markdown ([4d75a95](https://github.com/solid-memo/website/commit/4d75a95da32f4160b31f2c6302977444caae5b7d)), closes [#235](https://github.com/solid-memo/website/issues/235)
* **decks:** write Vim keys and commands as code in Markdown ([13bc0d1](https://github.com/solid-memo/website/commit/13bc0d111d47cc72df8f7218c09f39065eb76285)), closes [#235](https://github.com/solid-memo/website/issues/235)

## [5.3.2](https://github.com/solid-memo/website/compare/v5.3.1...v5.3.2) (2026-10-22)

### Bug Fixes

* **decks:** ask nine more Solid questions for one answer ([cf74ac8](https://github.com/solid-memo/website/commit/cf74ac81e1ab6bb04383a25a1500fc12ecdb29fb)), closes [#231](https://github.com/solid-memo/website/issues/231)
* **decks:** ask the hash WebID review question for one answer ([209ad1c](https://github.com/solid-memo/website/commit/209ad1c7c581fef13aec786995990a7b4382cecd)), closes [#231](https://github.com/solid-memo/website/issues/231)
* **decks:** ask two driving theory questions for one answer ([99d2b8f](https://github.com/solid-memo/website/commit/99d2b8f7712bf670630cbd66587f5f0013f94909)), closes [#231](https://github.com/solid-memo/website/issues/231)
* **decks:** ask two public code questions for one answer ([e78d6f9](https://github.com/solid-memo/website/commit/e78d6f95300fd71140d847ec343f6641a0d9e4a2)), closes [#231](https://github.com/solid-memo/website/issues/231)

## [5.3.1](https://github.com/solid-memo/website/compare/v5.3.0...v5.3.1) (2026-10-21)

### Bug Fixes

* **ui:** keep deck names readable in a narrow deck list ([913cb38](https://github.com/solid-memo/website/commit/913cb383a6ca84249d00c8ab2339402d81b0605a)), closes [#221](https://github.com/solid-memo/website/issues/221)

## [5.3.0](https://github.com/solid-memo/website/compare/v5.2.0...v5.3.0) (2026-10-21)

### Features

* **ui:** head the course strip and say what it holds ([675a449](https://github.com/solid-memo/website/commit/675a449ba89b2e29cdb0dd2cff92346a89c500a7)), closes [#224](https://github.com/solid-memo/website/issues/224)

## [5.2.0](https://github.com/solid-memo/website/compare/v5.1.0...v5.2.0) (2026-10-21)

### Features

* **ui:** make End session the next step and Undo a quiet one ([6cbf227](https://github.com/solid-memo/website/commit/6cbf227a6c34be3bc71e58dc2a1b0157cefdd13e)), closes [#219](https://github.com/solid-memo/website/issues/219)
* **ui:** show the statistics by deck as a block a deck ([4d037fd](https://github.com/solid-memo/website/commit/4d037fdbe9814c453bbd2e902ec547d5cd3cf2b3)), closes [#223](https://github.com/solid-memo/website/issues/223)

### Bug Fixes

* **studio:** keep the sidebar's faint pin at 3:1 ([fc9783a](https://github.com/solid-memo/website/commit/fc9783aff1e8c773b887567c5c7e0140a3de22ce)), closes [#216](https://github.com/solid-memo/website/issues/216)
* **ui:** draw the drop line's label on the primary fill ([67adfea](https://github.com/solid-memo/website/commit/67adfea41f2ece0ec12433c40cf44971bb7f1c94)), closes [#216](https://github.com/solid-memo/website/issues/216)
* **ui:** keep every step of a chart at 3:1 on the surfaces ([c78fe4b](https://github.com/solid-memo/website/commit/c78fe4b934b2780ea66aa53d272a36a9884965e2)), closes [#216](https://github.com/solid-memo/website/issues/216)
* **ui:** raise Standard's dark muted text to 4.5:1 on a hovered grade ([a4d7b99](https://github.com/solid-memo/website/commit/a4d7b99071a6c6342f042321a31676d02a8c867f)), closes [#9ba6b2](https://github.com/solid-memo/website/issues/9ba6b2) [#aab4bf](https://github.com/solid-memo/website/issues/aab4bf) [#216](https://github.com/solid-memo/website/issues/216)

## [5.1.0](https://github.com/solid-memo/website/compare/v5.0.0...v5.1.0) (2026-10-21)

### Features

* **ui:** welcome a returning learner with their streak ([82b0b8f](https://github.com/solid-memo/website/commit/82b0b8f19124a8dda066eeda67e3a2ca3c65e49d)), closes [#213](https://github.com/solid-memo/website/issues/213)

## [5.0.0](https://github.com/solid-memo/website/compare/v4.2.0...v5.0.0) (2026-10-21)

### ⚠ BREAKING CHANGES

* **vocab:** the app writes preferences in format 6. An older
version of Solid Memo reads format-6 preferences without the palette
and the text size and refuses to save over them, so after this version
saves or updates an instance's preferences, a tab or device still on an
older version cannot save its preferences, its theme or "Not now" to
the invitation to FSRS-6 until it is reloaded.

### Features

* **ui:** add a Color-blind friendly palette ([70520b7](https://github.com/solid-memo/website/commit/70520b7080739f021670d2e843018e78c2ecf57f)), closes [#211](https://github.com/solid-memo/website/issues/211)
* **ui:** add a High contrast palette, kept on the device ([ecfa427](https://github.com/solid-memo/website/commit/ecfa42749c0f12e5294964394cc48dab64020292)), closes [#211](https://github.com/solid-memo/website/issues/211)
* **ui:** add a Parchment palette for low glare ([4e254ae](https://github.com/solid-memo/website/commit/4e254ae899a9dd930bb2b3582c4b07519e5c2536)), closes [#211](https://github.com/solid-memo/website/issues/211)
* **ui:** choose the colors and the text size in the preferences ([28982bf](https://github.com/solid-memo/website/commit/28982bffa74eda97b9d0bd3e207f64d5342c4746)), closes [#211](https://github.com/solid-memo/website/issues/211)
* **ui:** show the text at a larger size kept on the device ([48ed73c](https://github.com/solid-memo/website/commit/48ed73ca4018ef191a83a9b56072b5c862f54722)), closes [#211](https://github.com/solid-memo/website/issues/211)
* **vocab:** design a palette of one's own, kept in the pod ([ecdd5a4](https://github.com/solid-memo/website/commit/ecdd5a40c6c84ba1b20f8ed52e4eb1e31fa1c365)), closes [#rrggbb](https://github.com/solid-memo/website/issues/rrggbb) [#rrggbb](https://github.com/solid-memo/website/issues/rrggbb) [#211](https://github.com/solid-memo/website/issues/211)
* **vocab:** keep the palette and the text size in the pod's preferences ([d7e4071](https://github.com/solid-memo/website/commit/d7e4071e41d25ca57a2456e5af6258f0a3e0daea)), closes [#211](https://github.com/solid-memo/website/issues/211)

### Bug Fixes

* **studio:** scale the panes' size limits with the root font size ([821ff3e](https://github.com/solid-memo/website/commit/821ff3ef89c152605a732812f90fa77933f3b3c3)), closes [#211](https://github.com/solid-memo/website/issues/211)
* **ui:** keep a later choice of colors over the read of an earlier one ([8d4dff2](https://github.com/solid-memo/website/commit/8d4dff2cc02c97510dc146844befedfeb905ff52)), closes [#211](https://github.com/solid-memo/website/issues/211)
* **ui:** keep fields and card tables within 320px at the largest text ([0ce902f](https://github.com/solid-memo/website/commit/0ce902f306d55cfcfe6c9e93357949ebbbf2678f)), closes [#211](https://github.com/solid-memo/website/issues/211)

## [4.2.0](https://github.com/solid-memo/website/compare/v4.1.3...v4.2.0) (2026-10-20)

### Features

* **ui:** shrink a card's question text as it gets longer ([31c5bfb](https://github.com/solid-memo/website/commit/31c5bfbae18630acc355092fe65e9269e1fae484)), closes [#209](https://github.com/solid-memo/website/issues/209)

## [4.1.3](https://github.com/solid-memo/website/compare/v4.1.2...v4.1.3) (2026-10-20)

### Bug Fixes

* **web:** unregister the old journeys report's service workers ([786bdea](https://github.com/solid-memo/website/commit/786bdea71787fe07f5eb444a49a24934a09d5774))

## [4.1.2](https://github.com/solid-memo/website/compare/v4.1.1...v4.1.2) (2026-10-20)

### Bug Fixes

* **ui:** take the landing page's logo back to the first step ([7ebfcca](https://github.com/solid-memo/website/commit/7ebfccacae755f59750f8cad1dc7ba74ce6d7d8d)), closes [#205](https://github.com/solid-memo/website/issues/205)

## [4.1.1](https://github.com/solid-memo/website/compare/v4.1.0...v4.1.1) (2026-10-20)

### Bug Fixes

* **solid:** refuse unsafe pod writes in one fence ([38a0d12](https://github.com/solid-memo/website/commit/38a0d12ffa324282424617f80e423134c3fe3bfe))
* **solid:** use a catalog-named document only where it is the deck's own ([64b3269](https://github.com/solid-memo/website/commit/64b3269cd2a4354a46389a9834d5da2fe992f83d))

## [4.1.0](https://github.com/solid-memo/website/compare/v4.0.0...v4.1.0) (2026-10-19)

### Features

* **application:** read an instance as a graph ([90ec00c](https://github.com/solid-memo/website/commit/90ec00c48900dd21a712d8a7bb8bd3eb525c2908)), closes [#198](https://github.com/solid-memo/website/issues/198)
* **studio:** draw the instance's data as a graph ([ca238d3](https://github.com/solid-memo/website/commit/ca238d3388b556e56ecb40051e6c845355f76f9e)), closes [#198](https://github.com/solid-memo/website/issues/198)

## [4.0.0](https://github.com/solid-memo/website/compare/v3.13.0...v4.0.0) (2026-10-19)

### ⚠ BREAKING CHANGES

* the app writes preferences in format 5 and deck
schedules in format 2. An older version of Solid Memo reads format-5
preferences without the scheduler and refuses to save over them, so
after this version saves or updates an instance's preferences, a tab
or device still on an older version cannot save its preferences or
theme until it is reloaded. Such a tab also ignores the preferences'
scheduler and keeps scheduling and grading by SM-2 alone, which leaves
the FSRS-6 states it grades to be worked out again. It reads a
format-2 deck schedule as format 1, so while that schedule is fresh it
shows its counts (FSRS-6's due days when FSRS-6 is in use) as its own,
and it cannot write over it: its digest writes that hold one fail and
it reads that deck's documents again on each visit.

### Features

* **decks:** add a Swedish driving license B theory course ([503679d](https://github.com/solid-memo/website/commit/503679d482828e8bcda63de187d463a1976bbf50)), closes [#194](https://github.com/solid-memo/website/issues/194)
* **domain:** schedule with FSRS-6 ([5e68e46](https://github.com/solid-memo/website/commit/5e68e46eac08fb03607421c27535cd7f2bae0550)), closes [#191](https://github.com/solid-memo/website/issues/191)
* keep an FSRS-6 state beside each SM-2 state ([ed0b841](https://github.com/solid-memo/website/commit/ed0b84101969b3d38ce109b0f4afe4ece8b46cf8)), closes [#191](https://github.com/solid-memo/website/issues/191)
* name the scheduler in preferences and deck schedules ([3e5d1ff](https://github.com/solid-memo/website/commit/3e5d1ffd5bc6f747c58892981ae37461b736de02)), closes [#191](https://github.com/solid-memo/website/issues/191)
* **ns:** add FSRS-6 review states to vocabulary 1.21 ([75b6f17](https://github.com/solid-memo/website/commit/75b6f173ef544811bae87d3089c24c39707a2e82)), closes [#191](https://github.com/solid-memo/website/issues/191)
* recommend FSRS-6 and invite SM-2 learners to switch ([2494072](https://github.com/solid-memo/website/commit/24940724bbc0dcd0758a722cc9997eb8502ad077)), closes [#191](https://github.com/solid-memo/website/issues/191)
* **studio:** show a card's FSRS-6 memory in the inspector ([15b1ae4](https://github.com/solid-memo/website/commit/15b1ae49582d0caaad90bdc0e4a83e5bf979d3d6)), closes [#191](https://github.com/solid-memo/website/issues/191)
* switch the scheduler to FSRS-6 in the preferences ([4f3be7c](https://github.com/solid-memo/website/commit/4f3be7cf8bde8d0db05a00ded44e15df2c64d1d6)), closes [#191](https://github.com/solid-memo/website/issues/191)

## [3.13.0](https://github.com/solid-memo/website/compare/v3.12.0...v3.13.0) (2026-10-19)

### Features

* **decks:** add a deck of famous movie quotes ([4600719](https://github.com/solid-memo/website/commit/4600719e491ecd5f8cfea2cb91fda549d16f2cb0)), closes [#186](https://github.com/solid-memo/website/issues/186)

## [3.12.0](https://github.com/solid-memo/website/compare/v3.11.0...v3.12.0) (2026-10-18)

### Features

* **library:** ask every app language of a library deck's title, description and keywords ([5054f6b](https://github.com/solid-memo/website/commit/5054f6bd03a97654b9fdbb3b93009bff737b5571)), closes [#172](https://github.com/solid-memo/website/issues/172)

### Bug Fixes

* **ci:** keep step outputs out of scripts and Pages rights in their jobs ([c443861](https://github.com/solid-memo/website/commit/c44386186575db49b7a40476ce860852b8d43837)), closes [#170](https://github.com/solid-memo/website/issues/170) [#170](https://github.com/solid-memo/website/issues/170)
* **solid:** bring outdated deck entries up through upgradeDeck ([57d3960](https://github.com/solid-memo/website/commit/57d3960bd04cf681b706fa82506331ea7eef06ab)), closes [#168](https://github.com/solid-memo/website/issues/168)
* **studio:** keep what has the focus in a table clear of what sticks ([3a96613](https://github.com/solid-memo/website/commit/3a96613bf75b6e894613f664ba1e853717efe5b8)), closes [#169](https://github.com/solid-memo/website/issues/169)
* **studio:** mark the languages in the names of cells edited in place ([b10a4f7](https://github.com/solid-memo/website/commit/b10a4f76458b6ae0a04bcf694552abcfabf59d9f)), closes [#169](https://github.com/solid-memo/website/issues/169)

## [3.11.0](https://github.com/solid-memo/website/compare/v3.10.1...v3.11.0) (2026-10-18)

### Features

* **studio:** write a release's contact from the release screen ([711a5d1](https://github.com/solid-memo/website/commit/711a5d18e031f25ec53068d32577dd6bf6901481)), closes [#166](https://github.com/solid-memo/website/issues/166)

### Bug Fixes

* **studio:** flag a missing library contact and any email in the library check ([ca7e48e](https://github.com/solid-memo/website/commit/ca7e48e7bc4ffcf08f9c6d58c0fcb8b676b73b53)), closes [#166](https://github.com/solid-memo/website/issues/166)

## [3.10.1](https://github.com/solid-memo/website/compare/v3.10.0...v3.10.1) (2026-10-17)

### Bug Fixes

* **studio:** mark a card side's cell field with the side's language ([9a66983](https://github.com/solid-memo/website/commit/9a669832cf2d8aee90a53c237167482a23dcbd17)), closes [#149](https://github.com/solid-memo/website/issues/149)
* **ui:** give the small targets axe finds 24px of room ([c674c53](https://github.com/solid-memo/website/commit/c674c53a0132eeeb4463c9e45f455cfe99d9e731)), closes [#149](https://github.com/solid-memo/website/issues/149)

## [3.10.0](https://github.com/solid-memo/website/compare/v3.9.0...v3.10.0) (2026-10-17)

### Features

* **domain:** write an error's details and report link without addresses ([3c259d1](https://github.com/solid-memo/website/commit/3c259d1e1a0406cfcf8a4b4a232340e3e7991873)), closes [#147](https://github.com/solid-memo/website/issues/147)
* **ui:** show a screen to act on when a render error breaks the app ([bb970a6](https://github.com/solid-memo/website/commit/bb970a68034cc326e87a0c1117018188271ebde0)), closes [#147](https://github.com/solid-memo/website/issues/147)

## [3.9.0](https://github.com/solid-memo/website/compare/v3.8.0...v3.9.0) (2026-10-17)

### Features

* **ui:** show under each grade the interval it gives ([0693270](https://github.com/solid-memo/website/commit/0693270fea5c25048ffc5582244698d57c6f0c33)), closes [#145](https://github.com/solid-memo/website/issues/145)
* **ui:** undo the last answer in a study session ([01b8a1d](https://github.com/solid-memo/website/commit/01b8a1d8f373fd96a4418e36e36a836760267ea0)), closes [#145](https://github.com/solid-memo/website/issues/145)

## [3.8.0](https://github.com/solid-memo/website/compare/v3.7.1...v3.8.0) (2026-10-17)

### Features

* **ui:** copy a library deck's link from its page ([7361c48](https://github.com/solid-memo/website/commit/7361c48ccb37ee285572a9765c52adc30227331f)), closes [#142](https://github.com/solid-memo/website/issues/142)
* **ui:** link the About page from the footer ([aaac736](https://github.com/solid-memo/website/commit/aaac736bb73da56dcedecb048b4ed16a876c00f3)), closes [#142](https://github.com/solid-memo/website/issues/142)
* **ui:** open a library deck from a link that names no instance ([8795e94](https://github.com/solid-memo/website/commit/8795e94e28704f49fd0c4335f63949ed1fa4b970)), closes [#142](https://github.com/solid-memo/website/issues/142)
* **web:** give the About page a link preview of its own ([7655e47](https://github.com/solid-memo/website/commit/7655e4766f9515c704a7f58755429fd091a71629)), closes [#142](https://github.com/solid-memo/website/issues/142)
* **web:** show the app in screenshots, and invite a try in its preview ([350ee21](https://github.com/solid-memo/website/commit/350ee21a1b79b0ed4c74ae6e7abfbed2d216e5b4)), closes [#142](https://github.com/solid-memo/website/issues/142)

## [3.7.1](https://github.com/solid-memo/website/compare/v3.7.0...v3.7.1) (2026-10-17)

### Performance Improvements

* grade a card without reading its state and the preferences first ([7f148e5](https://github.com/solid-memo/website/commit/7f148e5f66edc3cd145a0b248f683331abf41f40)), closes [#146](https://github.com/solid-memo/website/issues/146)
* **solid:** keep what a write leaves at the version the pod answers with ([6b625ec](https://github.com/solid-memo/website/commit/6b625ec5aa90a6f98f4a0c39a5adc75d6bb2ca1e)), closes [#146](https://github.com/solid-memo/website/issues/146)
* **ui:** read the library's index once a page for the deck list ([d891c31](https://github.com/solid-memo/website/commit/d891c31490c06b4e8a9ca1619fd04d8ced04773c)), closes [#146](https://github.com/solid-memo/website/issues/146)

## [3.7.0](https://github.com/solid-memo/website/compare/v3.6.1...v3.7.0) (2026-10-17)

### Features

* **ui:** report a mistake in a card from where it is seen ([0c14836](https://github.com/solid-memo/website/commit/0c148368965d56bd4f6ef1165b669d61352e9df6)), closes [#144](https://github.com/solid-memo/website/issues/144)

## [3.6.1](https://github.com/solid-memo/website/compare/v3.6.0...v3.6.1) (2026-10-17)

### Bug Fixes

* **application:** keep the note of a cut-off guest move on a failed retry ([d2a1f68](https://github.com/solid-memo/website/commit/d2a1f685f1e8f41b887e3f94fab4e0386c2691b9)), closes [#140](https://github.com/solid-memo/website/issues/140)
* **ui:** offer a cut-off guest move's copy for removal when logged in ([301301b](https://github.com/solid-memo/website/commit/301301bc443d6d929d264f4f1453656e01499dd2)), closes [#140](https://github.com/solid-memo/website/issues/140)
* **ui:** say a library update finished after the deck page reloads it ([46cd821](https://github.com/solid-memo/website/commit/46cd821beb0f5e6dcbd783b466f410aec456de1c)), closes [#140](https://github.com/solid-memo/website/issues/140) [#140](https://github.com/solid-memo/website/issues/140)
* **ui:** say the statistics begin anew once a reset empties the log ([7efaad0](https://github.com/solid-memo/website/commit/7efaad048a9263b82a2d4c8098d6c748d7456c81)), closes [#140](https://github.com/solid-memo/website/issues/140)

## [3.6.0](https://github.com/solid-memo/website/compare/v3.5.0...v3.6.0) (2026-10-17)

### Features

* **decks:** stop presenting foundation reviews as current ([7b1708e](https://github.com/solid-memo/website/commit/7b1708e1f8dd0b56cfbe9d572b38ffa502646a7b)), closes [#136](https://github.com/solid-memo/website/issues/136)

## [3.5.0](https://github.com/solid-memo/website/compare/v3.4.0...v3.5.0) (2026-10-17)

### Features

* **docs:** list every page of the docs on each page, from an index in Turtle ([9006825](https://github.com/solid-memo/website/commit/9006825a1095847a49bea72822dde067f44c46bb)), closes [#134](https://github.com/solid-memo/website/issues/134)

## [3.4.0](https://github.com/solid-memo/website/compare/v3.3.0...v3.4.0) (2026-10-16)

### Features

* **decks:** learn Korean from dialogues around food ([c2a179c](https://github.com/solid-memo/website/commit/c2a179cf201c3d1d1af0407de8b43580762a9442)), closes [#132](https://github.com/solid-memo/website/issues/132)

## [3.3.0](https://github.com/solid-memo/website/compare/v3.2.0...v3.3.0) (2026-10-16)

### Features

* **ui:** link the docs from the footer ([939fc6f](https://github.com/solid-memo/website/commit/939fc6fae0ca39e2933905cda2237f065afb0568)), closes [#112](https://github.com/solid-memo/website/issues/112)
* **web:** generate the sitemap and robots.txt from CNAME ([9e09627](https://github.com/solid-memo/website/commit/9e0962763f8ccf3a8a8f43782669f1e92dfc6515)), closes [#112](https://github.com/solid-memo/website/issues/112)
* **web:** link the docs from the About page, the page without script and publiccode.yml ([d9c3a6e](https://github.com/solid-memo/website/commit/d9c3a6edcb3d2171ce1a1de8979dee03b49d5f40)), closes [#112](https://github.com/solid-memo/website/issues/112)
* **web:** publish the docs at /docs/ with every release, drawn in Chromium ([81259e1](https://github.com/solid-memo/website/commit/81259e13f3f85768c8b27b446fe82700e23c3635)), closes [#112](https://github.com/solid-memo/website/issues/112)

## [3.2.0](https://github.com/solid-memo/website/compare/v3.1.0...v3.2.0) (2026-10-16)

### Features

* **decks:** learn everyday Korean phrases ([8ed97d8](https://github.com/solid-memo/website/commit/8ed97d82c241799545f6bc1e0139c2a5c276b755)), closes [#122](https://github.com/solid-memo/website/issues/122)

## [3.1.0](https://github.com/solid-memo/website/compare/v3.0.0...v3.1.0) (2026-10-16)

### Features

* **ui:** join a text field and its language picker in one box ([8900820](https://github.com/solid-memo/website/commit/8900820e8bd34f719877a0a8b1c86b1c53d8e21c)), closes [#117](https://github.com/solid-memo/website/issues/117)

## [3.0.0](https://github.com/solid-memo/website/compare/v2.3.0...v3.0.0) (2026-10-16)

### ⚠ BREAKING CHANGES

* **ns:** the app writes cards in card format 6. An older
version of Solid Memo reads a format-6 card without its front label
and refuses to save over it, so after this version updates a pod, a
tab or device still on an older version cannot edit those cards until
it is reloaded. A library release with front labels needs this version
to be imported.

### Features

* **decks:** label what each capitals card asks ([b83227c](https://github.com/solid-memo/website/commit/b83227c14f1e524fb1b8ff4b2d8d8d57bed8db55)), closes [#115](https://github.com/solid-memo/website/issues/115)
* **ns:** label a card's front, in card format 6 ([6e787f3](https://github.com/solid-memo/website/commit/6e787f3fd670d3f24438a09702f5d7175b74e093)), closes [#115](https://github.com/solid-memo/website/issues/115)
* **ui:** mark decks with a newer library release on the deck list ([6c97668](https://github.com/solid-memo/website/commit/6c9766848f64abfcbe65b9fc8a0c94a11ebd78b9)), closes [#118](https://github.com/solid-memo/website/issues/118)

## [2.3.0](https://github.com/solid-memo/website/compare/v2.2.0...v2.3.0) (2026-10-16)

### Features

* **decks:** say how each HTTP status is used in practice ([dba89b1](https://github.com/solid-memo/website/commit/dba89b19d4687f3f53a6c4c895d956392ee2be95)), closes [#114](https://github.com/solid-memo/website/issues/114)

## [2.2.0](https://github.com/solid-memo/website/compare/v2.1.2...v2.2.0) (2026-10-16)

### Features

* **ui:** link to Discussions from the footer ([2b117ec](https://github.com/solid-memo/website/commit/2b117ecee7c547150ec512befd6d35976a79c2e6)), closes [#107](https://github.com/solid-memo/website/issues/107)

## [2.1.2](https://github.com/solid-memo/website/compare/v2.1.1...v2.1.2) (2026-10-16)

### Bug Fixes

* **studio:** keep hidden text inside the panes that scroll ([485ba46](https://github.com/solid-memo/website/commit/485ba46443e52076b7c6fa7a4446293561d44c7f)), closes [#110](https://github.com/solid-memo/website/issues/110)

## [2.1.1](https://github.com/solid-memo/website/compare/v2.1.0...v2.1.1) (2026-10-16)

### Bug Fixes

* **domain:** find the guest's pod in a text by the origin its URLs parse to ([01e9fb6](https://github.com/solid-memo/website/commit/01e9fb6e82e3413fdb61c57791deb6e2d7ddf6e8)), closes [#102](https://github.com/solid-memo/website/issues/102)

## [2.1.0](https://github.com/solid-memo/website/compare/v2.0.1...v2.1.0) (2026-10-15)

### Features

* **ui:** link to the changelog from the footer ([1ba50c8](https://github.com/solid-memo/website/commit/1ba50c8bd13a896e6a14e9be1939a5e314d1dc40)), closes [#88](https://github.com/solid-memo/website/issues/88)

## [2.0.1](https://github.com/solid-memo/website/compare/v2.0.0...v2.0.1) (2026-10-15)

### Bug Fixes

* **release:** count only a BREAKING CHANGE: footer as written; 2.0.0 broke nothing ([41444fc](https://github.com/solid-memo/website/commit/41444fc3fbaf4d997a163020f536c2d430c8b5e7)), closes [#84](https://github.com/solid-memo/website/issues/84)

## [2.0.0](https://github.com/solid-memo/website/compare/v1.2.0...v2.0.0) (2026-10-15)

### ⚠ BREAKING CHANGES

* **releasing:** of the app. One rule, with no judgment of what an older
reader loses, can be checked, and every shape edited in place so far was
edited before 1.0.0.

### Documentation

* **releasing:** declare the public API that the version promises ([4e18c22](https://github.com/solid-memo/website/commit/4e18c227f36dc4f33d37c8b3a29d0e38b21d5af7)), closes [#72](https://github.com/solid-memo/website/issues/72)

## [1.2.0](https://github.com/solid-memo/website/compare/v1.1.0...v1.2.0) (2026-10-15)

### Features

* **studio:** edit a release's themes on the release screen ([f95c429](https://github.com/solid-memo/website/commit/f95c429d8076c25a0b3194f51ec0eb3906bcf489)), closes [#69](https://github.com/solid-memo/website/issues/69)
* **studio:** group a release's themes, and nest narrower topics ([fb9501f](https://github.com/solid-memo/website/commit/fb9501fd36359e14589f0e43870daa98c9243229)), closes [#69](https://github.com/solid-memo/website/issues/69)

### Bug Fixes

* **domain:** start every new draft about education (EDUC) ([19617f4](https://github.com/solid-memo/website/commit/19617f428c5254792837f84385366137db2c331d)), closes [#69](https://github.com/solid-memo/website/issues/69)

## [1.1.0](https://github.com/solid-memo/website/compare/v1.0.1...v1.1.0) (2026-10-14)

### Features

* **decks:** learn everyday Arabic phrases with Basic Arabic ([e04f2f8](https://github.com/solid-memo/website/commit/e04f2f82abf5a75fceff1cea249ede41d7cb314a))
* **decks:** study the 1000 most common Arabic nouns ([95ae21e](https://github.com/solid-memo/website/commit/95ae21e319dee25ec3b3602fdc8ba624771d6e8b))
* **decks:** study the 300 most common Arabic adjectives ([2fda847](https://github.com/solid-memo/website/commit/2fda847d2de339fce023c6d028f1b1a3eefcccdd))
* **decks:** study the 500 most common Arabic verbs ([edd8d2c](https://github.com/solid-memo/website/commit/edd8d2c2007656e4f6d413429533a3a8aa11ec64))
* describe Arabic as a language and a topic ([94c74e2](https://github.com/solid-memo/website/commit/94c74e21cfb82ac6fb6c1edf03e27f31a5b7ce6e))
* find Arabic words with or without their vowel marks ([ed017e1](https://github.com/solid-memo/website/commit/ed017e10ada11d546a710feacdbb8ea3733527fa))
* show Arabic and other right-to-left text in its own direction ([ab40317](https://github.com/solid-memo/website/commit/ab403171c45c4c5f259ee497ecd5a518a8092e0e))

## [1.0.1](https://github.com/solid-memo/website/compare/v1.0.0...v1.0.1) (2026-10-14)

### Bug Fixes

* keep the last edit's deck arrangement over a read still in flight ([ec57855](https://github.com/solid-memo/website/commit/ec57855c47b278f33bd775a80cfb558137c37409))

## 1.0.0 (2026-10-13)

### Features

* declare Solid Memo stable, from its first version, 1.0.0 ([282574d](https://github.com/solid-memo/website/commit/282574d234cccc8221bd648c5e4c9eb7f94c5c28))

<!-- markdownlint-enable -->
<!-- cspell:enable -->

## What the first version contains

Version 1.0.0 is the first version released, and the first stable one.
Its entry above, which semantic-release writes when it releases the
version, lists only the changes whose commits follow Conventional
Commits, a small part of it: most of the app was built before. This is
all that it contains.

### Added

- **Study.** Flashcards scheduled by SM-2, the spaced-repetition method
  that shows a card again just before it would be forgotten
  ([docs/srs.md](docs/srs.md)). A deck is studied one way or both ways,
  at a pace of new cards a day that each deck can set. A card's side
  may be text, a picture or both, with a note under each side and a
  label above the back. The day's study is celebrated, with its streak.
- **Your data in your pod.** Decks, cards, review states, preferences
  and the answer log are RDF documents in the user's own
  [Solid](https://solidproject.org/) pod, found again through the type
  index ([docs/data-model.md](docs/data-model.md)). Sign-in with
  Solid-OIDC against any Solid identity provider
  ([docs/authentication.md](docs/authentication.md)), and help for a
  newcomer to get a pod ([docs/onboarding.md](docs/onboarding.md)).
- **Guest mode.** Trying the app before signing in, in a pod kept in the
  browser, and keeping that study when a real pod is connected later
  ([docs/guest-mode.md](docs/guest-mode.md)).
- **The deck library.** About a hundred ready-made decks, described with
  DCAT and published with the site, each with its own license and its
  sources; previews of a library deck and its cards; upgrades of a copy
  when its deck has a new version
  ([docs/deck-library.md](docs/deck-library.md)).
- **Courses.** Library decks with chapters of theory and multiple-choice
  questions, whose cards join the learner's deck as they are answered;
  a course for newcomers offered on an empty deck list, and the courses
  to go on with above it ([docs/courses.md](docs/courses.md)).
- **Markdown** in cards and courses, shown safely whatever the data
  holds ([docs/markdown.md](docs/markdown.md)).
- **Organizing decks** into named groups that nest.
- **Statistics** of the study, read from the answer log, over the last
  30 days, 3 months, 12 months or all time, in tabs: how the answers
  went and what each day held; recall week by week, by interval and by
  how late a review was, counting only real reviews; how long was
  studied and at what hours; where the cards stand and what is coming;
  each course's chapters done; the hardest cards and the leeches; and
  every answer a card was given. The charts can be stepped through
  with the keyboard, and the answers saved as a CSV file
  ([docs/statistics.md](docs/statistics.md)).
- **Answer times.** Each answer records how long recalling and grading
  took, the day it was due and the device's offset from UTC, kept with
  the answer log in the pod (vocabulary 1.19,
  [docs/privacy.md](docs/privacy.md#in-your-pod)).
- **Files.** Saving a deck as a Turtle or JSON-LD file and opening one,
  and importing a deck or course from the URL of its release.
- **Solid Memo Studio**, a second app at `#/studio` for managing decks
  and cards in bulk, and for writing decks and courses as drafts,
  checking, trying and publishing them as releases
  ([docs/studio.md](docs/studio.md)).
- **Data checks.** Every document checked against its SHACL shapes and
  DCAT-AP in the browser; data that fails is set aside, not lost
  ([docs/validation.md](docs/validation.md)).
- **Format versions and migrations.** Every subject the app writes
  carries its format version, and the app brings older data up to the
  format it writes, in place, keeping every URL
  ([docs/migrations.md](docs/migrations.md)).
- **Six languages.** English, Swedish, Korean, German, Spanish and
  French, and deck and card text shown in the reader's languages
  ([docs/i18n.md](docs/i18n.md)).
- **Accessibility.** Keyboard and screen-reader use; light and dark
  themes ([docs/theme.md](docs/theme.md)); every view a URL that can
  be bookmarked and shared
  ([docs/routing.md](docs/routing.md)).
- **Open data.** The vocabulary and the shapes are published at
  `https://solid-memo.com/ns/`, so other apps can read and write the
  same data ([docs/vocab.md](docs/vocab.md),
  [docs/shapes.md](docs/shapes.md)).
- **Running your own copy.** The app's name, its repository and the pod
  providers offered at sign-up are set by configuration
  ([docs/configuration.md](docs/configuration.md),
  [docs/reuse.md](docs/reuse.md)), and every screen links to the source
  code, the commit and the issue tracker.
- **An About page** at `/about/`, in plain HTML that search engines and
  browsers without script can read, saying what Solid Memo is for
  learners, deck authors, technologists and decision makers
  ([docs/deployment.md](docs/deployment.md)).
- **Guides for learners**: studying, statistics and the library
  ([docs/user-guide.md](docs/user-guide.md),
  [docs/statistics.md](docs/statistics.md),
  [docs/browsing.md](docs/browsing.md)).
- **A project contact in decks.** New deck versions name the issue
  tracker as their contact point, not an email address
  ([docs/deck-library.md](docs/deck-library.md#contact)).
- **License headers.** Every file carries a machine-readable license, as
  [REUSE](https://reuse.software/) asks
  ([docs/style.md](docs/style.md#licenses)).
- **Tests.** Unit tests at 100% coverage per package, end-to-end tests
  against several Solid servers, and user journeys in a browser
  ([docs/testing.md](docs/testing.md)).
