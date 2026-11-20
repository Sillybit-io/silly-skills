---
name: plan-result-review
description: Compares everything a build changed with the reviewed plan it implemented, from the build's baseline snapshot. Inventories committed, staged, unstaged, untracked, deleted, renamed, binary, mode, and symlink changes, maps every requirement to a change and every change to a todo, checks that the owner's pre-build work survived, weighs each difference as blocking or recorded, and explains it with its location and reason. Returns MATCH, ACCEPTED, MISMATCH, or INCOMPLETE. Use when asked to check a build against its plan, review the result, confirm nothing was missed, or run a plan's scope-fidelity gate.
license: CC-BY-ND-4.0
metadata:
  version: "2.1.0"
  category: planning
  suggested-model: openai/gpt-6-astra
  suggested-effort: max
---

# plan-result-review

## Purpose

plan-result-review answers one question after a build: does what changed match what the reviewed plan said to change, and nothing else? It works from the build's baseline snapshot, not from the last commit, so it sees staged, unstaged, and untracked work, deletions, renames, binaries, modes, and symlinks. It also sees work the owner had in progress before the build started. It maps in both directions: every requirement and todo to the change or existing code that satisfies it, and every changed artifact to the todo that owns it. Each difference names the plan clause, the changed part, what was expected and what happened, and why, with the source of that reason. An unknown reason stays unknown. Each difference has a weight. **Blocking**: a failing test, Acceptance, or QA check; anything in a strict area (security, sign-in, and permissions; production and shared services); a UI todo with no browser check; owner work changed or lost; a todo or Must Have with nothing built. **Recorded**: everything else, such as an extra file, a rename, a commit that differs from the plan, or changed behavior outside a strict area while tests pass. Only blocking differences send the build back for a fix; recorded ones stay in the round, one line each, and the verdict is `ACCEPTED`. When unsure whether a difference is in a strict area, it is blocking. The owner's recorded approval turns a difference into an approved deviation, still listed. A build gets at most two rounds. The skill adds a round to `## Result review` in the plan's `<stem>.reviews.md`, and never repairs code.

**Balance rule.** A record earns its bytes only by changing what the next agent does. A round renders differences, not agreements: a requirement that is met, an artifact a todo owns, owner work that survived, and a commitment kept are counts on one line, never rows. Never restate a machine record (receipts, snapshots, the inventory) as prose, and never re-render a table from an earlier round. Run it in a fresh session, so the reviewer did not build what it reviews. The `suggested-model` hint is advisory.

## When to use / when NOT to use

Use plan-result-review when you:

- Finished building a reviewed plan and need an independent check before calling it complete.
- Run a plan's scope-fidelity gate, such as F4.
- Suspect the build missed a requirement, added unplanned changes, or touched the owner's own work.

Do NOT use plan-result-review when you:

- Want the plan itself reviewed before a build. That is `plan-review`.
- Want the code reviewed for quality or security without a plan. That is `ai-review`.
- Want the differences fixed. This skill reports them; the builder fixes them.

## Workflow

