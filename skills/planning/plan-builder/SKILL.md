---
name: plan-builder
description: Builds a reviewed plan from the main session, which coordinates while a fresh child session builds each todo, keeping a durable, resumable record of one receipt per todo. Captures a byte-exact baseline snapshot before touching anything, requires each todo's real Acceptance and QA, commits only that todo's owned paths, and never claims Done without a passed receipt. Resumes an interrupted build from its last record. Runs an independent result review with at most two rounds before reporting complete. Use when asked to build this plan, implement this reviewed plan, or resume this plan.
license: CC-BY-ND-4.0
metadata:
  version: "2.4.0"
  category: planning
  suggested-model: anthropic/claude-opus-5-5
  suggested-effort: max
---

# plan-builder

## Purpose

plan-builder turns a reviewed plan into a durable, resumable build without one session holding the whole build in its context. The main session is the **coordinator**: it runs the validator, launches a fresh child session for each todo, for the final wave, for the result review, and for each fix, and keeps the record on disk. A **child** does one job and returns one line. A host lets only the main session launch children, so the coordinator never runs as a child itself. Every todo gets one passed receipt, written only after its real Acceptance and every QA part ran and any required commit landed. Each receipt names a byte-exact snapshot of the project, captured by [scripts/capture-build-state.ts](scripts/capture-build-state.ts), so a crash, a compaction, or a fresh session resumes from the last record instead of guessing. The plan directory travels with the code: T0 commits it, every todo commit includes it, and one plan-only commit closes the build. When git ignores the plan directory, the Commits section of [references/receipts.md](references/receipts.md) says what changes. A build never reports complete without a fresh independent result review. Format 1 plans, whose records carry `schemaVersion: 1`, finish on the plan skills from before 2.0.0. The `suggested-model` hint is advisory.

**Context rule.** The coordinator's context is re-sent on every request of a long build, so it reads only validator output, child replies, and the plan's verdict lines. It never reads code, runs tests, reads a child's transcript, or reads the whole spec. Start a build from a fresh main session when you can.

## When to use / when NOT to use

Use plan-builder when you:

- Are told to build, implement, or resume a plan with `status: reviewed` (or an in-progress `<stem>.build.md` from an earlier session).
- Need to pick up an interrupted build safely, without repeating completed work or guessing at what already happened.
- Need every todo's real Acceptance and QA run and recorded, not assumed from the plan text.

Do NOT use plan-builder when you:

- Have a plan that is not `status: reviewed` and has no build file. Send it to `plan-review` first.
- Want to write the plan's implementation todos differently. That is `plan-writer`. During a build, a plan change goes through step 10, Plan change, which hands it to `plan-writer` and `plan-reviewer`.
- Only want to check a finished build against its plan without building anything. That is `plan-result-review`.
- Want a fully automated multi-round loop across writer and reviewer. That is `plan-loop`; this skill only builds.

## Workflow

### Coordinator, in the main session

1. Resolve the plan path from the request or conversation: `docs/plans/<stem>/<stem>.md`. Read [references/receipts.md](references/receipts.md). Do not read the spec whole; the validator and `--todo` give you what you need.
2. **New build** (no build file). Run `bun <plan-review-base>/scripts/validate-plan.ts <plan> --review --root <project> --json`, where `<plan-review-base>` is the plan-review skill directory installed beside this one. Require `gateEligible: true`; otherwise report the validator's errors and stop. A `FORMAT_1` error means the plan finishes on the old install: say so and stop. For every plan, run the same script with `--todo T0` in place of `--review` and `--json`, and check the branch by the reference's Branch section. A case there with a reply stops the build with that reply, as Output format shows it. Then capture the baseline with `capture-build-state.ts` to a fresh, durable run directory, write `<stem>.build.md` as the reference describes, and run T0 yourself: copy the plan directory into `docs/plans/` only when needed, commit it as `docs(plans): add <slug> plan` unless git ignores it, as the reference's Commits section says, and record its pass receipt with [scripts/record-receipt.ts](scripts/record-receipt.ts), as the reference's Recording a receipt section says. These are the only project writes you make yourself.
3. **Each step.** Run the same command with `--resume` added and act on its JSON:
   - `reconcileBoxes` not empty: set those boxes to Done yourself, without repeating any work.
   - `errors` holds `SPEC_CHANGED` or `APPROVAL_CHANGED`: the plan changed outside step 10. Go to its record part, ahead of `recoveryRequired`, which a changed plan can also set.
   - `sliceStart` true: follow the reference's Slices section before you launch a child.
   - `recoveryRequired`: launch a todo child for `nextTodo` in recovery mode, with the `drift` list.
   - `nextTodo` is a todo: launch a todo child with the plan path, the project root, the todo id, the run directory, and any `requiredRechecks` for it. Nothing else.
   - `nextTodo` is a final gate: go to step 5.
   - The last receipt is `blocked`: stop with a CHECKPOINT that names what the child said is missing.
