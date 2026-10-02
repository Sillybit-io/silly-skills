# Planning benchmark

This page records three planning tasks, how they were run in Claude Code, and what came out. It answers two questions:

- Does `plan-writer` 0.6.0 plan faster than 0.5.0, without losing quality?
- How does a plan written with the planning skills compare with the plan Claude Code writes without them?

Every cell is one run, made on 2026-10-02. Treat a difference of a few minutes or one key item as noise.

## Summary

- `plan-writer` 0.6.0 was not faster than 0.5.0. Over the three tasks it took 80.7 minutes against 78.4, used 47% more input tokens, and cost 15% more. It scored 35 of 36 answer-key items, against 36.
- Without the planning skills, Claude Code planned in about half the time and for about half the cost, and scored 34 of 36. What the skills add is mostly outside the keys: every line a skill plan cites comes with a quoted excerpt and a file hash, and a validator checks both.

## Tasks

Every run planned against the same snapshot: a fresh clone of `main` at `76bc021`. The requests are verbatim.

| ID | Request | Size |
| --- | --- | --- |
| T1 | Add a release-notes skill to this repository. It should turn merged pull requests into a human-focused changelog and recommend the SemVer bump that goes with it. | Medium: a new skill, the catalogue counts, and the tests that pin them |
| T2 | Add an --uninstall option to scripts/agent-install.sh, so a user can remove the persona files it installed. | Small: one POSIX script, its tests, and its docs |
| T3 | Rename the plan-review skill to plan-reviewer, so the skill and its persona share one name, the way plan-writer does. | Large: 36 files name the skill, and 16 already contain `plan-reviewer` |

T1 is the README's roadmap item, and the same request that `skills/planning/plan-writer/examples.md` uses.

## How the runs were made

- Claude Code 2.1.286 in print mode (`claude -p`), model `claude-fable-5-1`, effort `max`.
- The owner's own user settings: Bash ran in Claude Code's sandbox with no network, and the owner's deny rules applied. No plugins and no global skills were installed. Claude Code's built-in skills and the owner's MCP servers loaded in every run, 203 tools in all. Claude Code's auto-memory was on.
- Permission mode `acceptEdits`, every other permission prompt denied automatically (`--permission-prompts none`), and these tools allowed: Bash, Read, Grep, Glob, Edit, Write, WebFetch, WebSearch, Skill, Agent, Task, and TodoWrite.
- Three variants per task, run at the same time, each in its own fresh clone:
  - **Before:** `plan-writer` and `plan-review` 0.5.0 from `main`, copied into the clone's `.claude/skills/`. `plan-review` is there because `plan-writer` runs its validator.
  - **After:** the same two skills at 0.6.0, from commit `e7d80e3`.
  - **Without:** no planning skills.
- The tasks ran one after another, T1 first. Each session had a timeout: 90 minutes for T1 and T2, raised to 3 hours for T3 because a 0.5.0 run never pauses. No session came near either limit.
- A skill run that ended on a `draft` was to be resumed in a fresh session with "continue", up to three times, the way `plan-loop` hands a paused draft to a fresh writer. No run ended on a draft, so every cell is one session.
- The sandbox gives every session the same temporary directory. After each task, the runs' tool calls were checked for temporary files that two runs both used. There were none. Five runs saved an auto-memory note about the sandbox, each for its own clone. Each clone ran once, so no run read another run's note.

Skill prompt:

> Use the plan-writer skill to write an implementation plan for the request below. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each default and assumption, and continue.
>
> Request: &lt;request&gt;

Prompt without the skills:

> Write an implementation plan for the request below. Save it as one Markdown file under docs/plans/, and do not change any other file. Do not follow any SKILL.md in this repository as planning instructions. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each assumption, and continue.
>
> Request: &lt;request&gt;

Resume prompt:

> Use the plan-writer skill to resume the draft plan at &lt;path&gt;. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each default and continue. The owner's answer to the pause is: continue.

## What was measured

