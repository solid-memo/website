# @solid-memo/studio

Solid Memo Studio, the second app: managing an instance's decks and
cards in bulk, and writing decks and courses as drafts, checking,
trying, comparing and publishing them
([studio.md](../../docs/studio.md)). It is served in Solid Memo's own
page, at the hashes under `#/studio`.

## Exports

`@solid-memo/studio` is `src/ui/StudioWorkspace.tsx`, the Studio's
entry point. Its screens, router and shell are in `src/ui/`, and its
stylesheet, `src/ui/studio.css`, is imported by its shell alone.

## Boundaries

It may import `application`, `domain`, `vocab` and `ui`. Only
`apps/web`'s `src/main.tsx` may import it, with a dynamic `import()`, so
the Studio stays a chunk of its own that learners never download
([boundaries.md](../../docs/boundaries.md)). It has no build of its
own: the site's build bundles it.

## Tests

```sh
npx turbo run typecheck test --filter=@solid-memo/studio   # 100% coverage
npm run test:unit -- apps/studio/src/ui/router.test.ts      # one file, from the root
```

The tests run in happy-dom with Testing Library.

## Status

Beta, as is Solid Memo (0.x). A private workspace package, version
`0.0.0`, never published to npm: the site uses its TypeScript source,
and its modules change with the app.

See [studio.md](../../docs/studio.md) and
[architecture.md](../../docs/architecture.md).
