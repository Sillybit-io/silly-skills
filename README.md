# silly-skills

[![CI](https://github.com/Sillybit-io/silly-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/Sillybit-io/silly-skills/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Sillybit-io/silly-skills/badge)](https://scorecard.dev/viewer/?uri=github.com/Sillybit-io/silly-skills)
![License: CC BY-ND 4.0](https://img.shields.io/badge/license-CC%20BY--ND%204.0-lightgrey)
![Skills: 9](https://img.shields.io/badge/skills-9-blue)

AI skills for work quality, review, speed, and standardization. Each skill is a single `SKILL.md` file that runs unchanged in Claude Code, Cursor, and OpenCode: it reviews a diff like a senior developer, writes the review-guidance half of a pull request, triages the comments that come back, audits how a project uses AI, keeps documentation honest, sweeps a branch for secrets before you publish it, codifies the conventions a repository actually follows, and turns a vague ticket into a decision-complete brief — the same way every time, for everyone on the team.

## License

Free to use, including commercially, with attribution. Source-available under CC BY-ND 4.0 — installing via a skills CLI is expressly permitted (see [NOTICE](NOTICE)); republishing modified versions requires written approval. The full licence text is in [LICENSE](LICENSE).

## Install

Skills are installed with the [`skills`](https://www.npmjs.com/package/skills) CLI. No clone, no build step.

Install everything — all nine skills:

```bash
npx skills add Sillybit-io/silly-skills --all
```

Install one skill by name:

```bash
npx skills add Sillybit-io/silly-skills --skill ai-review
```

Install one category, using the tree-path source format. Swap `review` for `ai-health`, `docs`, or `workflow`:

```bash
npx skills add https://github.com/Sillybit-io/silly-skills/tree/main/skills/review
```

Target specific agents by adding `-a` to any command above. Without it, the CLI asks which agents to install into:

```bash
npx skills add Sillybit-io/silly-skills --all -a claude-code -a cursor -a opencode
```

Every command works the same with `bunx`:

```bash
bunx skills add Sillybit-io/silly-skills --all
bunx skills add Sillybit-io/silly-skills --skill ai-review
bunx skills add https://github.com/Sillybit-io/silly-skills/tree/main/skills/review
bunx skills add Sillybit-io/silly-skills --all -a claude-code -a cursor -a opencode
```

Update installed skills to their latest published version, or remove one:

```bash
npx skills update
npx skills remove ai-review
```

## Skills

| Category | Name | Description |
| --- | --- | --- |
| ai-health | [ai-audit](skills/ai-health/ai-audit/SKILL.md) | Read-only audit of every AI surface in a project — embedded prompts, skill files, agent configs, tool and MCP descriptions, model IDs — scored by severity into one report file. |
| docs | [doc-cleanup](skills/docs/doc-cleanup/SKILL.md) | Checks every command, path, script name, and environment variable in the docs against the real repository, fixes what is provably stale, then rewrites the prose in simple English. |
| review | [ai-review](skills/review/ai-review/SKILL.md) | Reviews a pull request, merge request, or branch diff as a senior developer who knows the codebase; every finding is labelled fact or opinion and carries a severity from blocker to question. |
| review | [pr-description](skills/review/pr-description/SKILL.md) | Writes the review-guidance block of a pull request description from the real diff: complexity, risk, rollback, which files need human eyes, and an AI-authorship disclosure. |
| review | [review-response](skills/review/review-response/SKILL.md) | Triages every comment on your own pull request as must-fix, valid-suggestion, opinion, or question, and drafts a substantive reply for each one before anything is posted. |
| workflow | [conventions-codifier](skills/workflow/conventions-codifier/SKILL.md) | Writes down the conventions a repository actually follows into a generated block in AGENTS.md or CONVENTIONS.md, with at least two file-and-line citations behind every rule. |
| workflow | [issue-refiner](skills/workflow/issue-refiner/SKILL.md) | Turns a vague ticket into a decision-complete brief — problem, outcome, acceptance criteria, risks, open questions — and writes it back to Linear, Jira, GitHub, or GitLab. |
| workflow | [secret-and-privacy-sweep](skills/workflow/secret-and-privacy-sweep/SKILL.md) | Judges whether a diff or working tree is too sensitive to publish across six categories, masking every value it reports and ending with a single verdict line. |
| workflow | [skill-writer](skills/workflow/skill-writer/SKILL.md) | Authors and reviews SKILL.md files for this repository: the frontmatter contract, the mandatory section order, the tone rules, version bumps, and the attribution footer. |

## Versioning

Versions live at two levels. The repository follows SemVer as a whole: each release is a git tag plus a GitHub Release, and every notable change is recorded in [CHANGELOG.md](CHANGELOG.md). Each skill also carries its own `metadata.version` in its frontmatter and moves independently — patch for wording, minor for a new capability, major for a change to how you invoke it — so you can see that one skill changed without reading the whole repository changelog. [RELEASING.md](RELEASING.md) walks through the commands for both levels.

## Security and privacy

Every pull request runs three checks. gitleaks scans for committed credentials; this repository's own validator fails the build on `FORBIDDEN_CONTENT`, which rejects secret-shaped strings, real email addresses, and absolute local filesystem paths anywhere in the tree; and OpenSSF Scorecard reports the repository's supply-chain posture. No secrets, personal data, or internal references belong in this repository — to report something that slipped through, follow [SECURITY.md](SECURITY.md).

## Roadmap

- `test-gap-finder` — maps the behaviors a diff leaves untested, then splits them into a test plan an AI can write and one a human must design.
- `release-notes` — turns merged pull requests into a human-focused changelog and recommends the SemVer bump that goes with it.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, then write your skill with [skill-writer](skills/workflow/skill-writer/SKILL.md), which encodes the frontmatter contract, section order, and attribution footer this repository enforces in CI.
