# The Standard for Public Code

How well Solid Memo meets the [Standard for Public Code](https://www.standardforpubliccode.org/)
(version 0.8.1), what the maintainer decided, and what is left. Each
criterion is a list of requirements, and each requirement is a MUST, a
SHOULD or OPTIONAL.

This is an assessment of `main` at `90652c08` with the branch
`public-code-followup`, made on 2026-10-13. It replaces the assessment
of 2026-10-11 (the branch `standard-for-public-code`, based on `main` at
`cae0a9f`) and the first one, of `main` at `18eace6` on 2026-10-10. It
is not a promise. Check items off as they land, and re-assess when they
do.

## Summary

The first assessment found strong engineering and weak process. The
branch `standard-for-public-code` closed most of the process gaps with
files and checks, and the maintainer has since changed every setting it
asked for:

- Contribution guidelines, governance, a security policy, a code of
  conduct, a roadmap, issue forms and a pull request template.
- A policy page, a privacy page, a list of standards, objectives, a
  glossary, a user guide, and a README for every package.
- CI on every pull request, forks included, with one `ci-ok` check that
  `main` requires, and checks of the docs, the spelling, the formatting
  and the licenses.
- Discussions, private vulnerability reporting, secret scanning and push
  protection, all on.
- A version (0.1.0, in beta), a changelog, `publiccode.yml` and
  `CITATION.cff`.
- Settings for running your own copy, and links from the app to its
  source code and its issue tracker.

This branch fixes what the re-review found: tests for the two scripts
that had none, the standards missing from [standards.md](standards.md),
the tool terms missing from the [glossary](glossary.md), a checklist for
reviewers, a plain statement that 0.1.0 is not tagged yet, the
maintainer's GitHub account in GOVERNANCE.md, CODEOWNERS and
CODE_OF_CONDUCT.md, and this page.

What is left falls into two groups:

1. Actions for the maintainer: tagging v0.1.0, with a DOI from Zenodo,
   and making the project findable. The tag closes one MUST.
2. Gaps that stay open for now. The largest is criterion 7, review by
   someone other than the author, which cannot be met honestly while the
   project has one maintainer. Criterion 6 is non-compliant: older
   commits on `main` record no reason, and commits do not link to
   issues.

## Scorecard

The counts are requirements met out of those in the criterion. Partial
and unknown count as not met. A requirement that holds because there is
nothing to apply it to counts as met, and the text says so.

| # | Criterion | MUST | SHOULD | Verdict |
|---|---|---|---|---|
| 1 | [Code in the open](https://www.standardforpubliccode.org/criteria/code-in-the-open.html) | 3/3 | 0/1 | Compliant |
| 2 | [Bundle policy and source code](https://www.standardforpubliccode.org/criteria/bundle-policy-and-source-code.html) | 2/2 | 2/2 | Compliant |
| 3 | [Make the codebase reusable and portable](https://www.standardforpubliccode.org/criteria/make-the-codebase-reusable-and-portable.html) | 2/2 | 4/8 | Compliant |
| 4 | [Welcome contributors](https://www.standardforpubliccode.org/criteria/welcome-contributors.html) | 3/3 | 4/4 | Compliant |
| 5 | [Make contributing easy](https://www.standardforpubliccode.org/criteria/make-contributing-easy.html) | 5/5 | – | Compliant |
| 6 | [Maintain version control](https://www.standardforpubliccode.org/criteria/maintain-version-control.html) | 1/3 | 3/4 | Non-compliant |
| 7 | [Require review of contributions](https://www.standardforpubliccode.org/criteria/require-review-of-contributions.html) | 1/3 | 1/5 | Non-compliant |
| 8 | [Document codebase objectives](https://www.standardforpubliccode.org/criteria/document-codebase-objectives.html) | 1/1 | 1/1 | Compliant |
| 9 | [Document the code](https://www.standardforpubliccode.org/criteria/document-the-code.html) | 3/3 | 4/5 | Compliant |
| 10 | [Use plain English](https://www.standardforpubliccode.org/criteria/use-plain-english.html) | 5/5 | 2/2 | Compliant |
| 11 | [Use open standards](https://www.standardforpubliccode.org/criteria/use-open-standards.html) | 4/4 | 3/3 | Compliant |
| 12 | [Use continuous integration](https://www.standardforpubliccode.org/criteria/use-continuous-integration.html) | 4/4 | 2/3 | Compliant |
| 13 | [Publish with an open license](https://www.standardforpubliccode.org/criteria/publish-with-an-open-license.html) | 4/4 | 1/1 | Compliant |
| 14 | [Make the codebase findable](https://www.standardforpubliccode.org/criteria/make-the-codebase-findable.html) | – | 3/8 | No MUSTs |
| 15 | [Use a coherent style](https://www.standardforpubliccode.org/criteria/use-a-coherent-style.html) | 1/1 | 2/2 | Compliant |
| 16 | [Document codebase maturity](https://www.standardforpubliccode.org/criteria/document-codebase-maturity.html) | 2/3 | 2/2 | Partial |
| | **Total** | **41/46** | **34/51** | |

A criterion is compliant when all its MUSTs are met. It is non-compliant
when more than half of them are not met, and partial otherwise.

`main` at `90652c08` alone scores 36/46 MUSTs and 31/51 SHOULDs. This
branch adds 4.3, 7.4, 10.3, 10.6, 11.3, 12.1, 16.2 and the changelog's
SHOULD in criterion 16.

The assessment of 2026-10-11 scored 39/46 and 37/51, and the first one
17/44 and 8/50. The re-review was stricter than the one on 2026-10-11: it
found the gaps fixed here, and it counts as partial what has not been
done yet, such as reviews by someone else (7.2, 7.5), examples for every
feature (9.6) and a check of the docs' coverage (12.7). The first
assessment counted too few requirements in criteria 1, 10 and 11; the
counts above are the Standard's own.

With the v0.1.0 tag, the MUSTs reach 42/46. The four left are in
criterion 6, the commits on `main` that record no reason, which the
history keeps, and the links to issues, which need a change of practice;
and in criterion 7, a second reviewer, whose reviews would also cover
the source, the policy, the tests and the docs.

## GitHub settings

Some requirements depend on settings that are not in the repository.
This is their state on 2026-10-13. The maintainer checked the ones that
cannot be read without signing in:

- Private vulnerability reporting is on.
- Discussions are on.
- The repository has a description, a homepage and topics.
- The labels `deck`, `interop` and `i18n`, which the issue forms set,
  exist.
- Secret scanning and push protection are on.
- "Allow auto-merge" is on, so Renovate can merge its pull requests once
  `ci-ok` passes.
- The ruleset on `main` (24560297) requires a pull request with no
  approvals and the `ci-ok` check, with the branch up to date. It allows
  rebase merges and merge commits. Its bypass list is empty.
- The `github-pages` environment allows deployments from `main` only.

Check them again before relying on them.

## Criteria

What holds today, and what does not, criterion by criterion.

### 1. Code in the open

- MUST, met — the source code in use is public. Production is built only
  from `main`, after CI passes ([deployment.md](deployment.md)). A deploy
  by hand runs only from `main`, and runs `npm run check` first.
- MUST, met — the source of the policy in use is public. The SM-2
  scheduler and the library's rules are in the repository
  ([policy.md](policy.md)).
- MUST, met — no sensitive information about users or third parties, and
  no secrets in the tree or its history. The maintainer's own email
  address is in the published deck versions, by his choice
  ([privacy.md](privacy.md#what-the-project-has-published)).
- SHOULD, partial — publish code not in use. The history, the pull
  requests and the old deck and shape versions are public, but no version
  is tagged yet. The leftover `pc/*` and `*-backup` branches exist only on
  the maintainer's machine; they are most likely copies of work already
  merged.
- OPTIONAL, met — the footer on every screen links to the source code,
  the commit and the issue tracker
  ([`Footer.tsx`](../packages/ui/src/ui/Footer.tsx),
  [configuration.md](configuration.md#vite_repo_url)).

### 2. Bundle policy and source code

- MUST, met — the policy is included. No public policy applies, and
  [policy.md](policy.md) says so. It lists the outside rules the code
  follows (SM-2, the CLDR plural rules, BCP 47, NFC and DCAT-AP), with
  versions and links, and the project's own rules.
- MUST, met — no policy is based on source code, so there is none to
  include.
- SHOULD, met — policy in machine-readable formats. The project's own
  rules are SHACL shapes and the library's checks; SM-2 is pure functions
  in `packages/domain`.
- SHOULD, met — CI checks the code against the policy. `sm2.test.ts`
  reads the table of [srs.md's worked examples](srs.md#worked-examples)
  from the page and checks the scheduler against every row, so a change
  to either that the other does not match fails; and
  `npm run library:check` refuses a new deck version without a license.

### 3. Make the codebase reusable and portable

- MUST, met — reusable in other contexts. A build reads its name, its
  repository, its Pod providers and its deck library from `VITE_`
  settings ([configuration.md](configuration.md)), and
  [reuse.md](reuse.md) explains how to run your own instance.
- MUST, met — no dependency on secret or proprietary software or
  services. The site is static, and every Solid server and identity
  provider it is tested with is open source.
- SHOULD, not met — used by several parties.
- SHOULD, not met — a roadmap shaped by several parties.
  [ROADMAP.md](../ROADMAP.md) is public and says how to propose an item,
  but no other party has.
- SHOULD, not met — developed by several parties.
- SHOULD, met — configuration rather than code.
- SHOULD, met — localizable. The app speaks six languages
  ([i18n.md](i18n.md)).
- SHOULD, partial — no situation-specific information. The app's name,
  its pod providers and its repository links are settings: the footer's
  links and `index.html`'s links to the repository (its JSON-LD and its
  `noscript` source link) follow `VITE_REPO_URL`. What is still written
  for this deployment: `index.html`'s absolute URLs on solid-memo.com
  (the canonical link, `og:url`, `og:image`, and the JSON-LD `url`, `@id`
  and `image`) and its description; `robots.txt` and `sitemap.xml`; the
  about page, with its address and its links to this repository;
  Solid Memo's wordmark and logo; `CNAME`; and the README.
  [reuse.md](reuse.md#6-what-you-edit-by-hand) lists them as files to
  edit by hand. The tree names no path on the maintainer's machine, but
  three old commits on `main` do, and the history keeps them.
- SHOULD, met — modules documented for reuse. Each package has a README
  that says what it exports and may import.
- SHOULD, met — no single-vendor platform. Any static host serves the
  site ([deployment.md](deployment.md)), and any Solid provider holds the
  data.

### 4. Welcome contributors

- MUST, met — anyone can suggest a change, in an issue or a pull request.
- MUST, met — contribution guidelines in [CONTRIBUTING.md](../CONTRIBUTING.md).
- MUST, met — governance in [GOVERNANCE.md](../GOVERNANCE.md). It,
  `.github/CODEOWNERS` and CODE_OF_CONDUCT.md now name the maintainer's
  own account, `@ixuz`; before, they named `@antwika`, an organization,
  which CODEOWNERS cannot use.
- SHOULD, met — who pays for reviews. Volunteers, in their own time,
  with no funding ([CONTRIBUTING.md](../CONTRIBUTING.md#review)).
- SHOULD, met — the engagement of organizations. GOVERNANCE.md says no
  organization is committed.
- SHOULD, met — a public roadmap in [ROADMAP.md](../ROADMAP.md).
- SHOULD, met — activity statistics. The README shows commit activity,
  the last commit and the contributors as badges, and links GitHub's
  pulse and activity graphs.
- OPTIONAL, met — a code of conduct: the Contributor Covenant 2.1, with a
  private email contact for reports.

### 5. Make contributing easy

- MUST, met — a public issue tracker, with forms for bugs, features,
  decks, translations and interop reports.
- MUST, met — the README links to the issues and the pull requests.
- MUST, met — communication channels. The README, CONTRIBUTING.md
  and the issue forms send questions to Discussions, which are on.
- MUST, met — a closed channel for vulnerability reports.
  [SECURITY.md](../SECURITY.md) points to GitHub's private vulnerability
  reporting, which is on. A reporter needs a GitHub account.
- MUST, met — instructions for reporting a vulnerability, in
  SECURITY.md.

### 6. Maintain version control

- MUST, met — every file is in Git.
- MUST, partial — decisions in commit messages. Of the 392 commits on
  `main` at `90652c08`, 91 have no body once their trailers are left out,
  so they record no reason; the other 301 say why. New commits comply:
  CONTRIBUTING.md asks for a body that says why, and Renovate's commits
  carry one (`commitBody` in `renovate.json5`): each update, from what
  version to what, where, its source and release notes, and why. Nothing
  checks a body automatically, and the history cannot change, so this
  stays partial.
- MUST, not met — commit messages link to issues and discussions.
  CONTRIBUTING.md asks for a `Refs: #NN` trailer, but no commit on
  `main` has one, and the maintainer's own changes start from no issue.
  `main` now allows merge commits, which name their pull request.
- SHOULD, met — a distributed version control system: Git.
- SHOULD, met — guidelines ask for one logical change per commit.
- SHOULD, not met — released versions marked. No tag exists yet.
- SHOULD, met — diff-friendly formats. CONTRIBUTING.md asks for text
  formats, and `.gitattributes` fixes the line endings.
- OPTIONAL, partial — signed commits and an email address. Every commit
  has an author's email address, but the maintainer's commits are not
  signed.

### 7. Require review of contributions

- MUST, not met — every contribution reviewed by someone other than its
  author. The maintainer merges his own pull requests without review, a
  temporary exception that GOVERNANCE.md states, and Renovate merges its
  own once CI passes, with no person reviewing them.
- MUST, partial — reviews cover the source, the policy, the tests and
  the docs. CONTRIBUTING.md and the pull request template say so, but no
  one other than the author has reviewed a change yet, so there is no
  review to check.
- MUST, met — a written reason for every declined contribution.
- SHOULD, met — review checks the standards, the architecture and the
  decisions. The template's checklist covers them for the author,
  CONTRIBUTING.md's review checklist for the reviewer, and
  `npm run check:boundaries` enforces the import rules.
- SHOULD, partial — review runs the software and the tests. CI runs
  every test on every pull request, a fork's too, and the reviewer's
  checklist says to try a change users see in the app, but there is no
  reviewer yet to do it.
- SHOULD, not met — a reviewer from a different context.
- SHOULD, not met — no unreviewed changes on `main`. The ruleset
  requires a pull request and no approval, so the maintainer's own pull
  requests and the ones Renovate merges on its own reach `main`
  unreviewed.
- SHOULD, not met — review within two business days. It is a stated
  target, but one volunteer cannot assure it, and nothing measures it.
- OPTIONAL, not met — review by several reviewers.

### 8. Document codebase objectives

- MUST, met — [objectives.md](objectives.md) states the mission, the
  goals and who the app is for.
- SHOULD, met — objectives.md links each principle to the check that
  enforces it, and [policy.md](policy.md) to the rules behind them.
- OPTIONAL, met — the about page explains the project to the public.

### 9. Document the code

- MUST, met — all functionality described, for learners in
  [user-guide.md](user-guide.md) and for developers in the topic pages.
- MUST, met — how to install and run, in the README.
- MUST, met — examples of the key functionality: the user guide and the
  [user journeys](https://solid-memo.com/journeys/) report.
- SHOULD, met — an overview for a wide audience: the README's "About"
  and the about page.
- SHOULD, met — how to run a standalone copy: the README's "Run it on its
  own", [reuse.md](reuse.md), and guest mode as a test dataset that needs
  no Pod.
- SHOULD, partial — examples for all functionality.
  [markdown.md](markdown.md) and [boundaries.md](boundaries.md) have
  them, but the [user guide](user-guide.md) has no journey or worked
  example yet for guest mode, the theme, switching instances, or
  exporting and importing a deck file.
- SHOULD, met — the components and their relations, in
  [architecture.md](architecture.md).
- SHOULD, met — CI checks the docs: markdownlint, cspell, lychee and the
  docs index ([testing.md](testing.md#documentation)).

### 10. Use plain English

- MUST, met — the authoritative languages are documented: English only
  (the README, [style.md](style.md#language)).
- MUST, met — English is one of them.
- MUST, met — the docs are up to date in English, the one authoritative
  language. This page and ROADMAP.md said settings were off after they
  had been turned on; this update fixes that.
- MUST, met — the source code is in English.
- MUST, met — the bundled policy is in English.
- SHOULD, met — terms explained, in [glossary.md](glossary.md), which
  now covers the code's and the tools' terms too, such as CI, SPDX,
  REUSE, npm and ports and adapters. The README and CONTRIBUTING.md link
  it.
- SHOULD, met — a plain reading level. Long pages open with a plain
  summary, and style.md asks for short sentences and everyday words. The
  technical pages are above that level, for their own readers.

### 11. Use open standards

- MUST, met — data is exchanged in open standards: the Solid Protocol,
  RDF, SHACL, DCAT, SKOS and the rest ([standards.md](standards.md)).
- MUST, met — the status of each standard is recorded. standards.md
  marks the drafts and de facto specifications, and every specification
  used is open to read and to implement.
- MUST, met — every standard is listed with a link. This branch adds
  vCard, the SPDX terms and license list, CSV, WCAG and the repository's
  own conventions, such as REUSE, `publiccode.yml` and Semantic
  Versioning.
- MUST, met — the drafts and de facto ones do not hinder reuse, and
  standards.md says why.
- SHOULD, met — where no standard existed, the project publishes its own
  open vocabulary and shapes in `ns/`.
- SHOULD, met — machine-testable standards preferred: data is checked
  against SHACL shapes, by two engines in CI.
- SHOULD, met — no non-open standard is used, so there is none to
  prefer.

### 12. Use continuous integration

- MUST, met — all functionality has automated tests, at 100% coverage
  in every package. The scripts are covered too: `checkBoundaries.ts` now
  has tests and is no longer left out of coverage, and
  `shacl_crosscheck.py` has its own tests, which CI runs before the
  cross-check ([testing.md](testing.md)).
- MUST, met — contributions pass all tests before they are merged.
  CI runs on every pull request, and `ci-ok` passes only when all its
  jobs did: `build`, `library` (the deck library compared with the
  change's base), `crosscheck`, `pod`, `contract`, `journeys` and `docs`.
  The ruleset requires `ci-ok`, with the branch up to date, and no one
  can bypass it. The interop workflow's advisory servers report and do
  not gate, by design ([testing.md](testing.md)).
- MUST, met — guidelines for structuring contributions in
  CONTRIBUTING.md.
- MUST, met — an active contributor who reviews contributions: the
  maintainer. One person is a thin margin, as criterion 7 shows.
- SHOULD, met — test results are public, for a fork's pull request too.
- SHOULD, met — one issue per pull request, as CONTRIBUTING.md asks.
- SHOULD, partial — coverage monitored. Each package's test coverage is
  in the CI run's summary, and `npm run check:docs` keeps every page in
  the docs index. Nothing measures the docs' coverage, such as a README
  for every package or a comment on every export.
- OPTIONAL, partial — the policy and the docs tested against the code.
  The generated vocabulary, the vendored packages' list and the SM-2
  table are checked; standards.md, the answers CSV's columns in
  statistics.md and testing.md's list of CI jobs are not.
- OPTIONAL, met — the docs tested for style and broken links:
  markdownlint, cspell and lychee.
- OPTIONAL, partial — the software tested with the docs' examples.
  `sm2.test.ts` checks the scheduler against srs.md's worked examples;
  the Turtle examples in the docs are not checked.

### 13. Publish with an open license

- MUST, met — the code and docs are under the MIT License. The decks
  carry their own open licenses.
- MUST, met — MIT is approved by the OSI.
- MUST, met — a license file, and every license's text in `LICENSES/`.
- MUST, met — no copyright transfer and no contributor license
  agreement ([CONTRIBUTING.md](../CONTRIBUTING.md#licensing)).
- SHOULD, met — machine-readable notices in every file. The repository
  follows REUSE, and CI runs `reuse lint` ([style.md](style.md#licenses)).
- OPTIONAL, met — several licenses: MIT for the code and the docs, and
  each deck's own license.

### 14. Make the codebase findable

- SHOULD, not met — a descriptive name. The project is "Solid Memo", but
  the repository is still called `website`, by choice.
- SHOULD, met — a short description, on the repository, in
  `package.json` and in `publiccode.yml`.
- SHOULD, not met — submitted to software catalogs.
- SHOULD, met — a website that explains the problem for different
  readers: [solid-memo.com/about](https://solid-memo.com/about/).
- SHOULD, not met — findable by name in a search engine. Not checked,
  and the site is not registered with any search engine.
- SHOULD, not met — findable by the problem it solves. Not checked.
- SHOULD, not met — a persistent identifier. There is no DOI yet.
- SHOULD, met — machine-readable metadata: `publiccode.yml`, checked in
  CI, and `CITATION.cff`.
- OPTIONAL, met — a domain of its own, solid-memo.com.
- OPTIONAL, not met — regular talks at conferences.

### 15. Use a coherent style

- MUST, met — a style guide, [style.md](style.md).
- SHOULD, met — style checked automatically: Biome, the Turtle
  formatter, markdownlint and cspell, in `npm run check` and CI.
- SHOULD, met — rules for comments and docs, in style.md.
- OPTIONAL, met — rules for understandable English, in style.md.

### 16. Document codebase maturity

- MUST, not met — versioned. The app is numbered 0.1.0 and shows its
  version in the footer, but no version is tagged or released yet.
- MUST, met — maturity stated. The README says the app is in beta, and
  that a version CHANGELOG.md dates "Unreleased" is not tagged yet.
- MUST, met — no version is declared ready, and `npm run check` refuses
  a prerelease dependency unless
  [vendor-code.md](vendor-code.md#maturity) explains it.
- SHOULD, met — a summary of changes, in [CHANGELOG.md](../CHANGELOG.md).
  Its 0.1.0 section now covers the statistics, the answer times and the
  about page, which were merged after it was written.
- SHOULD, met — the version scheme, in [releasing.md](releasing.md).
- OPTIONAL, met — Semantic Versioning, at 0.x.

## Decisions made

The maintainer made these choices. Each is recorded where it applies.

1. **Governance.** One maintainer decides, in public, and gives reasons.
   A regular contributor can be invited as a co-maintainer. If the
   maintainer steps away, he hands the organization to a co-maintainer,
   or the repository is archived ([GOVERNANCE.md](../GOVERNANCE.md)).
2. **Security contact.** GitHub's private vulnerability reporting only:
   no email address and no `/.well-known/security.txt`
   ([SECURITY.md](../SECURITY.md)).
3. **Review.** The maintainer merges his own pull requests without a
   second reviewer, as a stated, temporary exception
   ([GOVERNANCE.md](../GOVERNANCE.md#merging)). The project invites a
   second reviewer.
4. **Email in decks.** The 205 published deck versions keep
   `foaf:mbox`, as a published version is never edited. A new version
   names the project's contact, a `dcat:contactPoint` that points at the
   issue tracker, with no email address. `npm run library:check` checks
   it for every version not published at the base
   ([deck-library.md](deck-library.md#contact), [privacy.md](privacy.md)).
5. **Repository name.** Kept as `website`. The description and the
   metadata name the project.
6. **License of `docs/` and `ns/`.** MIT, as for the code, stated in the
   README and set up with REUSE.
7. **Maturity and versions.** Beta. Semantic Versioning at 0.x, tagged by
   hand, with a changelog in the Keep a Changelog format
   ([releasing.md](releasing.md)).
8. **Renovate.** Updates are merged automatically through pull requests
   (`automergeType: 'pr'`), once CI passes. Renovate cannot approve its
   own pull requests, so once `main` requires an approval, a maintainer
   approves each update and automerge merges it after that; Renovate gets
   no bypass. If that is too many approvals, automerge is narrowed, not
   the review ([GOVERNANCE.md](../GOVERNANCE.md#dependency-updates)).
9. **Formatting.** Biome, with a line width of 100
   ([style.md](style.md#formatting)).
10. **Spelling.** American English everywhere, checked by cspell.
11. **Code of conduct.** The Contributor Covenant 2.1. Reports go to the
    maintainer's email, which is published for that purpose.

Whatever is decided later:

- Deck attribution stays "Compiled by Anton Wiklund with the help of AI".
  No contribution or review text may say or imply that the maintainer
  reviews decks.
- Published `decks/*/vN.ttl`, `ns/shapes/*/vN.ttl` and `ns/vocab/vN.ttl`
  files are never edited. A change ships as a new version.

## What remains

### GitHub settings (admin)

Only an admin of the repository can change these. All are done:

- [x] **Private vulnerability reporting.** On, and its exclusion is gone
  from `lychee.toml`. *(5)*
- [x] **Secret scanning and push protection.** Both on. *(1)*
- [x] **Discussions.** On, and their exclusion is gone from
  `lychee.toml`. *(5)*
- [x] **Topics and description.** The description and homepage are kept,
  and topics are added. *(14)*
- [x] **Labels.** `deck`, `interop` and `i18n` exist, for the deck,
  interop and translation forms.
- [x] **The ruleset on `main`** (24560297). It requires `ci-ok`, and its
  bypass list is empty, so Renovate has no bypass. *(7, 12)*
- [x] **Allow auto-merge.** On, so Renovate can merge its pull requests
  once `ci-ok` passes.
- [x] **The `github-pages` environment.** `main` is its only deployment
  branch. *(1, 12)*

### Actions for the maintainer

- [x] **The blame-ignore list.** The branch `standard-for-public-code`
  was merged with a merge commit (pull request #37), so the reformat's
  SHA in `.git-blame-ignore-revs` (`7646413`, "Reformat the code with
  Biome") names a commit on `main` ([style.md](style.md#formatting)).
  *(15)*
- [ ] **A DOI.** Connect Zenodo to the repository before the tag, so
  that the release gets a DOI, and add the DOI to `CITATION.cff` and the
  README. *(14)*
- [ ] **Tag v0.1.0** as [releasing.md](releasing.md#tagging-a-version)
  says: date the `[0.1.0]` heading in CHANGELOG.md, set the version and
  date in `publiccode.yml` and `CITATION.cff`, then tag the merged
  release commit and make a GitHub release; then remove the exclusions
  of CHANGELOG.md's links from `lychee.toml`. *(1, 6, 16)*
- [ ] **Software Heritage.** Save the repository there. *(14)*
- [ ] **Search engines.** Verify solid-memo.com in Google Search Console
  and Bing Webmaster Tools, and submit `sitemap.xml`. *(14)*
- [ ] **The Solid community.** Ask for a listing on solidproject.org, and
  post about the project on the Solid forum. *(3, 14)*
- [ ] **Local branches.** Delete the leftover `pc/*` and `*-backup`
  branches on the maintainer's machine, or publish any that holds work
  not on `main`. *(1)*
- [ ] **A second reviewer.** Then require one approval and code-owner
  review on `main`. Renovate's pull requests then wait for a
  maintainer's approval too, and automerge merges them once it is given
  (decision 8). *(7, 12)*

### Gaps that remain

These are not met, and the settings and actions above do not close
them:

- **Criterion 7, review by another person.** With one maintainer, his own
  changes have no second reviewer, and Renovate's updates are merged with
  no reviewer at all. A second reviewer, with one approval required on
  `main` for every pull request, Renovate's included, closes the MUST on
  review, and the SHOULD on no unreviewed changes. Their reviews would
  also show that reviews cover the source, the policy, the tests and the
  docs, and run the app. The SHOULD on a reviewer from a different
  context needs that reviewer to come from one, and review within two
  business days needs enough reviewers to assure it, and a way to
  measure it.
- **Criterion 3, several parties.** Use, the roadmap and development by
  several parties need other parties. The roadmap invites them, but
  none has joined.
- **Criterion 3, situation-specific information.** `index.html`'s site
  URLs, `CNAME`, the sitemap, `robots.txt` and the about page name
  solid-memo.com, and the about page links to this repository. A
  deployed site needs them, and
  [reuse.md](reuse.md#6-what-you-edit-by-hand) lists them for a copy to
  change. Three old commits name paths on the maintainer's machine, and
  the history keeps them.
- **Criterion 6, decisions in commit messages.** 91 of the 392 commits
  on `main` record no reason, and rewriting `main` to add them is not an
  option. New commits have a body, so the share without one only
  shrinks.
- **Criterion 6, links to issues.** No commit on `main` has a `Refs:`
  trailer, and most changes start from no issue. Opening an issue for
  each change, adding `Refs:` with the pull request, or merging with a
  merge commit, which names the pull request, would close it.
- **Criterion 9, examples for all functionality.** Guest mode, the theme,
  switching instances and deck files need a journey or a worked example
  in the user guide.
- **Criterion 12, the docs' coverage.** Nothing checks that every package
  has a README, or that every export has a comment.
- **Criterion 14, findability.** The repository name is kept by choice.
  Catalogs, search engines and a DOI wait for the actions above.

## The plan, as it landed

The first assessment's plan, with what has landed since checked: most
of it on the branch `standard-for-public-code`.

### Phase 1: files and small fixes

- [x] **Footer.** The repository URL comes from `VITE_REPO_URL`. Every
  screen links to the source code, the commit, the issue tracker and the
  version, in every language the app speaks
  ([`Footer.tsx`](../packages/ui/src/ui/Footer.tsx)).
- [x] **`CONTRIBUTING.md`**, linked from the README.
- [x] **`GOVERNANCE.md`** and `.github/CODEOWNERS`.
- [x] **`SECURITY.md`.** No `security.txt`, as decided.
- [x] **Templates.** Issue forms for bugs, features, decks, translations
  and interop reports, `config.yml` (which points conduct reports to
  their email contact), the pull
  request template, and `CODE_OF_CONDUCT.md`.
- [x] **README.** About, Status, Run it on its own, Contributing, the
  language statement, the badges, the journeys report and the licenses.
- [x] **New pages**: [objectives.md](objectives.md),
  [policy.md](policy.md), [standards.md](standards.md),
  [privacy.md](privacy.md) and [glossary.md](glossary.md), the full SM-2
  citation, and links to the specifications.
- [x] **`ROADMAP.md`.**
- [x] **Metadata and style.** `publiccode.yml`, `CITATION.cff`,
  `CHANGELOG.md`, [releasing.md](releasing.md), `.gitattributes`,
  `.editorconfig`, [style.md](style.md), the root `package.json`'s
  metadata, and the JSON-LD in `apps/web/index.html`.
- [x] **Package docs.** A README and a `description` for each package,
  `e2e/journeys` in [architecture.md](architecture.md), and the maturity
  of the 0.x dependencies in [vendor-code.md](vendor-code.md#maturity).
- [ ] **Branches.** The leftover `pc/*` and `*-backup` branches remain
  on the maintainer's machine (above).

### Phase 2: CI and GitHub settings

- [x] **`ci.yml`.** Runs on every pull request and on pushes to `main`,
  with the `ci-ok` job, a read-only token and no secrets.
- [x] **The deck library's base.** Compared in `ci.yml`'s `library`
  job, which `ci-ok` waits for; `ns.yml`, whose checks were all in
  `ci.yml` but that one, is gone.
- [x] **`deploy.yml`.** A deploy by hand runs only from `main`, after
  `npm run check`.
- [x] **`renovate.json5`.** `automergeType: 'pr'`, and a `commitBody`
  that records each update and why.
- [x] **Checks in `npm run check`.** The docs index
  (`npm run check:docs`), prerelease dependencies
  (`npm run check:dependencies`), and each package's coverage in the
  run's summary.
- [x] **A docs job.** lychee (offline on every change, online weekly),
  `reuse lint` and the publiccode.yml parser; markdownlint and cspell
  run in `npm run check`, so in the build job.
- [x] **License required.** `npm run library:check` refuses a new deck
  version without `dcterms:license`, and `sm2.test.ts` checks the
  scheduler against the table it reads from
  [srs.md](srs.md#worked-examples).
- [x] **GitHub settings.** Listed above, all done.

### Phase 3: larger work

- [x] **Configuration.** `VITE_APP_NAME`, `VITE_REPO_URL` and
  `VITE_POD_PROVIDERS`, [configuration.md](configuration.md),
  [reuse.md](reuse.md), and a generic custom domain section in
  [deployment.md](deployment.md). No CI build under a subpath.
- [x] **User documentation.** [user-guide.md](user-guide.md),
  [statistics.md](statistics.md), [browsing.md](browsing.md), examples in
  [markdown.md](markdown.md) and [boundaries.md](boundaries.md), and a
  plain summary at the top of long pages.
- [x] **Formatter and linter.** Biome in `npm run check`, with the
  reformat in `.git-blame-ignore-revs`.
- [x] **REUSE.** `REUSE.toml`, `LICENSES/`, SPDX headers, the license on
  the `ns/` graphs ([vocab.md](vocab.md#license)), `reuse lint` in CI,
  and `npm run check:reuse` for the decks' licenses.
- [ ] **Releases.** The version shows in the footer. The tag, the DOI and
  the archive remain (above).
- [ ] **Findability.** The about page is done and in the sitemap. Search
  engines and the Solid community remain (above).
- [x] **Deck contact.** New deck versions name the project's contact.
- [ ] **A second reviewer.**

## Checking progress

- The full check passes at 100% coverage after every code change. Run
  `npm run crosscheck`, `npm run format:turtle` and `npm run library`
  when `ns/` or `decks/` change.
- GitHub's community profile (`/community`) shows every item.
- A pull request from a fork runs CI, `ci-ok` is required, and the
  template appears.
- A pull request that edits a published deck version fails.
- A deploy by hand from a branch other than `main` is skipped.
- The footer's links open the source code, the commit and the issues on
  `solid-memo/website`.
- GitHub's blame of a reformatted file on `main` shows the change that
  wrote each line, not the reformat.
- `lychee.toml` excludes no address whose setting or tag now exists.
- Go through the criteria again, and update the scorecard here.
