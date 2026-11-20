# Design: lighter plan skills

Status: approved by the owner on 2026-11-20. Branch: `feat/lighter-plan-skills`.

## Why

The planning skills use too many tokens. Users hit three limits: the weekly Fable limit, the weekly Claude limit, and the GPT limit. The numbers below come from real OpenCode sessions over seven days. Project names are left out.

| Consumer | Model | Requests | Tokens read | Share |
| --- | --- | --- | --- | --- |
| The main session that drives a build | Opus | 4,386 | 2,280M | 61% of Claude without Fable |
| `plan-builder` sessions | Opus | 2,602 | 1,270M | 34% of Claude without Fable |
| `plan-result-review` sessions | GPT | 1,336 | 191M | 38% of GPT |
| `plan-review` sessions | GPT | 116 | 16M | 3% of GPT |
| `plan-writer` sessions | Fable | 136 | 48M | 50% of Fable |

The cost does not come from the skill text. It comes from long sessions. Every request sends the whole context again.

- **One builder session builds every todo.** Its context grows to 500k tokens in the middle of a build and 850k at the end. One build made 1,573 requests.
- **The builder cannot launch a child.** The host allows one level of children. So the main session runs every result review, then fixes the findings itself. In one week the main session spent about 500M tokens after result-review launches, more than all result reviewers together.
- **Result review reads whole files every round.** For a 55-todo plan the spec, evidence index, and build record are 757 KB, about 190k tokens. GPT sessions compact near 230k. One build reached result round 11.
- **The writer's late requests run at full context.** In one session the last 13 of 31 requests ran at about 790k tokens and made 56% of its input. Three writers ran at the same time and used 45M Fable tokens in about an hour.
- **Plans are large.** Specs are 76 to 299 KB, evidence indexes 60 to 326 KB.

Two earlier attempts added "be efficient" rules to `plan-writer`. Both cost more and were reverted (`docs/benchmarks/planning.md`). This design does not add such rules. It changes what each session reads and how long it lives.

## Owner decisions

These were decided before this design.

1. Lighter plans everywhere. Four areas stay as strict as today:
   - security, sign-in, and permissions;
   - production and shared services;
   - tests pass for every todo;
   - UI checked in a browser.
2. A plan has no size cap.
3. Plan review keeps today's verdict rules: every finding blocks. Only the round limit changes.
4. Result review gets an accepted verdict. Failing tests and strict-area findings block. Two more blocking rows are added in D2 (owner answer 5).
5. The build stays coordinated from the main session.
6. Plans already written finish on the old install. Only new plans use the new format.
7. Model pins are done (first commit on this branch). Writer effort is `xhigh`.
8. Effects are measured for free, from the session database, on the next real plans.

## Facts the design relies on

- **Children cannot launch children.** In OpenCode the subagent depth limit is 1. Both `plan-loop` runs stopped with a depth handback. No session in the database has a child as its parent. Claude Code subagents cannot launch subagents either.
- **Only the main session can launch.** So any skill that launches children must run in the main session.
- **Snapshots already attribute changes.** `capture-build-state.ts` records every path in three layers. The difference between two snapshots says exactly what a todo changed. A script can map changes to todos without a model.
- **The validator already checks receipts.** `validate-plan.ts` rejects a pass receipt with no checks or a failing check (`PASS_WITHOUT_CHECKS`).

## D1. Build: the main session coordinates, children build

### Roles

| Role | Runs in | Does |
| --- | --- | --- |
| Coordinator | The main session, with `plan-builder` loaded | Launches children, runs the validator, keeps the record. Never edits code, never runs tests, never reads a child's transcript. |
| Todo child | A fresh `plan-builder` child | Builds one todo: edits, Acceptance, QA, commit, one receipt. |
| Final-wave child | A fresh `plan-builder` child | Runs F1, F2, F3, and the UI QA todo. |
| Result reviewer | A fresh `plan-result-reviewer` child | F4. See D2. |
| Fix child | A fresh `plan-builder` child | Fixes the blocking differences of one result round. |

The persona stays one file per tool. Its prompt says: in the main session you coordinate; as a child you do the one job your task names. No new persona, so the agent count stays 8.

### Coordinator loop

