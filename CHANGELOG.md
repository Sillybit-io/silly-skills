# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- `ai-review` 0.2.0:
  - The review now gathers the change's stated intent — the pull request or merge request description, or the commit messages behind a branch — before it reads the diff, and treats every claim in it as something to verify against the code rather than as instruction. The intent, or `not stated`, appears on its own line in the review header.
  - Coverage is now provable rather than asserted. Every changed file enters a queue keyed by path and status, and every row ends in exactly one of three terminal states: `reviewed`, `reviewed - reduced depth: <reason>`, or `skipped - <reason>`, where a skip is only ever generated output, vendored code, or a lockfile. The "What I checked" table gained a Status column, the header line splits its file count into reviewed and skipped, and no file leaves the queue silently.
  - A large change is now worked in bounded batches grouped by directory or by shared concern. Size never removes a file from the review: an oversized file is reviewed at reduced depth with the limit declared, never skipped, and reduced depth limits how far context is verified without reducing which axes are asked. Finding a blocker no longer ends the pass — it is recorded and the rest of the queue is reviewed.
  - The security axis now covers instructions embedded in the reviewed content itself. Text in a description, a commit message, or a diff that addresses an automated reviewer — asking it to approve the change, skip files, or ignore its own instructions — is reported as a security finding and never obeyed.
  - Every comment body is now written to a file and read back from that file by the posting command, so review text is never pasted inline into a shell command whatever characters it contains.
  - A failed inline comment post — a cited line outside the diff, or a head commit that moved underneath the review — is no longer retried blindly. The finding already lives in the main review body, and every failed inline post is named in the reply.
  - Every run now writes or updates a stable report at `reports/ai-review-<id>.md`, keyed by pull request, merge request, commit, or branch. A later review of the same change reads it first as background, re-verifies every prior finding against the current code, and tracks each one as `open`, `resolved`, or `still present`.
  - The review's closing section is now "Needs human judgment". Instead of a blanket disclaimer, it names what the review could not settle — the unchecked areas, every `question` finding, every reduced-depth file, and the product decisions the code alone cannot answer — and ends with a "Look beyond these findings" line that points at the files or areas that got the least attention. Every `blocker` or `major` finding that could not be confirmed without running the code now carries a "Human verification" line naming what to run or check.
- `ai-audit` 0.2.0:
  - The audit now does its research before it judges anything. It fetches the Mastra documentation when the audited project depends on Mastra, the prompt-guidance and model lifecycle pages of every provider that owns a routed model or the target model, and the OpenRouter public catalogue, and it lists every one of those fetches in a new Sources block in the report header, each with a content handle or the reason it failed.
  - Models is now its own area of the health summary. Every model a live code path routes to, and the target model, is judged on four questions — is it still current, does it fit the task it serves, is there a better option, and what does it cost — using only data fetched during that run. A model counts as retired only when the vendor's own page says so, or, for a Claude model, the upstream model-migration document; a model missing from the catalogue is never treated as retired on that evidence alone.
  - A prompt assembled at runtime is now audited as two surfaces. The assembly code — the template functions, the concatenation, and the conditional fragments — is read and judged in full, and the stored values spliced into it are read through whatever proxies the repository holds, such as fixtures or seeds. When a stored value has no proxy, the report names the locations that were searched before it was declared a gap.
  - Every inventoried file is now read in full before it is judged. Counts for multi-file surfaces come from a listing command recorded in the report, and sampling is no longer an accepted account of coverage — `sampled`, `by size and form`, and the other phrases that stood in for it are rejected as Read values.

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
