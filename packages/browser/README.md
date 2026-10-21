# @solid-memo/browser

The adapters for the browser itself: the update journal, the language,
the theme, the palette and the text size kept on this device
(`localStorage`), the guest's pod's store (IndexedDB), and files saved
as downloads and opened from the user's disk.

## Exports

`@solid-memo/browser/<module>` is `src/<module>.ts`:

- `localStorageUpdateJournal`, `localStorageLanguagePreference`,
  `localStorageThemePreference`, `localStoragePalettePreference` and
  `localStorageTextSizePreference`.
- `indexedDbResourceStore`: the guest's pod ([guest-mode.md](../../docs/guest-mode.md)).
- `fileExchange`: the `FileExchange` port, with a `Blob` behind a link
  and a hidden file input ([boundaries.md](../../docs/boundaries.md#files-without-a-vendor-library)).

## Boundaries

It may import `application` and `domain`, and implements
`application`'s ports. Only `composition` may import it
([boundaries.md](../../docs/boundaries.md)).

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/browser   # 100% coverage
npm run test:unit -- packages/browser/src/fileExchange.test.ts   # one file, from the root
```

The tests run in happy-dom, with `fake-indexeddb` for IndexedDB.

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm: the other packages use its TypeScript
source, and its modules change with the app.

See [architecture.md](../../docs/architecture.md).