1. Resolve the plan path from the request: `docs/plans/<stem>/<stem>.md`. Run `bun <plan-result-review-base>/scripts/inventory-changes.ts <plan> --root <project> --brief` and read its summary first: requirements, each todo with its strict areas, recorded checks, and commit, and each changed path with the todo that changed it. The summary is for navigation, not a verdict. Read each todo's clauses with `bun <plan-review-base>/scripts/validate-plan.ts <plan> --todo <id> --root <project>` when you check it, and the latest `## Result review` round when there is one. Do not read the spec, the evidence index, or the build record whole. A format 1 plan finishes on the old install: say so and stop.
2. Record the identity: the plan's canonical spec digest, the current HEAD, and the dirty state. Record the phase: the gate you run for, such as `F4`, or `completion`.
3. Choose the baseline. Read [references/inventory.md](references/inventory.md). In round 2, still compare against the build baseline, not round 1, so a new regression is not missed; read the changes since round 1 first. Use the build record's snapshot; otherwise an explicit snapshot, base, or range from the caller; otherwise ask. Never guess `HEAD~1`, and never compare only the last commit. When owner-work preservation must be certified and no readable snapshot exists, the verdict is INCOMPLETE.
4. Build the change inventory with the helper `scripts/inventory-changes.ts`, or by hand as the reference describes. Include every path in the baseline and receipts, even when git no longer lists it. The plan directory is left out: the build commits it by design. Record the totals by layer.
5. Read what changed. For each changed path, read its diff or its binary, mode, or symlink change, and enough surrounding code to judge behavior. Decide which changed paths touch a strict area, whatever the todos' `Strict:` fields say: auth and session code, permission checks, secrets handling, deploy and CI files, and production or shared-service configuration. When a question needs a wider search, you may send `plan-scout` one bounded question; otherwise search yourself.
6. Map requirements to changes. For each Must Have, Must NOT Have, gap, and todo (its Do, Must not, Acceptance, and QA), find the change or existing code that satisfies it. Map each Behavior line in the brief too: it is met when the checks of its serving todos, or a command you run, show its `then`. In a disposable copy of the project, run the project's test command once, and the Acceptance command of every strict todo. The validator already refused any pass receipt that lacks its Acceptance and QA checks, so the brief's recorded checks stand for the other todos. Record each command you ran and its result.
7. Check the execution commitments. Compare the current branch with the plan's `branch:`, or with the last slice's branch when the brief's slices name branches. For each `Commit: yes` todo, find its commit and compare the files with the todo's owned paths plus the plan directory, and the subject by type, scope, and meaning; a shortened subject is not a difference. Use the brief's attribution of each change to a todo, which comes from the receipts' before and after snapshots.
8. Map changes to todos. For each changed artifact, name the todo that owns it. The plan and its receipts are the authority; a file no todo names is extra, even when the change looks useful. A todo that edits a file an earlier wave's todo also edited is not extra when its own `Do` covers the edit.
9. Check the owner's work. For every path that had staged, unstaged, or untracked changes at the baseline, confirm those layers survived, unless a todo owned that exact change. A path restored to HEAD, a deleted untracked file, or a newly ignored file counts as changed even when `git diff` is empty.
10. Record each difference with the fields in [references/differences.md](references/differences.md), including its weight. Take an `approved` reason only from the owner's recorded decision, such as a receipt note that quotes it or an answered question. Mark every other reason `inferred`, with its evidence, or `unknown`. In round 2, weigh every difference again: one a fix pulled into a strict area becomes blocking.
11. Decide the verdict by that reference: MISMATCH for unapproved blocking differences, then INCOMPLETE for missing required evidence, then ACCEPTED for recorded differences only, then MATCH.
12. Save the round in `<stem>.reviews.md`. Add `## Result review` after `## Review` when absent, with its history table. Add the round's table row and insert the round directly above the previous result round, so rounds read newest first. Never edit an earlier round. Carry every unresolved difference, missing evidence item, and approved deviation into the new round. When the environment blocked the review itself (no Bun, no readable baseline, no disposable copy), write a short checkpoint round instead: verdict, identity, what blocked it, and the next check, nothing else. Change nothing else in the plan or project. Re-read the saved round and confirm its verdict, counts, and identity.
13. Reply with the verdict block.

### Handling feedback

A challenge to a difference triggers an evidence check, not automatic removal. Correct an unsupported finding and say why. A hedged remark, such as "I think that file is fine", never removes a difference by itself: answer with the evidence and a yes/no question. An owner's explicit approval of a deviation is recorded as `approved` with its date, and the difference stays listed.

## Output format

The reply starts with exactly one verdict line:

```text
PLAN-RESULT: MATCH
PLAN-RESULT: ACCEPTED (<n> recorded)
PLAN-RESULT: MISMATCH (<n> blocking, <m> recorded)
PLAN-RESULT: INCOMPLETE
```

`<stem>.reviews.md`, after `## Review`:

````markdown
## Result review

| Round | Date | Phase | Verdict | Differences |
| --- | --- | --- | --- | --- |
| 1 | <date> | F4 | MISMATCH | 2 blocking, 1 recorded |
| 2 | <date> | F4 | ACCEPTED | 0 blocking, 1 recorded |

### Result round 2

<the newest round>

### Result round 1

<the round before it, unchanged since it was written>
````

One round. Leave out every section that would be empty:

````markdown
### Result round <n>

**Verdict:** PLAN-RESULT: <verdict>
**Identity:** spec <digest>; HEAD <revision>; baseline <snapshot> (<manifest digest>) | base <revision>, owner work not certifiable
**Phase:** <F4 | completion>; <other gates still open, or none>
**Counts:** <n> paths changed (committed <n>, staged <n>, unstaged <n>, untracked <n>, removed <n>); requirements met <m>/<t>; artifacts owned <m>/<t>; owner-work paths preserved <m>/<t>; commitments kept <m>/<t>

