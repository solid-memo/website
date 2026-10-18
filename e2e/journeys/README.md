# @solid-memo/e2e-journeys

The user journeys: the built app in Chromium, and a few of them in
Firefox, WebKit and on a phone (`playwright.config.ts`), driven by
[Playwright](https://playwright.dev/) through whole journeys a user
takes, logging in to a Community Solid Server 7 started in Docker
([testing.md](../../docs/testing.md#user-journeys)).

## What is in it

- `journeys/*.journey.ts`: the journeys.
- `pages/`: one page object per screen, and `flows/`: steps several
  journeys share.
- `harness/`: the server, its accounts, the pod's dump on a failure,
  the seeded random, the app's own text (`strings.ts`), so a
  journey finds a button by what the user reads, and the accessibility
  check each step ends with (`accessibility.ts`).
- `css/`: the Community Solid Server behind TLS (`compose.yml`).

It exports nothing; no package may import it.

## Boundaries

It may import `ui`, from `harness/strings.ts` only, for the app's
messages, `@playwright/test` and `@axe-core/playwright`
([boundaries.md](../../docs/boundaries.md)).

## Run and test

From the root:

```sh
npx turbo run build --filter=@solid-memo/web   # the app the journeys drive
npm run journeys                               # every journey, against a server started in Docker
npm run journeys -- -g smoke                   # the journeys whose title matches
npx turbo run typecheck test --filter=@solid-memo/e2e-journeys   # the harness's own tests, without Docker or a browser
```

`npm run check` runs only the harness's own tests.

## Status

Stable, as is Solid Memo from version 1.0.0. A private workspace package, version
`0.0.0`, never published to npm.

See [testing.md](../../docs/testing.md#user-journeys).
