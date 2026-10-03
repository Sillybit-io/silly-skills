# Planning benchmark

This page records three planning tasks run in Claude Code on 2026-10-02, and what came out. It answers three questions:

- Did either of two attempts to make `plan-writer` faster beat `plan-writer` 0.5.0?
- How much do two runs of almost the same setup differ?
- How does a plan written with the planning skills compare with the plan Claude Code writes without them?

Every cell is one run. The page gives the exact prompts, the start and end time of every run, how each plan was scored, and a command to repeat a run.

## Summary

- **Neither attempt made planning faster, so both were reverted.** Over the three tasks, 0.5.0 took 78.4 minutes and cost $37.16. The first attempt took 80.7 minutes and cost $42.64. The second attempt took 80.8 minutes and cost $42.14. `plan-writer` stays at 0.5.0.
- **Single runs vary a lot.** The second attempt changed one sentence, and its runs did not act on it, so they were close to repeat runs of 0.5.0. They still differed from the 0.5.0 runs by up to 2.9 minutes per task and by up to 2.4 times in input tokens. With one run per cell, this benchmark cannot separate small differences between skill versions.
- **Without the planning skills, Claude Code planned in about half the time.** It took 38.3 minutes and cost $21.19 over the three tasks, and its plans scored 34 of 36 answer-key items, against 36 for 0.5.0. That time gap is far larger than the spread between repeat runs. What the skills add is mostly outside the keys: every line a skill plan cites comes with a quoted excerpt and a file hash, and a validator checks both.

## Tasks

Every run planned against the same snapshot: a fresh clone of `main` at `76bc021`. The requests are verbatim.

| ID | Request | Size |
| --- | --- | --- |
| T1 | Add a release-notes skill to this repository. It should turn merged pull requests into a human-focused changelog and recommend the SemVer bump that goes with it. | Medium: a new skill, the catalogue counts, and the tests that pin them |
| T2 | Add an --uninstall option to scripts/agent-install.sh, so a user can remove the persona files it installed. | Small: one POSIX script, its tests, and its docs |
| T3 | Rename the plan-review skill to plan-reviewer, so the skill and its persona share one name, the way plan-writer does. | Large: 36 files name the skill, and 16 already contain `plan-reviewer` |

T1 is the README's roadmap item, and the same request that `skills/planning/plan-writer/examples.md` uses.

## Variants

| Variant | Planning skills in the clone's `.claude/skills/` | Commit | Status |
| --- | --- | --- | --- |
| 0.5.0 | `plan-writer` and `plan-review` 0.5.0 | `76bc021` | The current release |
| First attempt | Both skills as changed for speed: batched searches, reads, and digests; a search reused while its scope is unchanged; stricter evidence to exclude an edge; read-only baseline checks in the background; a 50-file pause; limits on web research, contract lookups, baseline checks, and validator retries; and a late research pass | `e7d80e3` | Reverted in `8fb0114` |
| Second attempt | 0.5.0 with one change: `plan-writer` step 5 says read-only baseline checks may run in the background | `8dca147` | Reverted in `3854e93` |
| Without skills | None | none | none |

`plan-review` is installed with `plan-writer` because `plan-writer` runs its validator.

## How the runs were made

- Claude Code 2.1.286 in print mode (`claude -p`), model `claude-fable-5-1`, effort `max`.
- The owner's own user settings: Bash ran in Claude Code's sandbox with no network, and the owner's deny rules applied. No plugins and no global skills were installed. Claude Code's built-in skills and the owner's MCP servers loaded in every run, 203 tools in all. Claude Code's auto-memory was on.
- Permission mode `acceptEdits`, every other permission prompt denied automatically (`--permission-prompts none`), and these tools allowed: Bash, Read, Grep, Glob, Edit, Write, WebFetch, WebSearch, Skill, Agent, Task, and TodoWrite.
- Each run used its own fresh clone. For a skill variant, the two skills from that variant's commit were copied into the clone's `.claude/skills/`.
- 0.5.0, the first attempt, and the runs without skills ran task by task: a task's three runs started at the same time, T1 first. The second attempt was added later, with its three runs, one per task, started at the same time. The Runs table gives every start and end time.
- Each session had a timeout: 90 minutes in the T1 and T2 batches, and 3 hours after that. No session came near either limit.
- A skill run that ended on a `draft` was to be resumed in a fresh session with "continue", up to three times, the way `plan-loop` hands a paused draft to a fresh writer. No run ended on a draft, so every cell is one session.
- The sandbox gives every session the same temporary directory. After each batch, the tool calls of the runs in it were checked for temporary files that two of them both used. There were none. Eight runs saved an auto-memory note about the sandbox, each for its own clone. Each clone ran once, so no run read another run's note.

