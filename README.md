# silly-skills

[![CI](https://github.com/Sillybit-io/silly-skills/actions/workflows/ci.yml/badge.svg)](https://github.com/Sillybit-io/silly-skills/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Sillybit-io/silly-skills/badge)](https://scorecard.dev/viewer/?uri=github.com/Sillybit-io/silly-skills)
![License: CC BY-ND 4.0](https://img.shields.io/badge/license-CC%20BY--ND%204.0-lightgrey)
![Skills: 18](https://img.shields.io/badge/skills-18-blue)
![Agents: 8](https://img.shields.io/badge/agents-8-blue)

AI skills for work quality, review, speed, and standardization. Each skill is a `SKILL.md` file that runs unchanged in Claude Code, Cursor, and OpenCode, and a skill that recommends a model has a persona under `agents/` for each of the three tools: it reviews a diff like a senior developer, writes the review-guidance half of a pull request, triages the comments that come back, audits how a project uses AI, keeps documentation honest, sweeps a branch for secrets before you publish it, codifies the conventions a repository actually follows, turns a vague ticket into a decision-complete brief, writes an implementation plan and reviews it for blockers, builds that plan with a resumable receipt trail and checks the result against it, builds UI code design-system first, and writes a new document or decision record a named reader can act on — the same way every time, for everyone on the team.

## License

Free to use, including commercially, with attribution. Source-available under CC BY-ND 4.0 — installing via a skills CLI is expressly permitted (see [NOTICE](NOTICE)); republishing modified versions requires written approval. The full licence text is in [LICENSE](LICENSE).

## Install

Skills are installed with the [`skills`](https://www.npmjs.com/package/skills) CLI. No clone, no build step.

Install everything — all eighteen skills:

```bash
npx skills add Sillybit-io/silly-skills --all
```

Install one skill by name:

```bash
npx skills add Sillybit-io/silly-skills --skill ai-review
```

Install one category, using the tree-path source format. Swap `review` for `ai-health`, `docs`, `engineering`, `planning`, or `workflow`:

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
| docs | [tech-writing](skills/docs/tech-writing/SKILL.md) | Writes a new README, how-to, reference page, or decision record from repository facts, naming the reader and their next action before it writes a word of prose. |
| engineering | [ui-engineering](skills/engineering/ui-engineering/SKILL.md) | Builds UI code design-system first: reads existing components, extends tokens instead of hardcoding values, checks WCAG 2.2 accessibility, and renders or screenshots the result. |
| planning | [plan-builder](skills/planning/plan-builder/SKILL.md) | Builds a reviewed plan with a durable, resumable receipt trail: a byte-exact baseline snapshot, each todo's real Acceptance and QA, commits scoped to that todo's own paths, and a fresh independent result review before it reports complete. |
| planning | [plan-loop](skills/planning/plan-loop/SKILL.md) | Drives a plan to a reviewed state by launching fresh `plan-writer` and `plan-reviewer` children every round — never itself — with a five-round consent boundary and a structured handback on anything it cannot do alone. |
| planning | [plan-result-review](skills/planning/plan-result-review/SKILL.md) | Compares everything a build changed with the plan it implemented, from the build's own baseline snapshot, and explains every difference with its location and reason. Returns MATCH, MISMATCH, or INCOMPLETE. |
| planning | [plan-review](skills/planning/plan-review/SKILL.md) | Reviews an implementation plan against repository evidence, describes every blocker it finds with a fix, and can loop — fixing and re-reviewing up to five rounds — until the plan is approved. |
| planning | [plan-scout](skills/planning/plan-scout/SKILL.md) | Finds every producer and consumer of a named entry point, file, symbol, or format for a planning agent, with quoted excerpts, the searches it ran, and what it could not read. Never edits, runs commands, or judges a plan. |
| planning | [plan-writer](skills/planning/plan-writer/SKILL.md) | Researches the feature, analyzes the codebase, asks product questions before technical ones, and writes a plan with a design diagram when the request is a flow and a final verification wave of at least four gates. |
| review | [ai-review](skills/review/ai-review/SKILL.md) | Reviews a pull request, merge request, or branch diff as a senior developer who knows the codebase; every finding is labelled fact or opinion and carries a severity from blocker to question. Stops before reading the diff when more than 300 non-gitignored files changed. |
| review | [pr-description](skills/review/pr-description/SKILL.md) | Writes the review-guidance block of a pull request description from the real diff: complexity, risk, rollback, which files need human eyes, and an AI-authorship disclosure. |
| review | [review-response](skills/review/review-response/SKILL.md) | Triages every comment on your own pull request as must-fix, valid-suggestion, opinion, or question, and drafts a substantive reply for each one before anything is posted. |
| workflow | [conventions-codifier](skills/workflow/conventions-codifier/SKILL.md) | Writes down the conventions a repository actually follows into a generated block in AGENTS.md or CONVENTIONS.md, with at least two file-and-line citations behind every rule. |
| workflow | [issue-refiner](skills/workflow/issue-refiner/SKILL.md) | Turns a vague ticket into a decision-complete brief — problem, outcome, acceptance criteria, risks, open questions — and writes it back to Linear, Jira, GitHub, or GitLab. |
| workflow | [secret-and-privacy-sweep](skills/workflow/secret-and-privacy-sweep/SKILL.md) | Judges whether a diff or working tree is too sensitive to publish across six categories, masking every value it reports and ending with a single verdict line. |
| workflow | [create-agent](skills/workflow/create-agent/SKILL.md) | Writes a persona folder under `agents/` for one existing skill, with a Claude Code file, an OpenCode file, and a Cursor file that load that skill. |
| workflow | [skill-writer](skills/workflow/skill-writer/SKILL.md) | Authors and reviews SKILL.md files for this repository: the frontmatter contract, the mandatory section order, the tone rules, a 700-character description budget, version bumps, and the attribution footer. |

## Running a skill on its suggested model

Some skills carry a model hint in their frontmatter: `metadata.suggested-model` (a `provider/model` id) and `metadata.suggested-effort` (`low`, `medium`, `high`, `xhigh`, or `max`). The hint is advisory — `SKILL.md` never pins a model, so every skill still runs on whatever model your tool is using. For a one-off, just switch the model in your tool before invoking the skill.

To pin the suggested model, the repository ships a persona folder under `agents/` for each of those skills. The folder name is the role (`plan-reviewer` loads `plan-review`). One installer copies the file for your tool and rewrites its model line. No clone is required:

```bash
curl -fsSL https://raw.githubusercontent.com/Sillybit-io/silly-skills/main/scripts/agent-install.sh | sh -s -- --tool opencode --agent plan-reviewer
curl -fsSL https://raw.githubusercontent.com/Sillybit-io/silly-skills/main/scripts/agent-install.sh | sh -s -- --tool opencode --all
sh scripts/agent-install.sh --tool cursor --agent ui-engineer --model claude-opus-5-5 --effort xhigh
```

`--agent` is the persona, or several separated by commas. `--all` installs every persona in `agents/`. From a clone it reads the local folders. From the curl command it lists that folder on GitHub and downloads each file. `--source` takes a full GitHub URL when the files are not on `main`.

An agent file is markdown. The YAML header is configuration. The body is the system prompt, and it loads the skill instead of copying it. OpenCode reads `.opencode/agents/<persona>.md` (or `~/.config/opencode/agents/` with `--global`); `mode: primary` is a session you switch to with Tab, and `mode: subagent` is an `@mention`. Claude Code reads `.claude/agents/<persona>.md` and Cursor reads `.cursor/agents/<persona>.md`. Those two tools only have subagents, so the file returns its result to the parent. Cursor cannot list tools; `readonly: false` is the write switch.

Run `sh scripts/agent-install.sh --help` for every flag, including `--dest` for a custom directory and `--force` to overwrite. Re-run with `--force` after a persona changes, since the installer never touches an agent file it already wrote.

| Tool | Persona installs to | Invoke it |
| --- | --- | --- |
| Claude Code | `.claude/agents/<persona>.md` (or `~/.claude/agents/` with `--global`) | the subagent name, e.g. `plan-reviewer` |
| OpenCode | `.opencode/agents/<persona>.md` (or `~/.config/opencode/agents/`) | Tab for `plan-writer`, `plan-reviewer`, `plan-builder`, and `plan-loop`; `@plan-scout`, `@plan-result-reviewer`, `@tech-writer`, and `@ui-engineer` |
| Cursor | `.cursor/agents/<persona>.md` (or `~/.cursor/agents/`) | the subagent name, e.g. `plan-reviewer` |

Claude Code runs Claude models only, so a wrapper for a skill that suggests a non-Anthropic model pins the nearest Claude tier and says so in its own text.

| Skill | Suggested model | Effort | Cheaper alternative |
| --- | --- | --- | --- |
| plan-writer | `anthropic/claude-fable-5-1` | max | `anthropic/claude-opus-5-5` at xhigh |
| plan-review | `openai/gpt-6-astra` | max | `anthropic/claude-opus-5-5` at xhigh |
| ui-engineering | `anthropic/claude-opus-5-5` | max | `anthropic/claude-sonnet-5` at high |
| tech-writing | `anthropic/claude-fable-5-1` | medium | `anthropic/claude-sonnet-5` at medium |

### Models these skills were designed around

| Model | Tier | Effort levels | Best for |
| --- | --- | --- | --- |
| `anthropic/claude-opus-5-5` | Flagship, long-running agentic work | low – max | Coding and agentic work |
| `anthropic/claude-fable-5-1` | Deepest reasoning, slowest | low – max | Long-horizon reasoning and research |
| `anthropic/claude-sonnet-5` | Speed and intelligence balance | low – max | Everyday coding and writing |
| `openai/gpt-6-astra` | Flagship | low – max | Complex reasoning and coding |
| `openai/gpt-6-sol` | Coding and agentic workflows | none – max | Coding and agentic workflows |
| `openai/gpt-6-luna` | Cheapest, most efficient | none – max | Fast, high-volume tasks |
| `openai/gpt-5.6-terra` | Balanced cost and intelligence | none – max | Cost-aware work |

`openai/gpt-6-sol-fast` and `openai/gpt-6-luna-fast` are OpenCode's own catalog aliases for `gpt-6-sol` and `gpt-6-luna` run at a priority service tier — they trade a roughly 2x price increase for lower latency, not a different model. Full model and pricing details live on each vendor's own model pages: `platform.claude.com` and `developers.openai.com`.

## Planning flow

Six skills cover a plan from a vague idea to a verified result: `plan-writer` and `plan-review` write and check it; `plan-scout` is the optional discovery helper either one can delegate a single bounded question to; `plan-loop` automates the writer-then-reviewer cycle for you; `plan-builder` is what your normal coding agent loads when you say "build this plan"; `plan-result-review` is the independent check that what got built actually matches it.

`plan-writer` sharpens a vague idea with up to three questions when it needs to, explores the codebase, researches the feature on the public web, and then asks product questions before technical questions. When an answer changes the feature, it researches that point once more. It writes a plan to `docs/plans/` — with a branch name that follows the repository's own observed convention, a design diagram when the request is a flow, and a final verification wave of at least four gates — moving it through `draft` (while an owner question is open), `planned` (the full task breakdown), and `reviewed` (once `plan-review` approves it). After a plan is written, run `plan-review` — ideally on a different model family than the one that wrote the plan — for the cheapest independent second opinion available. It checks the research, the question order, the diagram, and the final wave along with the rest, and describes every blocker it finds. On a rejection, `plan-review` can fix the listed blockers and re-review on its own, looping up to five rounds before it stops and asks whether to continue. Either skill can hand a single bounded discovery question — "every consumer of this function", say — to `plan-scout`, a read-only subagent that returns quoted evidence and never edits, runs a command, or offers an opinion on the plan.

Neither writer nor reviewer caps how much it investigates: `skill-writer`'s numeric work-budget rule is overridden for `plan-writer` and `plan-review` alone, by owner decision, because completeness matters more than investigation cost for a plan a developer will execute unsupervised. Both still stop and checkpoint on a genuine access failure — an unreadable file, an unreachable URL, a host timeout — they just never stop merely because a count ran out.

Both skills compose with a tool's own read-only planning mode instead of needing it turned off: the exploration and the questions run the same way inside Claude Code's Plan Mode or Cursor's Plan mode, and the plan file's write waits for that mode's own approval step, same as any other edit would. Neither skill's persona sets a plan-only permission mode of its own, since that would deny the write with no way to approve past it.

Say "review and fix until it passes" and `plan-loop` runs the whole write-then-review cycle for you: every round's reviewer, and every fix in between, is a freshly launched child session — never itself, never the session that just fixed or reviewed the plan. A reviewer's task holds only the plan path and the round number, never a parent's opinion of what the verdict should be. It stops at the first `OKAY`, at five rounds without a fresh consent, or at anything it cannot do alone — a denied child launch, a missing tool, an owner question — with a structured handback naming exactly what unblocks it, rather than pretending to be independent when it is not.

Once a plan is reviewed, say "build this plan" to your normal coding agent — OpenCode's Build, Claude Code's coding session, or Cursor's Agent — and it loads `plan-builder`. Before touching anything, it captures a byte-exact snapshot of the project with `scripts/capture-build-state.ts`, then works through each todo with a start receipt, a checkpoint, and a passed receipt recording the real Acceptance and QA it ran — never a planned check it did not execute. Commits touch only that todo's own files. An interrupted build resumes from its last recorded receipt instead of guessing at what already happened. The final gate spawns a fresh `plan-result-review` child, which compares every changed artifact with the plan from that same baseline snapshot — including the owner's own staged, unstaged, and untracked work from before the build started — and returns `MATCH`, `MISMATCH`, or `INCOMPLETE` with a reason for every difference. `plan-builder` only reports the build complete once that independent review currently reads `MATCH`.

`plan-builder`, `plan-loop`, and `plan-result-review` all use the validator bundled inside `plan-review`, so installing any of them pulls in `plan-review` too; `plan-loop` also needs `plan-writer`, and `plan-builder` needs `plan-result-review`. `plan-scout` is optional everywhere it is offered — every skill that can delegate to it also works without it, searching the codebase itself instead. Claude Code and Cursor only run subagents, so every planning persona there returns its result to whatever session launched it and routes an owner's question back up rather than asking directly; OpenCode's `plan-writer`, `plan-review`, `plan-builder`, and `plan-loop` personas can also be switched to directly as your own session. Where a skill suggests a model from a family a host cannot run, its wrapper pins the closest model that host offers instead, and says so in its own last line.

### Benchmark: with and without the skills

Three planning tasks were run in Claude Code on `claude-fable-5-1` at `max` effort: once with `plan-writer` 0.6.0 and `plan-review` 0.6.0, and once with no planning skill. A blind scorer checked each plan against an answer key written before any plan existed.

| Task | Variant | Time (min) | Input tokens | Output tokens | Cost | Answer key |
| --- | --- | --- | --- | --- | --- | --- |
| T1: add a release-notes skill | With the skills | 27.8 | 4.93M | 147k | $15.25 | 12/12 |
| T1: add a release-notes skill | Without | 16.9 | 1.73M | 68k | $7.67 | 12/12 |
| T2: add `--uninstall` to the agent installer | With the skills | 25.1 | 2.97M | 111k | $11.56 | 13/13 |
| T2: add `--uninstall` to the agent installer | Without | 11.3 | 1.18M | 52k | $5.24 | 13/13 |
| T3: rename `plan-review` to `plan-reviewer` | With the skills | 27.8 | 5.82M | 152k | $15.83 | 10/11 |
| T3: rename `plan-review` to `plan-reviewer` | Without | 10.1 | 3.34M | 49k | $8.28 | 9/11 |

Without the skills, Claude Code planned in about half the time and for about half the cost, and its plans covered nearly the same answer-key items: 34 of 36, against 35. What the skills add is mostly outside the keys. Every line a skill plan cites comes with a quoted excerpt and a file hash that the validator checks: 26 to 117 lines per plan, against 0 to 19 unchecked references without the skills. A skill plan also records the project's checks as a baseline, traces critical flows, and ends with a final verification wave. Each number is one run. Cost is the API-equivalent price Claude Code reports. [docs/benchmarks/planning.md](docs/benchmarks/planning.md) has the method, the answer keys, every measurement, and the comparison with 0.5.0.

## Versioning

Versions live at two levels. The repository follows SemVer as a whole: each release is a git tag plus a GitHub Release, and every notable change is recorded in [CHANGELOG.md](CHANGELOG.md). Each skill also carries its own `metadata.version` in its frontmatter and moves independently — patch for wording, minor for a new capability, major for a change to how you invoke it — so you can see that one skill changed without reading the whole repository changelog. [RELEASING.md](RELEASING.md) walks through the commands for both levels.

## Security and privacy

Every pull request runs three checks. gitleaks scans for committed credentials; this repository's own validator fails the build on `FORBIDDEN_CONTENT`, which rejects secret-shaped strings, real email addresses, and absolute local filesystem paths anywhere in the tree; and OpenSSF Scorecard reports the repository's supply-chain posture. No secrets, personal data, or internal references belong in this repository — to report something that slipped through, follow [SECURITY.md](SECURITY.md).

## Roadmap

- `test-gap-finder` — maps the behaviors a diff leaves untested, then splits them into a test plan an AI can write and one a human must design.
- `release-notes` — turns merged pull requests into a human-focused changelog and recommends the SemVer bump that goes with it.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, then write your skill with [skill-writer](skills/workflow/skill-writer/SKILL.md), which encodes the frontmatter contract, section order, and attribution footer this repository enforces in CI.