4. When a child replies, run the resume command again. An error on the new receipt, such as `MISSING_CHECK`, means the todo is not done: launch a fresh child for the same todo with the validator's error. After two such retries, stop with a CHECKPOINT. Otherwise return to step 3, without asking for a continue.
5. **Final wave.** Launch one final-wave child for F1, F2, F3, every gate `F5` onward, and the automated UI QA todo when `ui: yes`. Then launch a fresh `plan-result-reviewer` child for F4 with the plan path and the project root only. Read the verdict line of the newest `### Result round` in `<stem>.reviews.md`.
6. **After the result review.**
   - `MATCH` or `ACCEPTED`: set F4 Done, make the plan-only commit `docs(plans): complete <slug> build` unless git ignores the plan directory, as the reference's Commits section says, and reply DONE.
   - `MISMATCH` in round 1: launch a fix child with the round number; it reads the blocking differences itself. Then launch a fresh result reviewer for round 2.
   - `MISMATCH` in round 2: stop with STOPPED and one line per blocking difference. The owner decides.
   - `INCOMPLETE`: stop with a CHECKPOINT that names the missing evidence.
7. **No child available.** When the host denies or cannot launch a todo, final-wave, or fix child, do that child's job yourself, as the child section says, and say so in the reply. Never run F4 yourself: without a fresh result reviewer, stop with a HANDBACK.
8. A genuinely unavailable input — Bun, a dependency, the plan-review or plan-result-review skill, network access a check needs — is a CHECKPOINT with the missing input named, never a reason to report Done.
9. After a compaction or a new session, reload this skill and start at step 3. All state is on disk.
10. **Plan change.** This step runs when the owner asks you, in this main session, to change the plan during a build. A child that reads such a request in its task does not act on it. You never edit the plan yourself and never review it.
    - **Start.** Wait for the running child's reply, then run the resume command, so one actor at a time writes the plan directory. Drift outside the plan directory, apart from HEAD, goes through recovery first, as step 3 says. An `amendRefusal` that names a result review round or a pass receipt without a digest ends the step: stop with a CHECKPOINT that gives its reason, with nothing written.
    - **Close an active todo.** When `activeTodo` names a todo, no child works on it any more. Close it with `record-receipt.ts <plan> --todo <id> --event block --note <the reason in one line>`, then run the resume command again. The printed line may end with `errors: PREREQUISITE_FAILED`; the receipt is recorded all the same. Close a todo only here: after the child's reply, with no drift, and before the writer starts. A `blocked` last receipt or a `PREREQUISITE_FAILED` error does not stop this step: a plan change is the way out of both.
    - **Writer.** Launch one fresh `plan-writer` child. Its payload is the plan path, the project root, the owner's words as given, and the sentence "A build is running on this plan." The writer's Change under build step holds the rules. When the writer returns an owner question, ask the owner, wait, and pass the answer to the same writer.
    - **Reviewer.** When the writer returns its planned block, launch one fresh `plan-reviewer` child. Its payload is the plan path, the project root, and "one review round", and nothing else. Then read the verdict line of the newest `### Round` under `## Review` in `<stem>.reviews.md`. After OKAY, go to the record part. After any other verdict, stop with `PLAN-BUILD: CHECKPOINT (<next todo>; <the verdict>)`; its Next is `plan-loop` on the plan path, then "resume this plan".
    - **Record part.** Step 3 also comes here when the resume command reports `SPEC_CHANGED` or `APPROVAL_CHANGED`: someone changed the plan outside this step. Run the validator with `--review`, as in step 2. Without `gateEligible: true`, stop with a CHECKPOINT that names the errors or the verdict. With it, commit the plan directory alone as `docs(plans): amend <slug> plan`, unless it has nothing to commit or the JSON has `planIgnored`, as the reference's Amend section says. Then run `record-receipt.ts <plan> --event amend --note <the change in one line>` with `--commit HEAD`, or with `--no-commit "git ignores the plan directory"` under `planIgnored`, and return to step 3 without asking. A refused receipt is a CHECKPOINT with the printed reason.
    - **Refused launch.** When the host refuses or cannot launch the writer or the reviewer, stop with a `PLAN-BUILD: CHECKPOINT` that names the `plan-writer` session and the `plan-reviewer` session the owner must run, with the payload of each; once the writer has finished, name the `plan-reviewer` session alone. Do neither job yourself. After the owner ran them, "resume this plan" reaches the record part through step 3.