#### Blocking

<Unapproved blocking differences only. A fix child reads this section.>

1. **D<n> <kind> — <clause>.** Why blocking: <failing check | strict area <area> | UI not checked | owner work | nothing built>. Changed part: <location>. Expected: <…>. Actual: <…>. Reason: <…> (source: inferred <evidence> / unknown). Next: <…>.

#### Recorded

- D<n> <kind> — <clause>: <one line, with the location>

#### Approved deviations

- <clause> — <one line> (approved: <where the owner's decision is recorded>, <date>)

#### Unverified

- <missing evidence, what it blocks, and the next check>

#### Extras

- `path` — <change>; no todo owns it (difference <n>)

#### Changed owner work

- `path`: <baseline layers> → <current layers> (difference <n>)

#### Checked

- `<command run in a disposable copy>` → <result>
````

A short checkpoint round, when the environment blocked the review:

````markdown
### Result round <n>

**Verdict:** PLAN-RESULT: INCOMPLETE
**Identity:** spec <digest>; HEAD <revision>
**Blocked by:** <what was unavailable, with the error>
**Next:** <the smallest action that makes the review runnable>
````

## Guardrails

MUST:

- MUST compare from the build baseline snapshot, or an explicit base the caller gave, and say which.
- MUST inventory committed, staged, unstaged, untracked, deleted, renamed, binary, mode, and symlink changes, plus every baseline and receipt path.
- MUST read the contents of every changed artifact, not only its name.
- MUST map every requirement to a change or existing code, and every changed artifact to a todo or a difference.
- MUST check that the owner's pre-build staged, unstaged, and untracked work survived.
- MUST compare the branch, each planned commit, and each pass receipt's recorded checks and each todo's commit order with the plan.
- MUST weigh every difference as blocking or recorded by the table in Purpose, and treat a difference as blocking when unsure whether it touches a strict area.
- MUST record for every blocking difference its clause, why it blocks, changed part, expected and actual result, reason, reason source, and next step; a recorded difference is one line.
- MUST run the project's test command once and every strict todo's Acceptance command in a disposable copy.
- MUST compare round 2 against the build baseline and weigh every difference again.
- MUST return INCOMPLETE when required evidence, such as a readable baseline, is missing and no unapproved difference is proven.
- MUST keep approved deviations listed, one line each, with the record of the owner's approval.
- MUST render only differences; agreements are counts on the Counts line.
- MUST run checks that execute code only in a disposable copy of the project.

NEVER:

- NEVER guess a base such as `HEAD~1`, or review only the last commit.
- NEVER change code, tests, configuration, or any plan file other than `## Result review` in `<stem>.reviews.md`.
- NEVER delete or rewrite an earlier round.
- NEVER render a row for a met requirement, an owned artifact, preserved owner work, or a kept commitment.
- NEVER invent a reason, or mark a reason `approved` without the owner's recorded decision.
- NEVER treat a reason, a receipt, or a passing test as a waiver of a violated requirement.
- NEVER report MATCH or ACCEPTED with a blocking difference, an unmapped requirement, or changed owner work.
- NEVER read the spec, the evidence index, or the build record whole; use the brief and `--todo`.
- NEVER claim the build is complete; MATCH certifies only the compared implementation.

## QA checklist

- [ ] The baseline is the build record's snapshot or an explicit base, and the record says which.
- [ ] The inventory covers all layers, deletions, renames, binaries, modes, symlinks, and every baseline and receipt path.
- [ ] Every requirement, changed path, owner-work path, and commitment was checked, and the Counts line totals them; only the ones that differ are rendered.
- [ ] Every difference has a weight; every blocking one has all its fields, every recorded one a line; no reason is marked approved without a recorded owner decision.
- [ ] The verdict follows MISMATCH, then INCOMPLETE, then ACCEPTED, then MATCH, and its counts equal the unapproved blocking and recorded differences.
- [ ] The project's test command and every strict todo's Acceptance ran once in a disposable copy.
- [ ] Only `## Result review` in the reviews file changed: a new table row and the new round above the earlier ones, which are unchanged. Nothing else changed in the project.
- [ ] The saved section was re-read and matches the reply.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
