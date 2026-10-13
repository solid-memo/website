# Governance

How Solid Memo is run: who decides, how changes are merged and
published, and what happens if the maintainer steps away. How to
contribute is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Who maintains it

Solid Memo is a volunteer project. It has no funding, and no
organization is committed to it, as a sponsor, a user or an employer of
its contributors. Its one maintainer is Anton Wiklund
([@ixuz](https://github.com/ixuz)), who owns the
[solid-memo](https://github.com/solid-memo) GitHub organization.
[.github/CODEOWNERS](.github/CODEOWNERS) names the maintainers.

## How decisions are made

The maintainer decides. Anyone can propose a change in an
[issue](https://github.com/solid-memo/website/issues) or in
[Discussions](https://github.com/solid-memo/website/discussions), and the
maintainer gives the decision and its reasons there, in public. A
decision that changes the code is recorded in the message of the commit
that makes it ([CONTRIBUTING.md](CONTRIBUTING.md#commit-messages)).
What is planned is in [ROADMAP.md](ROADMAP.md).

When there are co-maintainers, they decide by agreement, and the
maintainer decides when they cannot agree.

## Merging

- Every change reaches `main` through a pull request that passes CI.
- A pull request is reviewed by a maintainer who did not write it
  ([CONTRIBUTING.md](CONTRIBUTING.md#review)).
- A contribution that is declined or closed always gets a written
  reason.

**A known, temporary exception:** while the project has one maintainer,
there is no second reviewer. The maintainer merges his own pull requests
once CI passes, without review by anyone else. The Standard for Public
Code asks for every contribution to be reviewed by someone other than its
author, so Solid Memo does not yet meet that requirement
([docs/standard-for-public-code.md](docs/standard-for-public-code.md)). The
project invites a second reviewer: say so in an issue or in Discussions.
Once there is one, `main` requires an approving review, for Renovate's
pull requests too ([Dependency updates](#dependency-updates)).

## Dependency updates

[Renovate](https://docs.renovatebot.com/) proposes dependency updates
([renovate.json5](renovate.json5)). Each update is a pull request, and
Renovate merges it on its own only when CI passes, with no person
reviewing it, so its updates are unreviewed changes too. A few updates
wait for a person, as `renovate.json5` says why. Renovate cannot approve
its own pull requests: once `main` requires an approving review, a
maintainer approves each update, and Renovate merges it after that.

## Deploying

The site at https://solid-memo.com/ runs the latest version, built from
its release commit on `main`, and nothing else. A version deploys once
CI has passed on its release commit; any other push to `main` waits
for the next version ([docs/deployment.md](docs/deployment.md)). A
deploy by hand is run only from `main`, and only by a maintainer, and
deploys the latest version again.

## Publishing versions

The vocabulary, the shapes and the decks are published with the site, so
a maintainer publishes a version of any of them by merging it into
`main`, and it goes live with the next release. Anyone may propose one
in a pull request.

- **The vocabulary** grows by adding terms. A term that should no
  longer be written is deprecated, never removed, and a breaking change
  is a new namespace ([docs/vocab.md](docs/vocab.md#versioning-policy)).
- **The shapes** gain versions; a published `ns/shapes/*/vN.ttl` is
  never edited ([docs/shapes.md](docs/shapes.md)).
- **The decks** gain versions; a published `decks/*/vN.ttl` is never
  edited or removed, and a card that should go is retired
  ([docs/deck-library.md](docs/deck-library.md#publishing-a-new-version)).
- **The app** is versioned with [Semantic Versioning](https://semver.org/),
  from 1.0.0. semantic-release releases each version from the commits'
  [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
  types, and writes its changes into the changelog
  ([docs/releasing.md](docs/releasing.md)). A breaking change, and so a
  major version, is agreed in an issue first.

## Becoming a co-maintainer

Anyone who contributes regularly and reviews others' work can be invited
by the maintainer to become a co-maintainer. A co-maintainer can review
and merge pull requests, and is added to
[.github/CODEOWNERS](.github/CODEOWNERS). A co-maintainer who wants to
step down only needs to say so.

## If the maintainer steps away

If the maintainer can no longer look after the project, he hands the
solid-memo GitHub organization to an active co-maintainer. If there is
none, the repository is archived, with a notice in the README saying so.
The code, the vocabulary and the decks stay available under their
licenses, and anyone may fork them.

## Changing this document

This document changes like any other file: in a pull request, decided
as above.
