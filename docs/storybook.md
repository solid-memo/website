# Storybook

The UI's components (`packages/ui`) each have stories: the component
drawn in one state, with made-up data, in a
[Storybook](https://storybook.js.org/). A contributor or a reviewer sees
a component in every state, language, palette and theme without a pod
and without going through the app to reach that state. The stories run
as tests in `npm run check`.

## Running it

```sh
npm run storybook         # the Storybook at http://localhost:6006/, redrawn as files change
npm run storybook:build   # the static Storybook, built to packages/ui/dist/
```

The Storybook builds with the Preact renderer on Vite
(`@storybook/preact-vite`), from
[packages/ui/.storybook/](../packages/ui/.storybook/). It sends nothing
anywhere: telemetry, crash reports and the check for news are off, so a
build or a visit fetches only the Storybook's own files.

## The toolbar

Every story is drawn in a frame, `StoryFrame` in
[storybook.tsx](../packages/ui/src/test/storybook.tsx), the way the app
draws its screens. The frame has a query client of its own that retries
nothing and the messages of the chosen language. It sets the theme,
palette and text size on the page's root as the app sets them. The
toolbar chooses:

| Menu | Choices | What it sets |
|---|---|---|
| Language | the app's languages (`LOCALES`) | the `I18nProvider`'s locale and the root's `lang` ([i18n.md](i18n.md)) |
| Palette | the built-in palettes (`PALETTES`) | the root's `data-palette` ([theme.md](theme.md)) |
| Theme | light, dark | the root's `data-theme` and the `ThemeProvider` |
| Text size | the text sizes (`TEXT_SIZES`) | the root's `data-text-size` |
| Direction | left to right, right to left | the `dir` of the story's box, as card text in Arabic runs |

A story starts in English, the standard palette, light, the default
text size and left to right. The frame's language is fetched before the
story is drawn, as the app fetches its own before the first render.

## Writing a story

A component's stories sit beside it, in `<Component>.stories.tsx`, one
file per component's file, in Storybook's Component Story Format.
[Pager.stories.tsx](../packages/ui/src/ui/Pager.stories.tsx) and
[DeckListContainer.stories.tsx](../packages/ui/src/ui/DeckListContainer.stories.tsx)
are short examples.

- **The title** is `<Area>/<Component>`: `Basics`, `Decks`, `Cards`,
  `Study`, `Courses`, `Library`, `Statistics`, `Preferences`,
  `Instances`, `App` or `Onboarding`.
- **The states** are those a reviewer asks about: the usual one, empty,
  loading, failed, long text that wraps, card text right to left, and
  whatever else the component's props or tests show.
- **Callbacks** are `fn()` from `storybook/test`, so the Actions panel
  shows each call. A component's interaction is a story's `play`, which
  acts as a learner does and checks the outcome with `expect`.
- **Use cases** come from the test fakes:
  `makeUseCasesFake({ listDecks: fn(async () => decks) })`
  ([useCasesFake.ts](../packages/ui/src/test/useCasesFake.ts)). In the
  Storybook, the fakes' `vi.fn` is Storybook's own spy, the same kind
  ([vitest.ts](../packages/ui/.storybook/vitest.ts)).
- **Shared data**, an instance on a made-up pod and decks in the scripts
  the app shows, is in
  [storyData.ts](../packages/ui/src/test/storyData.ts), and each area's
  own in [test/stories/](../packages/ui/src/test/stories/): cards, the
  library, statistics made from a fixed seed, instances and preferences.
- **What a story imports** goes into the browser's bundle: test helpers
  from `storybook/test` only, never from `vitest`, Testing Library or
  `node:` modules.
- **Nothing is fetched** from outside the Storybook: a card's picture is
  `storyPictureUrl`, the package's own illustration at its address on
  the Storybook's site, as a card shows only a picture at an http(s)
  address. A pod's address is `https://pod.example/`.
- **Nothing is left behind**: a story that changes the address, the
  browser's storage or what a module remembers puts it back in a
  `beforeEach` cleanup. A failure story throws an error the app doesn't
  retry, so no query runs on after it.

## Stories are tests

[stories.test.tsx](../packages/ui/src/stories.test.tsx), part of the UI
package's tests, draws every story of every `*.stories.tsx` in its frame,
as the Storybook draws it, and runs its `play`. It then waits until the
story has settled, nothing changed for a moment, and takes it down, so
its effects and listeners don't run on into the next story. A story
that throws, or whose `play` fails, fails `npm run check`. The test runs in happy-dom
with the package's other tests, so the stories count toward its 100%
coverage ([testing.md](testing.md#coverage-policy)). A story file's own
code is covered too: every fake method a story writes is one the
component calls.

The same test fails when a component's file has no stories file beside
it. The files without one are listed in the test, each with its reason:
a provider or a module of helpers, not a component.

The repository's checks treat a stories file and `.storybook/` as test
code (`isTestFile` in
[checkBoundaries.ts](../scripts/checkBoundaries.ts)): they may import
the test fakes, and `npm run check:exports` doesn't ask for their
exports to be used elsewhere.

## Its dependencies

`storybook` and `@storybook/preact-vite` are development dependencies of
the UI package, never part of the app's bundle. Storybook 10's Preact
renderer asks for Preact 10, so an `overrides` entry in the root
`package.json` gives it the app's Preact 11: one copy of Preact for the
app, the tests and the Storybook. The bundler Storybook builds with,
`esbuild`, has an install script, which doesn't run
([vendor-code.md](vendor-code.md#installing)).