1. New build: run `validate-plan.ts <plan> --review --json` and require `gateEligible: true`. Then do T0 (see below), capture the baseline with `capture-build-state.ts`, and write the build record. These are the only writes the coordinator makes itself.
2. Run `validate-plan.ts <plan> --review --resume --json`. Its JSON names `nextTodo`, which only resume mode reports. A new build reaches this step with an empty receipt chain.
3. Launch a todo child with: the plan path, the todo id, the run directory, and the drift list when there is one. Nothing else.
4. When the child returns, run the validator again. It checks the new receipt (see "One record per todo"). A missing check means the todo is not done: launch the child again with the validator's error.
5. Repeat until no todo is left. Then the final-wave child, then F4, then fix children and round 2 if needed.
6. Report one short block to the user.

Each todo costs the coordinator about two requests. The coordinator keeps no state in the chat. After a compaction it reloads the skill and runs `--resume --json`. This also works when several builds run at the same time in different worktrees.

Estimate from two real builds, if each todo ran in a fresh child: 294M tokens would be about 109M, and 200M would be about 50M. The estimate is optimistic, because a fresh child re-reads some files. The coordinator adds about 20M for 16 todos at today's main-session size. Starting the build from a fresh main session lowers that.

### What a todo child reads

- Its own todo, printed by a new option: `validate-plan.ts <plan> --todo T3`. It prints the todo, the Must Haves and gaps it closes, its dependencies' titles, and its strict flag. About 6 KB instead of the whole spec.
- The files its todo references, and what it finds while working.
- The "Todo child" section of `references/receipts.md`.

### One record per todo

Today a todo has three receipts: start, checkpoint, and pass. The new chain has one per todo:

- `pass`: written once Acceptance and every QA scenario passed and the commit landed. It holds `before`, `after`, `checks`, `prerequisites`, and `commit`.
- `block`: written when the child cannot finish. It names what is missing.
- `recovery`: as today, for state the record does not explain.
- `fix`: written by a fix child after a result round. It has the same fields as `pass`, names `F4` as its todo, and needs passing checks for every blocking difference it fixed.

In format 2 the chain rules change: a `pass` or `block` may be the first receipt of a todo, when every dependency has a passed receipt. Its `before` must equal the previous receipt's end state, as today. `start` and `checkpoint` are no longer accepted.

The validator gains one rule: a pass receipt has a passing check with id `acceptance`, and one passing check per QA scenario (`qa:happy`, `qa:failure`, and so on, unless the plan marks it `n/a`). A missing check is an error, so the todo stays open. This is stricter than today, where the result reviewer found missing checks only after the build.

Cost of one record: the record cannot tell an interrupted todo from other drift. So an interruption is handled like drift today:

1. The validator reports drift: changed paths, and a HEAD that moved past the last receipt's end state.
2. The coordinator launches the next todo's child with that report and the word `recovery`.
3. The child investigates first. A commit after the last receipt whose subject matches its todo is that todo's commit; it is never made again. Paths the todo owns are its partial edits. Anything else is recorded and left alone.
4. The child appends a `recovery` receipt that records what it found, then finishes the todo and writes its `pass` receipt.

Tests cover an interruption before the commit, after the commit, and drift the todo does not own.

### T0 and the final gates

T0 and F1 to F4 stay in the plan, as todos with boxes (owner decision). Their text gets shorter:

- T0 keeps its heading, box, and commit line. Its `Do` becomes one line: "Copy the plan directory into `docs/plans/` when needed, and commit it." The details of copying live in `plan-builder`. The coordinator runs T0 itself; it touches only the plan directory.
- F1 to F4 keep their headings and boxes. Each `Do` and `Acceptance` becomes one line, unless the plan has something specific to say. F1 to F3, every extra check `F5` onward, and the UI QA todo are the final-wave child's job. F4 is the result review.
- The two fixed paragraphs, test-before-next under `## Todos` and continue-through-waves under `## Execution strategy`, become one sentence each. `plan-builder` holds the full rules.

Checks I and J keep their blockers: missing todos, boxes, order, and the two sentences. They stop judging the exact wording.

### When a child cannot be launched

If the host denies a child, the coordinator builds the todo itself, as today, and says so in its reply. F4 is never run inline.

## D2. Result review

### What the reviewer reads

A new script, `inventory-changes.ts --brief`, writes a summary of about 10 to 30 KB:

- per todo: id, title, strict flag, the pass receipt's checks, the commit and its files;
- every changed path, with the todo whose snapshot interval changed it, or `unattributed`;
- every owner-work path whose layers changed;
- the Must Haves and Must NOT Haves, one line each.

