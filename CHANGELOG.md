# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- `plan-writer` 0.6.0: builds the plan as one file in small independent edits. It writes a skeleton once right after the branch name, appends each new citation, coverage row, frontier item, flow, and baseline check as it is found, and fills one placeholder, subsection, row, or todo per edit. An entry that already exists, such as a pending coverage row, is edited in place when it is resolved, refreshed, answered, or fixed, because appending a second row never replaces the first. It never calls Write on an existing plan or regenerates the Evidence index. The three plan-writer personas state the same rule.
- `plan-review` 0.6.0: the bundled validator merges several fenced `json` blocks under `### Evidence index` (arrays concatenate, a duplicate id is still an error), so a writer can append one small block per entry. A single block stays valid. It also reports `PLACEHOLDER` for a leftover `<!-- todo: ... -->` line in a `planned` or `reviewed` plan.

### Added

- `docs/benchmarks/planning.md`: three planning tasks run in Claude Code on 2026-10-02 with `plan-writer` and `plan-review` 0.5.0, with two attempts at a faster `plan-writer`, and without the planning skills. It records the exact prompts, the start and end time of every run, the time, tokens, and cost, and a blind answer-key score for each plan. Neither attempt was faster than 0.5.0, so both were reverted. The 0.6.0 entries above came after the benchmark and are not measured by it. Planning without the skills took about half the time. The README's planning section summarizes the comparison with and without the skills.

## [0.8.0] - 2026-09-30

### Added

- `plan-scout` 0.1.0: a read-only subagent that finds every producer and consumer of a named entry point, file, symbol, or format, following imports, string registrations, path strings, data formats, configuration, docs, ops scripts, and tests. Returns quoted excerpts, the searches it ran, boundary reasons, and what it could not read. Never edits, runs a command, delegates, or offers an opinion on the plan. `plan-writer` and `plan-review` may each delegate one bounded discovery question to it.
- `plan-builder` 0.1.0: the skill a normal coding agent loads to build a reviewed plan. Captures a byte-exact baseline snapshot with `scripts/capture-build-state.ts` before any edit, then a start, checkpoint, and passed receipt per todo, recording the todo's real Acceptance and QA as actually run. Commits only that todo's owned paths. Resumes an interrupted build from its last recorded receipt, recovering from an unrecorded edit instead of guessing past it, and never marks a todo Done without a durable passed receipt. The final gate spawns a fresh `plan-result-review` child and reports the build complete only once that review currently reads `MATCH`.
- `plan-loop` 0.1.0: automates the writer-then-reviewer cycle without weakening either skill's independence. Every round's reviewer, and the fix step between rounds, runs in a freshly launched child session — never the loop's own session, and never the session that just fixed or reviewed the plan. A reviewer's task payload holds only the plan path, the project root, and the round instruction, never a parent's verdict or persuasion. Stops at the first OKAY, at five rounds without a fresh consent, or at a denied launch, an unavailable input, a depth limit, or an identical blocked checkpoint, returning a structured handback instead of an invented independence claim.
- `plan-result-review` 0.1.0: compares everything a build changed with the reviewed plan it implemented, from the build's own baseline snapshot, so it sees staged, unstaged, and untracked work, deletions, renames, binaries, modes, and symlinks, including the owner's own pre-build work. Maps every requirement to a change and every changed artifact to a todo, and explains each difference with its location, expected and actual result, reason, and reason source. Returns `MATCH`, `MISMATCH (<n> differences)`, or `INCOMPLETE`.
- `agents/plan-scout/`, `agents/plan-builder/`, `agents/plan-loop/`, and `agents/plan-result-reviewer/`: the Claude Code, OpenCode, and Cursor files for each new persona, plus its `skill` sidecar.
- The repository catalogue now lists 18 skills and 8 agent personas. `scripts/validate.ts` gained a matching `AGENT_BADGE_COUNT` check for README's new agent-count badge, mirroring the existing `BADGE_COUNT` check for the skill-count badge.

### Changed

- `plan-review` 0.5.0: no source, URL, or detailed-blocker count — the owner chose completeness over investigation cost for this skill, overriding `skill-writer`'s numeric investigation budgets. Every round now writes a machine-readable `#### Gate record` alongside its prose, checked by the bundled validator before the reviewer replies. The OpenCode wrapper moved from `mode: primary` to `mode: all`, so it can run as a child as well as an interactive session, and gained a `plan-scout` delegation; the Claude Code wrapper gained `Bash` and `Agent`.
- `plan-writer` 0.5.0: gained real-run examples and two new reference files (`coverage.md`, `evidence-index.md`); all three host wrappers updated for the same child/primary handling as `plan-review`.
- `create-agent` 0.2.0: handles editing an existing persona, `all` mode in a child context, a parent question handback, the Agent capability, four Claude model aliases, and OpenCode's `#<variant>` model syntax (normalizing a legacy `reasoningEffort` field into it).
- `scripts/validate-plan.ts`, bundled inside `plan-review`, gained the D4 build-state inventory and digest functions (`inventoryState`, `stateDigest`, `verifySnapshot`, and related helpers) that `plan-builder`'s `capture-build-state.ts` and `plan-result-review`'s `inventory-changes.ts` both call directly, so a snapshot and the validator's own resume check can never drift apart from having two separate implementations.