## Prompts

Each run got one prompt on standard input, and nobody answered a question during a run. The three skill variants got the same prompt, byte for byte.

### T1 prompts

Skill variants:

```text
Use the plan-writer skill to write an implementation plan for the request below. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each default and assumption, and continue.

Request: Add a release-notes skill to this repository. It should turn merged pull requests into a human-focused changelog and recommend the SemVer bump that goes with it.
```

Without skills:

```text
Write an implementation plan for the request below. Save it as one Markdown file under docs/plans/, and do not change any other file. Do not follow any SKILL.md in this repository as planning instructions. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each assumption, and continue.

Request: Add a release-notes skill to this repository. It should turn merged pull requests into a human-focused changelog and recommend the SemVer bump that goes with it.
```

### T2 prompts

Skill variants:

```text
Use the plan-writer skill to write an implementation plan for the request below. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each default and assumption, and continue.

Request: Add an --uninstall option to scripts/agent-install.sh, so a user can remove the persona files it installed.
```

Without skills:

```text
Write an implementation plan for the request below. Save it as one Markdown file under docs/plans/, and do not change any other file. Do not follow any SKILL.md in this repository as planning instructions. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each assumption, and continue.

Request: Add an --uninstall option to scripts/agent-install.sh, so a user can remove the persona files it installed.
```

### T3 prompts

Skill variants:

```text
Use the plan-writer skill to write an implementation plan for the request below. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each default and assumption, and continue.

Request: Rename the plan-review skill to plan-reviewer, so the skill and its persona share one name, the way plan-writer does.
```

Without skills:

```text
Write an implementation plan for the request below. Save it as one Markdown file under docs/plans/, and do not change any other file. Do not follow any SKILL.md in this repository as planning instructions. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each assumption, and continue.

Request: Rename the plan-review skill to plan-reviewer, so the skill and its persona share one name, the way plan-writer does.
```

### Resume prompt

Prepared for a skill run that ended on a draft. No run needed it.

```text
Use the plan-writer skill to resume the draft plan at <path>. This is a non-interactive run: nobody will answer questions, so do not ask any. Record each default and continue. The owner's answer to the pause is: continue.
```

## Runs

All times are UTC, on 2026-10-02.

| Task | Variant | Start | End | Exit code |
| --- | --- | --- | --- | --- |
| T1 | 0.5.0 | 16:13 | 16:43 | 0 |
| T1 | First attempt | 16:13 | 16:41 | 0 |
| T1 | Without skills | 16:13 | 16:31 | 0 |
| T2 | 0.5.0 | 16:44 | 17:04 | 0 |
| T2 | First attempt | 16:44 | 17:09 | 0 |
| T2 | Without skills | 16:44 | 16:55 | 0 |
| T3 | 0.5.0 | 17:10 | 17:39 | 0 |
| T3 | First attempt | 17:10 | 17:38 | 0 |
| T3 | Without skills | 17:10 | 17:20 | 0 |
| T1 | Second attempt | 18:37 | 19:03 | 0 |
| T2 | Second attempt | 18:37 | 19:00 | 0 |
| T3 | Second attempt | 18:37 | 19:09 | 0 |

## What was measured

