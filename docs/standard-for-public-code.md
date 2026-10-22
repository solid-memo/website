# The Standard for Public Code

How well Solid Memo meets the [Standard for Public Code](https://www.standardforpubliccode.org/)
(version 0.8.1), what the maintainer decided, and what is left. Each
criterion is a list of requirements, and each requirement is a MUST, a
SHOULD or OPTIONAL.
The project is committed to meeting the Standard, and says so with the
commitment badge in its [README](../README.md#the-standard-for-public-code);
this page shows how far it has come.

This is an assessment of `main` at `c1301d9c`, made on 2026-10-22. The
latest release is 5.3.1; `main` adds only one of Renovate's updates
(#230) to it. Every requirement of the 16 criteria, MUST, SHOULD and
OPTIONAL, was checked again against the Standard's own list, and what
landed since the last assessment was checked against the repository and
GitHub's public API. It replaces the assessment of 2026-10-18 (`main` at
`befdae42`, version 3.11.0, #167), the assessment of 2026-10-16 (`main`
at `2b780237`, version 2.1.1, #78), the re-review of 2026-10-13 (`main`
at `90652c08` with the branch `public-code-followup`), the assessment of
2026-10-11 (the branch `standard-for-public-code`, based on `main` at
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
- A changelog, `publiccode.yml` and `CITATION.cff`, and, with the
  branch `semantic-release`, versions released from the commits.
- Settings for running your own copy, and links from the app to its
  source code and its issue tracker.

The branch `public-code-followup` fixed what the re-review found: tests
for the two scripts that had none, the standards missing from
[standards.md](standards.md), the tool terms missing from the
[glossary](glossary.md), a checklist for reviewers, a plain statement
that 0.1.0 was not tagged yet (which the branch `semantic-release`
replaces, below), the maintainer's GitHub account in GOVERNANCE.md,
CODEOWNERS and CODE_OF_CONDUCT.md, and this page.

The branch `semantic-release` replaces the plan to tag 0.1.0 by hand
(decision 7): every commit follows Conventional Commits, checked by
commitlint in CI, and semantic-release releases a version after CI
passes on `main`. The first version is 1.0.0, and stable, and 0.1.0 is
never tagged ([releasing.md](releasing.md)).

Since 2026-10-13, `main` has released 39 versions, 1.0.0 to 5.3.1,
each with its tag and its GitHub release, and the site runs only the
newest. 3.0.0, 4.0.0 and 5.0.0 are the major versions that break
something: the app writes cards in a new format (#119), then
preferences and deck schedules in new formats for FSRS-6 (#196), and
preferences again for the palettes and the text size (#212). Every pull
request goes through the merge queue, which merges it with a merge
commit that names it. The release's key is in the `release`
environment, which allows only `main`, and since #151 the release job
holds the key only while semantic-release runs, and every action is
pinned to a commit. CI fails a change to the public API that no commit
calls breaking, and a commit that says no why or names no issue. CodeQL
scans the code, and its alerts are fixed in pull requests.

Since 3.11.0, 13 versions have been released, 3.12.0 to 5.3.1. What
landed in them that matters to the Standard: the FSRS-6 scheduler
beside SM-2 (#196), with its policy and tests; the Swedish driving
theory course (#195) and the famous movie quotes deck (#187), which
name the issue tracker as their contact; a library check that asks
every language the app speaks of a deck (#180); the workflows' lint in
CI (#178); `npm run check:exports`, which finds code only tests use
(#175); the journeys' report, every browser's in one (#193), on a site
of its own at journeys.solid-memo.com (#204); and a deploy that ships
the site CI built and tested (#227).

Two security advisories were reported, handled and published as
[SECURITY.md](../SECURITY.md) says: in private, in writing, and
disclosed once the fix was released.
[GHSA-fhp3-h74x-mhrr](https://github.com/solid-memo/website/security/advisories/GHSA-fhp3-h74x-mhrr)
(high) was fixed in the advisory's private fork, merged to `main` as
`05078e24` and released in 4.1.1.
[GHSA-jff6-f2jv-4w6p](https://github.com/solid-memo/website/security/advisories/GHSA-jff6-f2jv-4w6p)
(moderate) was fixed by #207 and #208 and released in 4.2.0. Both were
published on 2026-10-20, and each fix's commits name their advisory.
The merge from the private fork reached `main` outside the merge queue,
before any test ran on it, which criterion 12 now counts against the
project.

What is left falls into three groups:

1. Actions for the maintainer: making the project findable, the
   leftover local branches, and the journeys' report, which has not been
   published since 4.2.0.
2. Small fixes. Of the four the assessment of 2026-10-18 found, three
   are done and one is still open. This assessment found eleven more,
   among them the standards missing from standards.md, which bring back
   criterion 11's MUST on listing every standard, and it fixes this
   page's own stale figures.
3. Gaps that stay open for now. The largest is criterion 7, review by
   someone other than the author, which cannot be met honestly while the
   project has one maintainer, and is a decided gap until then.
   Criterion 6 is non-compliant: older commits on `main` record no
   reason, and 38 commits since 1.0.0, with most older ones, link no
   issue or pull request, or 32 when a security advisory counts as a
   link. Both apply from 1.0.0 on, and CI now refuses a pull request's
   commit without a reason or a link. Criterion 12 is partial: a fix
   merged from an advisory's private fork reaches `main` before any test
   runs on it. Declaring 1.0.0 stable makes the 0.x dependencies it
   ships a partial in criterion 16, a decided gap (decision 14).

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
| 6 | [Maintain version control](https://www.standardforpubliccode.org/criteria/maintain-version-control.html) | 1/3 | 4/4 | Non-compliant |
| 7 | [Require review of contributions](https://www.standardforpubliccode.org/criteria/require-review-of-contributions.html) | 1/3 | 1/5 | Non-compliant |
| 8 | [Document codebase objectives](https://www.standardforpubliccode.org/criteria/document-codebase-objectives.html) | 1/1 | 1/1 | Compliant |
| 9 | [Document the code](https://www.standardforpubliccode.org/criteria/document-the-code.html) | 3/3 | 4/5 | Compliant |
| 10 | [Use plain English](https://www.standardforpubliccode.org/criteria/use-plain-english.html) | 5/5 | 2/2 | Compliant |
| 11 | [Use open standards](https://www.standardforpubliccode.org/criteria/use-open-standards.html) | 3/4 | 3/3 | Partial |
| 12 | [Use continuous integration](https://www.standardforpubliccode.org/criteria/use-continuous-integration.html) | 3/4 | 2/3 | Partial |
| 13 | [Publish with an open license](https://www.standardforpubliccode.org/criteria/publish-with-an-open-license.html) | 4/4 | 1/1 | Compliant |
| 14 | [Make the codebase findable](https://www.standardforpubliccode.org/criteria/make-the-codebase-findable.html) | – | 4/8 | No MUSTs |
| 15 | [Use a coherent style](https://www.standardforpubliccode.org/criteria/use-a-coherent-style.html) | 1/1 | 2/2 | Compliant |
| 16 | [Document codebase maturity](https://www.standardforpubliccode.org/criteria/document-codebase-maturity.html) | 2/3 | 2/2 | Partial |
| | **Total** | **39/46** | **36/51** | |

A criterion is compliant when all its MUSTs are met. It is non-compliant
when more than half of them are not met, and partial otherwise.

### What changed since 2026-10-18

The assessment of 2026-10-18 scored 41/46 MUSTs and 36/51 SHOULDs. Two
MUSTs that were met no longer are, and no SHOULD changed:

- **Criterion 11, every standard listed with a link** (MUST): met to
  not met. [standards.md](standards.md) has changed only for FSRS-6
  since 3.11.0, and lacks the standards that features since then use:
  CSS Color, whose `#rrggbb` the color set's shape requires of every
  color in a palette of one's own (#212), and GraphQL and JSON, by which
  the taxonomy deck's script reads its source (#190). Criterion 11 goes
  from compliant to partial.
- **Criterion 12, contributions pass all tests before they are merged**
  (MUST): met to partial. The fix for GHSA-fhp3-h74x-mhrr reached
  `main` as `05078e24` from the advisory's private fork, where Actions
  do not run, so no test gated the merge itself. CI ran every job on
  `main` after it, and 4.1.1 waited for that run, as
  [releasing.md](releasing.md#what-each-stage-checks) says. Criterion 12
  goes from compliant to partial.

Verdicts that held, with new evidence:

- **Criterion 1, code not in use** (SHOULD): still partial. On
  2026-10-22, `main` is the only branch on GitHub, so the page no longer
  says branches with work not yet merged are public; every pull
  request's commits stay public with it. Besides the 17 leftover
  branches, six other branches on the maintainer's machine hold commits
  on no public branch or pull request.
- **Criterion 5, a closed channel for vulnerability reports** (MUST):
  still met, and now used: the two advisories above.
- **Criterion 6, the commit counts.** The assessment of 2026-10-18
  counted a merge commit with only its pull request's title as one with
  a body when the title had no scope. Counted the same way for all,
  `main` at `befdae42` had 156 of 634 commits with no body, not 113. At
  `c1301d9c`, 191 of 772 have none, and since 1.0.0, 95 of 365, all
  merge commits. Since 1.0.0, 327 of 365 commits link an issue or a pull
  request, and 333 when a security advisory counts. Since 4.1.1,
  commitlint and `npm run check:closes` accept an advisory's id.
- **Criterion 7, review** (MUST): still not met. None of the 34 pull
  requests merged since `befdae42` has a review by a person, and the
  advisory's fix came in with no pull request. The MUST on a written
  reason for a declined contribution now has a case: #229, closed with
  its reason.
- **Criterion 9, examples for all functionality** (SHOULD): still
  partial, with less missing. Attaching an instance by its address and
  confirming a deck's documents now have journeys
  (`pod-safety.journey.ts`), but the user guide's table does not name
  that file.
- **Criterion 14, findable by name and by the problem** (SHOULD): still
  not met, checked again with a web search on 2026-10-22. The persistent
  identifier still holds: Zenodo has 37 versions, 14 of which name the
  website. But `.zenodo.json` still names SM-2 as the only scheduler,
  and Software Heritage has not visited since 2026-10-16.
- **Criterion 16, versions** (MUST): still met, with 39 releases; 4.0.0
  and 5.0.0 are major versions for real breaks. The app at 5.3.1 ships
  the same four dependencies before 1.0.0 as at 3.11.0, so 16.3 stays a
  decided gap.

Everything else held. Where its text changed, it is to record what
landed since: the 13 releases, FSRS-6, the Swedish driving theory
course and the movie quotes deck, the deck languages check, the
workflows' lint, `npm run check:exports`, the lower limit on cognitive
complexity (#183), the screenshots taken by `npm run screenshots`
(#185), the Studio's graph (#197), the journeys' report and its traces
(#193, #204, #208), the build CI tests and the deploy ships (#227), the
palettes' contrast (#220) and the new `journeys` and
`labour-market-deck` environments.

### Earlier scores

The assessment of 2026-10-18, at 3.11.0 (`befdae42`, #167), scored
41/46 MUSTs and 36/51 SHOULDs. Against the assessment of 2026-10-16
(41/46 and 34/51), two SHOULDs had gone from partial to met: terms
explained (10), as #165 added DOI, ACR, WCAG and the EU data themes to
the glossary, and the persistent identifier (14), as 3.11.0 is the
first release whose Zenodo entry names the website.

The assessment of 2026-10-16, at 2.1.1, scored 41/46 MUSTs and 34/51
SHOULDs. Against the re-review of 2026-10-13 (41/46 and 36/51), two
SHOULDs had gone from met to partial: terms explained (10), as DOI had
come with the Zenodo archive and ACR, WCAG and `EDUC` had been missed,
and the persistent identifier (14), whose entry the re-review had not
checked for the website. The links to issues (6) had gone from not met
to partial, which did not change the count.

`main` at `90652c08` alone scored 36/46 MUSTs and 31/51 SHOULDs. The
branch `public-code-followup` added 4.3, 7.4, 10.3, 10.6, 11.3, 12.1,
16.2 and the changelog's SHOULD in criterion 16. The branch
`semantic-release` turned 16.3 from met to partial: it declared 1.0.0
ready to use, and 1.0.0 ships four dependencies before their own 1.0.0.
Its first release, 1.0.0, met 16.1 and the SHOULD to mark released
versions in criterion 6, which brought the MUSTs to 41/46.

The assessment of 2026-10-11 scored 39/46 and 37/51, and the first one
17/44 and 8/50. Each later one was stricter than the last, and counts as
partial what has not been done yet, such as reviews by someone else
(7.2, 7.5), examples for every feature (9.6) and a check of the docs'
coverage (12.7). The first assessment counted too few requirements in
criteria 1, 10 and 11; the counts above are the Standard's own.

The seven MUSTs left are in criterion 6, the commits on `main` that
record no reason or link no issue, which the history keeps, though CI
now refuses new ones in a pull request; in criterion 7, a second
reviewer, whose reviews would also cover the source, the policy, the
tests and the docs; in criterion 11, the standards missing from
standards.md, which a small fix closes; in criterion 12, a fix merged
from an advisory's private fork, which no test gates before it reaches
`main`; and in criterion 16, the dependencies before 1.0.0 that the
stable app ships.

## GitHub settings

Some requirements depend on settings that are not in the repository.
This is their state on 2026-10-22. These were read from GitHub's and
Zenodo's public APIs:

- Discussions and issues are on. The repository has a description, a
  homepage (solid-memo.com) and twelve topics.
- The labels `deck`, `interop` and `i18n`, which the issue forms set,
  exist.
- The ruleset on `main` (24560297) is active. It blocks deletion and
  force pushes, and requires a pull request with no approvals, the
  `ci-ok` check, and the merge queue. The merge queue merges with merge
  commits and builds each pull request on top of `main` and those ahead
  of it, so the branch need not be up to date
  ([testing.md](testing.md#the-merge-queue)).
- The ruleset "version tags" (25032384) is active, and protects
  `refs/tags/v*`: it restricts their creation, update and deletion, and
  blocks force pushes.
- The `github-pages`, `release`, `journeys` and `labour-market-deck`
  environments each allow deployments from `main` only. `journeys`
  (#204) is where the deploy reads the key that publishes the journeys'
  report ([deployment.md](deployment.md#the-journeys-report)), and
  `labour-market-deck` (#190) where the taxonomy workflow reads its
  app's key ([deck-library.md](deck-library.md#the-taxonomy-app)). No
  taxonomy run has used it yet: the workflow runs weekly, on Mondays,
  and none has run since it landed on 2026-10-19.
- CodeQL's workflow is active.
- Every version from 1.0.0 to 5.3.1, 39 in all, has its tag and its
  GitHub release, none a draft or a prerelease. Zenodo, connected to
  the repository, has archived 37 of them, all but 1.0.1 and 2.1.1,
  under the concept DOI. Its newest entry, 5.3.1, names the author, the
  repository and the website.
- Two security advisories are published, both on 2026-10-20
  (decision 13):
  [GHSA-fhp3-h74x-mhrr](https://github.com/solid-memo/website/security/advisories/GHSA-fhp3-h74x-mhrr)
  (high: shared instances could make Solid Memo change, expose or
  delete documents elsewhere in the user's pod), fixed in a private
  fork and merged as `05078e24` (4.1.1), and
  [GHSA-jff6-f2jv-4w6p](https://github.com/solid-memo/website/security/advisories/GHSA-jff6-f2jv-4w6p)
  (moderate: the published test report's trace viewer showed pages from
  any address on solid-memo.com), fixed by #207 and #208, and released
  in 4.2.0.

The public API does not show the rulesets' bypass lists or any secret.
The maintainer checked the ones that cannot be read without signing in,
on 2026-10-16, and they could not be read again on 2026-10-22:

- Private vulnerability reporting is on.
- Secret scanning and push protection are on.
- "Allow auto-merge" is on, so Renovate can add its pull requests to the
  merge queue, which merges them once `ci-ok` passes there too.
- The bypass list of the ruleset on `main` names "Deploy keys", for the
  release, which pushes each release commit through it. The bypass list
  of "version tags" names "Deploy keys" and the Repository admin role.
- The release's key is the environment secret `SEMANTIC_RELEASE_KEY` of
  the `release` environment, and is the only deploy key with write
  access; the repository secret of the same name, and the old deploy
  key, are deleted (#80). Every release from 2.0.1 on ran from that
  environment.

Check them again before relying on them.

## Criteria

What holds today, and what does not, criterion by criterion.

### 1. Code in the open

- MUST, met — the source code in use is public. Production runs only a
  released version, after CI passes on its release commit on `main`, the
  one its tag names: the site CI built and tested from that code, given
  the released version ([deployment.md](deployment.md#the-build-ci-tested)),
  and only the newest version, once its GitHub release is made. A deploy
  by hand runs only from `main`, deploys the newest version, and runs
  `npm run check` on it first. Since #204, the journeys' report is
  served at journeys.solid-memo.com from the repository
  solid-memo/journeys, which holds no code of its own: only the newest
  report, as Playwright writes it, and the page its traces open, from
  [e2e/journeys/report/trace/](../e2e/journeys/report/trace/) here
  ([deployment.md](deployment.md#the-journeys-report)). The fix for
  [GHSA-fhp3-h74x-mhrr](https://github.com/solid-memo/website/security/advisories/GHSA-fhp3-h74x-mhrr)
  was made in the advisory's private fork, merged to `main` from there
  (`05078e24`), as [releasing.md](releasing.md#what-each-stage-checks)
  describes, and released as 4.1.1 the usual way, so the site ran it
  only once it was public.
- MUST, met — the source of the policy in use is public. The SM-2 and
  FSRS-6 schedulers and the library's rules are in the repository
  ([policy.md](policy.md)).
- MUST, met — no sensitive information about users or third parties, and
  no secrets in the tree or its history. The maintainer's own email
  address is in 205 of the 222 published deck versions, by his choice,
  and in the code of conduct, as its contact
  ([privacy.md](privacy.md#what-the-project-has-published)). The other
  17 versions give the issue tracker as their contact and no email
  address. They include every version added since 2.1.1: the Korean
  phrases deck, the Korean at the Table course, new versions of the
  capitals decks, of HTTP status codes and of the Standard for Public
  Code course, and since 3.11.0 the famous movie quotes deck (#187) and
  the Swedish driving theory course (#195). Since 3.11.0, the Studio's
  release check for the library flags an email address too, and its
  release screen writes the contact (#166). Secret scanning and push
  protection are on ([GitHub settings](#github-settings)).
- SHOULD, partial — publish code not in use. The history, the pull
  requests, the old deck and shape versions, and every released version
  are public. Each release is tagged, 39 from 1.0.0 to 5.3.1, and its
  docs are served at `/docs/X.Y.Z/`
  ([deployment.md](deployment.md#each-releases-docs)). On 2026-10-22,
  `main` is the only branch on GitHub; every pull request's commits stay
  public with the pull request. The 17 leftover `pc/*` and `*-backup`
  branches are still only on the maintainer's machine. They are most
  likely copies of work already merged. Six other branches there hold
  commits that are on no public branch or pull request, four of them
  named `try-*`.
- OPTIONAL, met — the footer on every screen links to the About page,
  the docs, the source code, the commit, the changelog, the issue
  tracker and Discussions
  ([`Footer.tsx`](../packages/ui/src/ui/Footer.tsx),
  [configuration.md](configuration.md#vite_repo_url)).

### 2. Bundle policy and source code

- MUST, met — the policy is included. No public policy applies, and
  [policy.md](policy.md) says so. It lists the outside rules the code
  follows (SM-2, FSRS-6, the CLDR plural rules, BCP 47, NFC and DCAT-AP),
  with versions and links, and the project's own rules. FSRS-6 joined
  the list with the scheduler itself (#196). The Swedish driving theory
  course (#195) teaches traffic rules as deck content. The code does not
  carry them out, so they are not a policy the code is based on.
- MUST, met — no policy is based on source code, so there is none to
  include.
- SHOULD, met — policy in machine-readable formats. The project's own
  rules are SHACL shapes in [`ns/shapes/`](../ns/shapes/) and the
  library's checks: what a library deck version must state, in
  [`libraryRules.ts`](../packages/domain/src/release/libraryRules.ts),
  and what the repository's library asks, in `repoPolicy` in
  [`curationRules.ts`](../packages/domain/src/release/curationRules.ts).
  SM-2 and FSRS-6 are pure functions in `packages/domain`.
- SHOULD, met — CI checks the code against the policy. `sm2.test.ts`
  reads the table of [srs.md's worked examples](srs.md#worked-examples)
  from the page and checks the scheduler against every row, and
  `fsrs.test.ts` does the same with
  [the FSRS-6 worked examples](srs.md#fsrs-6-worked-examples), and checks
  fsrs-rs's published test vectors too. So a change to either one that
  the other does not match fails. And `npm run library:check` refuses a
  new deck version without a license or with the wrong contact. Since
  #180, it also refuses a deck whose newest version lacks a title, a
  description or keywords in any language the app speaks.

### 3. Make the codebase reusable and portable

- MUST, met — reusable in other contexts. A build reads its name, its
  repository, its Pod providers and its deck library from `VITE_`
  settings ([configuration.md](configuration.md)), and
  [reuse.md](reuse.md) explains how to run your own instance. Since
  releases began, the deploy on GitHub Pages deploys only released
  versions. So a fork that uses it releases its own, with a deploy key
  of its own ([releasing.md](releasing.md#the-deploy-key)), and serves
  the docs of its own releases. Since #227, the site deployed after a
  release is the one CI built and tested. So a fork that sets its own
  `VITE_` settings sets them on CI's build as well as on the deploy's
  ([configuration.md](configuration.md#setting-them)). Without its
  deploy key, as in a fork, the deploy publishes no journeys' report,
  and says so ([deployment.md](deployment.md#the-journeys-report)).
- MUST, met — no dependency on secret or proprietary software or
  services. The site is static, and every Solid server and identity
  provider it is tested with is open source. Their images are pinned by
  exact version and digest, so every run tests the same servers. The
  build draws the docs' diagrams in Chromium, which is open source, and
  `DOCS_DIAGRAMS=skip` builds without it
  ([configuration.md](configuration.md#docs_diagrams)). A weekly check
  reads the discovery documents of the Pod providers that onboarding
  suggests. It is not a gate, and the app needs none of these
  providers ([testing.md](testing.md#pod-providers)). The release and
  the deploy run on GitHub Actions, for this deployment only, and so
  do the copies of older releases' docs, the journeys' report, which
  goes out through the repository `solid-memo/journeys` (#204), and the
  weekly update of the taxonomy deck (#190). A build needs none of them.
  The taxonomy deck's script also runs by hand, with Python's standard
  library alone, and reads the taxonomy from a public API that serves it
  under CC0 1.0 ([deck-library.md](deck-library.md#the-taxonomy-deck)).
  The report's traces open in Playwright's own viewer, which is open
  source, at trace.playwright.dev (#208), or with
  `npx playwright show-trace` ([testing.md](testing.md#user-journeys)).
- SHOULD, not met — used by several parties.
- SHOULD, not met — a roadmap shaped by several parties.
  [ROADMAP.md](../ROADMAP.md) is public and says how to propose an item,
  but no other party has.
- SHOULD, not met — developed by several parties. Every commit on
  `main` is the maintainer's, Renovate's or the release's: 668, 65 and
  39 of the 772.
- SHOULD, met — configuration rather than code.
- SHOULD, met — localizable. The app speaks six languages, and card
  text in a language written right to left, such as the Arabic decks,
  keeps its own direction ([i18n.md](i18n.md)). Since #180,
  `npm run library:check` asks every language the app speaks of each
  library deck's newest version. The docs and the About page are in
  English only, by choice, and say so.
- SHOULD, partial — no situation-specific information. The app's name,
  its Pod providers and its repository links are settings: the footer's
  links and `index.html`'s links to the repository (its JSON-LD and its
  `noscript` source link) follow `VITE_REPO_URL`. Some things are still
  written for this deployment:
  - `index.html`'s absolute URLs on solid-memo.com (the canonical link,
    `og:url`, `og:image`, and the JSON-LD `url`, `@id` and `image`) and
    its description;
  - the About page, with its address and its links to this repository;
  - Solid Memo's wordmark and logo;
  - the screenshots of the app, which `npm run screenshots` takes again
    (#185);
  - `CNAME`, the domain the build writes `sitemap.xml` and `robots.txt`
    on;
  - `publiccode.yml`;
  - the README;
  - the docs, which the build publishes and which describe this
    deployment;
  - the journeys' report's address: the page at its old address,
    `/journeys/`, sends on to journeys.solid-memo.com, and the deploy
    workflow names that domain and the repository `solid-memo/journeys`
    (#204). The app, as it starts, also clears the service workers that
    only this deployment's old report left there (#207).

  [reuse.md](reuse.md#6-what-you-edit-by-hand) lists all but the last
  as files to edit by hand. The tree names no path on the maintainer's
  machine, but three old commits on `main` do, and the history keeps
  them.
- SHOULD, met — modules documented for reuse. Each package has a README
  that says what it exports and may import.
- SHOULD, met — no single-vendor platform. Any static host serves the
  site ([deployment.md](deployment.md)), and any Solid provider holds the
  data. Only this deployment's copies of older releases' docs, at
  `/docs/X.Y.Z/`, and its journeys' report need GitHub. Without them,
  `/docs/` is still served, and the app needs no report.

### 4. Welcome contributors

- MUST, met — anyone can suggest a change, in an issue, from one of the
  issue forms, or in a pull request from a fork, which CI runs on. Every
  public pull request, the maintainer's and Renovate's included, is
  merged through the merge queue in the same way (#76). The one
  exception so far is the fix for the advisory
  [GHSA-fhp3-h74x-mhrr](https://github.com/solid-memo/website/security/advisories/GHSA-fhp3-h74x-mhrr).
  It was made in private, as [SECURITY.md](../SECURITY.md) asks, in the
  advisory's private fork, and merged from that fork without the queue
  (`05078e24`, released in 4.1.1), as
  [docs/releasing.md](releasing.md#what-each-stage-checks) describes.
- MUST, met — contribution guidelines in [CONTRIBUTING.md](../CONTRIBUTING.md).
  Since 4.1.1, they also say that a security fix names its advisory
  instead of an issue.
- MUST, met — governance in [GOVERNANCE.md](../GOVERNANCE.md). It,
  `.github/CODEOWNERS` and CODE_OF_CONDUCT.md name the maintainer's
  own account, `@ixuz`. A decision exists only once it is written in an
  issue, a discussion or a pull request, including the messages of its
  commits (decision 13). It also says who holds the domain
  solid-memo.com, and that the domain is the project's one cost, paid by
  the maintainer (#161). Its merging rules do not yet name the merge
  from the advisory's private fork.
- SHOULD, met — who pays for reviews. Volunteers, in their own time,
  with no funding ([CONTRIBUTING.md](../CONTRIBUTING.md#review)).
- SHOULD, met — the engagement of organizations. GOVERNANCE.md says no
  organization is committed.
- SHOULD, met — a public roadmap in [ROADMAP.md](../ROADMAP.md). Its
  "Done recently" lists what came after 1.0.0, up to 3.10.1, such as the
  merge queue, the breaking-change check, the docs at `/docs/` and the
  Arabic and Korean decks (#165). It does not yet list the 14 releases
  since, 3.11.0 to 5.3.1. Two examples are FSRS-6 scheduling (#196) and
  the Swedish driving license B course (#195), both in 4.0.0.
- SHOULD, met — activity statistics. The README shows commit activity,
  the last commit and the contributors as badges, and links GitHub's
  pulse and activity graphs.
- OPTIONAL, met — a code of conduct: the Contributor Covenant 2.1, with a
  private email contact for reports.

### 5. Make contributing easy

- MUST, met — a public issue tracker, with forms for bugs, features,
  decks, translations and interop reports. Blank issues are off, so
  every issue starts from a form. The app's footer links to the forms,
  since 3.7.0 a card from a library deck links to the deck form to
  report a mistake in it (#152), and since 3.10.0 the crash screen
  links to a bug report (#158). Each page of the docs the site serves
  links to the forms too.
- MUST, met — the README links to the issues and the pull requests.
- MUST, met — communication channels. The README, CONTRIBUTING.md,
  the issue forms and, since 2.2.0, the app's footer (#113) send
  questions to Discussions, which are on. The project talks only in
  public and in writing: issues, Discussions, pull requests and commit
  messages, with no chat and no calls, and only security and code of
  conduct reports are private (decision 13,
  [GOVERNANCE.md](../GOVERNANCE.md#where-the-project-talks)).
- MUST, met — a closed channel for vulnerability reports.
  [SECURITY.md](../SECURITY.md) points to GitHub's private vulnerability
  reporting, which is on, and so does the page where a new issue starts.
  A reporter needs a GitHub account. The channel has been used: two
  advisories were handled in private and published on 2026-10-20, after
  the releases that fixed them.
  [GHSA-fhp3-h74x-mhrr](https://github.com/solid-memo/website/security/advisories/GHSA-fhp3-h74x-mhrr)
  (high) was fixed in a private fork and merged as `05078e24`, in
  4.1.1, and
  [GHSA-jff6-f2jv-4w6p](https://github.com/solid-memo/website/security/advisories/GHSA-jff6-f2jv-4w6p)
  (moderate) was fixed by #207 and #208 and released in 4.2.0. Each
  fix's commits name its advisory.
- MUST, met — instructions for reporting a vulnerability, in
  SECURITY.md. Since `05078e24`, CONTRIBUTING.md also says that a
  security fix made in private names its advisory instead of an issue
  (`Refs: GHSA-xxxx-xxxx-xxxx`).

### 6. Maintain version control

- MUST, met — every file is in Git.
- MUST, partial — decisions in commit messages. Of the 772 commits on
  `main` at `c1301d9c`, 191 have no body once their trailers are left
  out, so they record no reason. A merge commit whose message adds only
  its pull request's title counts as one with none. 96 of them are from
  before 1.0.0 (`d5d13c84`): 88 commits and eight merge commits. Since
  1.0.0, 95 of the 365 commits have none, and all 95 are merge commits:
  93 merges of pull requests, whose message names the pull request whose
  description says why; one merge of `main` into a branch (`094e64be`),
  which CI now refuses; and the merge of the security fix from a private
  fork (`05078e24`), whose four commits each say why. Since 3.11.0, 36
  of the 142 commits have none, all merge commits. The assessment of
  2026-10-18 counted 113, 22 and 10: it took a pull request's title with
  no scope, such as `docs: ...`, for a trailer, so it counted some merge
  commits and not others. Counted the same way for all, `main` at
  `befdae42` had 156 of 634, and 60 of the 227 since 1.0.0. Every other
  commit since 1.0.0 has a body: CONTRIBUTING.md asks for one that says
  why, Renovate's commits carry one (`commitBody` in `renovate.json5`):
  each update, from what version to what, where, its source and release
  notes, and why; and each release commit carries its changelog. From
  1.0.0 on, every commit but the merge commits follows Conventional
  Commits, so its type records what kind of decision it was. Since
  2026-10-15, CI's `commits` job checks with commitlint that every
  commit of a pull request has a body, and refuses a pull request with a
  merge commit, which commitlint skips. The history cannot change, so
  this stays partial; the maintainer decided that it applies from 1.x
  (decision 12).
- MUST, partial — commit messages link to issues and discussions. Of the
  772 commits, 341 link an issue or a pull request; since 1.0.0, 327 of
  365 do, since the commit checks landed (#92), 286 of 305, and since
  3.11.0, 127 of 142. Six more since #92 name a GitHub security advisory
  instead, since no public issue may describe a fix before it is
  deployed ([SECURITY.md](../SECURITY.md)): the four commits merged from
  a private fork for
  [GHSA-fhp3-h74x-mhrr](https://github.com/solid-memo/website/security/advisories/GHSA-fhp3-h74x-mhrr),
  and the two for
  [GHSA-jff6-f2jv-4w6p](https://github.com/solid-memo/website/security/advisories/GHSA-jff6-f2jv-4w6p)
  (#207, #208). With them, 333 of the 365 since 1.0.0 link their
  discussion, and 292 of the 305 since #92. Of the 13 since #92 that
  link nothing, ten are Renovate's, two are release commits (4.1.1 and
  4.1.3) whose changelog names only the security fixes' commits, and one
  is the merge from the private fork (`05078e24`). That merge reached
  `main` through a ruleset bypass with no pull request
  ([releasing.md](releasing.md)), so the `commits` job, which lints only
  a pull request's commits, never checked it. Of the 32 since 1.0.0 that
  link nothing, 18 are Renovate's, four are release commits, seven are
  the Arabic decks and one the fix released as 1.0.1, rebased onto
  `main` before every pull request was merged with a merge commit, one
  is the merge of `main` into a branch, and one the merge from the
  private fork. CONTRIBUTING.md asks for a `Closes: #NN` footer, and
  CI's `commits` job checks with commitlint that every commit of a pull
  request names an issue, a pull request or a discussion by its number,
  or, for a security fix, its advisory (`Refs: GHSA-xxxx-xxxx-xxxx`),
  and that the pull request closes its issue (`npm run check:closes`).
  Renovate's updates, which cannot name their pull request, carry the
  `Why:` line of their `commitBody` instead, and their merge commit
  names the pull request. The merge queue merges every pull request with
  a merge commit, which names it. Older commits on `main` link nothing,
  and the history cannot change; this too applies from 1.x (decision
  12). It was not met on 2026-10-13, when no commit had such a footer.
- SHOULD, met — a distributed version control system: Git.
- SHOULD, met — guidelines ask for one logical change per commit.
- SHOULD, met — released versions marked. semantic-release tags each
  version `vX.Y.Z` and makes a GitHub release of it: `v1.0.0` to
  `v5.3.1`, 39 so far. [releasing.md](releasing.md) sets up the ruleset
  "version tags", which restricts their creation, update and deletion.
- SHOULD, met — diff-friendly formats. CONTRIBUTING.md asks for text
  formats, and `.gitattributes` fixes the line endings.
- OPTIONAL, partial — signed commits and an email address. Every commit
  has an author's email address. The commits GitHub makes, most merge
  commits and most of Renovate's, carry its signature, but the
  maintainer's own commits and the release commits are not signed.

### 7. Require review of contributions

- MUST, not met — every contribution reviewed by someone other than its
  author. The maintainer merges his own pull requests without review, a
  temporary exception that GOVERNANCE.md states, and Renovate merges its
  own once CI passes, with no person reviewing them. Of the 106 pull
  requests merged since `90652c08`, 86 are the maintainer's and none of
  them has a review by a person; one, #96, is CodeQL's suggested fix,
  which the maintainer opened. The other 20 are Renovate's, and only #55
  has an approval, from the maintainer. The 34 merged since the last
  assessment, at `befdae42` (#177), #174 to #230, are 28 of the
  maintainer's and 6 of Renovate's, and none has a review by a person;
  the only reviews are CodeQL's comments on #175, #208 and #227. The fix
  for
  [GHSA-fhp3-h74x-mhrr](https://github.com/solid-memo/website/security/advisories/GHSA-fhp3-h74x-mhrr)
  (`05078e24`) reached `main` from the advisory's private fork, with no
  pull request in the repository and outside the merge queue
  ([releasing.md](releasing.md#what-each-stage-checks)), and no review
  by anyone else is on record. The release commit reaches `main` with no
  pull request: the release workflow pushes it from the `release`
  environment, which allows only `main`, and it holds only what
  semantic-release writes from commits already merged, reviewed or not.
  A decided gap while there is one maintainer (decision 12).
- MUST, partial — reviews cover the source, the policy, the tests and
  the docs. CONTRIBUTING.md and the pull request template say so, but no
  one other than the author has reviewed a change yet, so there is no
  review to check. A decided gap, as above.
- MUST, met — a written reason for every declined contribution.
  GOVERNANCE.md and CONTRIBUTING.md require one, and decision 13 keeps
  it public. Since 2026-10-13, one pull request has been closed without
  a merge: #229, the maintainer's own, which he closed on 2026-10-21
  with the reason that `e3269265`, merged with #227, already fixed it.
- SHOULD, met — review checks the standards, the architecture and the
  decisions. The template's checklist covers them for the author,
  CONTRIBUTING.md's review checklist for the reviewer, and
  `npm run check:boundaries` enforces the import rules. Since 2.0.0, CI
  also runs `npm run check:breaking`, which fails a change to
  [the public API](releasing.md#the-public-api) that no commit calls
  breaking, and the template asks whether a change breaks it.
- SHOULD, partial — review runs the software and the tests. CI runs
  every test that gates a change on every pull request, a fork's too,
  and again in the merge queue, on top of `main`
  ([testing.md](testing.md#the-merge-queue)), and the reviewer's
  checklist says to try a change users see in the app, but there is no
  reviewer yet to do it.
- SHOULD, not met — a reviewer from a different context.
- SHOULD, not met — no unreviewed changes on `main`. The ruleset
  requires a pull request, `ci-ok` and the merge queue, but no approval,
  so the maintainer's own pull requests and the ones Renovate merges on
  its own reach `main` unreviewed, and so did the advisory's fix, which
  skipped the queue. Renovate proposes a version only once it has been
  public for 3 days, so a bad one can be pulled first, but that wait is
  not a review.
- SHOULD, not met — review within two business days. It is a stated
  target, but one volunteer cannot assure it, and nothing measures it.
- OPTIONAL, not met — review by several reviewers.

### 8. Document codebase objectives

- MUST, met — [objectives.md](objectives.md) states the mission, the
  goals and who the app is for. Since 4.0.0 (#196), its first goal
  names FSRS-6, which a new instance starts on, beside SM-2.
- SHOULD, met — objectives.md links each principle to the check that
  enforces it, now with `fsrs.test.ts` for the FSRS-6 scheduler, and
  [policy.md](policy.md) to the rules behind them, FSRS-6 among them
  since #196.
- OPTIONAL, met — the about page explains the project to the public.
  The app's footer links it since 3.8.0, and it links the docs, which
  the site publishes at `/docs/` since 3.3.0, objectives.md among
  them (#129, #153).

### 9. Document the code

- MUST, met — all functionality described, for learners in
  [user-guide.md](user-guide.md) and for developers in the topic pages.
  What came since 3.11.0 came with it, such as FSRS-6 and its
  invitation, the colors, the text size and a palette of one's own, the
  welcome back, the decks to confirm and the Studio's graph. The site
  serves these docs as pages at `/docs/`, which the footer, the about
  page, the site's page without script and `publiccode.yml` link to.
- MUST, met — how to install and run, in the README.
- MUST, met — examples of the key functionality: the user guide and the
  [user journeys](https://journeys.solid-memo.com/) report.
- SHOULD, met — an overview for a wide audience: the README's "About"
  and the about page.
- SHOULD, met — how to run a standalone copy: the README's "Run it on its
  own", [reuse.md](reuse.md), and guest mode as a test dataset that needs
  no Pod.
- SHOULD, partial — examples for all functionality.
  [markdown.md](markdown.md), [boundaries.md](boundaries.md) and
  [deck-library.md](deck-library.md) have them. The
  [user guide](user-guide.md) has worked examples for guest mode, the
  theme, the colors and the text size, a palette of one's own, a second
  instance, and exporting and importing a deck file, and its table of
  journeys names the steps that show each. Switching to FSRS-6, the
  welcome back, the Studio's graph and a deck's own statistics each
  have a journey, as do undoing an answer, resetting the day, reporting
  a mistake, updating a library copy, a deck's link and the error
  screen. Attaching an instance by its address and confirming a deck's
  documents now have journeys too, in `pod-safety.journey.ts`, but the
  guide's table does not name that file. A release's themes and
  "Findable by other apps" have neither a journey nor a worked example,
  and no journey shows text written right to left.
- SHOULD, met — the components and their relations, in
  [architecture.md](architecture.md).
- SHOULD, met — CI checks the docs: markdownlint, cspell, lychee and the
  docs' index, [docs.ttl](docs.ttl), which `check:docs` holds to every
  page ([testing.md](testing.md#documentation)).

### 10. Use plain English

- MUST, met — the authoritative languages are documented: English only
  (the README, [style.md](style.md#language),
  [CONTRIBUTING.md](../CONTRIBUTING.md#language)).
- MUST, met — English is one of them.
- MUST, met — the docs are up to date in English, the one authoritative
  language. What landed since 3.11.0 came with its docs: FSRS-6 beside
  SM-2 (#196, [srs.md](srs.md#fsrs-6), [policy.md](policy.md#fsrs-6)
  and the glossary), the Studio's graph of what Solid Memo keeps in the
  instance (#197, [studio.md](studio.md#graph)), the journeys' report on
  a site of its own, with its traces opened at `trace.playwright.dev`
  (#204, #208, [deployment.md](deployment.md#the-journeys-report)), the
  workflows' lint (#178, [testing.md](testing.md#the-workflows)),
  `check:exports` (#175,
  [testing.md](testing.md#the-repositorys-own-checks)), the rule that a
  library deck speaks every app language (#180,
  [deck-library.md](deck-library.md#checks), [i18n.md](i18n.md)), the
  palettes' contrast (#220, [accessibility.md](accessibility.md#the-target))
  and how a security fix names its advisory
  ([CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages)). The
  [journeys' README](../e2e/journeys/README.md) matches the browsers
  `playwright.config.ts` runs. This page was the one behind: it still
  named `befdae42` and 3.11.0. This update fixes that.
- MUST, met — the source code is in English. Swedish text is deck data
  in `decks/`, and the Swedish names the taxonomy deck comes from are
  explained in [deck-library.md](deck-library.md#the-taxonomy-deck).
- MUST, met — the bundled policy is in English, its FSRS-6 section
  included.
- SHOULD, met — terms explained. [glossary.md](glossary.md) covers the
  code's and the tools' terms, such as CI, SPDX, REUSE, npm, ports and
  adapters, Conventional Commits, commitlint, semantic-release, SemVer,
  deploy keys and environments, DOI, ACR, WCAG and the EU data themes,
  such as `EDUC`, and now FSRS-6 and SM-2, FSRS-6's stability,
  difficulty, retrievability and desired retention, the scheduler and
  the pod fence. The README and CONTRIBUTING.md link the glossary. Other
  terms are explained or linked where they are used, such as the merge
  queue ([testing.md](testing.md#the-merge-queue)), Zenodo
  ([releasing.md](releasing.md)), axe
  ([accessibility.md](accessibility.md)), CodeQL
  ([testing.md](testing.md#code-scanning)), actionlint and zizmor
  ([testing.md](testing.md#the-workflows)), the trace viewer
  ([deployment.md](deployment.md#the-journeys-report)) and a GitHub
  security advisory, `GHSA-…`
  ([CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages)).
- SHOULD, met — a plain reading level. Long pages open with a plain
  summary, and style.md asks for short sentences and everyday words. The
  technical pages are above that level, for their own readers.
- OPTIONAL, met — courtesy translations. The app's messages are in
  Swedish, Korean, German, Spanish and French too. Library decks carry
  their titles, descriptions and keywords in all six, and since #180
  `npm run library:check` holds each deck's newest version to that
  ([deck-library.md](deck-library.md#checks)). The README says English
  is the authoritative language, and [i18n.md](i18n.md#translations)
  says English is the source and how each translation was made. The
  docs are in English only.

### 11. Use open standards

- MUST, met — data is exchanged in open standards: the Solid Protocol,
  RDF, SHACL, DCAT, SKOS and the rest ([standards.md](standards.md)).
  What came since 3.11.0 keeps to them. FSRS-6 review states (#196, in
  4.0.0) and palettes of one's own (#212, in 5.0.0) are Turtle in the
  pod, checked by their own shapes. A palette's colors are written
  `#rrggbb`, as CSS Color writes them
  ([theme.md](theme.md#where-a-palette-of-ones-own-is-kept)). The
  taxonomy deck's script (#190) reads the JobTech taxonomy API by
  GraphQL, which answers in JSON. All of these are open specifications.
- MUST, met — the status of each standard is recorded. standards.md
  marks the drafts and de facto specifications, and every specification
  used is open to read and to implement. Since #196, it also names
  FSRS-6 as an algorithm, not a standard, like SM-2.
- MUST, not met — every standard is listed with a link. The branch
  `public-code-followup` added vCard, the SPDX terms and license list,
  CSV, WCAG and the repository's own conventions, such as REUSE,
  `publiccode.yml` and Semantic Versioning. The Arabic decks (1.1.0)
  brought text written right to left, which the app isolates by the
  Unicode Bidirectional Algorithm (U+2068 and U+2069 in a message, and
  `unicode-bidi: isolate` in the style sheet); the branch
  `standards-list` (#91) listed it, with CSS Writing Modes, Unicode
  Text Segmentation and the Collation Algorithm, which the app already
  relied on. The docs served at `/docs/` (#129, in 3.3.0) brought SVG,
  for the diagrams the build draws, and listed it with WOFF, for the
  font embedded in them and the app's own fonts. Since #160, WCAG 2.2
  at level AA is the target of the app and the Studio, and the journeys
  check each screen they visit with axe
  ([accessibility.md](accessibility.md#the-target)). Since 3.11.0, the
  list has not kept up. It lacks CSS Color, whose `#rrggbb` the color
  set's shape requires of every color in a palette in the pod
  (`ns/shapes/color-set/v1.ttl`, #212). It also lacks GraphQL and JSON
  (RFC 8259), by which
  [`scripts/taxonomy_deck.py`](../scripts/taxonomy_deck.py) reads the
  taxonomy every week (#190). The SVG row names only the docs'
  diagrams, but the Studio's graph of the pod (#197) is drawn in SVG
  too, as the statistics charts already were.
- MUST, met — the drafts and de facto ones do not hinder reuse, and
  standards.md says why. FSRS-6 is published openly, with a reference
  implementation under BSD-3-Clause. A review state says which
  scheduler wrote it, so SM-2 and FSRS-6 are kept side by side.
- SHOULD, met — where no standard existed, the project publishes its own
  open vocabulary and shapes in `ns/`. Since 3.11.0, the vocabulary has
  gone from 1.20 to 1.23, and three shape families are new: the FSRS
  review state, the palette and the color set. Since 2.0.0,
  `api/frozen/` and `npm run check:breaking` keep a published shape or
  term from being taken back. The frozen list now holds 50 published
  files, up from 44, among them 44 of the project's shapes, up from 38
  ([releasing.md](releasing.md#the-public-api)).
- SHOULD, met — machine-testable standards preferred: data is checked
  against SHACL shapes, by two engines in CI. The new shapes have valid
  and invalid fixtures in `packages/vocab/fixtures/`.
- SHOULD, met — no non-open standard is used, so there is none to
  prefer.

### 12. Use continuous integration

- MUST, met — all functionality has automated tests, at 100% coverage
  in every package ([testing.md](testing.md#coverage-policy)). The docs'
  build in `packages/markdown/tooling/` is in its package's coverage.
  The scripts are covered too (`npm run check:scripts`), the three new
  since 3.11.0 (`checkExports.ts`, `ciGate.ts` and `siteVersion.ts`)
  included. Since #175, `npm run check:exports` finds an export only
  tests use, so no code only tests use is kept for the coverage to
  count. The two Python scripts, `shacl_crosscheck.py` and the taxonomy
  deck's generator `taxonomy_deck.py` (#190), have tests of their own,
  which CI's `crosscheck` job runs before the cross-check
  ([testing.md](testing.md)). No tool measures their coverage (below).
- MUST, partial — contributions pass all tests before they are merged,
  with one exception since 3.11.0. CI runs on every pull request, in the
  merge queue and on every push to `main`. Its jobs are `gate`, `check`,
  `site` (the build, made once a run, that the journeys run on and the
  deploy ships, #227), `library` (the deck library and the public API
  compared with the change's base), `crosscheck`, `pod`, `contract`,
  `journeys` (five jobs: every journey in Chromium, in two shards, and
  those that differ most between engines in Firefox, WebKit and on a
  phone, with axe's accessibility checks), `docs`, `workflows`
  (actionlint and zizmor over the workflows) and `commits` (commitlint
  and the closing keyword, on a pull request's commits), and `ci-ok`
  passes only when they all did. A tree is tested once: a push to
  `main` the merge queue passed reuses the queue's run, and a release
  commit reuses its parent's, with its own files linted by
  `release-files`; then `ci-ok` passes only when the reuse did
  ([releasing.md](releasing.md#what-each-stage-checks)). The ruleset
  requires `ci-ok`, on the pull request and again in the merge queue, on
  top of `main` and the pull requests ahead of it. One change did not go
  that way: the fix for
  [GHSA-fhp3-h74x-mhrr](https://github.com/solid-memo/website/security/advisories/GHSA-fhp3-h74x-mhrr)
  reached `main` as `05078e24` from the advisory's private fork, where
  Actions do not run. CI first ran on it on `main`, every job, and a
  release follows such a run only once it passes, so 4.1.1 waited for
  it. But no test gated the merge itself, and
  [releasing.md](releasing.md#what-each-stage-checks) ("Know when a
  change skipped the queue") allows that path for a merge through a
  ruleset bypass. The interop workflow's advisory servers report and do
  not gate, by design ([testing.md](testing.md)). CodeQL also scans pull
  requests from the repository's own branches, not from forks
  ([testing.md](testing.md#code-scanning)); it does not gate a merge.
- MUST, met — guidelines for structuring contributions in
  CONTRIBUTING.md and the pull request template. CONTRIBUTING.md also
  says how a security fix names its advisory instead of an issue.
- MUST, met — an active contributor who reviews contributions: the
  maintainer, with 39 releases from 1.0.0 to 5.3.1 since 2026-10-13,
  13 of them since 3.11.0, and 35 pull requests merged since 3.11.0,
  29 of them his and 6 Renovate's. One person is a thin margin, as
  criterion 7 shows.
- SHOULD, met — test results are public, for a fork's pull request too.
  The journeys' report of `main`, every browser's in one (#193), is
  published at [journeys.solid-memo.com](https://journeys.solid-memo.com/)
  (#204, [deployment.md](deployment.md#the-journeys-report)).
- SHOULD, met — one issue per pull request, as CONTRIBUTING.md and the
  pull request template ask, and `npm run check:closes` checks that a
  pull request closes its issue, or, for a security fix, names its
  advisory.
- SHOULD, partial — coverage monitored. Each package's test coverage is
  in the CI run's summary, and `npm run check:docs` checks that every
  page in `docs/` is in [the docs' index](docs.ttl). Nothing measures
  the docs' coverage: every package, app and end-to-end suite has a
  README today, but no check holds it, and nothing checks that every
  export has a comment. Nothing measures the Python scripts' test
  coverage either.
- OPTIONAL, partial — the policy and the docs tested against the code.
  The generated vocabulary, the vendored packages' list, the SM-2 and
  FSRS-6 tables
  and, since 2.0.0, the public API in `api/` are checked: a test writes
  each of its files from the code and fails when they disagree
  ([api/README.md](../api/README.md)). Since 2.1.1, the built site's
  test also checks that every address publiccode.yml names on the
  site's domain is a page the build serves, and since #177,
  `npm run check:docs` fails on an `npm run` in the Markdown that names
  no script. standards.md, the answers
  CSV's columns in statistics.md and testing.md's list of CI jobs are
  not.
- OPTIONAL, met — the docs tested for style and broken links:
  markdownlint, cspell and lychee.
- OPTIONAL, partial — the software tested with the docs' examples.
  `sm2.test.ts` and `fsrs.test.ts` check the schedulers against
  srs.md's worked examples; the Turtle examples in the docs are not
  checked.

### 13. Publish with an open license

- MUST, met — the code and docs are under the MIT License. The decks
  carry their own open licenses: CC0, CC BY or CC BY-SA. One deck,
  `famous-movie-quotes` (#187), quotes short lines from films: CC0
  covers the deck's own work, and `REUSE.toml` states that the quoted
  lines stay their rights holders'. That is deck content, not code or
  docs.
- MUST, met — MIT is approved by the OSI.
- MUST, met — a license file, and every license's text in `LICENSES/`.
- MUST, met — no copyright transfer and no contributor license
  agreement ([CONTRIBUTING.md](../CONTRIBUTING.md#licensing)).
- SHOULD, met — machine-readable notices in every file. The repository
  follows REUSE, and the `docs` job, which `ci-ok` needs, runs
  `reuse lint` ([style.md](style.md#licenses)), at the version pinned in
  `scripts/requirements-lint.txt` (#178); it passes at `c1301d9c`, for
  all 1,892 files, the public API's files in `api/` included.
  `npm run check:reuse` checks that each deck is listed under the
  license it states.
- OPTIONAL, met — several licenses: MIT for the code and the docs, and
  each deck's own license.

### 14. Make the codebase findable

- SHOULD, not met — a descriptive name. The project is "Solid Memo", but
  the repository is still called `website`, by choice.
- SHOULD, met — a short description, on the repository, in
  `package.json` and in `publiccode.yml`.
- SHOULD, not met — submitted to software catalogs. The Solid apps list
  on solidproject.org does not name it yet.
- SHOULD, met — a website that explains the problem for different
  readers: [solid-memo.com/about](https://solid-memo.com/about/), with
  sections for learners, deck authors, technologists and decision
  makers. It is in the site's `sitemap.xml`, with each page of the docs
  at `/docs/`.
- SHOULD, not met — findable by name in a search engine. A web search
  for "Solid Memo" on 2026-10-22 did not find the project, and
  registering the site with search engines is still an open action.
- SHOULD, not met — findable by the problem it solves. A web search for
  spaced-repetition flashcards kept in a Solid pod, on 2026-10-22, did
  not find it either.
- SHOULD, met — a persistent identifier whose entry names the major
  contributors, the repository and the website. Zenodo archives each
  GitHub release and gives it a DOI; the concept DOI,
  [10.5281/zenodo.23351087](https://doi.org/10.5281/zenodo.23351087),
  is in `CITATION.cff` and the README, and holds 37 versions. Zenodo
  does not take `CITATION.cff`'s `url`, so `.zenodo.json` lists the
  website (#165), and 3.11.0 is the first release that carries it
  ([releasing.md](releasing.md#what-a-release-does)). The entries of the
  14 releases from 3.11.0 to 5.3.1 name the author, the repository and
  solid-memo.com; the entries of earlier versions name the website
  nowhere. Software Heritage also keeps a copy of the code (#131), and
  its entry names the repository alone. Its latest copy is from
  2026-10-16, of 3.3.0.
- SHOULD, met — machine-readable metadata: `publiccode.yml`, checked in
  CI, whose `documentation` is the docs on the site, `CITATION.cff`,
  and `.zenodo.json`, which Zenodo reads from each release. The three
  are meant to say the same, but `.zenodo.json` still names SM-2 as the
  only scheduler: #196 added FSRS-6 to the other two, so Zenodo's
  entries from 4.0.0 on describe the scheduler as SM-2 alone.
- OPTIONAL, met — a domain of its own, solid-memo.com. The
  vocabulary, the shapes and the decks live under it, so the data in
  people's pods depends on it. Its risk is renewal: the maintainer
  registers it and pays for it, one year at a time. GOVERNANCE.md says
  who holds it, where its expiry is public, and that it stays renewed
  for at least 3 years if the repository is archived
  ([GOVERNANCE.md](../GOVERNANCE.md#the-domain)).
- OPTIONAL, not met — regular talks at conferences.

### 15. Use a coherent style

- MUST, met — a style guide, [style.md](style.md).
- SHOULD, met — style checked automatically: Biome, the Turtle
  formatter, markdownlint and cspell, in `npm run check` and CI, whose
  `ci-ok` check `main` requires. Since #139, Biome's lint also fails on
  modules that import each other in a circle, and on a function too
  complex to follow; #183 lowered that limit from 87 to 75, splitting up
  the functions over it. Since #160, a rule is turned off only for the
  files its reason names ([style.md](style.md#formatting)). Since #178,
  CI's `workflows` job, which `ci-ok` needs, lints the workflows:
  actionlint checks their syntax and shell, zizmor their security
  ([testing.md](testing.md#the-workflows)).
- SHOULD, met — rules for comments and docs, in style.md.
- OPTIONAL, met — rules for understandable English, in style.md.

### 16. Document codebase maturity

- MUST, met — versioned. semantic-release releases a version after CI
  passes on `main`: 39 so far, 1.0.0 to 5.3.1, each with its tag and
  its GitHub release. The site runs only the newest released version,
  and the footer shows which. Since 3.3.0 (#129), the docs of each
  release whose GitHub release carries them stay at `/docs/X.Y.Z/`
  ([deployment.md](deployment.md#each-releases-docs)). 2.0.0 was a
  major version by mistake: no commit in it breaks anything, but
  semantic-release read a line in a commit's body as a breaking change.
  [releasing.md](releasing.md) says so, and the release now counts only
  a `BREAKING CHANGE:` footer as written (#84, in 2.0.1). 3.0.0, 4.0.0
  and 5.0.0 are major versions for real breaks: the app writes cards in
  card format 6 (#119), preferences in format 5 and deck schedules in
  format 2 for FSRS-6 (#196), and preferences in format 6 for the
  palettes and the text size (#212). Each commit is marked with `!` and
  a `BREAKING CHANGE:` footer, and the changelog says what each version
  breaks.
- MUST, met — maturity stated. The README, the about page and
  `publiccode.yml` (`developmentStatus: stable`) say the app is stable
  from 1.0.0, its first version, and the releases page lists each
  version once it is released. No version before 1.0.0 was released,
  so the footer shows no version the docs disown.
- MUST, partial — a version ready to use depends only on versions ready
  to use. 1.0.0 is declared ready, and `npm run check` refuses a
  prerelease or 0.x dependency of the app, but four are allowed, each
  with its reason in [vendor-code.md](vendor-code.md#maturity):
  `rdf-validate-shacl` 0.6 and `rdf-validate-datatype` 0.2, the SHACL
  engine the app uses, `@inrupt/solid-client-errors` 0.0, released with
  `@inrupt/solid-client` 4, and `process` 0.11, final at 0.11 by its
  maintainer's choice. A decided gap (decision 14). The app at 5.3.1
  ships the same four as at 3.11.0, and no other. Mermaid, which draws
  the docs' diagrams at build time, brings packages before 1.0.0 too,
  but none of them is shipped, so the gap does not grow. While the app
  was in beta, no version was declared ready, and this held.
- SHOULD, met — a summary of changes, in [CHANGELOG.md](../CHANGELOG.md):
  semantic-release writes each version's entry from the commits, and a
  section written by hand sums up what 1.0.0 contains. Since 2.1.0, the
  footer on every screen links to it. The 5.0.0 entry links two issues
  that do not exist, `#rrggbb`, which semantic-release read from a
  commit's body as references.
- SHOULD, met — the version scheme, in [releasing.md](releasing.md),
  with [the public API](releasing.md#the-public-api) a version promises
  and what counts as breaking for data in pods.
- OPTIONAL, met — Semantic Versioning, from 1.0.0. Since 2.0.0, CI
  fails a change to the public API that no commit calls breaking. 2.0.0
  itself raised the major version with nothing broken, which Semantic
  Versioning allows; 3.0.0, 4.0.0 and 5.0.0 raised it for real breaks in
  the data the app writes.

## Decisions made

The maintainer made these choices. Each is recorded where it applies.

1. **Governance.** One maintainer decides, in public, and gives reasons.
   A regular contributor can be invited as a co-maintainer. If the
   maintainer steps away, he hands the organization and the domain to
   a co-maintainer, or the repository is archived and the domain stays
   renewed for at least 3 years ([GOVERNANCE.md](../GOVERNANCE.md)).
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
7. **Maturity and versions** (2026-10-13, replacing "beta, Semantic
   Versioning at 0.x, tagged by hand, with a changelog in the Keep a
   Changelog format"). Every commit follows Conventional Commits 1.0.0,
   Renovate's included, checked by commitlint in CI. semantic-release
   releases a version on every push to `main` that has a releasable
   commit, once CI has passed: it commits the version and the changelog
   back to `main` with a deploy key that the ruleset lets bypass its
   pull request, tags the commit and makes a GitHub release, from which
   Zenodo mints a DOI. The first version is 1.0.0, and stable; 0.1.0 is
   never tagged ([releasing.md](releasing.md),
   [CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages)). Only a
   released version is deployed: deploy.yml deploys the commit a version
   tag names ([deployment.md](deployment.md)).
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
12. **Criteria 6 and 7 with one maintainer** (2026-10-13). Decisions in
    commit messages (6.2) and links to issues (6.3) apply from 1.x: the
    commits before 1.0.0 stay as they are. Review by another contributor
    (7.1), and reviews that cover the source, the policy, the tests and
    the docs (7.2), are recorded as gaps while the project has one
    maintainer.
13. **Open, written communication** (2026-10-15). All collaboration,
    maintenance, decisions and discussion happen openly and in writing,
    in issues, Discussions, pull requests and their reviews, and commit
    messages, so every decision and its reasons can be found and linked
    later. The project runs and endorses no chat, direct messages, or
    voice or video calls or meetings. Something said elsewhere counts
    for nothing until it is written up in public, and a maintainer
    points such a message to the public channel. This binds the
    maintainers between themselves too. The two exceptions are private
    but still written: security vulnerabilities, in a private advisory
    made public once the fix is deployed, and code of conduct reports,
    by email or through GitHub's Report abuse
    ([GOVERNANCE.md](../GOVERNANCE.md#where-the-project-talks)).
14. **Dependencies before 1.0.0** (2026-10-15). Solid Memo is stable
    within an ecosystem that is not yet at 1.0: the Solid Protocol and
    Solid-OIDC are drafts, and the libraries around them are 0.x. The
    dependencies before 1.0.0 that
    [vendor-code.md](vendor-code.md#maturity) allows stay, each with its
    reason, and criterion 16's MUST on dependencies ready to use is a
    recorded gap until they reach 1.0.0 or a ready replacement exists. A
    new dependency before 1.0.0 is still refused unless it is added there
    with its reason.

Whatever is decided later:

- Deck attribution stays "Compiled by Anton Wiklund with the help of AI".
  No contribution or review text may say or imply that the maintainer
  reviews decks.
- Published `decks/*/vN.ttl`, `ns/shapes/*/vN.ttl` and `ns/vocab/vN.ttl`
  files are never edited. A change ships as a new version.

## What remains

Each item below starts with its state: **Done.** when it has landed,
**Open.** when it has not.

### GitHub settings (admin)

Only an admin of the repository can change these. All are done:

- **Done.** **Private vulnerability reporting.** On, and its exclusion is gone
  from `lychee.toml`. Two security advisories are published (above).
  *(5)*
- **Done.** **Secret scanning and push protection.** Both on. *(1)*
- **Done.** **Discussions.** On, and their exclusion is gone from
  `lychee.toml`. *(5)*
- **Done.** **Topics and description.** The description and homepage are kept,
  and topics are added. *(14)*
- **Done.** **Labels.** `deck`, `interop` and `i18n` exist, for the deck,
  interop and translation forms.
- **Done.** **The ruleset on `main`** (24560297). It requires `ci-ok`, and its
  bypass list names only "Deploy keys", for the release, so Renovate
  has no bypass. *(7, 12)*
- **Done.** **Allow auto-merge.** On, so Renovate can add its pull requests to
  the merge queue once `ci-ok` passes.
- **Done.** **The merge queue on `main`.** The ruleset on `main` requires the
  merge queue, merging with merge commits, and no longer requires
  branches to be up to date (#76). *(7, 12)*
- **Done.** **The `github-pages` environment.** `main` is its only deployment
  branch. The deploy runs from `main` even when it deploys a version's
  tag, so this still holds. *(1, 12)*
- **Done.** **The `journeys` environment** (#204). `main` is its only
  deployment branch, and the deploy reads from it the key that
  publishes the journeys' report to [solid-memo/journeys](https://github.com/solid-memo/journeys),
  as [deployment.md](deployment.md#the-journeys-report) says. *(1, 12)*

### Actions for the maintainer

- **Done.** **The blame-ignore list.** The branch `standard-for-public-code`
  was merged with a merge commit (pull request #37), so the reformat's
  SHA in `.git-blame-ignore-revs` (`7646413`, "Reformat the code with
  Biome") names a commit on `main` ([style.md](style.md#formatting)).
  *(15)*
- **Done.** **Zenodo.** Connected to the repository, so each GitHub release
  gets a DOI. *(14)*
- **Done.** **The release's deploy key**, before the branch
  `semantic-release` is merged. Make an SSH key pair, add its public
  key as a deploy key with write access, its private key as the
  repository secret `SEMANTIC_RELEASE_KEY` (to be moved into the
  `release` environment, below), and "Deploy keys" to the bypass list
  of the ruleset on `main`, as
  [releasing.md](releasing.md#the-deploy-key) says. *(1, 6, 16)*
- **Done.** **The first release.** The merge of the branch `semantic-release`
  released 1.0.0: the release commit and `v1.0.0` are on `main`.
  *(1, 6, 16)*
- **Done.** **A ruleset for version tags**, on `refs/tags/v*`, that restricts
  their creation, update and deletion, with "Deploy keys" and the
  Repository admin role on its bypass list, as
  [releasing.md](releasing.md#the-deploy-key) says. The deploy deploys
  the commit a version tag names, so without it anyone with write
  access could pick what is deployed. *(1)*
- **Done.** **The `release` environment** (#80). Make it, or open it if a run
  has made it already, with `main` as its only deployment branch, move
  the key into it as the environment secret `SEMANTIC_RELEASE_KEY`, and
  delete the repository secret, as
  [releasing.md](releasing.md#the-deploy-key) says: a repository secret
  can be read by a workflow on any branch. Keep the release key the
  only deploy key with write access, as both rulesets' bypass lets every
  such key past. *(1)*
- **Done.** **The DOI.** Add it to `CITATION.cff` and the README, in a pull
  request. *(14)*
- **Done.** **Software Heritage.** A copy of the repository is
  [preserved there](https://archive.softwareheritage.org/browse/origin/?origin_url=https://github.com/solid-memo/website),
  first as snapshot
  `swh:1:snp:dcf5c64c3cf402c99c0cf9ab72ebe36ba158d74b` (3.2.0). Its
  newest visit, on 2026-10-16, holds the releases up to 3.3.0, and it
  has not visited since, as its API showed on 2026-10-22; a "Save code
  now" request there would add the newer commits sooner. The repository
  stays where it is, and maintained; the copy only keeps the code
  findable if GitHub ever is not. *(14)*
- **Open.** **The journeys' report.** <https://journeys.solid-memo.com/>
  still shows the report of 4.2.0. For each release from 5.0.0 to
  5.3.1, the deploy published the site, but its `journeys` job failed at
  the step that publishes the report, as GitHub's API showed on
  2026-10-22. *(9, 12)*
- **Open.** **Search engines.** Verify solid-memo.com in Google Search Console
  and Bing Webmaster Tools, and submit `sitemap.xml`. *(14)*
- **Open.** **The Solid community.** Ask for a listing on solidproject.org, and
  post about the project on the Solid forum. The
  [list of apps](https://solidproject.org/apps) did not name Solid Memo
  on 2026-10-22. *(3, 14)*
- **Open.** **Local branches.** Delete the 17 leftover `pc/*` and `*-backup`
  branches on the maintainer's machine, or publish any that holds work
  not on `main`. All 17 were still there on 2026-10-22. *(1)*
- **Open.** **A second reviewer.** Then require one approval and code-owner
  review on `main`. Renovate's pull requests then wait for a
  maintainer's approval too, and automerge merges them once it is given
  (decision 8). *(7, 12)*

### Small fixes the assessment of 2026-10-16 found

Made in #165, and released in 3.11.0, so the docs the site serves have
them. All still hold:

- **Done.** **Terms.** DOI, ACR and WCAG are in
  [glossary.md](glossary.md), their first uses link there, and
  [deck-library.md](deck-library.md) links the EU data theme table
  where it names `EDUC`. *(10)*
- **Done.** **The DOI's entry.** `.zenodo.json` lists solid-memo.com as a
  related identifier, since Zenodo does not take `CITATION.cff`'s
  `url`. 3.11.0 is the first release that carries it, and its entry on
  Zenodo names the website, as every entry since does, up to 5.3.1.
  *(14)*
- **Done.** **CodeQL in the docs.** [testing.md](testing.md#code-scanning)
  and SECURITY.md say what CodeQL checks, that it does not gate a merge,
  and that its alerts are fixed in pull requests like any other change.
  *(12)*
- **Done.** **ROADMAP.md.** "Done recently" lists what came after 1.0.0,
  up to 3.10.1. It has not been brought up to date since (below). *(4)*
- **Done.** **The user guide.** It names the Arabic decks, says that
  text written right to left keeps its direction, and has worked
  examples for guest mode, the theme, a second instance and deck
  files. *(9)*

### Small fixes the assessment of 2026-10-18 found

privacy.md was fixed with that assessment (#174), #177 fixed two
others, and the last is still open:

- **Done.** **privacy.md.** It said every published deck version names
  the maintainer's email address, and that the library's index repeats
  it. It now says the first 205 versions do, every version since names
  the project's contact, and the index gives no email address. *(1, 10)*
- **Done.** **The user guide's journeys.** Its table of journeys left
  out `later-day`, `reset-day`, `library-upgrade` and `study-reload`;
  #177 added them. A journey added since is missing again (below). *(9)*
- **Done.** **The journeys' README.** [e2e/journeys](../e2e/journeys/README.md)
  said the journeys run the built app in Chromium. Since #177, it says
  that a few of them also run in Firefox, WebKit and on a phone. *(10)*
- **Open.** **`.zenodo.json` in standards.md.** `CITATION.cff` and
  `publiccode.yml` are listed in [standards.md](standards.md) as
  metadata formats, but `.zenodo.json`, Zenodo's own deposit metadata,
  is not. It is Zenodo's configuration, as `renovate.json5` is
  Renovate's, so it alone would not fail criterion 11, but a row beside
  `CITATION.cff` would say where its fields come from. *(11)*

### Small fixes this assessment found

Found on 2026-10-22. This page's own fix is made here, and the others
are not:

- **Done.** **This page.** It said branches with work not yet merged
  are public, though `main` is the only branch on GitHub; it gave 205 of
  220 deck versions with an email address, not 205 of 222; it counted
  the commits with no body by a rule that left some merge commits out,
  and said the share without a reason only shrinks; it gave 23 commits
  since 1.0.0 that link nothing, not 38; it said a release commit is
  tested again before it is deployed, which #227 replaced; and it said
  Software Heritage visits again for new commits. *(1, 6, 12, 14)*
- **Open.** **The standards' list.** [standards.md](standards.md) lacks
  [CSS Color](https://www.w3.org/TR/css-color-4/), whose `#rrggbb` the
  color set's shape requires of every color in a palette of one's own
  (`ns/shapes/color-set/v1.ttl`, #212), and
  [GraphQL](https://spec.graphql.org/) and
  [JSON](https://www.rfc-editor.org/rfc/rfc8259), by which
  `scripts/taxonomy_deck.py` reads the JobTech taxonomy (#190). Adding
  them meets criterion 11's MUST again. *(11)*
- **Open.** **SVG's uses.** The SVG row in [standards.md](standards.md)
  names only the docs' diagrams. The Studio's graph
  (`apps/studio/src/ui/graph/GraphView.tsx`, #197) and the statistics
  charts (`packages/ui/src/ui/charts/BarChart.tsx` and `LineChart.tsx`)
  are SVG too. *(11)*
- **Open.** **`.zenodo.json` and FSRS-6.** Its description says the app
  schedules cards with SM-2, and its keywords lack FSRS, while #196
  added FSRS-6 to `CITATION.cff` and `publiccode.yml`.
  [releasing.md](releasing.md) says a change to one is made in the
  others in the same pull request. Zenodo's entries from 4.0.0 on carry
  the old text. *(14)*
- **Open.** **GOVERNANCE.md's merging.** [GOVERNANCE.md](../GOVERNANCE.md#merging)
  says every change reaches `main` through a pull request in the merge
  queue. The release commit does not, and nor did the fix merged from
  the advisory's private fork (`05078e24`), which
  [releasing.md](releasing.md#what-each-stage-checks) describes. It
  should name both, and link there. *(4, 7)*
- **Open.** **The bypass list.** This page says the bypass list of the
  ruleset on `main` names only "Deploy keys", but `05078e24` reached
  `main` from the advisory's private fork without the queue, through a
  ruleset bypass, as [releasing.md](releasing.md#what-each-stage-checks)
  says. The maintainer should read the bypass list again and make this
  page and releasing.md agree. *(7, 12)*
- **Open.** **ROADMAP.md.** "Done recently" was last brought up to date
  at 3.10.1. It leaves out what came after, such as every app language
  asked of a library deck (3.12.0), the movie quotes deck (3.13.0),
  FSRS-6 and the Swedish driving license B course (4.0.0), the Studio's
  graph (4.1.0), the palettes and the text size (5.0.0) and the
  statistics by deck (5.2.0). It also says Software Heritage keeps
  adding the project's new commits, but its newest visit was on
  2026-10-16. *(4, 14)*
- **Open.** **The user guide's journeys.** Its table names every
  journey file but `pod-safety.journey.ts`, which came with 4.1.1. Its
  journeys attach an instance by its address and confirm a deck's
  documents on the Studio's Health screen. *(9)*
- **Open.** **reuse.md's list.** [reuse.md](reuse.md#6-what-you-edit-by-hand)
  does not list what #204 added for this deployment: the page at
  `apps/web/public/journeys/index.html`, which sends on to
  journeys.solid-memo.com, and, in `.github/workflows/deploy.yml`,
  `JOURNEYS_REPO`, `JOURNEYS_HOST` and the `journeys` environment's
  address. A fork without the key publishes nothing, so this is only a
  gap in what a copy is told to change. *(3)*
- **Open.** **policy.md's library rules.** The row "What the
  repository's library asks of a deck" in [policy.md](policy.md) leaves
  out the contact, which `repoPolicy` in `curationRules.ts` also asks
  for and `npm run library:check` checks on every version new since
  the base ([deck-library.md](deck-library.md#contact)). *(2)*
- **Open.** **vendor-code.md's SHACL engine.** [vendor-code.md](vendor-code.md#maturity)
  says `packages/shacl/src/engine.ts` and `packages/shacl/node/shacl.ts`
  use `rdf-validate-shacl`, but only `engine.ts` imports it, so the
  cost of swapping it is that one file. *(16)*
- **Open.** **The changelog's references.** The 5.0.0 entry in
  [CHANGELOG.md](../CHANGELOG.md), and its GitHub release, link two
  issues `#rrggbb` that do not exist, read from a commit's body.
  Changelog entries are not edited by hand, so the fix belongs in
  `release.config.mjs`, for example by taking only numbers as issue
  references. *(16)*

### Gaps that remain

These are not met, and the settings and actions above do not close
them:

- **Criterion 7, review by another person.** A decided gap (decision
  12). With one maintainer, his own
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
  URLs, `CNAME` (which the build writes the sitemap and `robots.txt`
  from), the about page, the screenshots, `publiccode.yml` and the docs
  name solid-memo.com, and the about page links to this repository. A
  deployed site needs them, and
  [reuse.md](reuse.md#6-what-you-edit-by-hand) lists them for a copy to
  change. Since #204, `deploy.yml` also names the journeys' report's
  repository and domain; without the `journeys` environment's key, as
  in a fork, it publishes nothing. Three old commits name paths on the
  maintainer's machine, and the history keeps them.
- **Criterion 6, decisions in commit messages.** 96 of the 407 commits
  on `main` before 1.0.0 record no reason, 88 commits and eight merge
  commits, and rewriting `main` to add them is not an option. The
  requirement applies from 1.x (decision 12): CI refuses a pull
  request's commit with no body, and every commit since 1.0.0 that
  records no reason is a merge commit. But the merge queue's merge
  commits add only their pull request's title, so the share without a
  reason does not shrink: 156 of 634 at `befdae42`, 191 of 772 at
  `c1301d9c`.
- **Criterion 6, links to issues.** 38 of the 365 commits since 1.0.0,
  and most older ones, link no issue, and the history keeps them. It
  applies from 1.x (decision 12): CI refuses a new commit that names no
  issue, pull request or discussion, or, for a security fix, its
  advisory, and every merge commit the merge queue makes names its pull
  request. Since the commit checks (#92), 19 of 305 commits link
  nothing: ten of Renovate's updates, which carry a `Why:` line
  instead; six commits that name a security advisory instead
  (`Refs: GHSA-…`), five of them the two fixes' own and one the change
  to the commit check that allows it; the release commits of 4.1.1 and
  4.1.3, whose changelogs list only those fixes; and the merge of the
  fix from the private fork (`05078e24`), which names neither.
- **Criterion 9, examples for all functionality.** A release's themes
  and "Findable by other apps" need a journey or a worked example in
  the user guide, and no journey shows text written right to left.
  Attaching an instance by its address has a journey since 4.1.1
  ([pod-safety.journey.ts](../e2e/journeys/journeys/pod-safety.journey.ts)).
- **Criterion 12, tests before a merge.** A fix made in a security
  advisory's private fork reaches `main` through a ruleset bypass,
  where Actions do not run, so CI first tests it on `main`, and the
  release waits for that run ([releasing.md](releasing.md#what-each-stage-checks)).
- **Criterion 12, the docs' coverage.** Nothing checks that every package
  has a README, or that every export has a comment, and nothing
  measures the Python scripts' test coverage.
- **Criterion 16, dependencies ready to use.** A decided gap (decision
  14). The stable app ships four dependencies before their own 1.0.0
  ([vendor-code.md](vendor-code.md#maturity)). Each reaching 1.0.0, or a
  replacement ready to use, would close it. `process` is final at 0.11 by
  its maintainer's choice. [`shacl-engine`](https://www.npmjs.com/package/shacl-engine)
  1.x exists, but brings in packages before 1.0.0 of its own and a
  SPARQL engine the app does not need.
- **Criterion 14, findability.** The repository name is kept by choice.
  Catalogs and search engines wait for the actions above, and a web
  search on 2026-10-22 found the project neither by name nor by the
  problem it solves. The DOI is in `CITATION.cff` and the README, and
  its entry names the website since 3.11.0.

## The plan, as it landed

The first assessment's plan, each item marked **Done.** when it has
landed and **Open.** when it has not: most of it landed on the branch
`standard-for-public-code`.

### Phase 1: files and small fixes

- **Done.** **Footer.** The repository URL comes from `VITE_REPO_URL`. Every
  screen links to the source code, the commit, the issue tracker and the
  version, in every language the app speaks
  ([`Footer.tsx`](../packages/ui/src/ui/Footer.tsx)).
- **Done.** **`CONTRIBUTING.md`**, linked from the README.
- **Done.** **`GOVERNANCE.md`** and `.github/CODEOWNERS`.
- **Done.** **`SECURITY.md`.** No `security.txt`, as decided.
- **Done.** **Templates.** Issue forms for bugs, features, decks, translations
  and interop reports, `config.yml` (which points conduct reports to
  their email contact), the pull
  request template, and `CODE_OF_CONDUCT.md`.
- **Done.** **README.** About, Status, Run it on its own, Contributing, the
  language statement, the badges, the journeys report and the licenses.
- **Done.** **New pages**: [objectives.md](objectives.md),
  [policy.md](policy.md), [standards.md](standards.md),
  [privacy.md](privacy.md) and [glossary.md](glossary.md), the full SM-2
  citation, and links to the specifications.
- **Done.** **`ROADMAP.md`.**
- **Done.** **Metadata and style.** `publiccode.yml`, `CITATION.cff`,
  `CHANGELOG.md`, [releasing.md](releasing.md), `.gitattributes`,
  `.editorconfig`, [style.md](style.md), the root `package.json`'s
  metadata, and the JSON-LD in `apps/web/index.html`.
- **Done.** **Package docs.** A README and a `description` for each package,
  `e2e/journeys` in [architecture.md](architecture.md), and the maturity
  of the 0.x dependencies in [vendor-code.md](vendor-code.md#maturity).
- **Open.** **Branches.** The leftover `pc/*` and `*-backup` branches remain
  on the maintainer's machine (above).

### Phase 2: CI and GitHub settings

- **Done.** **`ci.yml`.** Runs on every pull request and on pushes to `main`,
  with the `ci-ok` job and no secrets. Its token is read-only, but for
  the `caches` job, which runs on `main` only, runs none of the
  repository's code, and may delete `main`'s older Turbo caches.
- **Done.** **The deck library's base.** Compared in `ci.yml`'s `library`
  job, which `ci-ok` waits for; `ns.yml`, whose checks were all in
  `ci.yml` but that one, is gone.
- **Done.** **`deploy.yml`.** It deploys only a released version: after CI
  passes on a commit a version tag names, the site that CI run built
  and tested (#227), or, run by hand, only from `main`, the newest
  version, built after `npm run check`. Either way, only the newest
  version, from its release commit, once its GitHub release is made.
- **Done.** **`renovate.json5`.** `automergeType: 'pr'`, and a `commitBody`
  that records each update and why.
- **Done.** **Checks in `npm run check`.** The docs index
  (`npm run check:docs`), prerelease dependencies
  (`npm run check:dependencies`), and each package's coverage in the
  run's summary.
- **Done.** **A docs job.** lychee (offline on every change, online weekly),
  `reuse lint` and the publiccode.yml parser; markdownlint and cspell
  run in `npm run check`, so in the check job.
- **Done.** **License required.** `npm run library:check` refuses a new deck
  version without `dcterms:license`, and `sm2.test.ts` checks the
  scheduler against the table it reads from
  [srs.md](srs.md#worked-examples).
- **Done.** **GitHub settings.** Listed above, all done.

### Phase 3: larger work

- **Done.** **Configuration.** `VITE_APP_NAME`, `VITE_REPO_URL` and
  `VITE_POD_PROVIDERS`, [configuration.md](configuration.md),
  [reuse.md](reuse.md), and a generic custom domain section in
  [deployment.md](deployment.md). No CI build under a subpath.
- **Done.** **User documentation.** [user-guide.md](user-guide.md),
  [statistics.md](statistics.md), [browsing.md](browsing.md), examples in
  [markdown.md](markdown.md) and [boundaries.md](boundaries.md), and a
  plain summary at the top of long pages.
- **Done.** **Formatter and linter.** Biome in `npm run check`, with the
  reformat in `.git-blame-ignore-revs`.
- **Done.** **REUSE.** `REUSE.toml`, `LICENSES/`, SPDX headers, the license on
  the `ns/` graphs ([vocab.md](vocab.md#license)), `reuse lint` in CI,
  and `npm run check:reuse` for the decks' licenses.
- **Done.** **Releases.** The version shows in the footer, semantic-release
  releases each version from the commits, and only released versions
  are deployed, from tags a ruleset protects. Zenodo archives each
  release, and Software Heritage keeps a copy of the code (above).
- **Open.** **Findability.** The about page is done and in the sitemap,
  which the build writes. Search engines and the Solid community remain
  (above).
- **Done.** **Deck contact.** New deck versions name the project's contact.
- **Open.** **A second reviewer.**

## Checking progress

- The full check passes at 100% coverage after every code change. Run
  `npm run crosscheck`, `npm run format:turtle` and `npm run library`
  when `ns/` or `decks/` change, and `npm run lint:workflows` when
  `.github/` changes.
- GitHub's community profile (`/community`) shows every item.
- A pull request from a fork runs CI, `ci-ok` is required, and the
  template appears.
- A pull request that edits a published deck version fails.
- A deploy by hand from a branch other than `main` is skipped.
- A push to `main` that releases nothing is not deployed; a release
  commit is, once CI passes on it, and a deploy by hand deploys the
  newest version.
- The footer's links open the source code, the commit and the issues on
  `solid-memo/website`.
- GitHub's blame of a reformatted file on `main` shows the change that
  wrote each line, not the reformat.
- `lychee.toml` excludes no address whose setting or tag now exists.
- Go through the criteria again, and update the scorecard here, with
  the commit of `main` assessed and the date. Count the commits as this
  page does: a body is what is left once the trailers are left out, and
  a link is an issue or pull request number or address.
