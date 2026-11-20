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
| planning | [plan-builder](skills/planning/plan-builder/SKILL.md) | Builds a reviewed plan from your main session, which coordinates while a fresh child builds each todo: a byte-exact baseline snapshot, one receipt per todo with its real Acceptance and QA, commits scoped to that todo's own paths, and at most two independent result reviews before it reports complete. |
| planning | [plan-loop](skills/planning/plan-loop/SKILL.md) | Drives a plan to a reviewed state by launching fresh `plan-writer` and `plan-reviewer` children every round — never itself — with a two-round consent boundary and a structured handback on anything it cannot do alone. Runs in your main session. |
| planning | [plan-result-review](skills/planning/plan-result-review/SKILL.md) | Compares everything a build changed with the plan it implemented, from the build's own baseline snapshot, and weighs every difference as blocking or recorded. Returns MATCH, ACCEPTED, MISMATCH, or INCOMPLETE. |
| planning | [plan-review](skills/planning/plan-review/SKILL.md) | Reviews an implementation plan against repository evidence, describes every blocker it finds with a fix, and can loop — fixing and re-reviewing up to two rounds per consent — until the plan is approved. |
| planning | [plan-scout](skills/planning/plan-scout/SKILL.md) | Finds every producer and consumer of a named entry point, file, symbol, or format for a planning agent, with quoted excerpts, the searches it ran, and what it could not read. Never edits, runs commands, or judges a plan. |
| planning | [plan-writer](skills/planning/plan-writer/SKILL.md) | Researches the feature, reads the code one step around the change (to the end in security and production areas), asks product questions before technical ones, and writes a plan with hashed line citations, a design diagram when the request is a flow, and a final verification wave of at least four gates. |
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
| plan-writer | `anthropic/claude-fable-5-2` | xhigh | `anthropic/claude-opus-5-5` at xhigh |
| plan-review | `openai/gpt-6-astra` | max | `anthropic/claude-opus-5-5` at xhigh |
| plan-scout | `anthropic/claude-sonnet-5-5` | none set | none |
| plan-loop | `anthropic/claude-sonnet-5-5` | high | none |
| plan-builder | `anthropic/claude-opus-5-5` | max | `anthropic/claude-opus-5-5` at xhigh |
| plan-result-review | `openai/gpt-6-astra` | max | `anthropic/claude-opus-5-5` at xhigh |
| ui-engineering | `anthropic/claude-opus-5-5` | max | `anthropic/claude-sonnet-5-5` at high |
| tech-writing | `anthropic/claude-fable-5-2` | medium | `anthropic/claude-sonnet-5-5` at medium |

### Models these skills were designed around

| Model | Tier | Effort levels | Best for |
| --- | --- | --- | --- |
| `anthropic/claude-opus-5-5` | Flagship, long-running agentic work | low – max | Coding and agentic work |
| `anthropic/claude-fable-5-2` | Deepest reasoning, slowest | low – max | Long-horizon reasoning and research |
| `anthropic/claude-sonnet-5-5` | Speed and intelligence balance | low – max | Everyday coding and writing |
| `openai/gpt-6-astra` | Flagship | low – max | Complex reasoning and coding |
| `openai/gpt-6-sol` | Coding and agentic workflows | none – max | Coding and agentic workflows |
| `openai/gpt-6-luna` | Cheapest, most efficient | none – max | Fast, high-volume tasks |
| `openai/gpt-5.6-terra` | Balanced cost and intelligence | none – max | Cost-aware work |

`openai/gpt-6-sol-fast` and `openai/gpt-6-luna-fast` are OpenCode's own catalog aliases for `gpt-6-sol` and `gpt-6-luna` run at a priority service tier — they trade a roughly 2x price increase for lower latency, not a different model. Full model and pricing details live on each vendor's own model pages: `platform.claude.com` and `developers.openai.com`.

## Planning flow

