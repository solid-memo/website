<!-- markdownlint-disable-file MD041 -->
<!--
Thanks for contributing. See CONTRIBUTING.md. Check what applies, and say
"n/a" beside what does not. A security fix goes through a private report
first (SECURITY.md).
-->

## What and why

<!-- What this changes, and why. -->

Closes: #

<!--
Closes:, Fixes: or Resolves: closes the issue when the pull request is
merged; Refs: does not. If this pull request is one step of its issue
and does not finish it, write Refs: instead, and check "One step" below.
-->

## Checklist

- [ ] **One issue.** This pull request addresses one issue, linked above.
- [ ] **One step.** This pull request does not finish its issue, so it says `Refs:`, not `Closes:`. Leave this unchecked otherwise.
- [ ] **Done**, as [AGENTS.md](https://github.com/solid-memo/website/blob/main/AGENTS.md) defines it: `npm run check` passes (lint, Markdown and spelling included), `npm run lint:reuse` too if a file was added, and `npm run crosscheck` too if `ns/` or `decks/` changed.
- [ ] **Tests.** New and changed code has its tests, and every package stays at 100% coverage ([docs/testing.md](https://github.com/solid-memo/website/blob/main/docs/testing.md)).
- [ ] **Docs.** The docs say what changed, and a new page in `docs/` is listed in [docs/README.md](https://github.com/solid-memo/website/blob/main/docs/README.md).
- [ ] **Languages.** A new or changed message is in every locale: en, sv, ko, de, es and fr (`packages/ui/src/i18n/`).
- [ ] **Vocabulary and shapes.** Any change to `ns/` was agreed in an issue first; no published `ns/shapes/*/vN.ttl` or `decks/*/vN.ttl` was edited; generated files were regenerated, not edited.
- [ ] **Breaking?** Nothing in [the public API](https://github.com/solid-memo/website/blob/main/docs/releasing.md#the-public-api) breaks, or a commit says so (`!` and a `BREAKING CHANGE:` footer). `npm run check:breaking` sees a line of `api/` that goes, but not a feature removed, nor a reader that reads less than before.
- [ ] **Pod data.** Any change to what the app writes to a pod comes with its migration ([docs/migrations.md](https://github.com/solid-memo/website/blob/main/docs/migrations.md)).
- [ ] **Policy.** Any change to an external rule the code follows (SM-2, the plural rules, a specification) is cited.
- [ ] **Licenses.** New content is MIT, or a deck states its own license; a new file has its SPDX header (`npm run lint:reuse`), or a new deck its line in `REUSE.toml`; third-party content is credited.
- [ ] **Architecture.** Imports follow [docs/boundaries.md](https://github.com/solid-memo/website/blob/main/docs/boundaries.md) and the layers of [docs/architecture.md](https://github.com/solid-memo/website/blob/main/docs/architecture.md).
- [ ] **Run.** I ran the app (`npm run dev`) and tried the change, and considered the user journeys.
- [ ] **Authorship.** I read and understand every line of this pull request, and answer for it, whatever tools helped write it ([CONTRIBUTING.md](https://github.com/solid-memo/website/blob/main/CONTRIBUTING.md#using-ai)).
- [ ] **Commits.** Each commit is one logical change, in Conventional Commits form (`type(scope): subject`, `!` and a `BREAKING CHANGE:` footer if it breaks something), with an imperative subject and a body that explains why ([CONTRIBUTING.md](https://github.com/solid-memo/website/blob/main/CONTRIBUTING.md#commit-messages)).