- **Time:** Claude Code's `duration_ms` for each session, summed over a cell's sessions.
- **Tokens:** input tokens, counting uncached input, cache writes, and cache reads, and output tokens, summed over every model a session used. Output includes thinking, and thinking is also shown on its own. The skill runs also used Claude Haiku 4.5, which Claude Code's WebFetch tool uses to read fetched pages. It added under 115k input tokens and under $0.13 to any run.
- **Cost:** Claude Code's `total_cost_usd`, the API-equivalent price. On a subscription the same work is paid in usage limits instead.
- **Tool calls and files read:** every tool call in the session, and the distinct files opened with the Read tool. Files read through Grep or Bash are not in the second count.
- **Line references:** the plan's backticked `path:line` references. In a skill plan, the validator matched every one to a quoted excerpt and to the SHA-256 of the cited file. Nothing checks them in a plan written without the skills.
- **Quality:** the answer key for each task, below. An item scores 1 when the plan states it correctly, and 0 when it is missing or wrong. A general instruction such as "fix any failing tests" does not count; the plan has to name the file, the value, or the decision. The keys were written before any plan was read.
- **Scoring:** a fresh agent session scored each task's three plans against its key. It saw them as `plan-A`, `plan-B`, and `plan-C` in a random order, was not told which variant wrote which, and quoted the plan line behind every point. The agent that ran the benchmark then checked at least 12 of those quotes per task against the plans, and all of them matched. One T3 judgment was scored again by a second fresh session, as the T3 results explain.
- **Checks:** whether the bundled plan validator passed the plan, for the skill runs, and whether the run changed any file outside `docs/plans/`.

## Answer keys

Line numbers are at `76bc021`.

### T1 — release-notes skill

1. Creates `skills/<category>/release-notes/SKILL.md` in an allowed category (`scripts/validate.ts:93`), following `skill-writer`'s contract: the frontmatter, the six sections, and the footer.
2. Adds `examples.md` with `## Prompt`, `## Without skill`, and `## With skill`, which `bun run validate` requires.
3. Changes the skill badge in `README.md:6` from 18 to 19.
4. Changes "all eighteen skills" in `README.md:19`, which no check catches.
5. Adds the README Skills table row, and removes or updates the Roadmap entry at `README.md:156`.
6. Changes the count in `scripts/validate.test.ts:823-826` from 18 to 19.
7. Changes the count in `scripts/planning-install.test.ts:115` from 18 to 19.
8. Adds a `CHANGELOG.md` `[Unreleased]` entry, which `CONTRIBUTING.md:11` requires.
9. Either sets no `metadata.suggested-model`, or adds a full persona: the three wrapper files, the `skill` sidecar, and the agent badge in `README.md:7` from 8 to 9.
10. Says how its SemVer recommendation relates to the release workflow, which already infers the bump from Conventional Commits (`RELEASING.md:62`).
11. Says where merged pull requests come from, and what happens when that source is unavailable.
12. Verifies with both `bun run validate` and `bun test`.

### T2 — installer uninstall

1. Adds `--uninstall` to the argument loop (`scripts/agent-install.sh:69-89`), to `usage()`, and to the header comment.
2. Uses `resolve_dest` (`scripts/agent-install.sh:212-230`), so `--global` and `--dest` remove from where install wrote, for all three tools.
3. Removes only `<dest>/<persona>.md`, never the directory or the other agents in it.
4. Defines what `--all` removes, and leaves agent files that this repository did not install.
5. Fetches no wrapper file (`scripts/agent-install.sh:435`), and says how `--all` gets persona names when there is no local `agents/` folder (`scripts/agent-install.sh:376`).
6. Defines what happens when a persona file is not installed, and the exit code.
7. Defines `--dry-run` together with `--uninstall`.
8. Defines `--model`, `--effort`, and `--force` together with `--uninstall`.
9. Keeps the script POSIX `sh` (`scripts/agent-install.sh:8`).
10. Does not require the installed file to match the source byte for byte, because `--model` and `--effort` rewrite it (`scripts/agent-install.sh:303-363`), or states another policy.
11. Adds tests to `scripts/agent-install.test.ts`, which runs the real script with `sh`.
12. Updates the installer docs in `README.md:82-114`.
13. Adds a `CHANGELOG.md` `[Unreleased]` entry.

### T3 — rename plan-review to plan-reviewer