Six skills cover a plan from a vague idea to a verified result: `plan-writer` and `plan-review` write and check it; `plan-scout` is the optional discovery helper either one can delegate a single bounded question to; `plan-loop` automates the writer-then-reviewer cycle for you; `plan-builder` is what your normal coding agent loads when you say "build this plan"; `plan-result-review` is the independent check that what got built actually matches it.

`plan-writer` sharpens a vague idea with up to three questions when it needs to, explores the codebase, researches the feature on the public web, and then asks product questions before technical questions. When an answer changes the feature, it researches that point once more. It writes a plan to its own directory under `docs/plans/` — the spec and its evidence index, beside the files review and build fill in later, with a branch name that follows the repository's own observed convention, a design diagram when the request is a flow, and a final verification wave of at least four gates — moving it through `draft` (while an owner question is open), `planned` (the full task breakdown), and `reviewed` (once `plan-review` approves it). After a plan is written, run `plan-review` — ideally on a different model family than the one that wrote the plan — for the cheapest independent second opinion available. It checks the research, the question order, the diagram, and the final wave along with the rest, and describes every blocker it finds. On a rejection, `plan-review` can fix the listed blockers and re-review on its own, looping up to two rounds before it stops, lists the open blockers in one line each, and asks whether to continue. Either skill can hand a single bounded discovery question — "every consumer of this function", say — to `plan-scout`, a read-only subagent that returns quoted evidence and never edits, runs a command, or offers an opinion on the plan.

Both skills work to a fixed depth instead of a count. The writer reads the code the change touches and one step around it, always searches the changed inventory (counts, registrations, generated lists, and the tests that assert them), and goes to the end only in the strict areas: security, sign-in, and permissions, and production and shared services. A source citation is a path and a line range; `stamp-evidence.ts` adds the file's hash, so a citation to code that later changes fails the validator. The reviewer opens the citations each todo relies on and does not re-check what the validator proves. Version 2.0.0 of the planning skills writes plan format 2; a plan written before it finishes on the version that wrote it.

Both skills compose with a tool's own read-only planning mode instead of needing it turned off: the exploration and the questions run the same way inside Claude Code's Plan Mode or Cursor's Plan mode, and the plan file's write waits for that mode's own approval step, same as any other edit would. Neither skill's persona sets a plan-only permission mode of its own, since that would deny the write with no way to approve past it.

Say "review and fix until it passes" and `plan-loop` runs the whole write-then-review cycle for you: every round's reviewer, and every fix in between, is a freshly launched child session — never itself, never the session that just fixed or reviewed the plan. A reviewer's task holds only the plan path and the round number, never a parent's opinion of what the verdict should be. Run it in your main session, because only the main session can launch children. It stops at the first `OKAY`, at two rounds without a fresh consent, or at anything it cannot do alone — a denied child launch, a missing tool, an owner question — with a structured handback naming exactly what unblocks it, rather than pretending to be independent when it is not.

Once a plan is reviewed, say "build this plan" to your normal coding agent — OpenCode's Build, Claude Code's coding session, or Cursor's Agent — and it loads `plan-builder`. Your session becomes the coordinator: it reads only validator output and one-line child replies, and launches a fresh child session for each todo, for the final wave, for the result review, and for each fix, so no session carries the whole build. Start the build from a fresh session when you can. Before touching anything, the coordinator captures a byte-exact snapshot of the project with `scripts/capture-build-state.ts`. Each todo child records one passed receipt with the real Acceptance and QA it ran — the validator refuses a receipt that misses one. Commits touch only that todo's own files plus the plan directory, so the branch carries the plan, its reviews, and its build record; one plan-only commit closes the build. An interrupted build resumes from its last receipt instead of guessing at what already happened. The final gate launches a fresh `plan-result-review` child, which compares every changed artifact with the plan from that same baseline snapshot — including the owner's own staged, unstaged, and untracked work from before the build started — and weighs each difference. Failing checks, strict-area changes, unchecked UI, lost owner work, and missing todos block; everything else is recorded. `plan-builder` reports the build complete on `MATCH` or `ACCEPTED`, sends only blocking differences to a fix child, and stops for you after a second `MISMATCH`.