## [0.7.0] - 2026-09-27

### Changed

- `plan-writer` 0.4.0: the builder passes each todo's acceptance and QA scenario, and commits when the todo says so, before marking it done and starting the next. The final verification wave is not part of that rule. After a wave is finished, the builder starts the next wave, including the final wave, without asking for a continue. A failed check is fixed and the checks are run again until they pass.
- `plan-review` 0.4.0: rejects a plan that is missing that test-before-next instruction, or that applies it to the final verification wave. It also rejects a plan that stops between waves, or that stops and waits when a check fails.

## [0.6.0] - 2026-09-27

### Added

- `agents/<persona>/` holds the Claude Code, OpenCode, and Cursor files for a skill. The folder name is the role: `plan-writer`, `plan-reviewer`, `tech-writer`, and `ui-engineer`. A one-line `skill` sidecar names the skill the prompt loads.
- `create-agent` 0.1.0 writes that folder: description, mode (`agent`, `subagent`, or `all`), a system prompt that loads the skill, and the tool permissions each product can enforce.
- `scripts/agent-install.sh` installs one persona or every directory in `agents/` from a GitHub URL, with no clone. `--all` lists the folder through the GitHub contents API.

### Changed

- `skill-writer` 0.4.0 points a suggested model at `create-agent` instead of telling authors to put wrapper files inside the skill directory.
- Plan Writer and Plan Reviewer follow the skill's interactive branch. On OpenCode they are primary agents. Their edits are limited to `docs/plans/*`, because in OpenCode a `*` already matches `/` and a second asterisk would be a literal star.
- `plan-writer` 0.2.1: an interactive session, including a persona told to ask and wait, stops at the draft-gate. It does not record a default and continue.
- `plan-writer` 0.3.0: every todo starts as `- [ ] Open`, and the builder changes it to `- [x] Done` in the project copy when that todo is finished. T0 is first. It copies the plan into `docs/plans/` only when it is not already there, and the rest of the build continues in that copy.
- `plan-review` 0.3.0: rejects a plan that is missing those checkboxes, the instruction to check them off while building, or T0.

## [0.5.0] - 2026-09-27

- `plan-writer` 0.2.0: researches the feature on the public web, asks product questions before technical ones, adds a mermaid diagram when the request is a flow, and ends every plan with a final verification wave of at least four gates.
- `plan-review` 0.2.0: rejects a plan that is missing that research, that question order, a required diagram, or one of the four final-wave gates.

## [0.4.0] - 2026-09-27

### Changed

- `ai-review` 0.3.0: stops before reading the diff when more than 300 files remain after repository `.gitignore` matches are removed. The stop note is said in chat, posted on a pull request or merge request when one is the target, and written to the per-target report. The count commands, the ignore filter, and the stop note live in `references/file-limit.md`.
- `skill-writer` 0.3.0: cites the Agent Skills specification, raises the house description budget from 500 characters to 700, and tells authors to keep a `SKILL.md` body under 500 lines by putting step-specific detail in `references/`.

## [0.3.0] - 2026-09-26

### Added

- Two categories, `planning` and `engineering`, alongside `review`, `ai-health`, `docs`, and `workflow`.
- Four skills, each shipping `examples.md` and three ready-to-copy agent wrappers under `agents/` (`claude-code.md`, `opencode.md`, `cursor.md`) that pin the skill's suggested model:
  - `plan-writer` — sharpens a vague idea with up to three questions, explores the codebase, then writes a decision-complete implementation plan of verifiable todos and a branch name that follows the repository's own convention, asking only the questions evidence and defaults cannot settle.
  - `plan-review` — reviews an implementation plan for blockers only, reports at most three with fixes, and can loop, fixing and re-reviewing up to five rounds, until the plan is approved.
  - `ui-engineering` — builds UI code design-system first: reads existing components, extends tokens instead of hardcoding values, checks WCAG 2.2 accessibility, and renders or screenshots the result.
  - `tech-writing` — writes a new README, how-to, reference page, or decision record from repository facts, naming the reader and their next action before it writes a word of prose.
- Optional frontmatter keys `metadata.suggested-model` (`provider/model`) and `metadata.suggested-effort` (`low` to `max`). `bun run validate` checks their shape under a new `SUGGESTED_MODEL` code and, under `AGENT_WRAPPERS`, requires all three `agents/` wrappers whenever a skill declares a suggested model.
- `scripts/agent-install.sh`, a POSIX shell installer that copies a skill's agent wrapper into the directory your tool reads, globally or per project, with `--model` and `--effort` overrides.
- Two README sections: "Running a skill on its suggested model" and "Planning flow".

### Changed

- `skill-writer` 0.2.0: documents two new categories, `planning` and `engineering`; the optional `metadata.suggested-model` / `metadata.suggested-effort` hint; the `agents/` wrapper convention (all three wrapper files or none, tool-specific frontmatter kept out of `SKILL.md`); a 500-character description budget for new skills; the hedged-feedback rule for any skill that produces a user-facing artefact; and the numbered-work-budget rule for open-ended steps.

### Fixed

- `conventions-codifier` 0.1.1 — the worked example's excluded-paths list now names only the entries that this repository's own `.gitignore` lists.

## [0.2.0] - 2026-09-26

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
