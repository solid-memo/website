<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# Solid Memo

This repository's docs are indexed in [docs/README.md](docs/README.md); start with
[docs/architecture.md](docs/architecture.md).

- **Done** means `npm run check` passes, and `npm run crosscheck` too when
  `ns/` or `decks/` changed (it needs `pip install -r scripts/requirements-ci.txt`).
- **Generated files** (`packages/vocab/src/*.generated.ts`) are never
  edited by hand: change `ns/` and run `npm run generate`.
- **Turtle**: after editing a `.ttl` file, run `npm run format:turtle`; after
  changing `decks/`, `npm run library` ([docs/deck-library.md](docs/deck-library.md)).
- **Coverage** is 100% per package; new code ships with its tests, and
  unreachable code is removed, not excluded ([docs/testing.md](docs/testing.md)).
- **One test file**: `npm run test:unit -- <path>`, from the root.
- **Imports** follow [docs/boundaries.md](docs/boundaries.md), which
  `npm run check:boundaries` enforces.