Since 2.1.0, a plan states its Behavior lines first: a few lines, in the words of a user or an operator, that say what the change does for them. You approve them before the todos are written, and `plan-loop` shows you lines that were approved only by default before its first review round. The result review checks each line against the build. A large plan also groups its waves into slices that each ship alone, so it can be built slice by slice, with one pull request per slice when you want one. Say "build this plan through slice S1" to stop after the first slice.

`plan-builder`, `plan-loop`, and `plan-result-review` all use the validator bundled inside `plan-review`, so installing any of them pulls in `plan-review` too; `plan-loop` also needs `plan-writer`, and `plan-builder` needs `plan-result-review`. `plan-scout` is optional everywhere it is offered — every skill that can delegate to it also works without it, searching the codebase itself instead. Claude Code and Cursor only run subagents, so every planning persona there returns its result to whatever session launched it and routes an owner's question back up rather than asking directly; OpenCode's `plan-writer`, `plan-review`, and `plan-builder` personas can also be switched to directly as your own session, and `plan-loop` works only that way. A child session cannot launch children, so a coordinating skill always runs in your main session. Where a skill suggests a model from a family a host cannot run, its wrapper pins the closest model that host offers instead, and says so in its own last line.

### Benchmark: with and without the skills

Three planning tasks were run in Claude Code on 2026-10-02, on `claude-fable-5-1` at `max` effort: once with `plan-writer` and `plan-review` 0.5.0, and once with no planning skill. A blind scorer checked each plan against an answer key written before any plan existed.

| Task | Variant | Time (min) | Input tokens | Output tokens | Cost | Answer key |
| --- | --- | --- | --- | --- | --- | --- |
| T1: add a release-notes skill | With the skills | 28.9 | 2.70M | 110k | $12.52 | 12/12 |
| T1: add a release-notes skill | Without | 16.9 | 1.73M | 68k | $7.67 | 12/12 |
| T2: add `--uninstall` to the agent installer | With the skills | 20.1 | 2.42M | 90k | $9.02 | 13/13 |
| T2: add `--uninstall` to the agent installer | Without | 11.3 | 1.18M | 52k | $5.24 | 13/13 |
| T3: rename `plan-review` to `plan-reviewer` | With the skills | 29.4 | 4.21M | 131k | $15.62 | 11/11 |
| T3: rename `plan-review` to `plan-reviewer` | Without | 10.1 | 3.34M | 49k | $8.28 | 9/11 |

Without the skills, Claude Code planned in about half the time, 38.3 minutes against 78.4 over the three tasks, for $21.19 against $37.16. Its plans covered nearly the same answer-key items: 34 of 36, against 36. What the skills add is mostly outside the keys. Every line a skill plan cites comes with a quoted excerpt and a file hash that the validator checks: 25 to 76 lines per plan, against 0 to 19 unchecked references without the skills. A skill plan also records the project's checks as a baseline, traces critical flows, and ends with a final verification wave. Each number is one run, and two runs of nearly the same setup differed by about 3 minutes per task, so small differences mean little. Cost is the API-equivalent price Claude Code reports. [docs/benchmarks/planning.md](docs/benchmarks/planning.md) has the exact prompts, the run times, the answer keys, every measurement, and two attempts at a faster `plan-writer` that were measured and reverted. These numbers are for 0.5.0; later versions were not benchmarked.

### How the plan skills compare with Spec Kit