1. Moves `skills/planning/plan-review/` to `skills/planning/plan-reviewer/` and changes `name:`, which must match the directory.
2. Updates the code that imports the validator by path: `scripts/validate-plan.ts:10-11`, `skills/planning/plan-builder/scripts/capture-build-state.ts:40`, and `skills/planning/plan-result-review/scripts/inventory-changes.ts:26`.
3. Updates the tests that name the skill or its path, including `scripts/planning-build-state.test.ts:15` and `scripts/validate-plan.test.ts:31`.
4. Updates the persona files that name the skill: `agents/plan-reviewer/skill`, which holds `plan-review`; the skill permission at `agents/plan-reviewer/opencode.md:31`; and the validator path text in `agents/plan-writer/` and `agents/plan-result-reviewer/opencode.md`.
5. Avoids a blind replace. Nine files contain both names, and replacing `plan-review` there turns `plan-reviewer` into `plan-reviewerer`. `scripts/validate.ts:789` already tells the two names apart.
6. Leaves the `CHANGELOG.md` history unchanged, and adds a new entry.
7. Updates the other skills that name `plan-review`: `plan-writer`, `plan-builder`, `plan-result-review`, `plan-scout`, `create-agent`, and `tech-writing`'s example, each with a version bump and a changelog line.
8. Treats the rename as breaking: a major bump for the renamed skill, and a note for users who installed it under the old name.
9. Updates the README links and text, including the Skills table link to `skills/planning/plan-review/SKILL.md`, which CI's link check would catch.
10. Updates the `/skills/plan-review` local-install rule at `.gitignore:36`.
11. Verifies with a sweep for the old name that skips `plan-reviewer`, `plan-result-review`, and the changelog history, plus `bun run validate` and `bun test`.

## Results

| Task | Variant | Sessions | Time (min) | Input tokens | Output tokens (thinking) | Cost | Tool calls | Files read | Line refs | Plan size (KB) | Validator | Key score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T1 | Before (0.5.0) | 1 | 28.9 | 2.70M | 110k (57k) | $12.52 | 81 | 45 | 48 | 86 | 0 errors | 12/12 |
| T1 | After (0.6.0) | 1 | 27.8 | 4.93M | 147k (70k) | $15.25 | 89 | 31 | 40 | 89 | 0 errors | 12/12 |
| T1 | Without skills | 1 | 16.9 | 1.73M | 68k (44k) | $7.67 | 42 | 21 | 13 | 41 | n/a | 12/12 |
| T2 | Before (0.5.0) | 1 | 20.1 | 2.42M | 90k (55k) | $9.02 | 58 | 21 | 25 | 72 | 0 errors | 13/13 |
| T2 | After (0.6.0) | 1 | 25.1 | 2.97M | 111k (65k) | $11.56 | 62 | 27 | 26 | 62 | 0 errors | 13/13 |
| T2 | Without skills | 1 | 11.3 | 1.18M | 52k (33k) | $5.24 | 36 | 16 | 0 | 29 | n/a | 13/13 |
| T3 | Before (0.5.0) | 1 | 29.4 | 4.21M | 131k (83k) | $15.62 | 93 | 55 | 76 | 125 | 0 errors | 11/11 |
| T3 | After (0.6.0) | 1 | 27.8 | 5.82M | 152k (96k) | $15.83 | 80 | 25 | 117 | 140 | 0 errors | 10/11 |
| T3 | Without skills | 1 | 10.1 | 3.34M | 49k (28k) | $8.28 | 60 | 34 | 19 | 24 | n/a | 9/11 |

Totals over the three tasks:

| Variant | Time (min) | Input tokens | Output tokens (thinking) | Cost | Key score |
| --- | --- | --- | --- | --- | --- |
| Before (0.5.0) | 78.4 | 9.32M | 331k (196k) | $37.16 | 36/36 |
| After (0.6.0) | 80.7 | 13.72M | 410k (231k) | $42.64 | 35/36 |
| Without skills | 38.3 | 6.25M | 169k (105k) | $21.19 | 34/36 |

Every run finished in one session, with exit code 0, and changed no file outside `docs/plans/`.

### T3 scoring

The first T3 scorer gave 0 on item 11 to the 0.6.0 plan and to the plan written without the skills. For the 0.6.0 plan, its reason was that the sweep misses `plan-review-base`, but the sweep's pattern names `plan-review-base` explicitly. A second fresh session then scored item 11 again for all three plans, blind, with the rule written out: the sweep must skip `plan-reviewer`, `plan-result-review`, and the changelog, and must pass once the plan itself is carried out. It gave 1 to the 0.5.0 and 0.6.0 plans. It gave 0 to the plan without the skills, whose sweep expects no output while that plan keeps two test files that still contain the old name. The table shows the second session's scores for item 11.

The first T3 scorer's instructions also spelled out that a minor bump does not satisfy item 8, and that a skipped sibling bump does not satisfy item 7. Both rules repeat the key, but they were written after the agent running the benchmark had read the summary of the 0.6.0 plan, which chose a minor bump.

