# The Standard for Public Code

How well Solid Memo meets the [Standard for Public Code](https://www.standardforpubliccode.org/)
(version 0.8.1), and a plan for the rest. Each criterion is a list of
requirements, and each requirement is a MUST, a SHOULD or OPTIONAL.

This is an assessment of `main` at `18eace6`, made on 2026-10-10, and a
work list. It is not a promise. Tick items off as they land, and re-assess
when a phase is done.

## Summary

The engineering is strong:

- The code is open and MIT-licensed, and every deck release has an open licence.
- The app is built on open standards: Solid, Solid-OIDC, RDF, SHACL, DCAT, SKOS and PROV-O.
- Coverage is at 100% in every package, and interop is tested against several Solid servers.
- The vocabulary, shapes and decks are versioned rigorously.

The project fails the criteria about people and process:

- How to contribute, how decisions are made, how contributions are reviewed, and how to report a vulnerability.
- Versions and maturity.
- What the codebase is for.

Most of those gaps close with a few files and repository settings.

Criterion 7 asks for review by someone other than the author. That cannot be met
honestly while the project has one maintainer.

## Scorecard

The counts are requirements met out of those that apply. Partial and
unknown count as not met.

| # | Criterion | MUST | SHOULD | Verdict |
|---|---|---|---|---|
| 1 | [Code in the open](https://www.standardforpubliccode.org/criteria/code-in-the-open.html) | 2/2 | 0/1 | Compliant |
| 2 | [Bundle policy and source code](https://www.standardforpubliccode.org/criteria/bundle-policy-and-source-code.html) | 1/2 | 1/2 | Partial |
| 3 | [Make the codebase reusable and portable](https://www.standardforpubliccode.org/criteria/make-the-codebase-reusable-and-portable.html) | 1/2 | 2/8 | Partial |
| 4 | [Welcome contributors](https://www.standardforpubliccode.org/criteria/welcome-contributors.html) | 1/3 | 0/4 | Non-compliant |
| 5 | [Make contributing easy](https://www.standardforpubliccode.org/criteria/make-contributing-easy.html) | 1/5 | – | Non-compliant |
| 6 | [Maintain version control](https://www.standardforpubliccode.org/criteria/maintain-version-control.html) | 1/3 | 1/4 | Non-compliant |
| 7 | [Require review of contributions](https://www.standardforpubliccode.org/criteria/require-review-of-contributions.html) | 0/3 | 0/5 | Non-compliant |
| 8 | [Document codebase objectives](https://www.standardforpubliccode.org/criteria/document-codebase-objectives.html) | 0/1 | 0/1 | Non-compliant |
| 9 | [Document the code](https://www.standardforpubliccode.org/criteria/document-the-code.html) | 1/3 | 1/5 | Non-compliant |
| 10 | [Use plain English](https://www.standardforpubliccode.org/criteria/use-plain-english.html) | 2/4 | 0/2 | Partial |
| 11 | [Use open standards](https://www.standardforpubliccode.org/criteria/use-open-standards.html) | 2/4 | 2/2 | Partial |
| 12 | [Use continuous integration](https://www.standardforpubliccode.org/criteria/use-continuous-integration.html) | 1/4 | 0/3 | Non-compliant |
| 13 | [Publish with an open license](https://www.standardforpubliccode.org/criteria/publish-with-an-open-license.html) | 4/4 | 0/1 | Compliant |
| 14 | [Make the codebase findable](https://www.standardforpubliccode.org/criteria/make-the-codebase-findable.html) | – | 1/8 | No MUSTs |
| 15 | [Use a coherent style](https://www.standardforpubliccode.org/criteria/use-a-coherent-style.html) | 0/1 | 0/2 | Non-compliant |
| 16 | [Document codebase maturity](https://www.standardforpubliccode.org/criteria/document-codebase-maturity.html) | 0/3 | 0/2 | Non-compliant |
| | **Total** | **17/44** | **8/50** | |

A criterion is compliant when all its MUSTs are met. It is non-compliant when
more than half of them are not met.

Some of this could not be checked without signing in to GitHub. These were
read once and not checked again:

- The ruleset on `main` (ruleset 24560297) requires a pull request and the `build` check, and no approvals.
- Private vulnerability reporting is off.

Check these again before relying on them.

## What meets the standard today

- **Open code and licences.** The code is public and MIT-licensed. Production is built only from public `main`, after CI passes. No secrets are in the tree or its history. Every deck and course release declares an open `dcterms:license`. Vendored shapes keep their own licences.
- **Open standards.** The app uses the Solid Protocol, Solid-OIDC, the type index, RDF and Turtle, SHACL, DCAT 3 and DCAT-AP, SKOS, PROV-O, schema.org, CommonMark and BCP 47. It publishes its own versioned vocabulary in `ns/`.
- **Continuous integration.** `npm run check` runs at 100% coverage, alongside the pySHACL cross-check, the pod, contract and journey tests, and a weekly interop run.
- **Portability.** The build is static and runs from any host or subpath. `VITE_LIBRARY_INDEX_URL` points a build at another deck library.
- **Developer docs.** There are about twenty topic pages in this folder, updated in the same commits as the code.

## Gaps

These are the requirements not yet met, by criterion. Paths are as of
`18eace6`.

### 1. Code in the open

- SHOULD — publish all source code. Some branches exist only on the
  maintainer's machine, and no versions are tagged.
- OPTIONAL — link the source from the app. The footer link
  (`apps/web/src/ui/Footer.tsx:23`) points at the archived
  `antwika/solid-memo`, so the commit link is a 404 for current builds.
  `Footer.test.tsx` asserts that URL.
- Hardening:
  - `deploy.yml` lets `workflow_dispatch` deploy any branch without CI having passed.
  - The maintainer's personal email is published as `foaf:mbox` in 98 files under `decks/`.

### 2. Bundle policy and source code

- MUST — bundle the policy the code implements:
  - No public policy applies, but nothing says so.
  - SM-2 is cited only as "Wozniak 1990" (`packages/domain/src/sm2.ts`, [srs.md](srs.md)).
  - [authentication.md](authentication.md) does not link Solid-OIDC or WebID.
  - The type index and the CLDR plural rules are used without references.
  - No page says what the app does with personal data.
- SHOULD — tests that check the policy. Nothing makes a deck licence required: the
  `#license` property shapes have no `sh:minCount`, and the deck library
  check does not look for one.

### 3. Make the codebase reusable and portable

- MUST — reusable in other contexts:
  - The pod providers, the app name and the footer URLs are hard-coded.
  - No guide explains how to run your own instance.
- SHOULD — used by several parties, roadmap set together, contributors
  from several parties. None of these holds yet: there is one maintainer, no
  forks and no roadmap.
- SHOULD — configuration rather than code:
  - Only `VITE_LIBRARY_INDEX_URL` is configurable.
  - [deployment.md](deployment.md) and `CNAME` carry this deployment's own domain setup.
- SHOULD — modules documented for reuse. No package has a README or a
  `description`.

### 4. Welcome contributors

- MUST — contribution guidelines. There is no `CONTRIBUTING.md`.
- MUST — governance. Nothing says who decides and how. This includes who may
  deploy by hand, and when Renovate automerges.
- SHOULD — who pays for reviews, which organisations are involved, and a public
  roadmap. None of these is stated.
- SHOULD — activity statistics. There are no badges, and the footer links the wrong
  repository.
- OPTIONAL — a code of conduct. There is none.

### 5. Make contributing easy

- MUST — the README does not link to the issue tracker or pull requests.
- MUST — no public communication channel: Discussions are off.
- MUST — no closed channel for vulnerability reports, and no
  instructions for making one: there is no `SECURITY.md` and no
  `/.well-known/security.txt`.

### 6. Maintain version control

- MUST — decisions in commit messages. Recent commits explain themselves, but
  about a third of all commits have no body, and nothing asks for one.
- MUST — commits link to issues. None do. Renovate commits land without a
  pull request (`renovate.json5`: `automergeType: 'branch'`).
- SHOULD — group changes into commits, and mark released versions:
  - No guideline asks contributors to group changes into commits.
  - No version is tagged, there is no changelog, and every package is `0.0.0`.
- SHOULD — diff-friendly formats. Text formats are used, but nothing asks for them, and there is
  no `.gitattributes`.

### 7. Require review of contributions

- MUST — every contribution is reviewed by someone other than its author. The maintainer merges their
  own pull requests, and Renovate merges without one.
- MUST — reviews cover the source, policy, tests and documentation. No pull request template asks
  for any of these.
- MUST — tell contributors why a contribution is declined. No policy says so.
- SHOULD — reviewers check conformance to the architecture and run the software. Pull requests from
  forks get no CI.
- SHOULD — a reviewer from another context, no unreviewed changes on the
  release branch, and review within two business days. None of these holds.

### 8. Document codebase objectives

- MUST — the only stated objective is the README's tagline.
- SHOULD — nothing links the objectives to the principles and standards that
  serve them.

### 9. Document the code

- MUST — all functionality described. Statistics, browsing, preferences, the
  card creators, the chapter player and the today summary have no page.
- MUST — examples of the main features. No walkthrough of using the app. The
  journeys report at `/journeys/` is not linked from the README.
- SHOULD — a plain-language overview, a "run it on its own" section, and
  examples on every page. [markdown.md](markdown.md) and
  [boundaries.md](boundaries.md) have none.
- SHOULD — documentation quality checked in CI. Links and formatting are not
  checked, and nothing checks that every page is in [README.md](README.md).

### 10. Use plain English

- MUST — English is the authoritative language. It is in practice, but nothing
  says so.
- SHOULD — terms explained. There is no glossary for SRS, RDF, SHACL, WebID,
  IdP, DCAT-AP, CJK, Hangul, jamo, NFC and the rest.
- SHOULD — readable by non-specialists. Long pages have no plain summary
  first, and the spelling mixes British and American.

### 11. Use open standards

- MUST — standards listed with links. Few specifications are linked from the docs.
- MUST — non-open standards documented. Several of the specifications used are drafts or
  de facto rather than open standards: GFM, `markdown-cjk-friendly`, the
  type index, schema.org and SM-2. No page says so.

### 12. Use continuous integration

- MUST — contributions pass the tests before they are merged. No workflow
  runs on `pull_request`, and the manual deploy skips the CI check.
- MUST — guidelines for structuring contributions. [AGENTS.md](../AGENTS.md) is written for
  agents, not people.
- MUST — maintainers active enough to keep up with contributions. There is one.
- SHOULD — results public for every contribution, one issue per
  contribution, and coverage monitored. Fork pull requests get no
  results, and coverage is enforced but not published.

### 13. Publish with an open license

- SHOULD — a licence in every source file. No file has an SPDX header.
- Hardening:
  - The licence of `docs/` and `ns/` is only implied by the MIT licence.
  - `ns/vocab` declares no `dcterms:license`.

### 14. Make the codebase findable

- SHOULD — a descriptive name. The repository's name, `website`, says
  nothing about the project, and the archived `antwika/solid-memo` still shows
  up in searches.
- SHOULD — listed in catalogues, findable by its name and by the problem it
  solves, a persistent identifier, and machine-readable metadata. It has none of these: no GitHub topics, no
  `publiccode.yml`, no DOI. The site has no crawlable page explaining what
  it is.

### 15. Use a coherent style

- MUST — a style guide. Only Turtle has one, in
  `packages/turtle/src/formatTurtle.ts`.
- SHOULD — style tested automatically. Only Turtle is checked.
- SHOULD — rules for comments and documentation. Comments are good in practice,
  but nothing asks for them.

### 16. Document codebase maturity

- MUST — versioned. Everything is `0.0.0`, and no versions are tagged.
- MUST — maturity stated. The README does not say how ready the app is.
- MUST — a ready version depends only on ready dependencies. `rdf-validate-shacl` (0.x) and
  `micromark-extension-cjk-friendly` ship without a word on their maturity.
- SHOULD — a summary of changes per version, and a documented scheme for
  versions. Neither exists.

## Decisions to make first

Several items depend on a choice only the maintainer can make:

1. **Governance.** A single maintainer who decides, how someone becomes a
   co-maintainer, and what happens to the project if the maintainer steps
   away.
2. **Security contact.** GitHub's private vulnerability reporting alone, or
   also a role address and `/.well-known/security.txt`.
3. **Review.** Who could be a second reviewer: a Korean speaker, or someone
   from the Solid server community. Until there is one, state self-merge as a
   known, temporary exception.
4. **Personal email in decks.** Published deck versions cannot be edited.
   Either keep `foaf:mbox` as it is, or give future versions a project contact
   (for example `dcat:contactPoint` pointing at the issues). Say which in the
   privacy page.
5. **Repository name.** Rename `website` (GitHub redirects the old URL), or keep
   it and give it a descriptive description.
6. **Licence of `docs/` and `ns/`.** MIT stated outright, or CC BY 4.0 or
   CC0. This decides how REUSE is set up.
7. **Maturity and versions.** A status (for example "beta"), SemVer 0.x
   tags, and whether release-please makes the releases.
8. **Renovate.** Keep automerging onto branches, or switch to
   `automergeType: 'pr'`, so every dependency update has a pull request and
   passes the required check.

Whatever is decided:

- Deck attribution stays "Compiled by Anton Wiklund with the help of AI". No
  contribution or review text may say or imply that the maintainer reviews
  decks.
- Published `decks/*/vN.ttl` and `ns/shapes/*/vN.ttl` files are never
  edited. A change ships as a new version.
- `ns.yml` runs on pushes only on purpose (`ff115e7`), to avoid running twice.
  Any change to its triggers keeps that.

## Plan

### Phase 1: files and small fixes

- [ ] **Footer.**
  - Build the commit link from a `VITE_REPO_URL` that `apps/web/vite.config.ts` injects, as it does the commit SHA. Default to `https://github.com/solid-memo/website`.
  - Add "Source code" and "Report an issue" links, with strings in en, sv and ko.
  - Update `Footer.test.tsx`, `App.test.tsx` and `i18n.test.tsx`. *(1–6, 9, 14, 16)*
- [ ] **`CONTRIBUTING.md`**, linked from the README and `AGENTS.md`. It covers:
  - the kinds of contribution, linking [deck-library.md](deck-library.md), [courses.md](courses.md) and [i18n.md](i18n.md);
  - opening an issue before changing the vocabulary, shapes or decks;
  - fork, branch and pull request, and the setup;
  - the definition of done, linked from `AGENTS.md` rather than copied;
  - commit messages: an imperative subject, a body that explains why, a `Refs: #NN` trailer, and one change per commit;
  - text formats only;
  - review: volunteer and best effort, a target of two business days, and reasons given for a declined contribution;
  - licensing: contributions come in under the licence they go out under, and there is no CLA;
  - English is authoritative. *(3–7, 10, 12, 13, 15)*
- [ ] **`GOVERNANCE.md`** and `.github/CODEOWNERS` (decisions 1, 3 and 8). They cover:
  - how decisions are made, and the rules for merging;
  - Renovate, and when a deploy by hand is allowed;
  - who publishes and deprecates versions of the vocabulary, shapes and decks;
  - how to become a co-maintainer, and what happens if the maintainer leaves;
  - who maintains the project: volunteers, with no funding. *(4, 7, 12)*
- [ ] **`SECURITY.md`** (decision 2). It covers:
  - the supported version: `main`, as deployed;
  - how to report a vulnerability privately;
  - the scope: the OIDC session, Markdown and the content security policy, deck import, and pod writes during migrations;
  - disclosure through a GitHub security advisory.

  Optionally add `apps/web/public/.well-known/security.txt`, and extend `deploy.yml`'s artifact check to require it. *(5)*
- [ ] **Templates.**
  - Issue forms for bugs, features, decks, translations and interop reports, plus `config.yml`.
  - `.github/pull_request_template.md`, whose checklist covers the linked issue, tests, docs, i18n, the impact on `ns/`, shapes, migrations and licences, the architecture and boundaries, and that the app was run.
  - Optionally `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1). *(3–7, 12)*
- [ ] **README.** Add:
  - an "About" in plain words;
  - a "Status" section;
  - "Run it on its own";
  - a "Contributing" section linking to issues, pull requests, `CONTRIBUTING.md`, `SECURITY.md` and Discussions;
  - the language statement, CI and interop badges, a link to `/journeys/`, and the licence of `docs/` and `ns/`. *(3, 5, 8–10, 12, 14, 16)*
- [ ] **New pages in this folder**, each listed in [README.md](README.md). *(2, 8, 10, 11)*
  - `objectives.md` — the mission, the goals with the pages that implement them, who the app is for, and what it is not for. A table maps the principles and standards to where they are enforced.
  - `policy.md` — no public policy applies. Lists the external rules the code follows, with versions: SM-2 and the CLDR plural rules.
  - `standards.md` — a table of each standard: version, status, link, where it is used, and whether it is open. Then a section on the drafts and de facto specifications.
  - `privacy.md` — what is stored where, what the host sees, no analytics, and the published `foaf:mbox`.
  - `glossary.md` — Solid, pod, WebID, Solid-OIDC, type index, RDF, SHACL, DCAT, SKOS, BCP 47, SM-2, CommonMark, GFM, CJK, Hangul, jamo and NFC.
  - The full SM-2 citation in `sm2.ts` and [srs.md](srs.md), and specification links in [authentication.md](authentication.md), [markdown.md](markdown.md), [courses.md](courses.md) and [vocab.md](vocab.md).
- [ ] **`ROADMAP.md`**: now, next, later, out of scope, and how to propose an item. *(3, 4)*
- [ ] **Metadata and style.** *(3, 6, 13–16)*
  - Add `publiccode.yml` (0.4), `CITATION.cff`, `CHANGELOG.md` (Keep a Changelog) and `releasing.md`.
  - `.gitattributes`: LF line endings, binary images, and the generated vocab files marked `linguist-generated`.
  - `.editorconfig`.
  - `style.md`: naming, the Turtle house style, comments, plain English, and one spelling standard.
  - In the root `package.json`: `description`, `homepage`, `repository`, `bugs` and `keywords`.
  - In the JSON-LD in `apps/web/index.html`: `codeRepository`, `license`, `inLanguage` and `sameAs`.
- [ ] **Package docs.** *(3, 9, 16)*
  - A README and a `description` for each package in `packages/`.
  - `e2e/journeys` in [architecture.md](architecture.md).
  - A word on the maturity of the 0.x dependencies in [vendor-code.md](vendor-code.md).
- [ ] **Branches.** Publish or delete the branches that exist only locally, and merge or close finished ones. *(1)*

### Phase 2: CI and GitHub settings

- [ ] **`ci.yml`.**
  - Add `pull_request`, and limit `push` to `main` (and `renovate/**`, while Renovate merges onto branches).
  - Add a `ci-ok` job that needs every other job, runs `if: always()`, and fails if any of them failed or was cancelled.
  - The workflow reads only and uses no secrets, so it is safe for fork pull requests. *(3–5, 7, 12, 15)*
- [ ] **`ns.yml`.**
  - Limit `push` to `main`, and add `pull_request` with the same path filters. Its `--base` logic already handles both events.
  - Update its header comment and [deck-library.md](deck-library.md).
  - Do not make it a required check while it is path-filtered. *(4, 7, 12)*
- [ ] **`deploy.yml`.** Allow `workflow_dispatch` only from `refs/heads/main`, and run `npm run check` on that path. *(1, 2, 7, 12)*
- [ ] **`renovate.json5`.** Set `automergeType: 'pr'` (decision 8). *(6, 7)*
- [ ] **Checks in `npm run check`.** *(12, 16)*
  - A test that every page in this folder is listed in [README.md](README.md).
  - A check that fails on prerelease dependencies, with documented exceptions.
  - Write coverage totals to `$GITHUB_STEP_SUMMARY`.
- [ ] **A docs job.** lychee (offline on pull requests, online weekly), markdownlint-cli2, cspell and publiccode-parser. *(9, 10, 12, 14)*
- [ ] **Licence required.**
  - A new library deck shape version with `sh:minCount 1` on `#license`, or a check in the deck library, with a test that fails without one.
  - Table-driven `sm2.test.ts` cases that mirror [srs.md](srs.md). *(2)*
- [ ] **GitHub settings** (admin). *(1, 3–5, 7, 12, 14)*
  - Turn on private vulnerability reporting, secret scanning, push protection and Discussions.
  - Set the topics and the description.
  - Set the ruleset on `main` to require `ci-ok`, with no bypass for Renovate.
  - Restrict the `github-pages` environment to `main`.
  - Rename the repository (decision 5).

### Phase 3: larger work

- [ ] **Configuration.** *(3)*
  - Add `VITE_POD_PROVIDERS` and `VITE_APP_NAME`, falling back to today's values, and `apps/web/.env.example`.
  - Add `configuration.md` and `reuse.md`.
  - Make [deployment.md](deployment.md)'s domain section generic.
  - Optionally add a CI build under a subpath.
- [ ] **User documentation.** *(9, 10)*
  - Add `user-guide.md`, `statistics.md` and `browsing.md`.
  - Cover the card creators, the chapter player and the today summary.
  - Add examples to [markdown.md](markdown.md) and [boundaries.md](boundaries.md), and a plain summary at the top of long pages.
- [ ] **Formatter and linter.** Add Biome to `npm run check`. Reformat once, and record that commit in `.git-blame-ignore-revs`. *(10, 15)*
- [ ] **REUSE** (decision 6). *(11, 13)*
  - `REUSE.toml` for the decks and vendored files, and a `LICENSES/` folder.
  - SPDX headers added with `reuse annotate`, keeping `@vitest-environment` pragmas on the first line.
  - `dcterms:license` on the `ns/` graphs.
  - `reuse lint` in CI.
- [ ] **Releases.** *(6, 14, 16)*
  - Tag `v0.1.0` with release-please.
  - Show the version next to the SHA in the footer.
  - Get a Zenodo DOI, and archive in Software Heritage.
- [ ] **Findability.** *(3, 14)*
  - Add a static `apps/web/public/about/index.html` for learners, authors, technologists and decision makers, and list it in the sitemap.
  - Register with Search Console and Bing.
  - Get listed on solidproject.org, and post on the Solid forum.
- [ ] **Deck contact** (decision 4). Give future deck versions a project contact, released under the library's version rules.
- [ ] **A second reviewer** (decision 3). Then require one approval and code-owner review on `main`. *(7, 12)*

Phase 1, plus `ci.yml`, `ns.yml`, `deploy.yml`, Renovate and the GitHub settings
from Phase 2, meets every MUST of criteria 4, 5, 6, 8, 10, 11, 12, 15 and
16. Criterion 7 waits for a second reviewer.

## Checking progress

- `npm run check` passes at 100% coverage after every code change. Run
  `npm run crosscheck`, `npm run format:turtle` and `npm run library` when
  `ns/` or `decks/` change.
- GitHub's community profile (`/community`) shows every item.
- A pull request from a fork runs CI. `ci-ok` is required, and the template appears.
- A pull request that edits a published deck version fails.
- A deploy by hand from a branch other than `main` is skipped.
- The deployed footer's commit link opens the commit on `solid-memo/website`.
- Go through the criteria again, and update the scorecard here.
