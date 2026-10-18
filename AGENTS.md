<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
<!-- markdownlint-disable-file MD025 -- turbo writes the block above, with a heading of its own. -->

# Solid Memo

This repository's docs are indexed in [docs/docs.ttl](docs/docs.ttl); start with
[docs/architecture.md](docs/architecture.md). How contributions are made
(commit messages, one change per commit, pull requests) is in
[CONTRIBUTING.md](CONTRIBUTING.md).

- **Done** means `npm run check` passes (Biome, markdownlint, cspell,
  typecheck, tests and the repository's checks; it draws the docs'
  diagrams in Chromium, which `npm run browsers` installs once, and it
  fails under `DOCS_DIAGRAMS=skip`), `npm run lint:reuse` too
  when a file was added (it needs reuse:
  `pip install -r scripts/requirements-lint.txt`), and `npm run crosscheck`
  too when `ns/` or `decks/` changed (it needs
  `pip install -r scripts/requirements-ci.txt`), and `npm run lint:workflows`
  too when `.github/` changed (it needs
  `pip install -r scripts/requirements-lint.txt`).
- **Generated files** (`packages/vocab/src/*.generated.ts`) are never
  edited by hand: change `ns/` and run `npm run generate`.
- **Turtle**: after editing a `.ttl` file, run `npm run format:turtle`; after
  changing `decks/`, `npm run library` ([docs/deck-library.md](docs/deck-library.md)).
- **A new page** in `docs/` is listed in `docs/docs.ttl`, then
  `npm run format:turtle` ([docs/markdown.md](docs/markdown.md#the-docs-index)).
- **Coverage** is 100% per package; new code ships with its tests, and
  unreachable code is removed, not excluded ([docs/testing.md](docs/testing.md)).
- **Formatting**: after editing TypeScript, JSON or CSS, run `npm run format`
  (Biome); `npm run lint` checks it ([docs/style.md](docs/style.md#formatting)).
- **One test file**: `npm run test:unit -- <path>`, from the root.
- **Imports** follow [docs/boundaries.md](docs/boundaries.md), which
  `npm run check:boundaries` enforces.
- **Commits** follow Conventional Commits (`type(scope): subject`, a body
  that says why), as [CONTRIBUTING.md](CONTRIBUTING.md#commit-messages)
  says; `npm run lint:commits` checks them.
- **Licenses**: a new file that can carry a comment starts with the SPDX
  header, which `npm run lint:reuse` checks; a new deck is listed in
  `REUSE.toml` under its license, which `npm run check:reuse` (in
  `npm run check`) checks ([docs/style.md](docs/style.md#licenses)).
- **Spelling** is American English; `npm run lint:spelling`, part of
  `npm run check`, checks Markdown, `en.json` and `docs/docs.ttl` ([docs/style.md](docs/style.md#language)).