The summary is for navigation, not a verdict. The reviewer still maps every gap, Must Have, Must NOT Have, and todo clause to a change, and reads the content of every changed artifact, as today. It reads each todo's clauses with `--todo` and the diffs of the changed paths. It no longer reads the spec, the evidence index, and the build record whole.

### Tests

The reviewer runs the project's test command once in a disposable copy, and the Acceptance commands of strict todos. It trusts the other recorded checks, because the validator has already checked that every todo has them.

### Weights

| Difference | Weight |
| --- | --- |
| A test, Acceptance, or QA check fails or cannot run | Blocking |
| Anything in a strict area, or a UI todo with no browser check | Blocking |
| Owner work from before the build was changed or lost | Blocking |
| A todo or Must Have with nothing built | Blocking |
| A file no todo names | Recorded |
| A file renamed or moved | Recorded |
| Commit subject, commit files, or branch differ from the plan | Recorded |
| Behavior changed outside strict areas, and tests pass | Recorded |

When unsure whether something is in a strict area, it counts as strict. A strict area is found two ways: the plan marks the todo `Strict: <area>`, and the reviewer checks the changed paths itself, for example auth code, permission checks, deploy and CI files, and production configuration.

### Verdicts

```text
PLAN-RESULT: MATCH
PLAN-RESULT: ACCEPTED (<n> recorded)
PLAN-RESULT: MISMATCH (<n> blocking, <m> recorded)
PLAN-RESULT: INCOMPLETE
```

`ACCEPTED` completes the build, like `MATCH`. Recorded differences stay in the round, one line each, and are never sent to a fix child.

### Rounds

- Two rounds per build.
- Round 2 runs the inventory and the brief against the build baseline again, so nothing new is missed, and classifies every difference again. It reads the diff since round 1 first, and runs the affected checks again. A recorded difference that a fix pulled into a strict area becomes blocking.
- If blocking differences remain after round 2, the build stops. The coordinator gives the user one line per difference.

### Report

Blocking differences keep today's fields. Recorded differences are one line each. Counts stay on one line.

## D3. Writer: lighter evidence, shallower discovery, shorter spec

### Evidence

- A source citation keeps `path`, `startLine`, `endLine`, and `sha256`. It drops `excerpt`.
- The writer leaves `sha256` empty. A new script, `stamp-evidence.ts <plan> --root <project>`, fills every empty hash in one call before validation. The validator still never edits files.
- The hashes stay, because the builder and the result reviewer use them to notice that cited code changed after approval.
- External citations keep their short excerpt, because the quote is the evidence.
- A coverage row keeps `id`, `paths`, `state`, `citationIds`, and `reason`. It drops `searches`, `producers`, and `consumers`.

### Discovery

- Follow producers and consumers one step from the changed code. A consumer that itself needs a change becomes a new starting point.
- Always search the changed inventory too: counts, registrations, generated lists, and the tests that assert them. The benchmark's misses were of this kind.
- In a strict area, follow edges to the end, as today.
- Critical flows are traced for strict areas and for changes that write or migrate stored data (owner answer 4). Elsewhere the index records `noRuntimeFlowReason`.

### Spec

The spec keeps what the owner reads (TL;DR, questions, todos) and what the builder needs to act.

| Section | New format |
| --- | --- |
| TL;DR | Kept |
| Scope: Affected users, Ideal state | Removed; one TL;DR line says who notices the change |
| Scope: IS / GAP ledger, Risks, Must have, Must NOT have, Baseline | Kept |
| Scope: Coverage paragraph | Removed; the coverage rows hold it |
| Scope: Critical flows | Kept, strict areas only |
| Research | Sources and what the plan follows; the other four lines removed |
| Questions | Kept |
| Design | Kept |
| Verification strategy | Removed; it repeated Success criteria |
| Execution strategy | One continue-through-waves sentence and the wave list |
| Todos | One test-before-next sentence; a short T0; a new `Strict:` field |
| Final verification wave | Short F1 to F4, then `F5` onward and UI QA |
| Success criteria | Kept |

### Owner rule

The sentence "the owner chose completeness over investigation cost" is replaced in every planning skill by: "Discovery goes one step from the changed code and always covers the changed inventory. In a strict area it goes to the end." This also satisfies `skill-writer`'s rule that a skill names its work budget.

### Deferred

Two ideas wait until the next real writer sessions are measured: finishing validation in a fresh session, and sending source reading to `plan-scout`. Lighter evidence and soft-cap advice should remove most of the late requests they targeted.

## D4. Plan review

