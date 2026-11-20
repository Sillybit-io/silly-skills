---
name: plan-builder
description: Builds a reviewed plan from the main session, which coordinates while a fresh child session builds each todo, keeping a durable, resumable record of one receipt per todo. Captures a byte-exact baseline snapshot before touching anything, requires each todo's real Acceptance and QA, commits only that todo's owned paths, and never claims Done without a passed receipt. Resumes an interrupted build from its last record. Runs an independent result review with at most two rounds before reporting complete. Use when asked to build this plan, implement this reviewed plan, or resume this plan.
license: CC-BY-ND-4.0
metadata:
  version: "2.0.0"
  category: planning
  suggested-model: anthropic/claude-opus-5-5
  suggested-effort: max
---

# plan-builder

## Purpose

plan-builder turns a reviewed plan into a durable, resumable build without one session holding the whole build in its context. The main session is the **coordinator**: it runs the validator, launches a fresh child session for each todo, for the final wave, for the result review, and for each fix, and keeps the record on disk. A **child** does one job and returns one line. A host lets only the main session launch children, so the coordinator never runs as a child itself. Every todo gets one passed receipt, written only after its real Acceptance and every QA part ran and any required commit landed. Each receipt names a byte-exact snapshot of the project, captured by [scripts/capture-build-state.ts](scripts/capture-build-state.ts), so a crash, a compaction, or a fresh session resumes from the last record instead of guessing. The plan directory travels with the code: T0 commits it, every todo commit includes it, and one plan-only commit closes the build. A build never reports complete without a fresh independent result review. Format 1 plans, whose records carry `schemaVersion: 1`, finish on the plan skills from before 2.0.0. The `suggested-model` hint is advisory.

**Context rule.** The coordinator's context is re-sent on every request of a long build, so it reads only validator output, child replies, and the plan's verdict lines. It never reads code, runs tests, reads a child's transcript, or reads the whole spec. Start a build from a fresh main session when you can.

## When to use / when NOT to use

Use plan-builder when you:

- Are told to build, implement, or resume a plan with `status: reviewed` (or an in-progress `<stem>.build.md` from an earlier session).
- Need to pick up an interrupted build safely, without repeating completed work or guessing at what already happened.
- Need every todo's real Acceptance and QA run and recorded, not assumed from the plan text.

Do NOT use plan-builder when you:

- Have a plan that is not `status: reviewed` and has no build file. Send it to `plan-review` first.
- Want to write the plan's implementation todos differently. That is `plan-writer`.
- Only want to check a finished build against its plan without building anything. That is `plan-result-review`.
- Want a fully automated multi-round loop across writer and reviewer. That is `plan-loop`; this skill only builds.

## Workflow

### Coordinator, in the main session

1. Resolve the plan path from the request or conversation: `docs/plans/<stem>/<stem>.md`. Read [references/receipts.md](references/receipts.md). Do not read the spec whole; the validator and `--todo` give you what you need.
2. **New build** (no build file). Run `bun <plan-review-base>/scripts/validate-plan.ts <plan> --review --root <project> --json`, where `<plan-review-base>` is the plan-review skill directory installed beside this one. Require `gateEligible: true`; otherwise report the validator's errors and stop. A `FORMAT_1` error means the plan finishes on the old install: say so and stop. Then capture the baseline with `capture-build-state.ts` to a fresh, durable run directory, write `<stem>.build.md` as the reference describes, and run T0 yourself: copy the plan directory into `docs/plans/` only when needed, commit it as `docs(plans): add <slug> plan`, append its pass receipt, and set its box to Done. These are the only project writes you make yourself.
3. **Each step.** Run the same command with `--resume` added and act on its JSON:
   - `reconcileBoxes` not empty: set those boxes to Done yourself, without repeating any work.
   - `recoveryRequired`: launch a todo child for `nextTodo` in recovery mode, with the `drift` list.
   - `nextTodo` is a todo: launch a todo child with the plan path, the project root, the todo id, the run directory, and any `requiredRechecks` for it. Nothing else.
   - `nextTodo` is a final gate: go to step 5.
   - The last receipt is `blocked`: stop with a CHECKPOINT that names what the child said is missing.
