# Running your own instance

Anyone may run a copy of Solid Memo: the code is MIT-licensed
([LICENSE](../LICENSE)), and the site is static files. A learner's
data stays in their own Pod, never on your host, so a copy holds no
user data and needs no database. A few names must stay as they are
([What stays the same](#what-stays-the-same)).

## 1. Fork or clone

Fork <https://github.com/solid-memo/website>, or clone it anywhere:

```sh
git clone https://github.com/solid-memo/website.git memo
cd memo
npm ci
```

It needs Node.js 24 or later (`engines` in the root
[package.json](../package.json); CI uses `.nvmrc`'s version). The
build and the checks draw the docs' diagrams in Chromium: install it
once, without `sudo`, with `npm run browsers`, and on Linux any missing
system libraries with `sudo npx playwright install-deps chromium`.
`npm run check` runs the type checks and unit tests
([testing.md](testing.md)).

## 2. Configure

For your name, repository and, optionally, Pod providers and deck
library, copy
[apps/web/.env.example](../apps/web/.env.example) to `apps/web/.env` and
uncomment what you change.

```sh
VITE_APP_NAME=Example School Cards
VITE_REPO_URL=https://codeberg.org/example/memo
VITE_POD_PROVIDERS=[{"id":"school","name":"Example School Pods","oidcIssuer":"https://pods.school.example/"}]
```

[configuration.md](configuration.md) describes every setting, its
default and what it doesn't reach.

## 3. Build

```sh
npm run build
```

The site is `apps/web/dist/`
([deployment.md](deployment.md#what-the-artifact-contains)). Without
Chromium the build fails; `DOCS_DIAGRAMS=skip npm run build` leaves
out the docs' diagrams
([configuration.md](configuration.md#docs_diagrams)). To try the site,
`npm start` builds and serves it at `http://localhost:4173`.

## 4. Host it anywhere

Upload the **contents** of `apps/web/dist/` to any static host, at a
domain's root or in a subfolder (`https://example.org/memo/`), with no
rewrite rules or per-host settings
([deployment.md](deployment.md#why-any-static-host-works-unconfigured)).
Login needs HTTPS.

On GitHub Pages, a fork deploys with this site's workflow
([deployment.md](deployment.md#github-pages-automatic)), only for
releases, so your fork releases its own with its own deploy key
([releasing.md](releasing.md#the-deploy-key)). It deploys to
`https://<user>.github.io/<repository>/` or its own domain
([deployment.md](deployment.md#custom-domain-optional)). Its docs at
`/docs/` are those of the version it deploys
([deployment.md](deployment.md#older-releases-docs)).

## 5. Your own deck library

Make the app's one deck library ([deck-library.md](deck-library.md))
yours in one of two ways:

- **Edit `decks/` in your copy.** Add, change or remove decks as
  [deck-library.md](deck-library.md#publishing-a-new-version) says, run
  `npm run library`, and build: the library ships with your site. Its
  IRIs still name `https://solid-memo.com/decks/…`, so anyone but your
  site following one reaches solid-memo.com
  ([below](#what-stays-the-same)). Give your decks names the
  solid-memo.com library doesn't use, or the two get mixed up in a
  learner's Pod.
- **Point at a library hosted elsewhere** with `VITE_LIBRARY_INDEX_URL`
  ([configuration.md](configuration.md#vite_library_index_url)). Its
  index and decks must pass the same checks, and its host must allow
  browser reads (`Access-Control-Allow-Origin`).

Either way, a user can still add any other deck from its link
([deck-library.md](deck-library.md#a-release-outside-the-library)).

## 6. What you edit by hand

Change these files, which describe this deployment and aren't
settings, in your copy:

| File | What it says |
|---|---|
| [apps/web/index.html](../apps/web/index.html) | The site's address, as absolute URLs on <https://solid-memo.com/>: the canonical link, `og:url`, `og:image` and the JSON-LD `url`, `@id` and `image`; and the description. Its repository links follow `VITE_REPO_URL` ([configuration.md](configuration.md#vite_repo_url)). |
| [apps/web/public/about/index.html](../apps/web/public/about/index.html) | What Solid Memo is, under its name, with its solid-memo.com address and repository links that `VITE_REPO_URL` doesn't reach: rewrite it. Its Client ID Document link leads nowhere without a `CNAME`. |
| [apps/web/public/journeys/index.html](../apps/web/public/journeys/index.html), the `journeys` job in [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) | Where the journeys' report is published ([deployment.md](deployment.md#the-journeys-report)): the job's `journeys` environment URL, `JOURNEYS_REPO` (`solid-memo/journeys`) and `JOURNEYS_HOST` (`journeys.solid-memo.com`), to point at your own repository and host, and the page that sends the old address, `/journeys/`, on to that host, with its script's new hash ([journeysRedirect.test.ts](../apps/web/src/journeysRedirect.test.ts) checks both). Without the job's deploy key, a copy publishes no report; given one, it pushes to `solid-memo/journeys`. |
| [apps/web/public/social-preview.png](../apps/web/public/social-preview.png), [solid-memo-avatar.png](../apps/web/public/solid-memo-avatar.png), the favicons | Solid Memo's wordmark and logo. The avatar is the Client ID Document's `logo_uri` too, which identity providers may show at login ([authentication.md](authentication.md#the-client-id-document)). |
| [apps/web/public/screenshots/](../apps/web/public/screenshots/) | The app under Solid Memo's name at solid-memo.com, shown by the README, `publiccode.yml` and About page. Take your own (`npm run screenshots`, [testing.md](testing.md#screenshots)) or leave them out. |
| [CNAME](../CNAME) | This site's GitHub Pages domain ([deployment.md](deployment.md#custom-domain-optional)). The build writes `sitemap.xml`, `robots.txt`'s `Sitemap:` line and the Client ID Document on it. Write your domain into it, and your copy logs in with its own document there, under your `VITE_APP_NAME`. Or delete it: then the build writes no sitemap and no Client ID Document, and your copy registers with the identity provider at each login. |
| [publiccode.yml](../publiccode.yml) | What Solid Memo is, for software catalogs: this repository, the site's solid-memo.com address and its docs there (`documentation`). Rewrite it; a release writes its version and date into it ([releasing.md](releasing.md#what-a-release-does)). |
| [README.md](../README.md) | This project's description and links. |
| [docs/](README.md) | These docs, published at `/docs/`, on this deployment, its domain, repository and releases. Their repository links follow `VITE_REPO_URL`, their words don't: edit them or leave them as upstream's. |

## What stays the same

A learner can use your copy and <https://solid-memo.com/> on the same
Pod, since both read and write the same data
([data-model.md](data-model.md)). These names are part of that data,
not of one deployment. Every build must keep them, or it and the
other builds can't read each other's writes in a learner's Pod:

| Name | Where | What it names |
|---|---|---|
| `https://solid-memo.com/` (`SITE`) | [ns.ts](../packages/vocab/src/ns.ts), [shacl_crosscheck.py](../scripts/shacl_crosscheck.py) | The vocabulary, the shapes and the library's decks, whose IRIs Pods store. A copy reads their documents from its own address (`siteFetch` in [appUseCases.ts](../packages/composition/src/appUseCases.ts)). |
| `solid-memo/` | [guest.ts](../packages/domain/src/guest.ts), [trial.ts](../packages/domain/src/release/trial.ts) | The folder an instance gets in a Pod. |
| `solid-memo:*` keys | `packages/browser/src/`, [solidSessionGateway.ts](../packages/solid/src/solidSessionGateway.ts), the first-paint script in index.html | What the browser keeps: the language, theme, palette, text size, update journal and the hash a login set off from. |
| `solid-memo-guest-pod` | [indexedDbResourceStore.ts](../packages/browser/src/indexedDbResourceStore.ts) | The guest's Pod in the browser ([guest-mode.md](guest-mode.md)). |

The browser keeps data per origin, so the last two never mix between
your site and this one. They stay only so one codebase serves both.