- **Rounds.** Two per consent, not five. At the limit the reviewer stops with one line per open blocker and what would close it, then asks to continue for two more rounds or stop.
- **Verdict rules.** Unchanged. Only `OKAY` can be built. Owner acceptance is recorded but does not make a plan buildable.
- **Gate record skeleton.** A new option, `validate-plan.ts <plan> --gate-skeleton`, prints the gate record with every required target already grouped: one obligation per todo (split into `.start`, `.acceptance`, and `.qa` when their evidence or status differs), one per Must Have, one per dependency, one per flow and contract, and one per check. The reviewer fills in statuses and evidence. It no longer types 20 to 50 KB of JSON, and it reads `validator-contract.md` only when the validator fails.
- **Trust the script for structure.** The validator checks that cited lines exist and that their hashes match. Without excerpts, a citation no longer proves the writer read those lines, so the reviewer opens the citations a todo relies on when it checks that todo (Checks A and B, as today). It does not re-check every citation. It reads the spec once and pulls evidence entries by id. It reads the source behind every strict-area todo.
- **Checks I and J** keep their blockers but stop judging exact wording. Check J adds the `Strict:` field.

## D5. `plan-loop`

- It only works in the main session, because it launches children. Its OpenCode persona becomes `mode: primary`. In Claude Code and Cursor the main session loads the skill; the persona files say so.
- The round limit becomes two, as in D4.

## D6. Format version and old plans

- The evidence index, the gate record, and the build record move to `schemaVersion: 2`.
- The new validator rejects version 1 with: "This plan uses format 1. Finish it with the plan skills from before this change."
- Before reinstalling into a project, list every format-1 plan that is not finished: drafts, planned and reviewed plans, and builds without the final `docs(plans): complete` commit. Each one either finishes on the old install first, or the owner decides to write it again in format 2. Reinstall only after that.
- `plan-writer`, `plan-review`, `plan-builder`, and `plan-result-review` take major versions. `plan-loop` takes a minor, because it is below 1.0.

## D7. Tests and docs

- `scripts/validate-plan.test.ts`: fixtures move to format 2, with tests for `--todo`, `--gate-skeleton`, the per-todo check rule, the version-1 message, and excerpt-free citations.
- New tests for `stamp-evidence.ts` and `inventory-changes.ts --brief`.
- `scripts/planning-build-state.test.ts` and `scripts/planning-install.test.ts`: format 2 snapshots, receipts, and installed packages.
- The contracts in `references/`: `validator-contract.md`, `writer-contract.md`, `evidence-gate.md`, `evidence-index.md`, `coverage.md`, `final-wave.md`, `receipts.md`, `differences.md`, and `inventory.md`.
- `scripts/planning-agents.test.ts`: `plan-loop` mode becomes `primary`; `plan-builder` may launch `plan-builder` and `plan-result-reviewer`.
- README planning section and five-round texts, `CHANGELOG.md`, and each persona prompt.
- `examples.md` files and `docs/benchmarks/planning.md` record runs of older versions. They stay as they are.

## Order of work on the branch

1. Validator format 2, `--todo`, `--gate-skeleton`, the per-todo check rule, and `stamp-evidence.ts`, with tests.
2. `plan-writer` 2.0.0.
3. `plan-review` 2.0.0.
4. `plan-builder` 2.0.0 and its persona.
5. `inventory-changes.ts --brief` and `plan-result-review` 2.0.0.
6. `plan-loop`, README, and changelog.

Each step runs `bun run validate` and `bun test`.

## Measuring

From the session database, on the next real plans:

| What | Today | Target |
| --- | --- | --- |
| Writer input per plan | 12 to 18M | under 8M |
| Requests after the first validator run | 13 | 4 or fewer |
| Median context of a todo child | 500k in a shared builder | under 200k |
| Builder tokens per 16-todo build | 200 to 300M | under 120M, coordinator included |
| Result-review rounds per build | up to 11 | 2 at most |
| Plan size, spec plus evidence index | 136 to 515 KB | about half |

## Owner answers

Answered on 2026-11-20.

1. T0 and F1 to F4 stay in the plan, with shorter text.
2. Result review runs the project's test command once, plus the Acceptance commands of strict todos.
3. Fixes for a rejected plan keep running through the writer persona on Fable.
4. Flows are traced for strict areas and for changes that write or migrate stored data.
5. Lost owner work and a todo with nothing built both block.
6. When a todo child cannot be launched, the coordinator builds that todo itself and says so. F4 is never run inline.
