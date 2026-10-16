# The public API

What Solid Memo's versions promise ([docs/releasing.md](../docs/releasing.md#the-public-api)),
written down one promise a line. The docs the site serves at `/docs/`
are not among them, so no file here lists their addresses. Each file is written by a test in the
package whose code it reads, and that test fails when the code and the
file disagree. To write a file again after a change you meant, run its
test with `-u`, and commit the file with the change:

```sh
npm run test:unit -- packages/ui/src/ui/routes.api.test.ts -u
```

| File | What it promises | Written by |
|---|---|---|
| [formats.txt](formats.txt) | For each kind of data, the format version the app writes and the oldest it reads | [formats.api.test.ts](../packages/domain/src/shapes/migrations/formats.api.test.ts) |
| [pod-layout.txt](pod-layout.txt) | Where the data lives in a pod: its documents, the type index registrations, the profile links followed | [podLayout.api.test.ts](../packages/solid/src/podLayout.api.test.ts) |
| [routes/app.txt](routes/app.txt) | The hashes that open the app's screens | [routes.api.test.ts](../packages/ui/src/ui/routes.api.test.ts) |
| [routes/studio.txt](routes/studio.txt) | The hashes that open the Studio's screens | [routes.api.test.ts](../apps/studio/src/ui/routes.api.test.ts) |
| [browser-storage/](browser-storage/) | What each package keeps in the browser: storage keys, the guest pod's IndexedDB, Web Locks | `browserStorage.api.test.ts` in each of browser, solid, ui and studio |
| [self-hosting.txt](self-hosting.txt) | The `VITE_*` variables, the build and start commands, the folder the build writes | [selfHosting.api.test.ts](../scripts/selfHosting.api.test.ts) |
| [frozen/published.txt](frozen/published.txt) | Every document published from `ns/` and `vendor/`, and each shape's hash | [published.api.test.ts](../packages/vocab/tooling/published.api.test.ts) |
| [frozen/vocab.txt](frozen/vocab.txt) | Every term of the vocabulary, with its kind, range and domain, and every topic | [vocab.api.test.ts](../packages/vocab/tooling/vocab.api.test.ts) |

`npm run check:breaking -- --base origin/main` compares these files
with those where the branch left `main`. CI's `library` job runs it on
every pull request, in the merge queue and on every push to `main`,
each with its own base ([releasing.md](../docs/releasing.md#how-ci-holds-to-it)).
A line gone from a file here fails it, unless a commit says the change
breaks, or says why it does not in a
`Contract-Change: not-breaking <reason>` trailer. A line gone from
`frozen/` fails it whatever the commits say. A line added is a promise
added, and needs nothing.
