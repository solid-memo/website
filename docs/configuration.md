# Configuration

A build of the site reads a few optional settings from `VITE_`
variables; unset or blank, each takes this deployment's value
([reuse.md](reuse.md) says how to run a copy). `DOCS_DIAGRAMS` lets a
build without Chromium skip the docs' diagrams.

| Variable | Default | What it sets |
|---|---|---|
| [`VITE_APP_NAME`](#vite_app_name) | `Solid Memo` | What the site calls itself. |
| [`VITE_REPO_URL`](#vite_repo_url) | `https://github.com/solid-memo/website` | The repository the footer, the page and the docs link to. |
| [`VITE_POD_PROVIDERS`](#vite_pod_providers) | the list in [podProvider.ts](../packages/domain/src/podProvider.ts) | The Pod providers suggested at login and for creating a Pod. |
| [`VITE_LIBRARY_INDEX_URL`](#vite_library_index_url) | the site's own `decks/index.ttl` | The deck library the app lists. |
| [`DOCS_DIAGRAMS`](#docs_diagrams) | unset: every diagram drawn | `skip`: the docs built without their diagrams. |

[apps/web/.env.example](../apps/web/.env.example) gives an example of
each `VITE_` one.

## How a build reads them

Vite writes the values into the page at build time: a change needs a
new build, and a host can't change a built site's settings.

[src/config.ts](../apps/web/src/config.ts) reads and checks every
setting, and [src/main.tsx](../apps/web/src/main.tsx) passes them to
the page, which hands `AppShell` its name, its providers and its
`source`, the footer's links. No package reads the environment
([boundaries.md](boundaries.md)).
[vite.config.ts](../apps/web/vite.config.ts) checks the settings as the
build starts; an unusable value fails it, naming the variable:

```text
Error: VITE_REPO_URL must be an http(s) URL; it is "nope" (docs/configuration.md).
```

## Setting them

In the build's environment, for one run:

```sh
VITE_APP_NAME="Example School Cards" npm run build
```

In a file in `apps/web/`, read in `npm run dev` and `npm run build`
([Vite's env files](https://vite.dev/guide/env-and-mode#env-files)):

- `.env`, committed: a fork's own values, for every build;
- `.env.local`, ignored by git: values for one machine only.

A variable in the environment wins over the same one in a file. A
copy of [.env.example](../apps/web/.env.example), whose lines are
commented out, changes nothing until one is uncommented.

In CI, they go on every step that builds the site: the `site`
job of [ci.yml](../.github/workflows/ci.yml), whose build is tested
and then deployed after a release
([deployment.md](deployment.md#the-build-ci-tested)), and
[deploy.yml](../.github/workflows/deploy.yml), which builds only when
run by hand. Neither sets any variable; a fork that deploys with them
can add its repository's variables to both builds, so they agree. A
variable the repository doesn't have is blank, so it takes the
default:

```yaml
- run: npm run build
  env:
    VITE_APP_NAME: ${{ vars.VITE_APP_NAME }}
    VITE_REPO_URL: ${{ vars.VITE_REPO_URL }}
```

Turbo caches the build: [apps/web/turbo.json](../apps/web/turbo.json)
lists `VITE_*` under `env` and the `.env*` files under `inputs`, so a
new value rebuilds.

## VITE_APP_NAME

Any text on one line; it's trimmed.

```sh
VITE_APP_NAME=Example School Cards
```

The name is shown where it stands alone:

- the landing page's heading and the masthead's wordmark;
- the end of every browser tab's title (`Log in – Example School Cards`);
- the link to the learner's app on the Studio's empty deck list;
- the client name the identity provider shows at login, and the
  Client ID Document's `client_name`
  ([authentication.md](authentication.md#the-client-id-document));
- the page's `<title>`, `og:site_name`, `og:title` and JSON-LD `name` in
  [index.html](../apps/web/index.html), which `vite.config.ts` fills in.

In the app, it replaces the message `app.documentTitle` in every
language (`createI18n` in [i18n.tsx](../packages/ui/src/ui/i18n.tsx)),
untranslated.

The name doesn't reach:

- the about 75 sentences in each language that mention Solid Memo
  ("Solid Memo copies your study into your Pod…"), which name the
  software and fit its name to the grammar (Korean `Solid Memo로`, but
  `…으로` after a consonant);
- the Studio's own name, "Solid Memo Studio", and its "Back to Solid
  Memo";
- the English error texts in
  [appError.ts](../packages/domain/src/appError.ts);
- the page's description, link preview image
  ([social-preview.png](../apps/web/public/social-preview.png)) and its
  alt text, the screenshots
  ([screenshots/](../apps/web/public/screenshots/)), the favicons and
  the logo;
- the docs and the deck library.

A fork that renames the app edits the message files
([i18n.md](i18n.md)) and these files by hand.

## VITE_REPO_URL

An http(s) URL without a user name or password; a trailing slash is
dropped.

```sh
VITE_REPO_URL=https://codeberg.org/example/memo
```

The footer links:

| Link | Address |
|---|---|
| Docs | `docs/` on the same site, not this setting |
| Source code | `<url>` |
| The build's commit, beside the version | `<url>/commit/<sha>` |
| Changelog | `<url>/blob/main/CHANGELOG.md` |
| Report an issue | `<url>/issues/new/choose` |
| Discussions | `<url>/discussions` |

**Report a mistake** on a library deck's card opens
`<url>/issues/new?template=deck.yml`, the repository's deck form, with
the deck and the card filled in
([deck-library.md](deck-library.md#reporting-a-mistake)). On another
forge, the link opens a new issue without GitHub's form and fields.

These are GitHub's paths, which Gitea and Forgejo (Codeberg) share.
On GitLab, whose paths start with `/-/`, the commit, changelog and
issue links don't resolve. Discussions is GitHub's alone: elsewhere,
and on a GitHub repository with Discussions off, that link is a 404.

The page links to it too, as `vite.config.ts` fills in
[index.html](../apps/web/index.html): the JSON-LD's `sameAs` and
`codeRepository`, and the "source code" link shown to a browser that
runs no script. The about page's repository links don't follow
it ([reuse.md](reuse.md#6-what-you-edit-by-hand)).

In the docs at `/docs/`
([deployment.md](deployment.md#what-the-artifact-contains)), a link to
a file or folder outside `docs/` leads to `<url>/blob/<sha>/<path>` or
`<url>/tree/<sha>/<path>` at the commit built, and each page's footer
links its source there, the issues and the commit. When the build
doesn't know its commit (no git checkout and no `GITHUB_SHA`), these
links name `main` and the build warns. On GitLab, they don't resolve
either: some six hundred in the docs' text, and each footer's.

The app footer's "Created by antwika" credits the software's maker and
isn't a setting.

## VITE_POD_PROVIDERS

The Pod providers the site suggests
([onboarding.md](onboarding.md#pod-providers)): all on the
landing page, for logging in without typing a WebID, and those with a
`signUpUrl` under it, to create a Pod. A JSON array on one line:

```sh
VITE_POD_PROVIDERS='[{"id":"school","name":"Example School Pods","oidcIssuer":"https://pods.school.example/","signUpUrl":"https://school.example/pods"}]'
```

| Key | Required | What |
|---|---|---|
| `id` | yes | Unique in the list. |
| `name` | yes | What the button and the list say. |
| `oidcIssuer` | yes | The provider's Solid-OIDC issuer, an https URL, exactly as its `/.well-known/openid-configuration` gives it. |
| `signUpUrl` | no | An https page where a new user creates a Pod. |

The list needs at least one provider. Any other key, such as a
misspelled `signupUrl`, fails the build. A WebID login works at any
provider, listed or not, that names itself in its answer's `iss`
parameter ([authentication.md](authentication.md#the-issuer-on-the-providers-answer)).

## VITE_LIBRARY_INDEX_URL

The deck library's index, an http(s) URL. Unset, the app lists the
library published with the site, from `decks/`
([deck-library.md](deck-library.md#reading-it)). The browser reads the
index and its decks with a plain `fetch`, so their host must allow it
(`Access-Control-Allow-Origin`).

```sh
VITE_LIBRARY_INDEX_URL=https://example.org/decks/index.ttl
```

## DOCS_DIAGRAMS

The build draws the docs' Mermaid diagrams in Chromium
([markdown.md](markdown.md#diagrams)), which `npm run browsers` installs
once; without it, `npm run build`, `npm start` and the deploy fail,
naming that command. On a machine where Chromium can't be installed,
set `DOCS_DIAGRAMS=skip` in the build's environment:

```sh
DOCS_DIAGRAMS=skip npm start
```

The build then warns and starts no browser, even with Chromium
installed; each diagram shows its source and says it wasn't drawn.
`skip` is the only value; any other fails the build. It works in CI
and on a hosting service, but this repository's deploy refuses a build
without the drawings
([deployment.md](deployment.md#github-pages-automatic)).

With it, `npm run check` fails: its real-browser drawing test is
skipped and the coverage falls short. Vite's `.env` files don't set
it: Vite reads only `VITE_` variables from them.
[apps/web/turbo.json](../apps/web/turbo.json) lists it under `env`, so
a build without diagrams is never reused as one with them.
`npm run dev` needs no setting: without Chromium, its docs pages show
the source and the server says why, once.

## What a build computes

The build works these values out
([siteBuild.ts](../packages/site/src/siteBuild.ts)): the version goes in
the page's HTML, the others in its script as constants.

| Value | From | Shown or used |
|---|---|---|
| the version, `<meta name="version">` in `index.html` | the `version` in the root [package.json](../package.json) | The footer's version, and the one an error report names. It's in the page, not the content-hashed script, so the deploy gives the site CI tested the version released without touching the script (`npm run site:version`, [deployment.md](deployment.md#the-build-ci-tested)). |
| `__COMMIT_SHA__` | `git rev-parse HEAD`, else `GITHUB_SHA`, else none | The footer's commit link, left out when unknown. The docs' links into the repository name the same commit, or `main` when it's unknown. |
| `__SHAPES_RULESET__` | a hash of `ns/shapes/` and the vendored profiles | Which rules a pod's check receipts were made under ([validation.md](validation.md)). |
| `__CLIENT_ID__` | the domain in [CNAME](../CNAME): `https://<domain>/clientid.jsonld`, else none | On that domain, the client ID the page logs in with: the address of the Client ID Document the build writes there ([authentication.md](authentication.md#the-client-id-document)). |

## What cannot be configured

The addresses and names that are part of the data: the vocabulary,
shape and deck IRIs under `https://solid-memo.com/`, the folder an
instance gets in a pod, and the keys the browser keeps things under.
Changing them cuts a build off from every other build's data;
[reuse.md](reuse.md#what-stays-the-same) lists them.