[Spec Kit](https://github.com/github/spec-kit) is GitHub's toolkit for spec-driven development. Both it and the plan skills make an agent write down what it will build before it changes any code. They differ in where they start and in who checks the work. The table comes from reading Spec Kit's [command prompts](https://github.com/github/spec-kit/tree/ad43c27c67c2f6db0484cea292a399bbf281fcf6/templates/commands), templates, and guides at commit `ad43c27` (2026-11-20, after release 1.4.3), beside the plan skills at 2.1.0. Spec Kit was not run for this comparison, so it says nothing about speed, cost, or the quality of what gets built.

| Topic | Spec Kit | Plan skills |
| --- | --- | --- |
| Starts from | What the user needs: prioritized user stories, each with Given/When/Then scenarios, and no implementation detail | The code as it is, as a list of gaps between the current state and the request, each cited to a file and a line range, and Behavior lines in Given/When/Then that the owner approves |
| Reading existing code | No step in the `specify` or `plan` prompt asks for it; the guide for existing projects asks you to verify that the design reuses what is there | The writer reads the code the change touches and one step around it, and goes to the end in the strict areas |
| Questions | `specify` makes informed guesses and marks at most three open points; `clarify` asks up to five questions, one at a time | Up to three to sharpen a vague idea, then product questions before technical ones, at most four of each, in one message |
| Format checks | The agent checks its own spec against a checklist it writes, for up to three passes; the scripts resolve paths and check that files exist | A script: `validate-plan.ts` checks the structure, the coverage, and the hash of every cited file |
| Check before building | `analyze` compares the spec, the plan, and the tasks with each other; it is one of three extra gates in the full path | `plan-review` runs in its own session, ideally on another model family, opens the cited code, and returns `OKAY`, `REJECT`, or `INCOMPLETE` |
| Tests | Test tasks are written only when the spec or the user asks for them | Each todo has a runnable Acceptance and a QA scenario with a happy part and a failure part; the validator refuses a pass receipt without them |
| Check after building | `converge` reads the code against the spec, the plan, and the tasks, and appends what is left as new tasks; it uses no git history | A fresh `plan-result-review` session compares every change with the plan from a snapshot taken before the build, including the owner's earlier work |
| Slicing | One phase per user story, each testable alone, with a suggested first story | Todos in ordered waves; a large plan groups its waves into slices that each ship alone, each with an independent test, and suggests a first slice |
| Project rules | A constitution file that every plan is checked against | No file of their own; the plan records the project's own checks as a baseline |
| Files per change | `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, and `tasks.md` in one directory | The spec, its evidence index, the reviews, the gate record, and the build record in one directory |
| Runs in | Dozens of coding agents through integrations, with presets and extensions on top | Claude Code, Cursor, and OpenCode |

Pick Spec Kit when the hard part is deciding what to build: a new product or feature, work that starts from user stories, or a team that wants one workflow across many agents. Pick the plan skills when the hard part is changing code that already exists without breaking it, and you want a script and a second session to check the plan and the result, not the agent that wrote them.

Two ideas from Spec Kit have been in the plan skills since 2.1.0: Behavior lines in Given/When/Then that the owner approves before the todos are written, and slices of a large plan that each ship alone.

## Versioning

Versions live at two levels. The repository follows SemVer as a whole: each release is a git tag plus a GitHub Release, and every notable change is recorded in [CHANGELOG.md](CHANGELOG.md). Each skill also carries its own `metadata.version` in its frontmatter and moves independently — patch for wording, minor for a new capability, major for a change to how you invoke it — so you can see that one skill changed without reading the whole repository changelog. [RELEASING.md](RELEASING.md) walks through the commands for both levels.

## Security and privacy

Every pull request runs three checks. gitleaks scans for committed credentials; this repository's own validator fails the build on `FORBIDDEN_CONTENT`, which rejects secret-shaped strings, real email addresses, and absolute local filesystem paths anywhere in the tree; and OpenSSF Scorecard reports the repository's supply-chain posture. No secrets, personal data, or internal references belong in this repository — to report something that slipped through, follow [SECURITY.md](SECURITY.md).

## Roadmap

- `test-gap-finder` — maps the behaviors a diff leaves untested, then splits them into a test plan an AI can write and one a human must design.
- `release-notes` — turns merged pull requests into a human-focused changelog and recommends the SemVer bump that goes with it.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first, then write your skill with [skill-writer](skills/workflow/skill-writer/SKILL.md), which encodes the frontmatter contract, section order, and attribution footer this repository enforces in CI.