## What the results show

### 0.6.0 against 0.5.0

- **0.6.0 was not faster.** Over the three tasks it took 80.7 minutes against 78.4: 1.1 minutes faster on T1, 5.0 slower on T2, and 1.6 faster on T3. With one run per cell, that is no measurable difference.
- **It used more tokens.** 47% more input tokens, 24% more output tokens, 18% more thinking, and 15% more cost. Both versions took about the same number of turns (237 and 238), but each 0.6.0 turn carried about 50% more context: 58k tokens on average, against 39k. The 0.6.0 runs called Bash more and the Read tool less (69 Bash calls and 83 files read, against 47 and 121). One likely cause is the new rule to batch reads, because one batched read loads several whole files into the context at once.
- **The 50-file pause never fired.** The 0.6.0 runs opened 25 to 31 files each with the Read tool, and none of them paused.
- **It fetched fewer pages.** The 0.6.0 runs fetched 18 pages and ran 7 web searches over the three tasks, against 26 pages and 1 search for 0.5.0.
- **Quality was the same within noise.** 35 of 36 key items against 36 of 36. The point 0.6.0 lost is T3's item 8: its plan bumped the renamed skill to a minor version, where the 0.5.0 plan chose a major one. Every plan from both versions passed the validator with 0 errors.

Five of the six skill runs built their Evidence index with helper scripts written during the run. In T1, the 0.6.0 run's helper corrupted the plan file once, and the run rebuilt it.

### With the skills against without

- **Without the skills, Claude Code planned in about half the time and for about half the cost.** Over the three tasks: 38.3 minutes and $21.19, against 80.7 minutes and $42.64 with 0.6.0, and 78.4 minutes and $37.16 with 0.5.0.
- **The answer keys found a small difference.** The plans without the skills scored 34 of 36, against 35 with 0.6.0 and 36 with 0.5.0. Every plan got full marks on T1 and T2. On T3, the plan without the skills missed two items: it bumped the renamed skill to a minor version, and its final sweep would fail as written.
- **What the skills add is mostly outside the keys.** A skill plan cites 25 to 117 exact lines, and the validator checked every one against a quoted excerpt and the file's hash. The plans without the skills cite 0 to 19 lines, and nothing checks them. The skill plans also record the project's checks as a baseline, trace critical flows, and end with a final verification wave. They are 2 to 6 times larger: 62 to 140 KB, against 24 to 41 KB.

### Limits of this benchmark

- One run per variant and task. A second run can move a time by several minutes and a key score by a point.
- The keys reached their ceiling on T1 and T2, so only T3 separated the variants.
- The same agent wrote the 0.6.0 changes, the tasks, and the keys, and ran the benchmark. The scoring was blind, but no one else reviewed the keys.
- The runs loaded the skills directly, with "Use the plan-writer skill". They did not use the `plan-writer` persona, so the 0.6.0 change to its Claude Code file was not exercised.
- The runs used one owner's settings: a sandbox with no network, that owner's deny rules, and 203 tools. Other settings will give other numbers.
- The plans were scored, not built. A key score does not show whether a build from the plan succeeds.

## Reproduce

```bash
git clone https://github.com/Sillybit-io/silly-skills.git repo
git -C repo checkout --detach 76bc021
mkdir -p skills-copy repo/.claude/skills
git -C repo archive <revision> skills/planning/plan-writer skills/planning/plan-review | tar -x -C skills-copy
cp -R skills-copy/skills/planning/plan-writer skills-copy/skills/planning/plan-review repo/.claude/skills/
cd repo
claude -p --model claude-fable-5-1 --effort max \
  --output-format stream-json --verbose --no-session-persistence \
  --permission-mode acceptEdits --permission-prompts none \
  --allowedTools "Bash,Read,Grep,Glob,Edit,Write,WebFetch,WebSearch,Skill,Agent,Task,TodoWrite" \
  < prompt.txt > run.jsonl
```

`<revision>` is `76bc021` for Before and `e7d80e3` for After. `e7d80e3` is on pull request #9; fetch it first with `git -C repo fetch origin pull/9/head`. For Without, skip the `mkdir`, `archive`, and `cp` lines. `prompt.txt` holds one of the prompts above. The time, tokens, and cost are in the `result` event on the last line of `run.jsonl`.