- **Time:** Claude Code's `duration_ms` for each session, summed over a cell's sessions.
- **Tokens:** input tokens, counting uncached input, cache writes, and cache reads, and output tokens, summed over every model a session used. Output includes thinking, and thinking is also shown on its own. The skill runs also used Claude Haiku 4.5, which Claude Code's WebFetch tool uses to read fetched pages. It added under 115k input tokens and under $0.13 to any run.
- **Cost:** Claude Code's `total_cost_usd`, the API-equivalent price. On a subscription the same work is paid in usage limits instead.
- **Tool calls and files read:** every tool call in the session, and the distinct files opened with the Read tool. Files read through Grep or Bash are not in the second count.
- **Line references:** the plan's backticked `path:line` references. In a skill plan, the validator matched every one to a quoted excerpt and to the SHA-256 of the cited file. Nothing checks them in a plan written without the skills.
- **Quality:** the answer key for each task, below. An item scores 1 when the plan states it correctly, and 0 when it is missing or wrong. A general instruction such as "fix any failing tests" does not count; the plan has to name the file, the value, or the decision. The keys were written before any plan was read.
- **Scoring, round one:** for 0.5.0, the first attempt, and the runs without skills, a fresh agent session scored each task's three plans against its key. It saw them as `plan-A`, `plan-B`, and `plan-C` in a random order, was not told which variant wrote which, and quoted the plan line behind every point. The agent that ran the benchmark then checked at least 12 of those quotes per task against the plans, and all of them matched. One T3 judgment was scored again by another fresh session, as the scoring notes explain.
- **Scoring, round two:** for the second attempt, a fresh session per task scored its plan together with the task's 0.5.0 plan, as `plan-A` and `plan-B` in a random order. This compares the two within one session, and shows whether a second scorer agrees with the first. The agent that ran the benchmark checked 18 of those quotes against the plans, and read the plan text behind every 0 the second attempt got. All of them matched.
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
| T1 | 0.5.0 | 1 | 28.9 | 2.70M | 110k (57k) | $12.52 | 81 | 45 | 48 | 86 | 0 errors | 12/12 |
| T1 | First attempt | 1 | 27.8 | 4.93M | 147k (70k) | $15.25 | 89 | 31 | 40 | 89 | 0 errors | 12/12 |
| T1 | Second attempt | 1 | 26.0 | 6.42M | 112k (65k) | $13.30 | 92 | 33 | 36 | 101 | 0 errors | 12/12 |
| T1 | Without skills | 1 | 16.9 | 1.73M | 68k (44k) | $7.67 | 42 | 21 | 13 | 41 | n/a | 12/12 |
| T2 | 0.5.0 | 1 | 20.1 | 2.42M | 90k (55k) | $9.02 | 58 | 21 | 25 | 72 | 0 errors | 13/13 |
| T2 | First attempt | 1 | 25.1 | 2.97M | 111k (65k) | $11.56 | 62 | 27 | 26 | 62 | 0 errors | 13/13 |
| T2 | Second attempt | 1 | 22.8 | 2.23M | 103k (68k) | $10.37 | 52 | 21 | 25 | 71 | 0 errors | 12/13 |
| T2 | Without skills | 1 | 11.3 | 1.18M | 52k (33k) | $5.24 | 36 | 16 | 0 | 29 | n/a | 13/13 |
| T3 | 0.5.0 | 1 | 29.4 | 4.21M | 131k (83k) | $15.62 | 93 | 55 | 76 | 125 | 0 errors | 11/11 |
| T3 | First attempt | 1 | 27.8 | 5.82M | 152k (96k) | $15.83 | 80 | 25 | 117 | 140 | 0 errors | 10/11 |
| T3 | Second attempt | 1 | 32.0 | 6.54M | 148k (98k) | $18.47 | 103 | 70 | 99 | 117 | 0 errors | 8/11 |
| T3 | Without skills | 1 | 10.1 | 3.34M | 49k (28k) | $8.28 | 60 | 34 | 19 | 24 | n/a | 9/11 |

The second attempt's key scores come from round two. In that round, the 0.5.0 plans scored 12/12, 12/13, and 11/11.

Totals over the three tasks:

| Variant | Time (min) | Input tokens | Output tokens (thinking) | Cost | Key score |
| --- | --- | --- | --- | --- | --- |
| 0.5.0 | 78.4 | 9.32M | 331k (196k) | $37.16 | 36/36 |
| First attempt | 80.7 | 13.72M | 410k (231k) | $42.64 | 35/36 |
| Second attempt | 80.8 | 15.19M | 363k (232k) | $42.14 | 32/36 |
| Without skills | 38.3 | 6.25M | 169k (105k) | $21.19 | 34/36 |

Every run finished in one session, with exit code 0, and changed no file outside `docs/plans/`.

### Scoring notes

- **T3, item 11, round one.** The round-one scorer gave 0 on item 11 to the first attempt's plan and to the plan written without the skills. For the first attempt, its reason was that the sweep misses `plan-review-base`, but the sweep's pattern names `plan-review-base` explicitly. Another fresh session then scored item 11 again for all three plans, blind, with the rule written out: the sweep must skip `plan-reviewer`, `plan-result-review`, and the changelog, and must pass once the plan itself is carried out. It gave 1 to the 0.5.0 and first-attempt plans. It gave 0 to the plan without the skills, whose sweep expects no output while that plan keeps two test files that still contain the old name. The table shows that session's scores for item 11.
- **T3, items 7 and 8.** The T3 scorer prompts spell out that a minor bump does not satisfy item 8, and that a skipped sibling bump does not satisfy item 7. Both rules repeat the key, but they were written after the agent running the benchmark had read the summary of the first attempt's plan, which chose a minor bump.
- **Round two against round one.** Round two scored the 0.5.0 plans 12/12, 12/13, and 11/11, against 12/12, 13/13, and 11/11 in round one. The difference is T2's item 4. Both scorers quoted the same rule from that plan, that `--all` removes only catalogue persona names. The round-two scorer also noted that the plan would remove a hand-written file that shares a catalogue persona's name, and gave 0. Two scorers can differ by a point on the same plan, so compare the second attempt with the 0.5.0 score from the same round: 32 of 36 against 35.
- **The second attempt's T3 plan** lost three items. It bumped the renamed skill to a minor version. It left `tech-writing`'s example with the old name. And its sweep, `plan-review([^a-z-]|$)`, would not see a leftover `<plan-review-base>` placeholder, which the plan says it renames.

