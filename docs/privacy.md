# Privacy

What Solid Memo does with personal data. It has no server of its own
and no accounts: a learner's study is in their own pod or, before they
log in, in the browser. The app has no analytics, sets no cookies and
doesn't track anyone.

## In your pod

Once the learner logs in, all their study is in their
[pod](glossary.md#solid-and-the-web), in an instance folder
(`solid-memo/<name>/` by default). It holds decks and cards, each
card's review state, the answer log, preferences, drafts, and a digest
that speeds up the next visit ([data-model.md](data-model.md) lists
every document). The app reads and writes them from the browser,
straight to the pod's server, and keeps no other copy.

The [Studio](studio.md)'s graph of an instance reads those documents
and, as logging in does, the WebID profile, whose storages tell which
addresses are in the pod
([`instanceGraph.ts`](../packages/application/src/instanceGraph.ts)).
It draws addresses the documents name, such as the WebID, a library
release or a card's picture, as they are, and never fetches them, in
the pod or not.

The pod's server decides who else may read them. Solid Memo registers
the review states, the answers and the drafts only in the learner's
**private** type index
([data-model.md](data-model.md#discovery-chain)). Only a release the
learner publishes from the Studio is public; it carries the authors'
names, and their email addresses when given.

Each answer in the log records the card, when, and how well. Since
vocabulary 1.19, it records too how long the learner took to recall
the answer and, in study, to grade it, leaving out time the app was
hidden and any wait over ten minutes. It records the day the card was
due and the device's offset from UTC at answer time, which hints at
the learner's time zone then
([data-model.md](data-model.md#the-answer-log),
[statistics.md](statistics.md#response-times)). These go with every
answer, in study and in a course, and no setting turns them off. They
stay in the log's private documents.

The digest keeps a summary of each past month of the log, so the strip
above the deck list needn't reread them
([data-model.md](data-model.md#the-digest)). For each study day, it
counts answers, new cards, reviews, lapses, remembered reviews of
young cards, and how many answers took each second. It's the
instance's `digest.ttl`, beside the log.

## In the browser

Before logging in, the learner studies as a guest, in a pod kept in the
browser's IndexedDB (database `solid-memo-guest-pod`,
[`indexedDbResourceStore.ts`](../packages/browser/src/indexedDbResourceStore.ts),
[guest-mode.md](guest-mode.md)). It stays on that device until the
learner moves it into their own pod.

A few choices stay in `localStorage`, out of the pod and in force
before any pod is reached:

| Key | What | Written by |
|---|---|---|
| `solid-memo:language` | the chosen language | [`localStorageLanguagePreference.ts`](../packages/browser/src/localStorageLanguagePreference.ts) |
| `solid-memo:theme` | light, dark or the browser's; copied from the preferences once saved | [`localStorageThemePreference.ts`](../packages/browser/src/localStorageThemePreference.ts) |
| `solid-memo:palette` | the chosen colors (none for Standard); copied from the preferences | [`localStoragePalettePreference.ts`](../packages/browser/src/localStoragePalettePreference.ts) |
| `solid-memo:palette-colors` | a chosen custom palette's colors and name, for the first paint; copied from the pod (none for a built-in palette) | [`localStorageCustomPalettePreference.ts`](../packages/browser/src/localStorageCustomPalettePreference.ts) |
| `solid-memo:textSize` | the chosen text size (none for Default); copied from the preferences | [`localStorageTextSizePreference.ts`](../packages/browser/src/localStorageTextSizePreference.ts) |
| `solid-memo:seenHighlights` | the new-version highlights this browser has shown | [`localStorageSeenHighlights.ts`](../packages/browser/src/localStorageSeenHighlights.ts) |
| `solid-memo:recentLanguages.deck`, `solid-memo:recentLanguages.own` | languages picked lately for text | [`remembered.ts`](../packages/ui/src/ui/remembered.ts) |
| `solid-memo:collapsedGroups.<instance URL>` | which deck groups the learner folded | `remembered.ts` |
| `solid-memo:update:<…>` | a guest's study being moved or added, so another tab knows | [`localStorageUpdateJournal.ts`](../packages/browser/src/localStorageUpdateJournal.ts) |
| `solid-memo:studioLayout.v1`, `solid-memo:studioRecent.v1`, `solid-memo:studioInstances.v1` | the Studio's layout; its palette's last commands; and, by instance URL, saved views, pins and the decks and drafts opened last | [`prefs.ts`](../apps/studio/src/ui/shell/prefs.ts) |

During a login, `sessionStorage` holds the page the learner was on
(`solid-memo:login-hash`), to bring them back to it
([`solidSessionGateway.ts`](../packages/solid/src/solidSessionGateway.ts)).
While a login or a session restore is under way, it also holds the
sign-in client's mark that this tab may have sent the learner to the
identity provider (`solid-memo:provider-redirect`). The mark stays
until the next restore in that tab ends, or the tab closes.
The authentication library under the sign-in client
([`client/session.ts`](../packages/solid/src/client/session.ts),
`@inrupt/solid-client-authn-browser`) stores in the browser what it needs to restore the session, such as
the identity provider and the app's registration with it.
A build with the other sign-in client, `solid-memo-client`, keeps it in
IndexedDB instead (database `solid-memo-oidc`): the identity provider,
the app's registration, the WebID, the refresh token and a key pair
whose private key can't leave the browser. During a login,
`sessionStorage` holds the request under way (`solid-memo:oidc-login`).
Its access tokens stay in memory
([solid-memo-client.md](solid-memo-client.md#what-a-session-keeps)).

None of this leaves the device. Clearing the site's data removes it
all, the guest's pod included.

## What the site's host sees

The site is static files on GitHub Pages ([deployment.md](deployment.md)).
Loading a page sends GitHub the learner's IP address, the browser's
user agent and the address asked for, under
[GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
The deck library comes from the same site, so GitHub sees which deck
versions the app fetches. GitHub never sees pod data.

Someone else's copy of Solid Memo is served by their host and may
read its deck library from elsewhere
(`VITE_LIBRARY_INDEX_URL`, [deck-library.md](deck-library.md#reading-it)).

## Other servers your browser contacts

The browser contacts these, each when it's needed:

- **The WebID's server**, to read the learner's profile at login
  ([authentication.md](authentication.md)).
- **The identity provider**, which handles the login and sees that the
  learner logged in to Solid Memo. The provider, not the browser,
  may fetch Solid Memo's Client ID Document from the site to learn
  who the app is
  ([authentication.md](authentication.md#the-client-id-document)). A
  provider picked from the suggestions ([onboarding.md](onboarding.md))
  is one in [`podProvider.ts`](../packages/domain/src/podProvider.ts);
  the project runs none of them.
- **The pod's server**, for everything the learner studies.
- **The server of a deck's document outside the learner's pod**, when
  their study's catalog names one there. It's asked as no one, and the
  app saves nothing to it
  ([boundaries.md](boundaries.md#the-credential-gate)).
- **The servers of pictures on cards**, each seeing a request from the
  browser: for the library's decks, image hosts such as `flagcdn.com`,
  `upload.wikimedia.org`, `thumb.wikimedia.org` and `iiif.micr.io`; for
  the learner's own cards, wherever their pictures are.
- **The address of a deck or release added by link**
  ([deck-library.md](deck-library.md#from-a-link)).
- **The server of a release a Studio draft follows**, or whose next
  version the Studio starts, once a page load. It's asked as no one,
  unless it's the learner's own pod. Starting a next version also asks,
  as no one, the servers of the documents the release names its series
  and publisher in ([studio.md](studio.md#drafts)).

Links the learner follows, such as a deck's sources, lead to those
sites as any link does.

## No analytics, no cookies, no tracking

The app runs no analytics or tracking script and sets no cookies
of its own. Its Content Security Policy allows scripts from the site
alone, plus one inline script named by its hash
([`apps/web/index.html`](../apps/web/index.html), checked by
[`build.test.ts`](../apps/web/src/build.test.ts)). The project learns
nothing about who uses the app.

## When something goes wrong

When a screen fails to render, the app shows "Something went wrong" in
its place, between the same header and footer. An error nothing else
caught (in a button's handler, say) gets a closable notice
([`ErrorGuard.tsx`](../packages/ui/src/ui/ErrorGuard.tsx)). Neither
sends anything: the error goes to the browser's console and leaves
only if the learner takes it out:

- **Copy details** copies the app's version and commit, the route the
  learner was at without its values (`#/study?instance=&deck=`), and
  the error's message and stack.
- **Report it** opens the project's bug form on GitHub with only the
  app's version and that route filled in. The details stay out of the
  link, since a link's query reaches GitHub as soon as it opens: the
  learner pastes them from Copy details into the form, and they are
  sent only when the learner submits it.

The app first strips every address from the details, except the
paths of the site's own scripts, which show where the code broke
([`errorReport.ts`](../packages/domain/src/errorReport.ts)). It strips
web addresses, such as a pod's, a WebID's, a deck's or a card's, with
any token in their query. It strips email addresses, including ones
in other scripts, and `blob:`, `data:`, `mailto:`, `tel:` and `urn:`
values. An error's message can still quote other text, such as a
card's or a host name written without its `https://`. The details
appear under "Technical details" for the learner to read before
sending.

## What the project has published

Each library deck version names who compiled it. The first 205 name
the maintainer, Anton Wiklund, as creator, with his email address as
`foaf:mbox`, and keep it: a published version is never edited
([deck-library.md](deck-library.md#a-version)). Later versions name a
project contact instead: a `dcat:contactPoint` pointing at the
[issue tracker](https://github.com/solid-memo/website/issues), with no
personal email address ([deck-library.md](deck-library.md#contact)).
The library's index gives no email address.

The maintainer's email address is published on purpose in
[CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md#enforcement), as the private
contact for code of conduct reports. Mail to it about anything else,
such as a deck published with it, gets a pointer to the public
channels ([GOVERNANCE.md](../GOVERNANCE.md#where-the-project-talks)).
