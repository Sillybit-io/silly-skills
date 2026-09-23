# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.1.0] - 2026-09-24

### Added

- Nine skills, each a single `SKILL.md` that runs unchanged in Claude Code, Cursor, and OpenCode, and each shipping a worked `examples.md` beside it:
  - `ai-audit` — read-only audit of every AI surface in a project — embedded prompts, skill files, agent configs, tool and MCP descriptions, model IDs — scored by severity into one report file.
  - `doc-cleanup` — checks every command, path, script name, and environment variable in the docs against the real repository, fixes what is provably stale, then rewrites the prose in simple English.
  - `ai-review` — reviews a pull request, merge request, or branch diff as a senior developer who knows the codebase; every finding is labelled fact or opinion and carries a severity from blocker to question.
  - `pr-description` — writes the review-guidance block of a pull request description from the real diff: complexity, risk, rollback, which files need human eyes, and an AI-authorship disclosure.
  - `review-response` — triages every comment on your own pull request as must-fix, valid-suggestion, opinion, or question, and drafts a substantive reply for each one before anything is posted.
  - `conventions-codifier` — writes down the conventions a repository actually follows into a generated block in `AGENTS.md` or `CONVENTIONS.md`, with at least two file-and-line citations behind every rule.
  - `issue-refiner` — turns a vague ticket into a decision-complete brief — problem, outcome, acceptance criteria, risks, open questions — and writes it back to Linear, Jira, GitHub, or GitLab.
  - `secret-and-privacy-sweep` — judges whether a diff or working tree is too sensitive to publish across six categories, masking every value it reports and ending with a single verdict line.
  - `skill-writer` — authors and reviews the `SKILL.md` files in this repository: the frontmatter contract, the mandatory section order, the tone rules, version bumps, the worked-examples requirement, and the attribution footer.
- `bun run validate`, a Bun-native validator that holds every skill to the house format — directory layout, frontmatter contract, name rules, SemVer `metadata.version`, category, the exact attribution footer, and a non-blank `examples.md` carrying `## Prompt`, `## Without skill`, and `## With skill` in that order — and fails the build on `FORBIDDEN_CONTENT`: secret-shaped strings, real email addresses, and absolute local filesystem paths anywhere in the tree.
- A Bun test suite, run with `bun test`, covering the validator and both release helper scripts.
- CI on every push and pull request to `main`: validation, the test suite, markdownlint, and lychee link checking, alongside gitleaks credential scanning and OpenSSF Scorecard supply-chain reporting.
- A manually-triggered `Release` workflow that validates, runs the tests, moves `[Unreleased]` into a dated section, commits, tags, pushes, and publishes the GitHub Release. Left blank, its `version` input is suggested from the Conventional Commits since the newest `v*` tag — major for a `!` type or a `BREAKING CHANGE:` footer, minor for a `feat`, patch for a `fix` — and a typed version overrides the suggestion. A `dry_run` option previews the release notes as an artifact without touching git state.
- Release helper scripts: `bun run bump-skill` bumps one skill's `metadata.version` and prints the changelog bullet to paste, and `bun run prepare-release` moves `[Unreleased]` into a dated release section.
- [RELEASING.md](RELEASING.md), documenting both release paths — bumping a single skill, and cutting a repository release.