## What the results show

### The two attempts against 0.5.0

- **Neither was faster.** Over the three tasks, 0.5.0 took 78.4 minutes, the first attempt 80.7, and the second attempt 80.8. Per task, the first attempt was 1.1 minutes faster, 5.0 slower, and 1.6 faster. The second was 2.9 faster, 2.7 slower, and 2.6 slower.
- **Both cost more.** $42.64 and $42.14, against $37.16. Both also thought more: 231k and 232k thinking tokens, against 196k.
- **Quality did not improve.** The first attempt scored 35 of 36 against 36: in T3 it chose a minor bump. The second attempt scored 32 of 36 against 35 in its own round. Every skill plan passed the validator with 0 errors.
- **The 50-file pause never fired.** The first attempt's runs opened 25 to 31 files each with the Read tool.
- **The two attempts ran the project's checks differently.** In all three of the first attempt's runs, the model started the checks with Claude Code's background option, and those calls returned at once. In all three of the second attempt's runs, it ran them in the foreground for about three minutes each, as the 0.5.0 runs did. Step 5 describes background checks the same way in both versions; in the first attempt, other new rules sat around it. The first attempt saved that waiting, but spent more time generating. Its runs carried about 50% more context into each turn, 58k tokens on average against 39k, and wrote more that never reached the final plan, such as helper scripts and one rebuild of a plan file.

### How much single runs vary

The second attempt is close to a repeat of 0.5.0: one sentence changed, and its runs did not act on it. Against the 0.5.0 runs, it differed by:

| Task | Time | Input tokens | Output tokens | Thinking tokens |
| --- | --- | --- | --- | --- |
| T1 | 2.9 min faster | 2.38 times | 2% more | 14% more |
| T2 | 2.7 min slower | 0.92 times | 14% more | 24% more |
| T3 | 2.6 min slower | 1.55 times | 13% more | 18% more |

- Time moved by about 3 minutes per task, in both directions.
- Input tokens moved the most, because every turn counts the whole context again. A run that reads large files early pays for them on every later turn.
- Output tokens moved by up to 14%. Model time tracks output closely: every run in this benchmark produced 67 to 91 output tokens per second of model time, and the later batch was in the same range.
- Thinking was higher in all three. The extra sentence may cost some thinking, but one run per task cannot show it.

With one run per cell, a difference between skill versions of about 3 minutes per task, or of about 2.5 times in input tokens, can come from chance alone. Most of the first attempt's differences from 0.5.0 are inside that range.

### With the skills against without

- **Without the skills, Claude Code planned in about half the time.** Over the three tasks it took 38.3 minutes against 78.4 with 0.5.0, cost $21.19 against $37.16, and wrote 169k output tokens against 331k. Per task, the time gap was 12.0, 8.8, and 19.3 minutes, well beyond the spread between repeat runs.
- **The keys found a small difference.** The plans without the skills scored 34 of 36, against 36 with 0.5.0. Every plan got full marks on T1 and T2 in round one. On T3, the plan without the skills missed two items: it bumped the renamed skill to a minor version, and its final sweep would fail as written.
- **What the skills add is mostly outside the keys.** A 0.5.0 plan cites 25 to 76 exact lines, and the validator checked every one against a quoted excerpt and the file's hash. The plans without the skills cite 0 to 19 lines, and nothing checks them. The skill plans also record the project's checks as a baseline, trace critical flows, and end with a final verification wave. They are 2 to 5 times larger: 72 to 125 KB, against 24 to 41 KB.

### Limits of this benchmark

