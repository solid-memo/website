# Configuration

A build of the site reads a few settings from `VITE_` variables. Every
one is optional: unset or blank, it is this deployment's own value. To
run a copy of your own, see [reuse.md](reuse.md). One more variable,
`DOCS_DIAGRAMS`, lets a build on a machine without Chromium go ahead
without the docs' diagrams.

| Variable | Default | What it sets |
|---|---|---|
| [`VITE_APP_NAME`](#vite_app_name) | `Solid Memo` | What the site calls itself. |
| [`VITE_REPO_URL`](#vite_repo_url) | `https://github.com/solid-memo/website` | The repository the footer, the page and the docs link to. |
| [`VITE_POD_PROVIDERS`](#vite_pod_providers) | the list in [podProvider.ts](../packages/domain/src/podProvider.ts) | The Pod providers suggested at login and for creating a Pod. |
| [`VITE_LIBRARY_INDEX_URL`](#vite_library_index_url) | the site's own `decks/index.ttl` | The deck library the app lists. |
| [`DOCS_DIAGRAMS`](#docs_diagrams) | unset: every diagram drawn | `skip`: the docs built without their diagrams. |

[apps/web/.env.example](../apps/web/.env.example) lists the `VITE_`
ones, with an example of each.

## How a build reads them

Vite reads the variables when the site is built and writes their values
into the page, so a change needs a new build. There is no setting a
host can change on a built site.

[src/config.ts](../apps/web/src/config.ts) reads and checks every
setting, and [src/main.tsx](../apps/web/src/main.tsx) passes them on to
the page. No package reads the environment itself
([boundaries.md](boundaries.md)): the page hands `AppShell` its name,
its providers and its `source`, the footer's links. A value that cannot
be used fails the build, naming the variable, because
[vite.config.ts](../apps/web/vite.config.ts) checks the settings as the
build starts:

```text
Error: VITE_REPO_URL must be an http(s) URL; it is "nope" (docs/configuration.md).
```

## Setting them

In the environment of the build, for one run:

```sh
VITE_APP_NAME="Example School Cards" npm run build
```

In a file in `apps/web/`, which Vite reads in `npm run dev` and
`npm run build`
([Vite's env files](https://vite.dev/guide/env-and-mode#env-files)):

- `.env`, committed: a fork's own values, for every build;
- `.env.local`, ignored by git: values for your machine only.

A variable in the environment wins over the same one in a file. Copy
[.env.example](../apps/web/.env.example) to start; its lines are
commented out, so the copy changes nothing until you uncomment one.

In CI, set them on every step that builds the site. The site deployed
after a release is the one CI built and tested, in the `site` job of
[ci.yml](../.github/workflows/ci.yml)
([deployment.md](deployment.md#the-build-ci-tested)); the deploy
workflow ([deploy.yml](../.github/workflows/deploy.yml)) builds only
when it is run by hand. Neither sets any; a fork that deploys with them
can add its repository's variables to both builds, so they agree (a
variable the repository does not have is blank, so the default):

```yaml
- run: npm run build
  env:
    VITE_APP_NAME: ${{ vars.VITE_APP_NAME }}
    VITE_REPO_URL: ${{ vars.VITE_REPO_URL }}
```

Turbo caches the build. [apps/web/turbo.json](../apps/web/turbo.json)
lists `VITE_*` under `env` and the `.env*` files under `inputs`, so a
new value builds anew instead of reusing the last build.

## VITE_APP_NAME

What the site calls itself. Any text on one line; it is trimmed.

```sh
VITE_APP_NAME=Example School Cards
```

The name is shown where it stands alone:

- the landing page's heading and the masthead's wordmark;
- the end of every browser tab's title (`Log in – Example School Cards`);
- the link to the learner's app on the Studio's empty deck list;
- the name the identity provider shows when the user logs in (the
  client name, [authentication.md](authentication.md));
- the page's `<title>`, `og:site_name`, `og:title` and JSON-LD `name` in
  [index.html](../apps/web/index.html), which vite.config.ts fills in.

In the app, it takes the place of the message `app.documentTitle` in
every language (`createI18n` in
[i18n.tsx](../packages/ui/src/ui/i18n.tsx)). It is not translated.

The name does not reach:

- the sentences that mention Solid Memo, about 75 in each language
  ("Solid Memo copies your study into your Pod…"). Putting a name into
  a sentence takes each language's grammar: a Korean particle, for one,
  changes with the name's last sound (`Solid Memo로`, but `…으로` after
  a consonant). These sentences name the software, which stays Solid
  Memo;
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

A fork that renames the app further edits the message files
([i18n.md](i18n.md)) and these files itself.

## VITE_REPO_URL

The repository the footer, the page and the docs link to. An http(s) URL,
without a user name or password; a trailing slash is dropped.

```sh
VITE_REPO_URL=https://codeberg.org/example/memo
```

The footer links:

| Link | Address |
|---|---|
| Docs | `docs/`, these docs on the same site; it does not follow this setting |
| Source code | `<url>` |
| The build's commit, beside the version | `<url>/commit/<sha>` |
| Changelog | `<url>/blob/main/CHANGELOG.md` |
| Report an issue | `<url>/issues/new/choose` |
| Discussions | `<url>/discussions` |

The same address is where a mistake in a library deck is reported:
**Report a mistake** opens `<url>/issues/new?template=deck.yml`, the
repository's deck form, with the deck and the card filled in
([deck-library.md](deck-library.md#reporting-a-mistake)). The form and
its filled-in fields are GitHub's: on another forge the link opens a
new issue without them.

These are GitHub's paths, which Gitea and Forgejo (Codeberg) share.
On GitLab, whose paths start with `/-/`, the commit, changelog and
issue links do not resolve. Discussions is GitHub's alone: on a
GitHub repository without Discussions turned on, and on other forges,
that link leads to a 404.

The page links to the repository too, as vite.config.ts fills in
[index.html](../apps/web/index.html): the JSON-LD's `sameAs` and
`codeRepository`, and the "source code" link shown to a browser that
runs no script. The about page's links to the repository do not follow
it ([reuse.md](reuse.md#6-what-you-edit-by-hand)).

The docs at `/docs/` ([deployment.md](deployment.md#what-the-artifact-contains))
link to it too: a link to a file or folder outside `docs/` leads to
`<url>/blob/<sha>/<path>` or `<url>/tree/<sha>/<path>` at the commit
built, and each page's footer links its source there, the issues and
the commit. When the build does not know its commit (no git checkout
and no `GITHUB_SHA`), they name `main` instead, and the build warns. On
GitLab, these links, some six hundred in the docs' text and those in
each footer, do not resolve either.

The docs' list of versions, as the deploy writes it, links each
version's docs at `<url>/tree/vX.Y.Z/docs` and its notes at
`<url>/releases/tag/vX.Y.Z`. A fork has the upstream project's tags,
but its own releases carry no archive of their docs, so the list links
those versions in the repository only
([deployment.md](deployment.md#each-releases-docs)).

The app footer's "Created by antwika" is not a setting: it credits who
made the software, wherever it runs.

## VITE_POD_PROVIDERS

The Pod providers the site suggests ([onboarding.md](onboarding.md#pod-providers)):
every one on the login step, for logging in without typing a WebID, and
those with a `signUpUrl` on the first step, for creating a Pod. A JSON
array on one line:

```sh
VITE_POD_PROVIDERS='[{"id":"school","name":"Example School Pods","oidcIssuer":"https://pods.school.example/","signUpUrl":"https://school.example/pods"}]'
```

| Key | Required | What |
|---|---|---|
| `id` | yes | Unique in the list. |
| `name` | yes | What the button and the list say. |
| `oidcIssuer` | yes | The provider's Solid-OIDC issuer, an https URL, exactly as its `/.well-known/openid-configuration` gives it. |
| `signUpUrl` | no | An https page where a new user creates a Pod. |

The list needs at least one provider. Any other key is refused, so a
misspelled one (`signupUrl`) fails the build instead of being dropped.
A user can always log in with a WebID at any provider, listed or not.

## VITE_LIBRARY_INDEX_URL

The deck library's index, an http(s) URL. Unset, the app lists the
library published with the site, from `decks/`
([deck-library.md](deck-library.md#reading-it)). The browser reads the
index and its decks with a plain `fetch`, so the host that serves them
must allow it (`Access-Control-Allow-Origin`).

```sh
VITE_LIBRARY_INDEX_URL=https://example.org/decks/index.ttl
```

## DOCS_DIAGRAMS

The build draws the docs' Mermaid diagrams in Chromium
([markdown.md](markdown.md#diagrams)), which `npm run browsers` installs
once. Without it, `npm run build`, `npm start` and the deploy fail,
naming that command. On a machine where it cannot be installed, set
`DOCS_DIAGRAMS=skip` in the environment of the build:

```sh
DOCS_DIAGRAMS=skip npm start
```

The build then warns, starts no browser, and each diagram's page shows
its source and says it was not drawn, even where Chromium is installed.
`skip` is the only value; any other fails the build. It works in CI
too, such as a host that builds the site for you; this repository's
deploy refuses a build without the drawings
([deployment.md](deployment.md#github-pages-automatic)). It does not make `npm run check`
pass: its test that draws in the real browser is skipped, and the
coverage falls short.
Vite's `.env` files do not reach it, being read for `VITE_` variables
only. Turbo lists it under `env` in
[apps/web/turbo.json](../apps/web/turbo.json), so a build without
diagrams is never reused as one with them. `npm run dev` needs no
setting: without Chromium, its docs pages show the source, and the
server says why, once.

## What a build computes

These are not settings: the build works them out
([siteBuild.ts](../packages/site/src/siteBuild.ts)) and passes
them to the page, the version in its HTML and the others as constants
in its script.

| Value | From | Shown or used |
|---|---|---|
| the version, `<meta name="version">` in `index.html` | the `version` in the root [package.json](../package.json) | The footer's version, and the one an error report names. It is in the page, not the script, whose file is named by a hash of its content, so a built site can be given another version without touching its script: the deploy gives the site CI tested the version released (`npm run site:version`, [deployment.md](deployment.md#the-build-ci-tested)). |
| `__COMMIT_SHA__` | `git rev-parse HEAD`, else `GITHUB_SHA`, else none | The footer's commit link; left out when unknown. The docs' links into the repository name the same commit, or `main` when it is unknown. |
| `__SHAPES_RULESET__` | a hash of `ns/shapes/` and the vendored profiles | Which rules a pod's check receipts were made under ([validation.md](validation.md)). |

## What cannot be configured

The addresses and names that are part of the data: the vocabulary,
shape and deck IRIs under `https://solid-memo.com/`, the folder an
instance gets in a pod, and the keys the browser keeps things under.
Changing them would cut a build off from the data every other build
reads and writes. [reuse.md](reuse.md#what-stays-the-same) lists them.