### Children

- **Todo child.** Run `validate-plan.ts <plan> --todo <id> --root <project>` and read only that, the files it references, and what the work needs. In recovery mode, investigate the drift first, as the reference's Recovery section says, and record a `recovery` receipt. Record any required recheck. Make the todo's edits. Run its Acceptance and every labelled QA part for real, and fix the implementation until they pass. Commit when it says `Commit: yes`, with its owned paths and the plan directory only; the reference's Commits section says when the plan directory stays out. Then run `record-receipt.ts` once for the `pass` receipt, with a check for each id `--todo` printed, and reply with the `TODO-RESULT` line. When it cannot finish, record a `block` receipt that names what is missing.
- **Final-wave child.** Run each gate as the reference's Final wave section describes, mark each box Done when its work is done, and fix a failure in place: re-run the affected checks, then run `record-receipt.ts` for a `fix` receipt that names the gate.
- **Fix child.** Read the blocking differences of the given round in `<stem>.reviews.md`, and nothing the round only recorded. Fix each one, re-run the checks it affects and the todo checks of every todo it touches, commit, and run `record-receipt.ts` for one `fix` receipt with `F4` as its todo.
- Every child replies with one line, nothing else.

### Recovery

Read [references/receipts.md](references/receipts.md)'s Recovery section before acting on drift. A todo interrupted before its pass receipt shows as drift. A commit made after the last receipt, whose subject matches the todo, is that todo's commit: never make it again. Paths the todo owns are its partial edits. Anything else is recorded in the recovery receipt and left alone. Never replay a commit or another irreversible command because its outcome was not recorded.

## Output format

The coordinator's reply starts with exactly one verdict line:

```text
PLAN-BUILD: DONE
PLAN-BUILD: SLICE (S<n> built; next S<m>)
PLAN-BUILD: CHECKPOINT (<todo or gate>; <reason>)
PLAN-BUILD: STOPPED (<n> blocking differences after two result rounds)
PLAN-BUILD: BLOCKED (<missing input>)
PLAN-BUILD: HANDBACK (<why the result reviewer could not be launched>)
```

```markdown
PLAN-BUILD: DONE
<plan path>. All todos and final gates are Done. F4 result review: PLAN-RESULT: <MATCH | ACCEPTED (<n> recorded)> (round <n>). Baseline: `<snapshot>`. Branch: `<branch>`. Commits: <n>, the last `docs(plans): complete <slug> build`. <Todos built inline because no child was available: none | T<n>, ...>
```

When git ignores the plan directory, the DONE reply takes its second form:

```markdown
PLAN-BUILD: DONE
<plan path>. All todos and final gates are Done. F4 result review: PLAN-RESULT: <MATCH | ACCEPTED (<n> recorded)> (round <n>). Baseline: `<snapshot>`. Branch: `<branch>`. Commits: <n>; git ignores the plan directory, so no commit holds it. <Todos built inline because no child was available: none | T<n>, ...>
```

