# Studio

Solid Memo Studio is a second app beside Solid Memo, at
`https://solid-memo.com/studio/`. It is where users manage their decks.
Later it is also where creators build decks and courses and publish
them. For now it shows the decks of an instance, read-only.

## What it shares with Solid Memo

The Studio is its own package, `@solid-memo/studio` in
[`apps/studio/`](../apps/studio/). It sits on the same layers as
Solid Memo's app ([boundaries.md](boundaries.md)):

- Its [`src/main.tsx`](../apps/studio/src/main.tsx) calls
  `createAppUseCases` from `@solid-memo/composition`, as the name
  "Solid Memo Studio", and renders `StudioApp`.
- `StudioApp` is `AppShell` from `@solid-memo/ui` (the same as Solid
  Memo's `App`): the session restore, the landing page and its login,
  the connected Pod, the masthead, the language, the theme and the
  footer. Only the name and the tagline differ.
- Its screens are in [`apps/studio/src/ui/`](../apps/studio/src/ui/),
  containers over use cases and screens over props, as in `ui`. They
  reuse `ui`'s components, such as `InstancePickerContainer`,
  `Breadcrumbs` and `ReaderText`.
- Its text is in `ui`'s message files, under `studio.*`, in English and
  Swedish ([i18n.md](i18n.md)).

Both apps are served from one origin. So they share the browser's
storage: the guest's pod, and the language and theme chosen on this
device. They also share the login library's session, but a session
restores only in the app it was logged in from
([authentication.md](authentication.md#two-apps-on-one-origin)). Moving
between the apps therefore takes a login in the other app, which the
identity provider usually answers without a password.

## Routes

The Studio has its own hash router
([`src/ui/router.ts`](../apps/studio/src/ui/router.ts)). It keeps the
hash with the same core as Solid Memo's router (`routerCore.ts` in
`ui`, [routing.md](routing.md)).

| Hash | Screen |
| --- | --- |
| `#/instances` | the instance picker. A new instance is made in Solid Memo, so its link goes to Solid Memo's storage picker. |
| `#/?instance=…` | Home: every deck of the instance as a table, with its number of cards (retired ones aside) and how many are due today. |

Anything else, `#/` among them, is the default route: the only
instance's Home, or else the picker. An unknown instance falls back to
the picker. Like Solid Memo's fallbacks, these replace the history
entry.

The trail is Instances › Decks. The document title is the trail's last
step and "Solid Memo Studio". After a move, the screen's heading takes
the focus (`useScreenFocus`). The header has a link back to Solid Memo
(`../#/`), at the open instance's decks when there is one. The landing
page and the Pod connection screen have it too (`headerLink` in the
Studio's `AppIdentity`), so a visitor who is not signed in can go back.

## How it is built and served

- The Studio builds with `base: "./"` into `apps/studio/dist/`
  ([vite.config.ts](../apps/studio/vite.config.ts)). Its page has the
  same Content Security Policy as Solid Memo's, and its own build test
  ([build.test.ts](../apps/studio/src/build.test.ts)) checks it and the
  bundle as Solid Memo's does ([markdown.md](markdown.md#safety)).
- Solid Memo's build depends on the Studio's
  ([apps/web/turbo.json](../apps/web/turbo.json)), so `npm run build`
  builds the Studio first. Solid Memo's Vite build then copies
  `apps/studio/dist/` into `apps/web/dist/studio/` (`builtAppPlugin` in
  [publishApp.ts](../packages/vocab/tooling/publishApp.ts)). One artifact
  serves both apps ([deployment.md](deployment.md)).
- So build the site through turbo: `npm run build`, or
  `npx turbo run build --filter=@solid-memo/web`. `vite build` in
  `apps/web` (or `npm run build -w @solid-memo/web`) skips the Studio's
  build and copies whatever build is in `apps/studio/dist/`, perhaps an
  old one. With none there, it warns and publishes no Studio.
- The Studio reads the site's documents (the shapes, the vocabulary and
  the deck library) from the folder above it, where the site serves
  them.
- Both apps get the same build values (the commit and the shapes'
  ruleset) from `siteDefines` in
  [siteBuild.ts](../packages/vocab/tooling/siteBuild.ts).

`npm run dev:studio` serves the Studio from source on a port of its
own, with the site's documents beside it. Its link back to Solid Memo
opens the Studio again there; `npm start` serves both apps together.