- One run per variant and task, and repeat runs vary as the table above shows.
- The keys reached their ceiling on T1 and T2 in most sessions, so most of the quality differences come from T3, and two scorers can differ by a point on the same plan.
- The same agent wrote both attempts, the tasks, and the keys, and ran the benchmark. The scoring was blind, but no one else reviewed the keys.
- The runs loaded the skills directly, with "Use the plan-writer skill". They did not use the personas, so the persona changes in both attempts were not exercised.
- The runs used one owner's settings: a sandbox with no network, that owner's deny rules, and 203 tools. Other settings will give other numbers.
- The plans were scored, not built. A key score does not show whether a build from the plan succeeds.

## Reproduce

```bash
git clone https://github.com/Sillybit-io/silly-skills.git repo
git -C repo fetch origin pull/9/head
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

`<revision>` is `76bc021` for 0.5.0, `e7d80e3` for the first attempt, and `8dca147` for the second attempt. Both attempts are on pull request #9, which the `fetch` line brings in. For the runs without skills, skip the `mkdir`, `archive`, and `cp` lines. `prompt.txt` holds one of the prompts above. The time, tokens, and cost are in the `result` event on the last line of `run.jsonl`.

## Scorer prompts

<details>
<summary>Round-one scorer prompt for T1, with local paths shortened to &lt;dir&gt; and the key items left out</summary>

```text
You are scoring three implementation plans against an answer key. You do not know who wrote them or how; treat all three identically and do not speculate about their origin.

Read ONLY these three files. You may use Read and Grep on them. Do not open, list, or search any other file or directory, do not run shell commands, and do not edit or create any file.

- <dir>/plan-A.md
- <dir>/plan-B.md
- <dir>/plan-C.md

Each plan answers this request, made against a repository of AI skills (each skill is a SKILL.md under skills/<category>/<name>/; the catalogue had 18 skills and 8 agent personas):

"Add a release-notes skill to this repository. It should turn merged pull requests into a human-focused changelog and recommend the SemVer bump that goes with it."

Answer key. Line numbers are context for you; a plan does not need to cite the same line number, only the same file and the same change.

<the 12 T1 items, exactly as in the answer key above>

Scoring rule:
- An item scores 1 when the plan states it correctly, and 0 when it is missing or wrong.
- A general instruction such as "fix any failing tests" or "update docs as needed" does not count. The plan has to name the file, the value, or the decision.
- An item with two parts needs both parts. For an "either ... or ..." item, either branch counts.
- The plans are long. Search each one for every item (for example: eighteen, badge, validate.test.ts, planning-install.test.ts, CHANGELOG, Unreleased, suggested-model, persona, Roadmap, Conventional Commits, release workflow, bun test) before you score it 0.

Reply with, for each plan in order A, B, C:
1. A table: item number | score (0 or 1) | evidence. For a 1, the evidence is a verbatim quote of at most 25 words from that plan, with its line number. For a 0, one sentence saying what is missing or wrong; if a statement is wrong, quote it with its line number.
2. The plan's total out of 12.
3. Up to three factual errors you noticed outside the key that would mislead a developer, each with a quote and line number, or "none".

End with one line per plan: `A: <total>/12`, `B: <total>/12`, `C: <total>/12`.
```

The T2 and T3 prompts differ only in the request, a short description of the repository, the key, and the search hints. The round-two prompts are the same for two plans instead of three.

</details>

<details>
<summary>Rules the T3 prompts add</summary>

The round-one T3 prompt added the rules for items 2, 3, 4, 7, and 8. The item 11 rule comes from the session that scored item 11 again, and the round-two T3 prompt has all of them.

```text
- An item with two or more parts needs every part. For item 2, all three import sites must be named. For item 3, both named test files must be covered. For item 4, every listed persona file must be covered. For item 7, every listed skill must be covered and the plan must give each one a version bump and a changelog line; a plan that deliberately and explicitly decides not to bump a sibling whose text changes scores 0 on item 7. For item 8, any major version bump plus a reinstall note for existing users counts; a minor or patch bump scores 0 even if the plan explains why.
- Item 11 scores 1 only when all of these hold: (a) a sweep for the old name exists; (b) as written, it does not match `plan-reviewer` or `plan-result-review`, and it excludes `CHANGELOG.md` or its released history; (c) as written, it would pass once the plan itself is carried out correctly: it does not flag occurrences the plan deliberately keeps, or it names them as the expected output; and it does not miss old-name forms the plan says it renames; (d) the plan also runs `bun run validate` and `bun test` as verification. Reason from the exact pattern and flags written in the plan. For example, a grep `-w` or `\b` boundary does not match `plan-reviewer`, because `e` is a word character, but it does match `plan-review` before `-`, `/`, or a backtick.
```

</details>
