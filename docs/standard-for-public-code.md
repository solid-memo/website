# The Standard for Public Code

How well Solid Memo meets the [Standard for Public Code](https://www.standardforpubliccode.org/)
(version 0.8.1), what the maintainer decided, and what's left. Each
criterion is a list of requirements, and each requirement is a MUST, a
SHOULD or OPTIONAL. The project is committed to meeting the Standard,
as the commitment badge in its
[README](../README.md#the-standard-for-public-code) says.

This is an assessment of `main` at `befdae42`, made on 2026-10-18
(#167). The latest release is 3.11.0; `main` adds only #177's docs
fixes and docs check. Every requirement of the 16 criteria, MUST,
SHOULD and OPTIONAL, was checked again against the Standard's own list
at `bc5a0a83` (3.10.1 and #165). The changes up to `befdae42` were
checked the same day. #178 has since added the workflows' lint to CI,
which criterion 12 names, and the pull request template has since
dropped its checklist for the author.

It replaces the assessments of 2026-10-16 (`main` at `2b780237`,
2.1.1, #78) and 2026-10-11 (the branch `standard-for-public-code`, on
`main` at `cae0a9f`). It replaces the re-review of 2026-10-13 (`main`
at `90652c08` with the branch `public-code-followup`) and the first
one, of `main` at `18eace6` on 2026-10-10. It isn't a promise: items are
checked off and re-assessed as they land.

## Summary

The first assessment found strong engineering and weak process. The
branch `standard-for-public-code` closed most process gaps with files
and checks ([the plan](#the-plan-as-it-landed)): contribution
guidelines, governance, a security policy, CI with one required
`ci-ok` check, a changelog, `publiccode.yml` and `CITATION.cff`. The
maintainer has since changed every setting it asked for
([GitHub settings](#github-settings)).

The branch `public-code-followup` fixed what the re-review found:

- tests for the two scripts that had none;
- the missing standards in [standards.md](standards.md) and tool terms
  in the [glossary](glossary.md);
- a checklist for reviewers;
- a plain statement that 0.1.0 wasn't tagged yet, since replaced;
- the maintainer's GitHub account in GOVERNANCE.md, CODEOWNERS and
  CODE_OF_CONDUCT.md;
- this page.

The branch `semantic-release` replaced the plan to tag 0.1.0 by hand
(decision 7): every commit follows Conventional Commits, and
semantic-release releases a version after CI passes on `main`. The
first version, 1.0.0, is stable ([releasing.md](releasing.md)).

Since 2026-10-13, `main` has released 26 versions, 1.0.0 to 3.11.0,
and 3.0.0 is the first that breaks something (#119). Since #151 the
release job holds its key only while semantic-release runs, and every
action is pinned to a commit. CodeQL's five alerts on `main` were fixed
in pull requests (#96, #99 to #102), and one a pull request's own scan
raised in that pull request (#158). The criteria below cover the rest:
the merge queue, the `release` environment, the commit and
breaking-change checks, the docs per release, Software Heritage, the
journeys' browsers and accessibility checks, the domain and written,
public communication.

What's left ([What remains](#what-remains)): actions for the
maintainer (findability, the leftover local branches), one small fix,
and gaps in criteria 3, 6, 7, 9, 12, 14 and 16, those in 7 and 16
decided.

## Scorecard

The counts are requirements met out of those in the criterion. Partial
and unknown count as not met; a requirement with nothing to apply to
counts as met, and the text says so.

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
| 11 | [Use open standards](https://www.standardforpubliccode.org/criteria/use-open-standards.html) | 4/4 | 3/3 | Compliant |
| 12 | [Use continuous integration](https://www.standardforpubliccode.org/criteria/use-continuous-integration.html) | 4/4 | 2/3 | Compliant |
| 13 | [Publish with an open license](https://www.standardforpubliccode.org/criteria/publish-with-an-open-license.html) | 4/4 | 1/1 | Compliant |
| 14 | [Make the codebase findable](https://www.standardforpubliccode.org/criteria/make-the-codebase-findable.html) | – | 4/8 | No MUSTs |
| 15 | [Use a coherent style](https://www.standardforpubliccode.org/criteria/use-a-coherent-style.html) | 1/1 | 2/2 | Compliant |
| 16 | [Document codebase maturity](https://www.standardforpubliccode.org/criteria/document-codebase-maturity.html) | 2/3 | 2/2 | Partial |
| | **Total** | **41/46** | **36/51** | |

A criterion is compliant when all its MUSTs are met. It's non-compliant
when more than half of them aren't met, and partial otherwise.

### What changed since 2026-10-16

The assessment of 2026-10-16 scored 41/46 MUSTs and 34/51 SHOULDs. No
MUST changed, and two SHOULDs went from partial to met with #165's
fixes ([the list](#small-fixes-the-assessment-of-2026-10-16-found)):
terms explained (10) and a persistent identifier (14).

Three verdicts kept their count with new evidence:

- **Criterion 9, examples for all functionality** (SHOULD): still
  partial, with less missing, as #141 added seven journeys.
- **Criterion 14, findable by name and by the problem** (SHOULD): still
  not met, now checked by a web search on 2026-10-18.
- **Criterion 6, the commit counts**, updated in the criterion.

Everything else held, its text updated for what landed since:

- the 18 releases, the docs at `/docs/` and Software Heritage;
- the docs index in [docs.ttl](docs.ttl) and the release job's
  hardening;
- the journeys' browsers and accessibility checks;
- the domain in GOVERNANCE.md;
- #165's fixes (released in 3.11.0), the release's contact in the
  Studio (#166), and #177's docs fixes and check (on `main`, in no
  release yet).

### Earlier scores

Against the re-review of 2026-10-13 (41/46 and 36/51), the assessment
of 2026-10-16, at 2.1.1, had two SHOULDs go from met to partial:

- terms explained (10), as DOI had come with the Zenodo archive and
  ACR, WCAG and `EDUC` had been missed;
- the persistent identifier (14), whose entry the re-review hadn't
  checked for the website.

The links to issues (6) had gone from not met to partial, with no
change to the count.

`main` at `90652c08` alone scored 36/46 MUSTs and 31/51 SHOULDs. The
branch `public-code-followup` added 4.3, 7.4, 10.3, 10.6, 11.3, 12.1,
16.2 and the changelog's SHOULD in criterion 16. The branch
`semantic-release` turned 16.3 from met to partial, declaring 1.0.0
ready to use with four dependencies before their own 1.0.0. Its first
release, 1.0.0, met 16.1 and criterion 6's SHOULD to mark released
versions, bringing the MUSTs to 41/46.

The assessment of 2026-10-11 scored 39/46 and 37/51, and the first one
17/44 and 8/50. Each later one was stricter, counting as partial what
isn't done yet, such as reviews by someone else (7.2, 7.5), examples
for every feature (9.6) and a check of the docs' coverage (12.7). The
first assessment counted too few requirements in criteria 1, 10 and
11; the counts above are the Standard's own.

The five MUSTs left are in criteria 6 (old commits with no reason or
no issue link), 7 (no second reviewer) and 16 (dependencies before
1.0.0).

## GitHub settings

Some requirements depend on settings outside the repository. Their
state on 2026-10-18, read from GitHub's and Zenodo's public APIs:

- Discussions and issues are on. The repository has a description, a
  homepage (solid-memo.com) and twelve topics.
- The issue forms' labels `deck`, `interop` and `i18n` exist.
- The ruleset on `main` (24560297) is active. It blocks deletion and
  force pushes, and requires a pull request with no approvals, the
  `ci-ok` check, and the merge queue. The merge queue merges with merge
  commits, building each pull request on top of `main` and those ahead
  of it, so the branch need not be up to date
  ([testing.md](testing.md#the-merge-queue)).
- The ruleset "version tags" (25032384) is active on `refs/tags/v*`:
  it restricts their creation, update and deletion, and blocks force
  pushes.
- The `github-pages` and `release` environments each allow deployments
  from `main` only.
- CodeQL's workflow is active.
- Every version from 1.0.0 to 3.11.0, 26 in all, has its tag and its
  GitHub release. Zenodo has archived all but 1.0.1 and 2.1.1 under
  the concept DOI.

The maintainer checked those that need signing in, on 2026-10-16:

- Private vulnerability reporting is on.
- Secret scanning and push protection are on.
- "Allow auto-merge" is on, so Renovate can add its pull requests to the
  merge queue, which merges them once `ci-ok` passes there too.
- The bypass list of the ruleset on `main` names "Deploy keys", through
  which the release pushes each release commit. That of "version tags"
  names "Deploy keys" and the Repository admin role.
- The release's key is the environment secret `SEMANTIC_RELEASE_KEY` of
  the `release` environment, the only deploy key with write access.
  The repository secret of the same name and the old deploy key are
  deleted (#80). Every release from 2.0.1 on ran from that environment.

They need checking again before anything relies on them.

## Criteria

### 1. Code in the open

- MUST, met — the source code in use is public. Production runs only
  the newest released version, once its GitHub release is made and CI
  passes on the release commit its tag names, and runs the site CI
  built and tested from that code, given the released version
  ([deployment.md](deployment.md#the-build-ci-tested)). A deploy by
  hand runs only from `main`, deploys the newest version, and runs
  `npm run check` on it first.
- MUST, met — the source of the policy in use is public: the SM-2 and
  FSRS-6 schedulers and the library's rules ([policy.md](policy.md)).
- MUST, met — no sensitive information about users or third parties, and
  no secrets in the tree or its history. The maintainer's email address
  is in 205 of the 220 published deck versions, by his choice, and in
  the code of conduct, as its contact
  ([privacy.md](privacy.md#what-the-project-has-published)). The other
  15 give the issue tracker as their contact. They include every
  version since 2.1.1: the Korean phrases deck, the Korean at the Table
  course, and new versions of the capitals decks, of HTTP status codes
  and of the Standard for Public Code course. Since 3.11.0, the
  Studio's release check for the library flags an email address, and
  its release screen writes the contact (#166).
- SHOULD, partial — publish code not in use. The history, the pull
  requests, the old deck and shape versions, every released version and
  unmerged branches are public. Each release is tagged, with its docs
  in the repository at its tag and in an archive on its GitHub release
  ([deployment.md](deployment.md#older-releases-docs)). The 17 leftover
  `pc/*` and `*-backup` branches, most likely copies of merged work,
  are still only on the maintainer's machine.
- OPTIONAL, met — the footer on every screen links to the About page,
  the docs, the source code, the commit, the changelog, the issue
  tracker and Discussions
  ([`Footer.tsx`](../packages/ui/src/ui/Footer.tsx),
  [configuration.md](configuration.md#vite_repo_url)).

### 2. Bundle policy and source code

- MUST, met — the policy is included. No public policy applies, as
  [policy.md](policy.md) says. It lists the project's own rules and the
  outside rules the code follows, with versions and links: SM-2,
  FSRS-6, the CLDR plural rules, BCP 47, NFC and DCAT-AP.
- MUST, met — no policy is based on source code, so there's none to
  include.
- SHOULD, met — policy in machine-readable formats: SHACL shapes and
  the library's checks, and SM-2 and FSRS-6 as pure functions in
  `packages/domain`.
- SHOULD, met — CI checks the code against the policy. `sm2.test.ts`
  checks the scheduler against every row of
  [srs.md's worked examples](srs.md#worked-examples), read from the
  page, and `fsrs.test.ts` against
  [the FSRS-6 worked examples](srs.md#fsrs-6-worked-examples), so a
  change to one that the other doesn't match fails.
  `npm run library:check` refuses a new deck version without a license.

### 3. Make the codebase reusable and portable

- MUST, met — reusable in other contexts. A build reads its name, its
  repository, its Pod providers and its deck library from `VITE_`
  settings ([configuration.md](configuration.md)), and
  [reuse.md](reuse.md) explains how to run a separate instance. The
  GitHub Pages deploy deploys only released versions, so a fork using
  it releases its own, with its own deploy key
  ([releasing.md](releasing.md#the-deploy-key)), and serves its own
  releases' docs.
- MUST, met — no dependency on secret or proprietary software or
  services. The site is static, and every Solid server and identity
  provider it's tested with is open source, its image pinned by exact
  version and digest. The build draws the docs' diagrams in Chromium,
  which is open source, and `DOCS_DIAGRAMS=skip` builds without it
  ([configuration.md](configuration.md#docs_diagrams)). A weekly check,
  not a gate, reads the discovery documents of the Pod providers
  onboarding suggests; the app needs none of them
  ([testing.md](testing.md#pod-providers)). The release and the deploy
  run on GitHub Actions, for this deployment only. A build needs none
  of them.
- SHOULD, not met — used by several parties.
- SHOULD, not met — a roadmap shaped by several parties:
  [ROADMAP.md](../ROADMAP.md) says how to propose an item, but no other
  party has.
- SHOULD, not met — developed by several parties. Of the 634 commits on
  `main`, 552 are the maintainer's, 56 Renovate's and 26 the release's.
- SHOULD, met — configuration rather than code.
- SHOULD, met — localizable. The app speaks six languages, and card
  text written right to left, such as the Arabic decks', keeps its
  direction ([i18n.md](i18n.md)). The docs and the About page are in
  English only, by choice, and say so.
- SHOULD, partial — no situation-specific information. The app's name,
  its Pod providers and its repository links are settings; the footer's
  links and `index.html`'s links to the repository (its JSON-LD and its
  `noscript` source link) follow `VITE_REPO_URL`. Still written for
  this deployment, and listed in
  [reuse.md](reuse.md#6-what-you-edit-by-hand) as files to edit by
  hand:
  - `index.html`'s absolute URLs on solid-memo.com (the canonical link,
    `og:url`, `og:image`, and the JSON-LD `url`, `@id` and `image`) and
    its description;
  - the About page, with its address and its links to this repository;
  - Solid Memo's wordmark and logo;
  - the screenshots of the app;
  - `CNAME`, the domain the build writes `sitemap.xml` and `robots.txt`
    on;
  - `publiccode.yml`;
  - the README;
  - the docs, which the build publishes and which describe this
    deployment.

  The tree names no path on the maintainer's machine, but three old
  commits on `main` do.
- SHOULD, met — modules documented for reuse: each package's README
  says what it exports and may import.
- SHOULD, met — no single-vendor platform. Any static host serves the
  site ([deployment.md](deployment.md)), and any Solid provider holds
  the data.

### 4. Welcome contributors

- MUST, met — anyone can suggest a change: in an issue from one of the
  issue forms, or in a pull request from a fork, which CI runs on. Every
  pull request, the maintainer's and Renovate's included, is merged
  through the merge queue (#76).
- MUST, met — contribution guidelines in [CONTRIBUTING.md](../CONTRIBUTING.md).
- MUST, met — governance in [GOVERNANCE.md](../GOVERNANCE.md). It,
  `.github/CODEOWNERS` and CODE_OF_CONDUCT.md name the maintainer's
  account, `@ixuz`. A decision exists only once written in an issue, a
  discussion or a pull request, its commit messages included (decision
  13). GOVERNANCE.md says who holds the domain solid-memo.com, the
  project's one cost, paid by the maintainer (#161).
- SHOULD, met — who pays for reviews: volunteers, in their own time,
  with no funding ([CONTRIBUTING.md](../CONTRIBUTING.md#review)).
- SHOULD, met — the engagement of organizations: GOVERNANCE.md says
  none is committed.
- SHOULD, met — a public roadmap in [ROADMAP.md](../ROADMAP.md), whose
  "Done recently" lists what came after 1.0.0, up to 3.10.1, such as the
  merge queue, the breaking-change check, the docs at `/docs/` and the
  Arabic and Korean decks (#165).
- SHOULD, met — activity statistics: the README's badges for commit
  activity, the last commit and the contributors, and links to GitHub's
  pulse and activity graphs.
- OPTIONAL, met — a code of conduct: the Contributor Covenant 2.1, with a
  private email contact for reports.

### 5. Make contributing easy

- MUST, met — a public issue tracker, with forms for bugs, features,
  decks, translations and interop reports. Blank issues are off, and
  the app's footer links to the forms. Since 3.7.0, a card from a
  library deck links to the deck form to report a mistake (#152).
- MUST, met — the README links the issues and the pull requests.
- MUST, met — communication channels. The README, CONTRIBUTING.md,
  the issue forms and, since 2.2.0, the app's footer (#113) send
  questions to Discussions. The project talks only in public and in
  writing (issues, Discussions, pull requests and commit messages), with
  no chat and no calls; only security and code of
  conduct reports are private (decision 13,
  [GOVERNANCE.md](../GOVERNANCE.md#where-the-project-talks)).
- MUST, met — a closed channel for vulnerability reports.
  [SECURITY.md](../SECURITY.md) points to GitHub's private vulnerability
  reporting. A reporter needs a GitHub account.
- MUST, met — instructions for reporting a vulnerability, in
  SECURITY.md.

### 6. Maintain version control

- MUST, met — every file is in Git.
- MUST, partial — decisions in commit messages.
  - Of the 634 commits on `main` at `befdae42`, 113 have no body once
    their trailers are left out, 91 of them from before 1.0.0
    (`d5d13c84`), the same 91 as on 2026-10-13.
  - Since 1.0.0, 22 of the 227 commits have none, all merge commits: 21
    by the merge queue, whose message names the pull request that says
    why, and one merge of `main` into a branch (`094e64be`), which CI
    now refuses. Since 2.1.1, 10 of the 142 have none, all merge queue
    merges.
  - Every other commit since 1.0.0 has a body, which CONTRIBUTING.md
    asks to say why. Renovate's (`commitBody` in `renovate.json5`) give
    each update, from what version to what, where, its source and
    release notes, and why. Each release commit carries its changelog.
  - From 1.0.0 on, every commit but the merge commits follows
    Conventional Commits, its type recording the kind of decision.
    Since 2026-10-15, CI's `commits` job checks with commitlint that
    every commit of a pull request has a body, and refuses a pull
    request with a merge commit, which commitlint skips.
  - The history can't change, so this stays partial; it applies from
    1.x (decision 12).
- MUST, partial — commit messages link to issues and discussions.
  - Of the 634 commits, 218 link an issue or a pull request; since
    1.0.0, 204 of 227; since the commit checks (#92), 163 of 167, the
    four others all Renovate's.
  - Of the 23 since 1.0.0 that link nothing, 12 are Renovate's, two are
    release commits whose changelog names no issue, and one is the
    merge of `main` into a branch. Seven are the Arabic decks and one
    the fix released as 1.0.1, rebased onto `main` before every pull
    request was merged with a merge commit.
  - CONTRIBUTING.md asks for a `Closes: #NN` footer. CI's `commits` job
    checks with commitlint that every commit of a pull request names an
    issue, pull request or discussion by its number, and that the pull
    request closes its issue (`npm run check:closes`).
  - Renovate's updates can't name their pull request, so they carry the
    `Why:` line of their `commitBody`, and their merge commit names the
    pull request.
  - Older commits link nothing, and the history can't change; this too
    applies from 1.x (decision 12). It wasn't met on 2026-10-13, when
    no commit had such a footer.
- SHOULD, met — a distributed version control system: Git.
- SHOULD, met — guidelines ask for one logical change per commit.
- SHOULD, met — released versions marked. semantic-release tags each
  version `vX.Y.Z` and makes a GitHub release of it, `v1.0.0` to
  `v3.11.0`, protected by the ruleset "version tags"
  ([releasing.md](releasing.md)).
- SHOULD, met — diff-friendly formats: CONTRIBUTING.md asks for text
  formats, and `.gitattributes` fixes the line endings.
- OPTIONAL, partial — signed commits and an email address. Every commit
  has an author's email address, but the maintainer's aren't signed.

### 7. Require review of contributions

- MUST, not met — every contribution reviewed by someone other than its
  author.
  - The maintainer merges his own pull requests without review, a
    temporary exception GOVERNANCE.md states, and Renovate merges its
    own once CI passes.
  - Of the 72 pull requests merged since `90652c08`, 58 are the
    maintainer's, none reviewed, #96 among them (CodeQL's suggested
    fix, which the maintainer opened). The other 14 are Renovate's;
    only #55 has an approval, from the maintainer.
  - The 35 merged since 2.1.1, #104 to #177, are 32 of the maintainer's
    and 3 of Renovate's, none reviewed.
  - The release commit reaches `main` with no pull request, from the
    `release` environment, holding only what semantic-release writes
    from commits already merged.
  - A decided gap while there's one maintainer (decision 12).
- MUST, partial — reviews cover the source, the policy, the tests and
  the docs, as CONTRIBUTING.md says, but no one but the author has
  reviewed a change yet. A decided gap.
- MUST, met — a written reason for every declined contribution,
  required by GOVERNANCE.md and CONTRIBUTING.md, public by decision 13.
  No pull request has been closed without a merge since 2026-10-13, so
  the rule's had nothing new to apply to.
- SHOULD, met — review checks the standards, the architecture and the
  decisions: CONTRIBUTING.md's review checklist for the reviewer.
  `npm run check:boundaries` enforces the import rules. Since 2.0.0, CI
  runs `npm run check:breaking`, which fails a change to
  [the public API](releasing.md#the-public-api) that no commit calls
  breaking.
- SHOULD, partial — review runs the software and the tests. CI runs
  every gating test on every pull request, a fork's too, and again in
  the merge queue ([testing.md](testing.md#the-merge-queue)). The
  reviewer's checklist says to try a change users see in the app, with
  no reviewer yet.
- SHOULD, not met — a reviewer from a different context.
- SHOULD, not met — no unreviewed changes on `main`. The ruleset
  requires no approval, so the maintainer's and Renovate's pull
  requests reach `main` unreviewed. Renovate proposes a version only
  once it has been public for 3 days, and npm and uv lock no package
  an update pulls in to a younger version. A bad one can be pulled
  first; that wait isn't a review.
- SHOULD, not met — review within two business days: a stated target
  one volunteer can't assure, and nothing measures it.
- OPTIONAL, not met — review by several reviewers.

### 8. Document codebase objectives

- MUST, met — [objectives.md](objectives.md) states the mission, the
  goals and who the app is for.
- SHOULD, met — objectives.md links each principle to the check that
  enforces it, and [policy.md](policy.md) to the rules behind them.
- OPTIONAL, met — the about page explains the project to the public.
  The app's footer links it since 3.8.0, and it links the docs, which
  the site publishes at `/docs/` since 3.3.0, objectives.md among them
  (#129, #153).

### 9. Document the code

- MUST, met — all functionality described, for learners in
  [user-guide.md](user-guide.md) and for developers in the topic pages,
  such as, since 2.1.1, undoing an answer, reporting a mistake, a
  deck's link and the error screen.
  The site serves these docs at `/docs/`, and the about page, the
  site's page without script and `publiccode.yml` link to them.
- MUST, met — how to install and run, in the README.
- MUST, met — examples of the key functionality: the user guide and the
  [user journeys](https://journeys.solid-memo.com/) report.
- SHOULD, met — an overview for a wide audience: the README's "About"
  and the about page.
- SHOULD, met — how to run a standalone copy: the README's "Run it on its
  own", [reuse.md](reuse.md), and guest mode, a test dataset with no
  Pod.
- SHOULD, partial — examples for all functionality.
  - [markdown.md](markdown.md), [boundaries.md](boundaries.md) and
    [deck-library.md](deck-library.md) have them.
  - The `user-guide.md` page has worked examples (#165, first released
    in 3.11.0) for guest mode, the theme, a second instance, and
    exporting and importing a deck file. Its table of journeys names
    the steps that show each, and since #177 the four it left out:
    `later-day`, `reset-day`, `library-upgrade` and `study-reload`.
  - It lists the four Arabic decks, says that text written right to
    left keeps its direction, and shows the Studio's search finding an
    Arabic word with or without its vowel marks.
  - Undoing an answer, resetting the day, reporting a mistake, updating
    a library copy, a deck's link and the error screen each have a
    journey.
  - A release's themes, attaching an instance by its address and
    "Findable by other apps" have neither a journey nor a worked
    example. No journey shows text written right to left.
- SHOULD, met — the components and their relations, in
  [architecture.md](architecture.md).
- SHOULD, met — CI checks the docs: markdownlint, cspell, lychee and the
  docs' index, [docs.ttl](docs.ttl), which `check:docs` holds to every
  page ([testing.md](testing.md#documentation)).

### 10. Use plain English

- MUST, met — the authoritative languages are documented: English only
  (the README, [style.md](style.md#language)).
- MUST, met — English is one of them.
- MUST, met — the docs are up to date in English, the one authoritative
  language.
  - What landed since 2.1.1 came with its docs: the docs at `/docs/`
    ([deployment.md](deployment.md#what-the-artifact-contains)), the
    accessibility target and its checks
    ([accessibility.md](accessibility.md)), the journeys' browsers
    ([testing.md](testing.md#browsers)), CodeQL
    ([testing.md](testing.md#code-scanning),
    [SECURITY.md](../SECURITY.md)), the domain
    ([GOVERNANCE.md](../GOVERNANCE.md#the-domain)) and what the app does
    new ([user-guide.md](user-guide.md)).
  - This page, whose criteria 9 and 10 listed as missing what #165 had
    added, and [privacy.md](privacy.md) were behind; this update fixes
    both. #177 fixed others, such as the
    [journeys' README](../e2e/journeys/README.md)
    ([Small fixes](#small-fixes-this-assessment-found)).
- MUST, met — the source code is in English.
- MUST, met — the bundled policy is in English.
- SHOULD, met — terms explained, again as on 2026-10-13.
  - [glossary.md](glossary.md) covers the code's and the tools' terms,
    such as CI, SPDX, REUSE, npm, ports and adapters, Conventional
    Commits, commitlint, semantic-release, SemVer, deploy keys and
    environments, and since #165 DOI, ACR, WCAG and the EU data themes,
    such as `EDUC`.
  - [deck-library.md](deck-library.md) links the data theme table where
    it names `EDUC`. The README and CONTRIBUTING.md link the glossary.
  - Other terms are explained or linked where they're used, such as the
    merge queue ([testing.md](testing.md#the-merge-queue)), Zenodo
    ([releasing.md](releasing.md)), axe (`accessibility.md`) and CodeQL
    (`testing.md`).
- SHOULD, met — a plain reading level. Long pages open with a plain
  summary, and style.md asks for short sentences and everyday words.
  The technical pages are above that level, for their own readers.
- OPTIONAL, met — courtesy translations. The app's messages are in
  Swedish, Korean, German, Spanish and French too, and library decks
  carry their titles, descriptions and keywords in all six, the Korean
  decks since 2.1.1 included. The README says English is the
  authoritative language, and [i18n.md](i18n.md#translations) that
  it's the source, and how each translation was made.

### 11. Use open standards

- MUST, met — data is exchanged in open standards: the Solid Protocol,
  RDF, SHACL, DCAT, SKOS and the rest ([standards.md](standards.md)).
- MUST, met — the status of each standard is recorded: standards.md
  marks the drafts and de facto specifications, and every one used is
  open to read and to implement.
- MUST, met — every standard is listed with a link.
  - The branch `public-code-followup` added vCard, the SPDX terms and
    license list, CSV, WCAG and the repository's own conventions, such
    as REUSE, `publiccode.yml` and Semantic Versioning.
  - The Arabic decks (1.1.0) brought text written right to left, which
    the app isolates by the Unicode Bidirectional Algorithm: U+2068 and
    U+2069 in a message, `unicode-bidi: isolate` in the style sheet.
    The branch `standards-list` (#91) listed it, with CSS Writing Modes,
    Unicode Text Segmentation and the Collation Algorithm, which the app
    already relied on.
  - The docs at `/docs/` (#129, in 3.3.0) brought SVG, for the
    diagrams the build draws, listed with WOFF, for the font embedded
    in them and the app's own fonts.
  - Since #160, WCAG 2.2 at level AA is the target of the app and the
    Studio, and the journeys check each screen they visit with axe
    ([accessibility.md](accessibility.md#the-target)).
- MUST, met — the drafts and de facto ones don't hinder reuse
  (standards.md).
- SHOULD, met — where no standard existed, the project publishes its own
  open vocabulary and shapes in `ns/`. Since 2.0.0, `api/frozen/` and
  `npm run check:breaking` keep a published shape or term from being
  taken back ([releasing.md](releasing.md#the-public-api)).
- SHOULD, met — machine-testable standards preferred: two engines in CI
  check data against SHACL shapes.
- SHOULD, met — no non-open standard is used, so there's none to
  prefer.

### 12. Use continuous integration

- MUST, met — all functionality has automated tests, at 100% coverage
  in every package, the docs' build in `packages/markdown/tooling/`
  (new since 2.1.1) included. The scripts are covered too
  (`npm run check:scripts`), the four new since 2.1.1 included:
  `checkActions.ts`, `checkProviders.ts`, `docsArchive.ts` and
  `docsVersions.ts`, since removed. CI runs `shacl_crosscheck.py`'s own
  tests before the cross-check ([testing.md](testing.md)).
- MUST, met — contributions pass all tests before they're merged.
  - CI runs on every pull request, in the merge queue and on every push
    to `main`, and `ci-ok` passes only when all its jobs did. On
    `main`, a tree the merge queue already passed isn't tested again
    ([releasing.md](releasing.md#what-each-stage-checks)).
  - Its jobs are `check`, `site` (the build the journeys run on),
    `library` (the deck library and the public API compared with the
    change's base), `crosscheck`, `pod`, `contract`, `journeys`,
    `docs`, `workflows` and `commits`. `journeys` runs every journey in
    Chromium, and since #159 a set in Firefox, WebKit and on a phone,
    with axe's checks. `workflows` runs actionlint and zizmor, and
    `commits` commitlint and the closing keyword's check.
  - The ruleset requires `ci-ok` on the pull request and again in the
    merge queue, and its bypass list names only "Deploy keys", for the
    release. semantic-release pushes the release commit with its key
    once CI has passed on `main`, and CI checks that commit too before
    it's deployed.
  - The interop workflow's advisory servers don't gate, by design
    (`testing.md`), nor does CodeQL, which scans pull requests from the
    repository's own branches, not forks
    ([testing.md](testing.md#code-scanning)).
- MUST, met — guidelines for structuring contributions in
  CONTRIBUTING.md and the pull request template.
- MUST, met — an active contributor who reviews contributions: the
  maintainer, with 26 releases since 2026-10-13, 18 since 2.1.1, a
  thin margin (criterion 7).
- SHOULD, met — test results are public, a fork's pull request's too.
- SHOULD, met — one issue per pull request, as CONTRIBUTING.md asks;
  `npm run check:closes` checks that a pull request closes its issue.
- SHOULD, partial — coverage monitored. Each package's test coverage is
  in the CI run's summary, and `npm run check:docs` checks that every
  page in `docs/` is in [the docs' index](docs.ttl). Nothing measures
  the docs' coverage: every package, app and end-to-end suite has a
  README today, but no check holds it, and nothing checks that every
  export has a comment.
- OPTIONAL, partial — the policy and the docs tested against the code.
  - The generated vocabulary, the vendored packages' list, the SM-2 and
    FSRS-6 tables and, since 2.0.0, the public API in `api/` are
    checked: a test writes each file from the code and fails when they
    disagree ([api/README.md](../api/README.md)).
  - Since 2.1.1, the built site's test checks that every address
    publiccode.yml names on the site's domain is a page the build
    serves.
  - Since #177, `npm run check:docs` fails on an `npm run` in the
    Markdown that names no script.
  - standards.md, the answers CSV's columns in statistics.md and
    testing.md's list of CI jobs aren't checked.
- OPTIONAL, met — the docs tested for style and broken links:
  markdownlint, cspell and lychee.
- OPTIONAL, partial — the software tested with the docs' examples:
  `sm2.test.ts` uses srs.md's, but the docs' Turtle examples aren't
  checked.

### 13. Publish with an open license

- MUST, met — the code and docs are under the MIT License, and the
  decks carry their own open licenses.
- MUST, met — MIT is approved by the OSI.
- MUST, met — a license file, and every license's text in `LICENSES/`.
- MUST, met — no copyright transfer and no contributor license
  agreement ([CONTRIBUTING.md](../CONTRIBUTING.md#licensing)).
- SHOULD, met — machine-readable notices in every file, by REUSE. The
  `docs` job, which `ci-ok` needs, runs `reuse lint`
  ([style.md](style.md#licenses)), which passes at `befdae42` for all
  1,738 files, `api/` included. `npm run check:reuse` checks that each
  deck is listed under the license it states.
- OPTIONAL, met — several licenses: MIT for the code and the docs, and
  each deck's own license.

### 14. Make the codebase findable

- SHOULD, not met — a descriptive name. The project is "Solid Memo", but
  the repository is still called `website`, by choice.
- SHOULD, met — a short description, on the repository, in
  `package.json` and in `publiccode.yml`.
- SHOULD, not met — submitted to software catalogs.
- SHOULD, met — a website that explains the problem for different
  readers: [solid-memo.com/about](https://solid-memo.com/about/), for
  learners, deck authors, technologists and decision makers.
- SHOULD, not met — findable by name in a search engine. A web search
  for "Solid Memo" on 2026-10-18 didn't find the project, and the site
  isn't registered with any search engine.
- SHOULD, not met — findable by the problem it solves: a web search for
  spaced-repetition flashcards kept in a Solid pod, on 2026-10-18,
  didn't find it.
- SHOULD, met — a persistent identifier whose entry names the major
  contributors, the repository and the website.
  - Zenodo gives each GitHub release a DOI. The concept DOI,
    [10.5281/zenodo.23351087](https://doi.org/10.5281/zenodo.23351087),
    is in `CITATION.cff` and the README.
  - Zenodo doesn't take `CITATION.cff`'s `url`, so `.zenodo.json` lists
    the website (#165). The entry of 3.11.0, the first release that
    carries it ([releasing.md](releasing.md#what-a-release-does)),
    names the author, the repository and solid-memo.com; earlier
    versions' entries don't name the website.
  - Software Heritage's copy of the code (#131) names the repository
    alone.
- SHOULD, met — machine-readable metadata: `publiccode.yml`, checked in
  CI, whose `documentation` is the docs on the site; `CITATION.cff`; and
  `.zenodo.json`, which Zenodo reads from each release.
- OPTIONAL, met — a domain of its own, solid-memo.com. The vocabulary,
  the shapes and the decks live under it, so the data in people's pods
  depends on it. The maintainer registers and pays for it one year at a
  time. [GOVERNANCE.md](../GOVERNANCE.md#the-domain) says who holds it,
  where its expiry is public, and that it stays renewed for at least 3
  years if the repository is archived.
- OPTIONAL, not met — regular talks at conferences.

### 15. Use a coherent style

- MUST, met — a style guide, [style.md](style.md).
- SHOULD, met — style checked by Biome, the Turtle formatter,
  markdownlint and cspell, in `npm run check` and CI. Since
  #139, Biome's lint fails on modules that import each other in a
  circle and on a function too complex to follow; since #160, a rule is
  turned off only for the files its reason names
  ([style.md](style.md#formatting)).
- SHOULD, met — rules for comments and docs, in style.md.
- OPTIONAL, met — rules for understandable English, there too.

### 16. Document codebase maturity

- MUST, met — versioned.
  - semantic-release releases each version (criterion 6); the site
    runs only the newest, and the footer shows which.
  - Since 3.3.0 (#129), each GitHub release carries its docs as an
    archive ([deployment.md](deployment.md#older-releases-docs)).
  - 2.0.0 was a major version by mistake: no commit in it breaks
    anything, but semantic-release read a line in a commit's body as a
    breaking change, as [releasing.md](releasing.md) says. The release
    now counts only a `BREAKING CHANGE:` footer (#84, in 2.0.1).
  - 3.0.0 is a major version for a real break: the app writes cards
    in card format 6. Its
    commit marks it with `!` and a `BREAKING CHANGE:` footer (#119),
    and the changelog says what it breaks.
- MUST, met — maturity stated. The README, the about page and
  `publiccode.yml` (`developmentStatus: stable`) say the app is stable
  from 1.0.0, its first version, and the releases page lists each
  released version. No version before 1.0.0 was released, so the
  footer shows no version the docs disown.
- MUST, partial — a version ready to use depends only on versions ready
  to use.
  - 1.0.0 is declared ready, and `npm run check` refuses a prerelease or
    0.x dependency of the app but four, each with its reason in
    [vendor-code.md](vendor-code.md#maturity) (decision 14):
    - `rdf-validate-shacl` 0.6 and `rdf-validate-datatype` 0.2, the
      SHACL engine the app uses;
    - `@inrupt/solid-client-errors` 0.0, released with
      `@inrupt/solid-client` 4;
    - `process` 0.11, final at 0.11 by its maintainer's choice.
  - Mermaid, which draws the docs' diagrams at build time, brings
    packages before 1.0.0 too, none of them shipped.
  - While the app was in beta, no version was declared ready, and this
    held.
- SHOULD, met — a summary of changes, in [CHANGELOG.md](../CHANGELOG.md).
  semantic-release writes each version's entry from the commits, and a
  section written by hand sums up 1.0.0. Since 2.1.0, the footer on
  every screen links to it.
- SHOULD, met — the version scheme, in `releasing.md`, with
  [the public API](releasing.md#the-public-api) a version promises and
  what counts as breaking for data in pods.
- OPTIONAL, met — Semantic Versioning, from 1.0.0, with
  `npm run check:breaking` in CI since 2.0.0. 2.0.0 raised the major
  version with nothing broken, which Semantic Versioning allows.

## Decisions made

The maintainer made these choices, each recorded where it applies.

1. **Governance.** One maintainer decides, in public, and gives reasons.
   A regular contributor can be invited as a co-maintainer. A
   maintainer who steps away hands the organization and the domain to
   a co-maintainer; otherwise the repository is archived and the domain
   stays renewed for at least 3 years ([GOVERNANCE.md](../GOVERNANCE.md)).
2. **Security contact.** GitHub's private vulnerability reporting only:
   no email address and no `/.well-known/security.txt`
   ([SECURITY.md](../SECURITY.md)).
3. **Review.** The maintainer merges his own pull requests without a
   second reviewer, a stated, temporary exception
   ([GOVERNANCE.md](../GOVERNANCE.md#merging)), and invites a second
   reviewer.
4. **Email in decks.** The 205 published deck versions keep
   `foaf:mbox`, as a published version is never edited. A new version
   names the project's contact, a `dcat:contactPoint` at the issue
   tracker, with no email address, which `npm run library:check` checks
   for every version not published at the base
   ([deck-library.md](deck-library.md#contact), [privacy.md](privacy.md)).
5. **Repository name.** Kept as `website`; the description and the
   metadata name the project.
6. **License of `docs/` and `ns/`.** MIT, as for the code, stated in the
   README and set up with REUSE.
7. **Maturity and versions** (2026-10-13), replacing "beta, Semantic
   Versioning at 0.x, tagged by hand, with a changelog in the Keep a
   Changelog format".
   - Every commit, Renovate's included, follows Conventional Commits
     1.0.0, checked by commitlint in CI.
   - semantic-release releases a version on every push to `main` with a
     releasable commit, once CI has passed. It commits the version and
     the changelog back to `main` with a deploy key the ruleset lets
     bypass its pull request, tags the commit and makes a GitHub
     release, from which Zenodo mints a DOI.
   - The first version is 1.0.0, and stable, and 0.1.0 is never tagged
     ([releasing.md](releasing.md),
     [CONTRIBUTING.md](../CONTRIBUTING.md#commit-messages)).
   - deploy.yml deploys only the commit a version tag names
     ([deployment.md](deployment.md)).
8. **Renovate.** Updates are merged automatically through pull requests
   (`automergeType: 'pr'`) once CI passes. Renovate can't approve its
   own pull requests and gets no bypass: once `main` requires an
   approval, a maintainer approves each update before automerge. If
   that's too many approvals, automerge is narrowed, not the review
   ([GOVERNANCE.md](../GOVERNANCE.md#dependency-updates)).
9. **Formatting.** Biome, with a line width of 100
   ([style.md](style.md#formatting)).
10. **Spelling.** American English everywhere, checked by cspell.
11. **Code of conduct.** The Contributor Covenant 2.1, with reports to
    the maintainer's email, published for that purpose.
12. **Criteria 6 and 7 with one maintainer** (2026-10-13). Decisions in
    commit messages (6.2) and links to issues (6.3) apply from 1.x, and
    the commits before 1.0.0 stay as they are. Review by another
    contributor (7.1) and reviews that cover the source, the policy,
    the tests and the docs (7.2) are gaps while there's one
    maintainer.
13. **Open, written communication** (2026-10-15).
    - All collaboration, maintenance, decisions and discussion happen
      openly and in writing: issues, Discussions, pull requests and
      their reviews, and commit messages, where every decision and its
      reasons can be found and linked.
    - The project runs and endorses no chat, direct messages, or voice
      or video calls or meetings. Something said elsewhere counts for
      nothing until it's written up in public, and a maintainer points
      such a message to the public channel. This binds the maintainers
      between themselves too.
    - The two exceptions are private but written: security
      vulnerabilities go in a private advisory, made public once the fix
      is deployed, and code of conduct reports go by email or through
      GitHub's Report abuse
      ([GOVERNANCE.md](../GOVERNANCE.md#where-the-project-talks)).
14. **Dependencies before 1.0.0** (2026-10-15). Solid Memo is stable
    within an ecosystem not yet at 1.0: the Solid Protocol and
    Solid-OIDC are drafts, and the libraries around them are 0.x. The
    dependencies before 1.0.0 that
    [vendor-code.md](vendor-code.md#maturity) allows stay, each with its
    reason, and criterion 16's MUST is a recorded gap until they reach
    1.0.0 or a ready replacement exists. A new one is refused unless
    added there with its reason.

Whatever is decided later:

- Deck attribution stays "Compiled by Anton Wiklund with the help of AI".
  No contribution or review text may say or imply that the maintainer
  reviews decks.
- Published `decks/*/vN.ttl`, `ns/shapes/*/vN.ttl` and `ns/vocab/vN.ttl`
  files are never edited; a change ships as a new version.

## What remains

Each item below starts with its state: **Done.** when it has landed,
**Open.** when it hasn't.

### GitHub settings (admin)

Only an admin of the repository can change these. All are done, as
[GitHub settings](#github-settings) records:

- **Done.** **Private vulnerability reporting**, its exclusion gone
  from `lychee.toml`. *(5)*
- **Done.** **Secret scanning and push protection.** *(1)*
- **Done.** **Discussions**, their exclusion gone from `lychee.toml`.
  *(5)*
- **Done.** **Topics**, beside the description and homepage. *(14)*
- **Done.** **Labels** for the deck, interop and translation forms.
- **Done.** **The ruleset on `main`** (24560297), with no bypass for
  Renovate. *(7, 12)*
- **Done.** **Allow auto-merge.**
- **Done.** **The merge queue on `main`** (#76). *(7, 12)*
- **Done.** **The `github-pages` environment**, `main` its only
  deployment branch; the deploy runs from `main` even when it deploys
  a version's tag. *(1, 12)*

### Actions for the maintainer

- **Done.** **The blame-ignore list.** The branch
  `standard-for-public-code` was merged with a merge commit (#37), so
  the reformat's SHA in `.git-blame-ignore-revs` (`7646413`, "Reformat
  the code with Biome") names a commit on `main`
  ([style.md](style.md#formatting)). *(15)*
- **Done.** **Zenodo**, connected to the repository. *(14)*
- **Done.** **The release's deploy key**, before the branch
  `semantic-release` was merged: an SSH key pair whose public key is a
  deploy key with write access, and whose private key is the repository
  secret `SEMANTIC_RELEASE_KEY`, later moved into the `release`
  environment. "Deploy keys" went on the bypass list of the ruleset on
  `main` ([releasing.md](releasing.md#the-deploy-key)). *(1, 6, 16)*
- **Done.** **The first release.** The merge of the branch
  `semantic-release` released 1.0.0: the release commit and `v1.0.0`
  are on `main`. *(1, 6, 16)*
- **Done.** **A ruleset for version tags**, on `refs/tags/v*`. The
  deploy deploys the commit a version tag names, so without it anyone
  with write access could pick what's deployed. *(1)*
- **Done.** **The `release` environment** (#80), made, or opened if a
  run had made it, with `main` as its only deployment branch, the key
  moved into it and the repository secret, which a workflow on any branch can
  read, deleted. It stays the only deploy key with write access, as
  both rulesets' bypass lets every such key past. *(1)*
- **Done.** **The DOI**, in `CITATION.cff` and the README. *(14)*
- **Done.** **Software Heritage.** A copy of the repository is
  [preserved there](https://archive.softwareheritage.org/browse/origin/?origin_url=https://github.com/solid-memo/website),
  first as snapshot
  `swh:1:snp:dcf5c64c3cf402c99c0cf9ab72ebe36ba158d74b` (3.2.0), and
  revisited for new commits. The repository stays maintained where it
  is; the copy keeps the code findable if GitHub ever isn't. *(14)*
- **Open.** **Search engines:** verifying solid-memo.com in Google
  Search Console and Bing Webmaster Tools, and submitting
  `sitemap.xml`. *(14)*
- **Open.** **The Solid community:** asking for a listing on
  solidproject.org, and posting about the project on the Solid forum.
  *(3, 14)*
- **Open.** **Local branches:** deleting the 17 leftover `pc/*` and
  `*-backup` branches on the maintainer's machine, or publishing any
  that holds work not on `main`. *(1)*
- **Open.** **A second reviewer.** Once there's one, the ruleset on
  `main` requires one approval and code-owner review, and Renovate's
  pull requests wait for a maintainer's approval before automerge
  (decision 8). *(7, 12)*

### Small fixes the assessment of 2026-10-16 found

Made in #165 and released in 3.11.0, so the docs the site serves
have them:

- **Done.** **Terms.** DOI, ACR and WCAG are in
  [glossary.md](glossary.md), their first uses linked there, and
  [deck-library.md](deck-library.md) links the EU data theme table
  where it names `EDUC`. *(10)*
- **Done.** **The DOI's entry.** `.zenodo.json` lists solid-memo.com as
  a related identifier. *(14)*
- **Done.** **CodeQL in the docs.** [testing.md](testing.md#code-scanning)
  and SECURITY.md say what CodeQL checks, that it doesn't gate a merge,
  and that its alerts are fixed in pull requests like any change. *(12)*
- **Done.** **ROADMAP.md.** "Done recently" lists what came after 1.0.0,
  up to 3.10.1. *(4)*
- **Done.** **The user guide**: the Arabic decks and worked examples,
  as criterion 9 lists. *(9)*

### Small fixes this assessment found

Found on 2026-10-18:

- **Done.** **privacy.md.** It said every published deck version names
  the maintainer's email address, which the library's index repeats.
  It now says the first 205 versions do, every version since names the
  project's contact, and the index gives no email address. *(1, 10)*
- **Done.** **The user guide's journeys**, the four its table left
  out, added by #177. *(9)*
- **Done.** **The journeys' README.** [e2e/journeys](../e2e/journeys/README.md)
  said the journeys run the built app in Chromium; since #177, it says
  a few run in Firefox, WebKit and on a phone too. *(10)*
- **Open.** **`.zenodo.json` in standards.md.** [standards.md](standards.md)
  lists `CITATION.cff` and `publiccode.yml` as metadata formats, but
  not `.zenodo.json`, Zenodo's deposit metadata. It's Zenodo's
  configuration, as `renovate.json5` is Renovate's, so criterion 11
  still holds. A row beside `CITATION.cff` would say where its fields
  come from. *(11)*

### Gaps that remain

These aren't met, and the settings and actions above don't close them:

- **Criterion 7, review by another person.** A decided gap (decision
  12). A second reviewer, with one approval required on `main` for
  every pull request, closes the MUST on review and the SHOULD on no
  unreviewed changes, and shows reviews that cover the four areas and
  run the app. The other SHOULDs need a reviewer from a different
  context, and, for review within two business days, enough reviewers
  and a way to measure it.
- **Criterion 3, several parties.** Use, the roadmap and development
  need other parties; the roadmap invites them, but none has joined.
- **Criterion 3, situation-specific information.** The files criterion
  3 lists, which [reuse.md](reuse.md#6-what-you-edit-by-hand) lists
  for a copy to change, and three old commits that name paths on the
  maintainer's machine.
- **Criterion 6, decisions in commit messages.** 91 of the 407 commits
  on `main` before 1.0.0 record no reason, and rewriting `main` isn't
  an option. The requirement applies from 1.x (decision 12), and with
  CI refusing a new commit with no body, the share only shrinks.
- **Criterion 6, links to issues.** 23 commits since 1.0.0, and most
  older ones, link no issue. The requirement applies from 1.x
  (decision 12), and CI refuses a new commit that names no issue.
- **Criterion 9, examples for all functionality**, for the three
  features and the text direction criterion 9 names.
- **Criterion 12, the docs' coverage**: READMEs and export comments.
- **Criterion 16, dependencies ready to use.** A decided gap (decision
  14), closed when each of the four
  ([vendor-code.md](vendor-code.md#maturity)) reaches 1.0.0 or has a
  ready replacement. [`shacl-engine`](https://www.npmjs.com/package/shacl-engine)
  1.x exists, but brings in packages before 1.0.0 of its own, and a
  SPARQL engine the app doesn't need.
- **Criterion 14, findability.** The name is kept by choice; catalogs
  and search engines wait for the actions above.

## The plan, as it landed

The first assessment's plan, each item marked **Done.** or **Open.**
Most of it landed on the branch `standard-for-public-code`.

### Phase 1: files and small fixes

- **Done.** **Footer**, its repository URL from `VITE_REPO_URL`, in
  every language the app speaks, with the version
  ([`Footer.tsx`](../packages/ui/src/ui/Footer.tsx), criterion 1).
- **Done.** **`CONTRIBUTING.md`**, linked from the README.
- **Done.** **`GOVERNANCE.md`** and `.github/CODEOWNERS`.
- **Done.** **`SECURITY.md`.** No `security.txt`, as decided.
- **Done.** **Templates.** The issue forms, `config.yml`, which points
  conduct reports to their email contact, the pull request template,
  and `CODE_OF_CONDUCT.md`.
- **Done.** **README.** About, Status, Run it on its own, Contributing,
  the language statement, the badges, the journeys report and the
  licenses.
- **Done.** **New pages**: [objectives.md](objectives.md),
  [policy.md](policy.md), [standards.md](standards.md),
  [privacy.md](privacy.md) and [glossary.md](glossary.md), the full SM-2
  citation, and links to the specifications.
- **Done.** **`ROADMAP.md`.**
- **Done.** **Metadata and style.** `publiccode.yml`, `CITATION.cff`,
  `CHANGELOG.md`, [releasing.md](releasing.md), `.gitattributes`,
  `.editorconfig`, [style.md](style.md), the root `package.json`'s
  metadata, and the JSON-LD in `apps/web/index.html`.
- **Done.** **Package docs.** A README and a `description` for each
  package, `e2e/journeys` in [architecture.md](architecture.md), and
  the 0.x dependencies' maturity in
  [vendor-code.md](vendor-code.md#maturity).
- **Open.** **Branches**, the leftover local ones (above).

### Phase 2: CI and GitHub settings

- **Done.** **`ci.yml`.** Runs on every pull request and on pushes to
  `main`, with the `ci-ok` job, a read-only token and no secrets.
- **Done.** **The deck library's base.** Compared in `ci.yml`'s
  `library` job, which `ci-ok` waits for; `ns.yml`, whose other checks
  were all in `ci.yml`, is gone.
- **Done.** **`deploy.yml`**, which deploys as criterion 1 says.
- **Done.** **`renovate.json5`.** `automergeType: 'pr'`, and a
  `commitBody` that records each update and why.
- **Done.** **Checks in `npm run check`.** The docs index
  (`npm run check:docs`), prerelease dependencies
  (`npm run check:dependencies`), and each package's coverage in the
  run's summary.
- **Done.** **A docs job.** lychee (offline on every change, online
  weekly), `reuse lint` and the publiccode.yml parser; markdownlint and
  cspell run in `npm run check`, so in the check job.
- **Done.** **License required.** `npm run library:check` refuses a new
  deck version without `dcterms:license`, and `sm2.test.ts` checks the
  scheduler against [srs.md](srs.md#worked-examples) (criterion 2).
- **Done.** **GitHub settings**, listed above.

### Phase 3: larger work

- **Done.** **Configuration.** `VITE_APP_NAME`, `VITE_REPO_URL` and
  `VITE_POD_PROVIDERS`, [configuration.md](configuration.md),
  [reuse.md](reuse.md), and a generic custom domain section in
  [deployment.md](deployment.md). No CI build under a subpath.
- **Done.** **User documentation.** [user-guide.md](user-guide.md),
  [statistics.md](statistics.md), [browsing.md](browsing.md), examples
  in [markdown.md](markdown.md) and [boundaries.md](boundaries.md), and
  a plain summary at the top of long pages.
- **Done.** **Formatter and linter.** Biome in `npm run check`, with the
  reformat in `.git-blame-ignore-revs`.
- **Done.** **REUSE.** `REUSE.toml`, `LICENSES/`, SPDX headers, the
  license on the `ns/` graphs ([vocab.md](vocab.md#license)),
  `reuse lint` in CI, and `npm run check:reuse` for the decks' licenses.
- **Done.** **Releases.** semantic-release releases each version from
  the commits, the footer shows it, and only released versions are
  deployed, from protected tags. Zenodo archives each release, and
  Software Heritage keeps a copy (criteria 1, 6, 14 and 16).
- **Open.** **Findability.** The about page is in the build's sitemap;
  search engines and the Solid community remain.
- **Done.** **Deck contact.** New deck versions name the project's
  contact.
- **Open.** **A second reviewer.**

## Checking progress

- The full check passes at 100% coverage after every code change, and
  `npm run crosscheck`, `npm run format:turtle` and `npm run library`
  after a change to `ns/` or `decks/`.
- GitHub's community profile (`/community`) shows every item.
- A pull request from a fork runs CI, `ci-ok` is required, and the
  template appears.
- A pull request that edits a published deck version fails.
- A deploy by hand from a branch other than `main` is skipped.
- A push to `main` that releases nothing isn't deployed; a release
  commit is, once CI passes on it, and a deploy by hand deploys the
  newest version.
- The footer's links open the source code, the commit and the issues on
  `solid-memo/website`.
- GitHub's blame of a reformatted file on `main` shows the change that
  wrote each line, not the reformat.
- `lychee.toml` excludes no address whose setting or tag now exists.
- A re-assessment goes through the criteria again and updates the
  scorecard with the commit of `main` assessed and the date. It counts
  a body as what's left once the trailers are left out, and a link as
  an issue or pull request number or address.