```markdown
PLAN-BUILD: SLICE (S<n> built; next S<m>)
<plan path>. <n> of <total> todos Done. Slice commit: <sha | none, nothing to commit>. Next: S<m> — <name>, on <`<branch>` | the current branch>. The build resumes in this clone, whose Git directory holds the snapshots.
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

```markdown
PLAN-BUILD: BLOCKED (branch <branch>)
<plan path>. The build needs branch `<branch>`; <checked out> is checked out. <reason> Run `<command>`, then say "build this plan" again, or say "build this plan on the current branch". Nothing was changed.
```

In this reply, `<checked out>` is the branch the first command of the reference's Branch section printed, in backticks, or `a detached HEAD`, and `<reason>` and `<command>` are the Reason and Command cells of the case there.

```markdown
PLAN-BUILD: CHECKPOINT (<next todo>; git switch -c <branch> exited <code>)
<plan path>. Git reported: <message>. Before the command, <checked out before> was checked out at `<start commit>`. Now <checked out> is checked out at `<commit>`, branch `<branch>` <exists | does not exist>, and <n> paths outside the plan directory are not clean<: `<paths>`>. The build did not run the command again, undid nothing, and wrote nothing else. Next: say "build this plan" again; the build goes on when `<branch>` is checked out.
```

This is the reply of the case `changed`: its values come from the two runs of the reads in the reference's Branch section, before and after the create command, and `<next todo>` is `T0` at a new build.

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
- MUST capture the baseline with `capture-build-state.ts` and record every receipt with `record-receipt.ts`, never by hand.
- MUST write a todo's pass receipt only after its real Acceptance and every QA part passed and any required commit landed, with the check ids `--todo` printed.
- MUST commit only a todo's owned paths plus the plan directory, and checkpoint instead of whole-file staging when owner content or unaccounted edits collide with an owned path. The reference's Commits section covers a plan directory that git ignores.
- MUST keep receipts to the contract's keys and fields under their caps; put long output in a log file named by `log`.
- MUST investigate drift and record a recovery receipt before forward progress after an unexplained state change.
- MUST launch a fresh `plan-result-review` child for F4, run at most two result rounds, and report Done only on a current `MATCH` or `ACCEPTED`.
- MUST take an owner's plan change during a build through step 10: close a todo left active with a block receipt before the writer starts, launch one fresh `plan-writer` child and one fresh `plan-reviewer` round, and record the `amend` receipt after an OKAY verdict before any further todo.
- MUST continue through every wave and the final wave without stopping to ask for a routine continue.
- MUST name the missing input and checkpoint when Bun, a dependency, an approval, or a required snapshot is unavailable.

NEVER:

- NEVER treat validator exit 0, or any check's mere completion, as approval or a passing result by itself.
- NEVER let the coordinator read code, run tests, or read a child's transcript.
- NEVER commit an unrelated initial or unaccounted change together with a todo's owned paths.
- NEVER rewrite a todo's Acceptance or QA to make a failing check pass; fix the implementation, or checkpoint when the check itself needs a new review.
- NEVER send a recorded result-review difference to a fix child; only blocking ones are fixed.
- NEVER run F4 inline, report a result review that did not run, or reuse a stale one after further changes.
- NEVER write or review a plan change as coordinator, even when the host refuses the writer or the reviewer; stop with a CHECKPOINT that names the sessions the owner must run.
- NEVER replay a commit or another irreversible command because its outcome was not recorded; investigate the real current state first.
- NEVER push.
- NEVER add the plan directory with force when git ignores it.
- NEVER switch to an existing branch, run `git switch -c` a second time, or undo a branch git created. Create a new branch only as the reference's Branch section says; between slices, the owner creates and switches branches.
- NEVER mark a todo Done without its own durable passed receipt.
- NEVER rely on temporary storage, an unreferenced Git blob, or any location that will not survive a session end for a baseline or a receipt snapshot.

## QA checklist

- [ ] The preflight ran the real validator and required `gateEligible`/`resumeEligible` before any edit.
- [ ] A new build checked the branch by the reference's Branch section before the baseline. It ran `git switch -c` at most once, never switched to an existing branch, never undid a create, and a stop wrote nothing of its own.
- [ ] A durable baseline snapshot exists, captured by `capture-build-state.ts`, and its location is recorded in the build file.
- [ ] Each todo was built by a fresh child, or the reply names it as built inline because no child was available.
- [ ] Every todo has one passed receipt, recorded by `record-receipt.ts`, with a passing `acceptance` check and one passing check per QA part.
- [ ] T0 committed the plan directory; every `Commit: yes` todo's commit touches only its owned paths and the plan directory. When git ignores the plan directory, the commits follow the reference's Commits section instead.
- [ ] A Done build ends with the plan-only `docs(plans): complete <slug> build` commit, unless git ignores the plan directory, as the reference's Commits section says; a checkpoint or a stop made none.
- [ ] Every todo's box is `- [x] Done` only after its passed receipt, and every gate's box only after its own work.
- [ ] F4 ran in a fresh `plan-result-review` child; there were at most two result rounds; Done was reported only on `MATCH` or `ACCEPTED`, and STOPPED lists each blocking difference.
- [ ] Each fix child got only blocking differences and wrote a `fix` receipt.
- [ ] A plan change during the build went through step 10: one fresh `plan-writer`, one fresh `plan-reviewer` round, a block receipt only for a todo left active, and an `amend` receipt only after OKAY; another verdict, a refusal, or a refused launch stopped with a CHECKPOINT.
- [ ] The coordinator read no code, ran no tests, and read no child transcript.
- [ ] No temporary directory, unreferenced blob, or non-durable location holds a baseline or receipt snapshot.
- [ ] Nothing was pushed.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
