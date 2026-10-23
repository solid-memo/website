# Privacy

What Solid Memo does with personal data: where what you study is
stored, what stays in your browser, what the site's host and other
servers see, and what the project itself has published.

In short: Solid Memo has no server of its own and no accounts. What
you study is stored in your own pod, or, before you log in, in your
browser. The app has no analytics, sets no cookies and does not track
you.

## In your pod

When you are logged in, everything Solid Memo knows about your study is
in your [pod](glossary.md#solid-and-the-web), in an instance folder
(`solid-memo/<name>/` by default): your decks and cards, the review
state of each card, the log of your answers, your preferences, your
drafts and a digest that makes the next visit faster.
[data-model.md](data-model.md) lists every document. Solid Memo reads
and writes them from your browser, straight to your pod's server. It
keeps no copy anywhere else.

Drawing an instance as a graph in the [Studio](studio.md) reads those
documents, and your WebID profile to find your storages, as logging in
does, so that it can tell which addresses are in your pod
([`instanceGraph.ts`](../packages/application/src/instanceGraph.ts)).
The addresses the documents name, such as your WebID, a library release
or a card's picture, are drawn as they are and never fetched, whether
they are in your pod or not.

Your pod's server decides who else may read them. Solid Memo registers
the review states, the answers and the drafts only in your **private**
type index, since they say what you studied and how well
([data-model.md](data-model.md#discovery-chain)). The one thing it
makes public is a release you publish from the
[Studio](studio.md): it is meant to be read by others, and it carries
the authors' names, and their email addresses when you give them.

Each answer in the log says which card you answered, when, and how
well. Since vocabulary 1.19 it also says how long you took to recall
the answer and, in study, to grade it (not counting the time the app
was hidden, nor a wait of more than ten minutes), the day the card was
due, and your device's offset from UTC when you answered, which hints
at the time zone you were in ([data-model.md](data-model.md#the-answer-log),
[statistics.md](statistics.md#response-times)). The app records them
with every answer, in study and in a course, with no setting to turn
it off. They say how fast you remember and at what hour you study, so
they are as personal as the rest of the log, and stay in the same
private documents.

The digest keeps a summary of each past month of the log, so the strip
above the deck list need not read the months again
([data-model.md](data-model.md#the-digest)): each study day's numbers
of answers, new cards, reviews and lapses, how many reviews of young
cards were remembered, and how many answers took each second. It says
when and how much you studied, as the log does, and stays in your pod
beside it, in the instance's `digest.ttl`.

## In the browser

Before you log in, you study as a guest, in a pod kept in the browser's
IndexedDB (database `solid-memo-guest-pod`,
[`indexedDbResourceStore.ts`](../packages/browser/src/indexedDbResourceStore.ts),
[guest-mode.md](guest-mode.md)). It stays on that device until you move
it into your own pod, or clear the site's data.

The app also keeps a few choices on the device, in `localStorage`, so
they hold before any pod is reached and stay out of your pod:

| Key | What | Written by |
|---|---|---|
| `solid-memo:language` | the language you chose | [`localStorageLanguagePreference.ts`](../packages/browser/src/localStorageLanguagePreference.ts) |
| `solid-memo:theme` | light, dark or the browser's, a copy of your preferences' once they are saved | [`localStorageThemePreference.ts`](../packages/browser/src/localStorageThemePreference.ts) |
| `solid-memo:palette` | the colors you chose (none for Standard), a copy of your preferences' too | [`localStoragePalettePreference.ts`](../packages/browser/src/localStoragePalettePreference.ts) |
| `solid-memo:palette-colors` | the colors of a palette of your own you chose, its name among them, for the first paint, a copy of your Pod's (none for a built-in palette) | [`localStorageCustomPalettePreference.ts`](../packages/browser/src/localStorageCustomPalettePreference.ts) |
| `solid-memo:textSize` | the text size you chose (none for Default), a copy of your preferences' too | [`localStorageTextSizePreference.ts`](../packages/browser/src/localStorageTextSizePreference.ts) |
| `solid-memo:recentLanguages.deck`, `solid-memo:recentLanguages.own` | languages you picked lately for text | [`remembered.ts`](../packages/ui/src/ui/remembered.ts) |
| `solid-memo:collapsedGroups.<instance URL>` | which deck groups you folded | [`remembered.ts`](../packages/ui/src/ui/remembered.ts) |
| `solid-memo:update:<…>` | a guest's study being moved or added, so another tab knows | [`localStorageUpdateJournal.ts`](../packages/browser/src/localStorageUpdateJournal.ts) |
| `solid-memo:studioLayout.v1`, `solid-memo:studioRecent.v1`, `solid-memo:studioInstances.v1` | the Studio's layout; the commands you used last in its palette; and, by instance URL, your saved views, your pins and the decks and drafts you opened last | [`prefs.ts`](../apps/studio/src/ui/shell/prefs.ts) |

During a login, `sessionStorage` holds the page you were on
(`solid-memo:login-hash`), to bring you back to it
([`solidSessionGateway.ts`](../packages/solid/src/solidSessionGateway.ts)).
The authentication library (`@inrupt/solid-client-authn-browser`) keeps
what it needs to restore your session, such as your identity provider
and the app's registration with it, in the browser's storage.

None of this leaves the device. Clearing the site's data removes it
all, the guest's pod included.

## What the site's host sees

The site is static files on GitHub Pages ([deployment.md](deployment.md)).
Loading a page sends GitHub the usual request: your IP address, your
browser's user agent and the address asked for, under
[GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
The deck library is served from the same site, so GitHub also sees
which deck versions the app fetches. GitHub never sees your pod's data:
the app speaks to your pod directly.

A copy of Solid Memo run by someone else is served by their host, and
may read its deck library from another address
(`VITE_LIBRARY_INDEX_URL`, [deck-library.md](deck-library.md#reading-it)).

## Other servers your browser contacts

The app contacts these from your browser, each when it is needed:

- **Your WebID's server**, to read your profile when you log in
  ([authentication.md](authentication.md)).
- **Your identity provider**, which handles the login itself. It sees
  that you logged in to Solid Memo. A provider you pick from the
  suggestions ([onboarding.md](onboarding.md)) is one of the providers
  in [`podProvider.ts`](../packages/domain/src/podProvider.ts); none of
  them is run by the project.
- **Your pod's server**, for everything you study.
- **The servers of pictures on cards.** A card's picture is loaded
  from where it is: for the library's decks, image hosts such as
  `flagcdn.com`, `upload.wikimedia.org`, `thumb.wikimedia.org` and
  `iiif.micr.io`; for your own cards, wherever their pictures are.
  Each sees a request from your browser.
- **The address of a deck or release you add by link**
  ([deck-library.md](deck-library.md#from-a-link)).

Links you follow, such as a deck's sources, take you to those sites as
any link does.

## No analytics, no cookies, no tracking

The app runs no analytics or tracking script, and sets no cookies of
its own. Its Content Security Policy lets the page run scripts from
the site alone, and one inline script it names by its hash ([`apps/web/index.html`](../apps/web/index.html), checked
by [`build.test.ts`](../apps/web/src/build.test.ts)). The project
learns nothing about who uses the app.

## When something goes wrong

When a screen fails while it renders, the app shows "Something went
wrong" in its place, under the same header and above the same footer,
and an error nothing else caught (in a button's handler, say) gets a
notice that can be closed ([`ErrorGuard.tsx`](../packages/ui/src/ui/ErrorGuard.tsx)).
Neither sends anything: the error stays in your browser, logged to its
console. It leaves the browser only if you take it out yourself:

- **Copy details** copies the app's version and commit, the route
  you were at without its values (`#/study?instance=&deck=`), and the
  error's message and stack.
- **Report it** opens the project's bug form on GitHub with the same
  details filled in. Nothing is sent until you submit the form there.

Every address is taken out of the details first, so they name no pod,
WebID, deck or card, and carry no token
([`errorReport.ts`](../packages/domain/src/errorReport.ts)). Only the
paths of the site's own scripts are kept, which say where the code
broke. An error's message can still quote other text, such as a card's;
the details are shown under "Technical details" to read before you
send them.

## What the project has published

The library's deck versions name who compiled them. The first 205
published versions name the maintainer, Anton Wiklund, as their
creator, with his email address as `foaf:mbox`. A published version is
never edited ([deck-library.md](deck-library.md#a-version)), so those
versions keep it. Every version since names a project contact instead:
a `dcat:contactPoint` that points at the
[issue tracker](https://github.com/solid-memo/website/issues), with no
personal email address ([deck-library.md](deck-library.md#contact)).
The library's index gives no email address.

The maintainer's email address is also published, on purpose, in
[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md#enforcement), as the private
contact for code of conduct reports. Mail to that address about
anything else, such as a deck published with it, is answered with a
pointer to the public channels
([GOVERNANCE.md](../GOVERNANCE.md#where-the-project-talks)).
