# Security

## Supported versions

Only `main`, as deployed at https://solid-memo.com/, is supported. A fix
is made on `main` and deployed from there; older commits and forks get no
fixes.

## Reporting a vulnerability

Report it privately through GitHub:
**[Report a vulnerability](https://github.com/solid-memo/website/security/advisories/new)**.
You need a GitHub account. Only you and the maintainers see the report.

Please do not open a public issue, pull request or discussion about it.

Say what is affected, how to reproduce it, and what an attacker could do
with it. A proof of concept against your own pod is welcome; do not test
against other people's pods or accounts.

## What happens next

Solid Memo is maintained by one volunteer, in his own time
([GOVERNANCE.md](GOVERNANCE.md)), so these are aims, not promises:

- We acknowledge the report within a week.
- We say whether we accept it, and why, once we have looked into it.
- We fix an accepted vulnerability as soon as we can, and deploy the fix
  from `main`.
- We disclose it in a
  [GitHub security advisory](https://github.com/solid-memo/website/security/advisories)
  once the fix is deployed, crediting you unless you would rather not be
  named. We agree the timing with you.

## Scope

Solid Memo is a static site: everything runs in the user's browser, and
it reads and writes the user's own Solid pod. In scope:

- **The Solid-OIDC session**: login, session restore and logout, and the
  requests made with the session ([docs/authentication.md](docs/authentication.md)).
- **Markdown rendering and the content security policy**: any way data
  from a pod, a deck or a link runs script, loads content or misleads the
  user ([docs/markdown.md](docs/markdown.md#safety)).
- **Deck import by URL**: adding a deck or a course from a link to its
  release, and the Studio's import of files
  ([docs/deck-library.md](docs/deck-library.md#from-a-link),
  [docs/studio.md](docs/studio.md)).
- **Pod writes during migrations**: a format update or a library upgrade
  that loses, exposes or corrupts a user's data
  ([docs/migrations.md](docs/migrations.md)).
- The vocabulary, shapes and decks published at solid-memo.com, and this
  repository's CI and deploy workflows.

Out of scope:

- Users' own pod servers and identity providers, and the Solid servers
  the tests run against. Report those to their projects.
- GitHub Pages, which hosts the site, and the libraries the app depends
  on, unless Solid Memo uses them in an unsafe way. Report a library's
  own vulnerability to that library.