4. When a child replies, run the resume command again. An error on the new receipt, such as `MISSING_CHECK`, means the todo is not done: launch a fresh child for the same todo with the validator's error. After two such retries, stop with a CHECKPOINT. Otherwise return to step 3, without asking for a continue.
5. **Final wave.** Launch one final-wave child for F1, F2, F3, every gate `F5` onward, and the automated UI QA todo when `ui: yes`. Then launch a fresh `plan-result-reviewer` child for F4 with the plan path and the project root only. Read the verdict line of the newest `### Result round` in `<stem>.reviews.md`.
6. **After the result review.**
   - `MATCH` or `ACCEPTED`: set F4 Done, make the plan-only commit `docs(plans): complete <slug> build`, and reply DONE.
   - `MISMATCH` in round 1: launch a fix child with the round number; it reads the blocking differences itself. Then launch a fresh result reviewer for round 2.
   - `MISMATCH` in round 2: stop with STOPPED and one line per blocking difference. The owner decides.
   - `INCOMPLETE`: stop with a CHECKPOINT that names the missing evidence.
7. **No child available.** When the host denies or cannot launch a todo, final-wave, or fix child, do that child's job yourself, as the child section says, and say so in the reply. Never run F4 yourself: without a fresh result reviewer, stop with a HANDBACK.
8. A genuinely unavailable input — Bun, a dependency, the plan-review or plan-result-review skill, network access a check needs — is a CHECKPOINT with the missing input named, never a reason to report Done.
9. After a compaction or a new session, reload this skill and start at step 3. All state is on disk.

### Children

- **Todo child.** Run `validate-plan.ts <plan> --todo <id> --root <project>` and read only that, the files it references, and what the work needs. In recovery mode, investigate the drift first, as the reference's Recovery section says, and append a `recovery` receipt. Record any required recheck. Make the todo's edits. Run its Acceptance and every labelled QA part for real, and fix the implementation until they pass. Commit when it says `Commit: yes`, with its owned paths and the plan directory only. Capture the after-snapshot, append one `pass` receipt whose checks use the ids `--todo` printed, and set the todo's box to Done. When it cannot finish, append a `block` receipt that names what is missing.
- **Final-wave child.** Run each gate as the reference's Final wave section describes, mark each box Done when its work is done, and fix a failure in place: re-run the affected checks and append a `fix` receipt that names the gate.
- **Fix child.** Read the blocking differences of the given round in `<stem>.reviews.md`, and nothing the round only recorded. Fix each one, re-run the checks it affects and the todo checks of every todo it touches, commit, and append one `fix` receipt with `F4` as its todo.
- Every child replies with one line, nothing else.

### Recovery

Read [references/receipts.md](references/receipts.md)'s Recovery section before acting on drift. A todo interrupted before its pass receipt shows as drift. A commit made after the last receipt, whose subject matches the todo, is that todo's commit: never make it again. Paths the todo owns are its partial edits. Anything else is recorded in the recovery receipt and left alone. Never replay a commit or another irreversible command because its outcome was not recorded.

## Output format

The coordinator's reply starts with exactly one verdict line:

```text
PLAN-BUILD: DONE
PLAN-BUILD: CHECKPOINT (<todo or gate>; <reason>)
PLAN-BUILD: STOPPED (<n> blocking differences after two result rounds)
PLAN-BUILD: BLOCKED (<missing input>)
PLAN-BUILD: HANDBACK (<why the result reviewer could not be launched>)
```

```markdown
PLAN-BUILD: DONE
<plan path>. All todos and final gates are Done. F4 result review: PLAN-RESULT: <MATCH | ACCEPTED (<n> recorded)> (round <n>). Baseline: `<snapshot>`. Branch: `<branch>`. Commits: <n>, the last `docs(plans): complete <slug> build`. <Todos built inline because no child was available: none | T<n>, ...>
```

```markdown
PLAN-BUILD: STOPPED (<n> blocking differences after two result rounds)
<plan path>. Round 2 — <plan path's reviews file>.
1. <difference id> — <one line: what is wrong and where>
```

