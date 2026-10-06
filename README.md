# Solid Memo

[![Solid Memo](apps/web/public/og-image.png)](https://solid-memo.com/)

Spaced-repetition flashcards that live in your own Solid Pod.

The app, its vocabulary and shapes ([`ns/`](ns/)) and the ready-made
decks ([`decks/`](decks/)) are published together at
https://solid-memo.com/ ([docs/deployment.md](docs/deployment.md)).

## License

Solid Memo is released under the [MIT License](LICENSE).

The ready-made decks carry their own licences, stated in each deck
(`dcterms:license`, [docs/deck-library.md](docs/deck-library.md)) and
shown in the app. The vendored SHACL shapes keep their own: the DCAT-AP shapes are CC BY 4.0
([licence](packages/vocab/vendor/dcat-ap/LICENSE)) and the SkoHub SKOS
shapes Apache 2.0 ([licence](packages/vocab/vendor/skohub/LICENSE)); see
[packages/vocab/vendor](packages/vocab/vendor/README.md).
