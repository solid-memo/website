# Governance

How Solid Memo is run: who holds its domain and pays for it, where it
talks, who decides, how changes are merged and published, and what
happens if the maintainer steps away.
How to contribute is in [CONTRIBUTING.md](CONTRIBUTING.md).

## Who maintains it

Solid Memo is a volunteer project. It has no funding, and no
organization is committed to it, as a sponsor, a user or an employer of
its contributors. Its one maintainer is Anton Wiklund
([@ixuz](https://github.com/ixuz)), who owns the
[solid-memo](https://github.com/solid-memo) GitHub organization.
[.github/CODEOWNERS](.github/CODEOWNERS) names the maintainers.

## The domain

The vocabulary, the shapes and the deck library live under
<https://solid-memo.com/>, at `/ns/` and `/decks/`
([docs/vocab.md](docs/vocab.md), [docs/deck-library.md](docs/deck-library.md)).
Every pod that uses the app holds data that points at those addresses,
so the domain has to stay with the project for as long as that data
matters. If it lapsed, the addresses would stop resolving, and someone
else could register the domain and serve different terms under them.

The maintainer registered solid-memo.com in his own name, at One.com.
It is renewed every year, automatically, and paid by him. Its expiry
date is public, in the `.com` registry's
[RDAP record](https://rdap.verisign.com/com/v1/domain/solid-memo.com)
and in WHOIS. What happens to it if the maintainer steps away is
[below](#if-the-maintainer-steps-away).

## Costs

The project pays for one thing: the domain. The code, its CI, the
site's hosting on GitHub Pages and the archives cost nothing, as the
repository is public. The maintainer pays for the domain himself, so
Solid Memo is not yet self-sufficient: it depends on him for its one
cost.

## Where the project talks

All collaboration, maintenance, decisions and discussion about Solid
Memo happen openly and in writing, in the project's public,
asynchronous channels. That way every decision and its reasons can be
found and linked later, by anyone. It also lets anyone take part, in any
time zone and at their own pace, and leaves no one out of a
conversation they could not attend.

The project's channels are:

- [issues](https://github.com/solid-memo/website/issues), for bugs,
  features, decks and other work to be done;
- [Discussions](https://github.com/solid-memo/website/discussions), for
  questions and ideas that are still open;
- [pull requests](https://github.com/solid-memo/website/pulls) and their
  reviews, for changes;
- commit messages, for the decision each commit records
  ([CONTRIBUTING.md](CONTRIBUTING.md#commit-messages)).

Apart from the two exceptions below, there is no other channel. The
project runs no ephemeral or instant chat, such as Discord, Slack,
Matrix, IRC or direct messages, and no voice or video calls or
meetings. It endorses none that others run. People are free to talk
about Solid Memo anywhere; such talk is simply not part of the project.

Something said elsewhere, such as a private message sent anyway, a
conversation at an event, or an email that is not one of the two
exceptions below, decides nothing and counts for nothing until it is
written up in a public issue, discussion or pull request. A
maintainer or co-maintainer who receives such a message answers it by
pointing to the public channel, or by opening the thread there, and
does not carry on the conversation in private. This binds the
maintainers between themselves too.

There are exactly two exceptions. Both are confidential, and both are
still in writing:

- **Security vulnerabilities** are reported and handled privately
  through GitHub's private vulnerability reporting, in writing in the
  security advisory. The advisory is made public once the fix is
  deployed, at a time agreed with the reporter. A report that is not a
  vulnerability in scope is closed with its reason
  ([SECURITY.md](SECURITY.md)).
- **Code of conduct reports** are sent privately by email to the
  maintainer or, when the report is about him, to GitHub through Report
  abuse, to protect the people involved. Only as much is made public as
  is safe for them ([CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md#enforcement)).

Anything in such a private thread that is not about a vulnerability or
the incident, such as a feature idea, moves to the public channels.

## How decisions are made

The maintainer decides. Anyone can propose a change in an
[issue](https://github.com/solid-memo/website/issues) or in
[Discussions](https://github.com/solid-memo/website/discussions), and the
maintainer gives the decision and its reasons there, in public. A
decision exists only once it is written in an issue, a discussion or a
pull request, including the messages of its commits
([Where the project talks](#where-the-project-talks)). A decision
that changes the code is recorded in the message of the commit that
makes it ([CONTRIBUTING.md](CONTRIBUTING.md#commit-messages)). What is
planned is in [ROADMAP.md](ROADMAP.md).

When there are co-maintainers, they decide by agreement, in the same
public channels, and the maintainer decides when they cannot agree.

## Merging

- Every change reaches `main` through a pull request that passes CI,
  on its own and again in the merge queue, on top of `main`
  ([docs/testing.md](docs/testing.md#the-merge-queue)).
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
Renovate adds it to the merge queue on its own, which merges it only
when CI passes, with no person
reviewing it, so its updates are unreviewed changes too. A few updates
wait for a person, as `renovate.json5` says why. A new version of an npm
dependency raises the dependency's range to that version, even when the
range already allows it, so each new version comes as a pull request of
its own and no older version is locked again. Every Monday, Renovate
also locks each `package-lock.json` again, to the newest versions the
ranges allow, so that the packages the dependencies need get their
fixes too. That moves many packages at once, so a person merges it,
after reading what moved. Every update waits too:
Renovate proposes a version only once it has been public for 3 days, so
that a bad or malicious version can be found and pulled before it
reaches `main`. The wait covers every package an update newly locks,
not only the one it names. The repository's [.npmrc](.npmrc), and one
beside each end-to-end test server's own `package-lock.json` in
`e2e/pod/servers/`, set npm's `min-release-age` to 3 days, and
[uv.toml](uv.toml) sets uv's `exclude-newer` to 3 days for the
`scripts/requirements-*.txt` it compiles. So npm and uv, whether
Renovate or a person runs them, resolve no package to a younger
version. npm before 11.10 ignores the setting without a word: Node 24's
npm is newer, and so is the npm the root `package.json`'s
`packageManager` names, which Renovate runs. Versions already locked
stay as they are, and `npm ci` and pip install them whatever their age.
Renovate proposes a security update at once, without the wait. When
its fixed version, or a package that version newly needs, is younger
than 3 days, npm or uv cannot lock it and the update fails: a
maintainer locks it by hand, after reading what it changes. npm's
`--min-release-age-exclude=<package>` exempts that one package and not
what it needs; so does uv's `--exclude-newer-package=<package>=false`,
which the maintainer then takes out of the command the `.txt` records
at its top. The workflows' actions
are pinned to a commit, not a tag, which their owners could move.
Renovate proposes their updates, but a person merges each one, after
reading what it changes, because the workflows' jobs run them, and some
of those jobs hold the deploy key and other secrets. A new commit under
an unchanged version means the action's tag was moved, and is never
merged unread. Renovate
cannot approve its own pull requests: once `main` requires an approving
review, a maintainer approves each update, and Renovate merges it after
that. The weekly Taxonomy workflow likewise proposes each new version of
the deck it generates as a pull request, which CI checks like any other
and nothing merges on its own
([docs/deck-library.md](docs/deck-library.md#the-taxonomy-deck)).

## Deploying

The site at <https://solid-memo.com/> runs the latest version and nothing
else: the site CI built and tested from its release commit's code on
`main`, given that version ([docs/deployment.md](docs/deployment.md#the-build-ci-tested)). A version deploys once
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
by the maintainer, in an issue, to become a co-maintainer. A
co-maintainer can review and merge pull requests, and is added to
[.github/CODEOWNERS](.github/CODEOWNERS). A co-maintainer who wants to
step down only needs to say so in an issue.

## If the maintainer steps away

If the maintainer can no longer look after the project, he hands the
solid-memo GitHub organization and the domain solid-memo.com to an
active co-maintainer, and says so in an issue. If there is none, the
repository is archived, with a notice in the README saying so. The
maintainer then keeps the domain renewed, and the site at
<https://solid-memo.com/> serving `/ns/` and `/decks/`, for at least 3
years after the archiving, so that the data in people's pods keeps
resolving while they move it or a fork takes over.
The code, the vocabulary and the decks stay available under their
licenses, and anyone may fork them. A fork keeps the code, but not the
addresses under solid-memo.com: those stay with the domain.

## Changing this document

This document changes like any other file: in a pull request, decided
as above.