```markdown
PLAN-BUILD: CHECKPOINT (T<n>; <reason>)
<plan path>. Receipts through seq <n>. <n> of <total> todos Done. Next: <what resumes this, or what the caller must supply>.
```

A child's reply is one line:

```text
TODO-RESULT: PASS T<n> (<commit sha> | no commit)
TODO-RESULT: BLOCKED T<n> (<what is missing>)
FINAL-WAVE: PASS (<gates>)
FINAL-WAVE: FAILED (<gate>; <what still fails>)
FIX: PASS (round <n>; <difference ids>)
FIX: BLOCKED (round <n>; <what is missing>)
```

## Guardrails

MUST:

- MUST require `gateEligible: true` (new build) or `resumeEligible: true` (resume) from the real validator run before any application edit.
- MUST run as coordinator only in the main session, and give each todo, the final wave, F4, and each fix a fresh child when the host allows it.
- MUST keep the coordinator's context to validator output, child replies, and verdict lines.
- MUST capture the baseline and every receipt snapshot with `capture-build-state.ts`, never by hand.
- MUST write a todo's pass receipt only after its real Acceptance and every QA part passed and any required commit landed, with the check ids `--todo` printed.
- MUST commit only a todo's owned paths plus the plan directory, and checkpoint instead of whole-file staging when owner content or unaccounted edits collide with an owned path.
- MUST keep receipts to the contract's keys and fields under their caps; put long output in a log file named by `log`.
- MUST investigate drift and record a recovery receipt before forward progress after an unexplained state change.
- MUST launch a fresh `plan-result-review` child for F4, run at most two result rounds, and report Done only on a current `MATCH` or `ACCEPTED`.
- MUST continue through every wave and the final wave without stopping to ask for a routine continue.
- MUST name the missing input and checkpoint when Bun, a dependency, an approval, or a required snapshot is unavailable.

NEVER:

- NEVER treat validator exit 0, or any check's mere completion, as approval or a passing result by itself.
- NEVER let the coordinator read code, run tests, or read a child's transcript.
- NEVER commit an unrelated initial or unaccounted change together with a todo's owned paths.
- NEVER rewrite a todo's Acceptance or QA to make a failing check pass; fix the implementation, or checkpoint when the check itself needs a new review.
- NEVER send a recorded result-review difference to a fix child; only blocking ones are fixed.
- NEVER run F4 inline, report a result review that did not run, or reuse a stale one after further changes.
- NEVER replay a commit or another irreversible command because its outcome was not recorded; investigate the real current state first.
- NEVER push.
- NEVER mark a todo Done without its own durable passed receipt.
- NEVER rely on temporary storage, an unreferenced Git blob, or any location that will not survive a session end for a baseline or a receipt snapshot.

## QA checklist

- [ ] The preflight ran the real validator and required `gateEligible`/`resumeEligible` before any edit.
- [ ] A durable baseline snapshot exists, captured by `capture-build-state.ts`, and its location is recorded in the build file.
- [ ] Each todo was built by a fresh child, or the reply names it as built inline because no child was available.
- [ ] Every todo has one passed receipt with a real snapshot reference, a passing `acceptance` check, and one passing check per QA part.
- [ ] T0 committed the plan directory; every `Commit: yes` todo's commit touches only its owned paths and the plan directory.
- [ ] A Done build ends with the plan-only `docs(plans): complete <slug> build` commit; a checkpoint or a stop made none.
- [ ] Every todo's box is `- [x] Done` only after its passed receipt, and every gate's box only after its own work.
- [ ] F4 ran in a fresh `plan-result-review` child; there were at most two result rounds; Done was reported only on `MATCH` or `ACCEPTED`, and STOPPED lists each blocking difference.
- [ ] Each fix child got only blocking differences and wrote a `fix` receipt.
- [ ] The coordinator read no code, ran no tests, and read no child transcript.
- [ ] No temporary directory, unreferenced blob, or non-durable location holds a baseline or receipt snapshot.
- [ ] Nothing was pushed.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
