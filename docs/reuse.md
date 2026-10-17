# Running your own instance

Anyone may run a copy of Solid Memo: the code is MIT-licensed
([LICENSE](../LICENSE)), and the site is plain static files. Hosting it
means serving those files. A learner's data stays in their own Pod,
never on your host, so a copy holds no user data and needs no database.

A learner can use your copy and <https://solid-memo.com/> on the same Pod:
both read and write the same data ([data-model.md](data-model.md)). That
is why a few names must stay as they are ([below](#what-stays-the-same)).

## 1. Fork or clone

Fork <https://github.com/solid-memo/website>, or clone it anywhere:

```sh
git clone https://github.com/solid-memo/website.git memo
cd memo
npm ci
```

It needs Node.js 24 or later (`engines` in the root
[package.json](../package.json); CI uses the version in `.nvmrc`), and
Chromium, which the build and the checks draw the docs' diagrams in:
`npm run browsers` installs it once, without `sudo` (on Linux, a
machine that lacks the system libraries it needs gets them with
`sudo npx playwright install-deps chromium`). `npm run check` runs the type checks and
the unit tests ([testing.md](testing.md)).

## 2. Configure

Give the build your name, your repository and, if you like, your own
Pod providers and deck library. Copy
[apps/web/.env.example](../apps/web/.env.example) to `apps/web/.env` and
uncomment what you change:

```sh
VITE_APP_NAME=Example School Cards
VITE_REPO_URL=https://codeberg.org/example/memo
VITE_POD_PROVIDERS=[{"id":"school","name":"Example School Pods","oidcIssuer":"https://pods.school.example/"}]
```

[configuration.md](configuration.md) describes every setting, its
default and what it does not reach.

## 3. Build

```sh
npm run build
```

The site is `apps/web/dist/`: the app, the Studio, the vocabulary and
the shapes (`ns/`), the deck library (`decks/`), the vendored
profiles (`vendor/`) and these docs (`docs/`). Without Chromium, the
build fails; `DOCS_DIAGRAMS=skip npm run build` builds the docs without
their diagrams ([configuration.md](configuration.md#docs_diagrams)). `npm start` builds and serves it at
`http://localhost:4173` to try it first.

## 4. Host it anywhere

Upload the **contents** of `apps/web/dist/` to any static host, at a
domain's root or in a subfolder (`https://example.org/memo/`). It needs
no rewrite rules and no per-host settings
([deployment.md](deployment.md#why-any-static-host-works-unconfigured)),
but it must be served over HTTPS for login to work.

On GitHub Pages, a fork deploys with the same workflow as this site
([deployment.md](deployment.md#github-pages-automatic)), which deploys
only released versions, so the fork releases its own with a deploy key
of its own ([releasing.md](releasing.md#the-deploy-key)). It deploys to
`https://<user>.github.io/<repository>/`, or to a domain of its own
([deployment.md](deployment.md#custom-domain-optional)). Its docs serve
each of its own releases at `/docs/X.Y.Z/`; the upstream project's tags,
which a fork has too, have no archive on the fork's releases, so the
list of versions links their docs in the repository
([deployment.md](deployment.md#each-releases-docs)).

## 5. Your own deck library

The app lists one deck library ([deck-library.md](deck-library.md)).
There are two ways to make it yours:

- **Edit `decks/` in your copy.** Add, change or remove decks as
  [deck-library.md](deck-library.md#publishing-a-new-version) says, run
  `npm run library`, and build: the library is published with your
  site. Its IRIs still name `https://solid-memo.com/decks/…`; your site
  serves them from its own address (`siteFetch` in
  [appUseCases.ts](../packages/composition/src/appUseCases.ts)), but
  anyone else who follows such an IRI reaches solid-memo.com. Give a
  deck of your own a name the library here does not use, or the two
  will be confused in a learner's Pod.
- **Point at a library hosted elsewhere** with `VITE_LIBRARY_INDEX_URL`
  ([configuration.md](configuration.md#vite_library_index_url)). Its
  index and decks must pass the same checks, and its host must let a
  browser read them (`Access-Control-Allow-Origin`).

Either way, a user can still add a deck published anywhere else, from
its link ([deck-library.md](deck-library.md#a-release-outside-the-library)).

## 6. What you edit by hand

A few files describe this deployment and are not settings. Change them
in your copy:

| File | What it says |
|---|---|
| [apps/web/index.html](../apps/web/index.html) | The site's address, as absolute URLs on <https://solid-memo.com/>: the canonical link, `og:url`, `og:image` and the JSON-LD `url`, `@id` and `image`; and the description. Its links to the repository follow `VITE_REPO_URL` ([configuration.md](configuration.md#vite_repo_url)). |
| [apps/web/public/about/index.html](../apps/web/public/about/index.html) | What Solid Memo is, under its name, with its address on <https://solid-memo.com/> and links to this repository, which `VITE_REPO_URL` does not reach. Rewrite it for your copy. |
| [apps/web/public/social-preview.png](../apps/web/public/social-preview.png), the favicons | Solid Memo's wordmark and logo. |
| [apps/web/public/screenshots/](../apps/web/public/screenshots/) | The app under Solid Memo's name, at <https://solid-memo.com/>, which the README, `publiccode.yml` and the About page show. Take your own, or leave them out. |
| [CNAME](../CNAME) | This site's domain on GitHub Pages ([deployment.md](deployment.md#custom-domain-optional)), which the build writes `sitemap.xml` and `robots.txt`'s `Sitemap:` line on. Write your own domain into it, or delete it: without it, the build writes no sitemap. |
| [publiccode.yml](../publiccode.yml) | What Solid Memo is, for software catalogs: this repository, the site's address on <https://solid-memo.com/> and its docs there (`documentation`). Rewrite it for your copy; a release writes its version and date into it ([releasing.md](releasing.md#what-a-release-does)). |
| [README.md](../README.md) | This project's own description and links. |
| [docs/](README.md) | These docs, which the build publishes at `/docs/`: they describe this deployment, its domain, its repository and its releases. Their links into the repository follow `VITE_REPO_URL` ([configuration.md](configuration.md#vite_repo_url)); their words do not. Edit them, or leave them as the upstream project's. |

## What stays the same

These names are part of the data, not of one deployment. Every build
must keep them, or it can no longer read what other builds wrote in a
learner's Pod, nor they what it wrote:

| Name | Where | What it names |
|---|---|---|
| `https://solid-memo.com/` (`SITE`) | [ns.ts](../packages/vocab/src/ns.ts), [shacl_crosscheck.py](../scripts/shacl_crosscheck.py) | The vocabulary, the shapes and the library's decks. Pods store these IRIs. |
| `solid-memo/` | [guest.ts](../packages/domain/src/guest.ts), [trial.ts](../packages/domain/src/release/trial.ts) | The folder an instance gets in a Pod. |
| `solid-memo:*` keys | `packages/browser/src/`, [solidSessionGateway.ts](../packages/solid/src/solidSessionGateway.ts), the theme script in index.html | What the browser keeps: the language, the theme, the update journal, the hash a login set off from. |
| `solid-memo-guest-pod` | [indexedDbResourceStore.ts](../packages/browser/src/indexedDbResourceStore.ts) | The guest's Pod in the browser ([guest-mode.md](guest-mode.md)). |

The browser keeps its data per origin, so the last two never mix
between your site and this one; they stay only so that one codebase
serves both.

The IRIs name solid-memo.com whichever site serves them, but your copy
reads the documents they name from its own address (`siteFetch`), not
from solid-memo.com.
