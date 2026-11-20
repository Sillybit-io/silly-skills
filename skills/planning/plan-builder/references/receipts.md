# Receipts, commits, and resume

Read this file before writing any receipt or making any commit. The schema for
`manifest.json`, the build record, and each receipt is defined once, in the
plan-review skill's [validator-contract.md](../../plan-review/references/validator-contract.md)
under "Build record and snapshots". This file explains how `plan-builder`
uses that schema; it does not redefine it. A receipt or manifest that
disagrees with that contract is wrong, whichever file you copied it from.

## Skill identity

The build record's `skill` field is `{"name": "plan-builder", "version":
"<this skill's metadata.version>", "sha256": "<SHA-256 of this skill's
SKILL.md bytes>"}`. It identifies which build of this skill produced the
record; nothing else checks it, so record it honestly rather than
approximately.

## Snapshots

Take every snapshot with `bun <this-skill-base>/scripts/capture-build-state.ts
<plan> --root <project> --output <destination> [--carry <snapshot>]...
[--include <path>]... [--report <path>]... --run-id <id> --base-revision
<revision> --approved-spec <digest>`. It only reads the project and writes its
own output; it never stages, commits, restores, edits the project, or runs a
plan-supplied command. Pass every earlier snapshot in this run's chain as
`--carry` so unchanged files are hard-linked, not recopied, and so the path
union stays complete even after a file is later deleted or ignored. Exit 0
prints the snapshot's location and digests; exit 1 means the project changed
while capturing or holds an unsupported state (a submodule, an unmerged index
entry, a file the manifest format cannot represent) and needs a checkpoint,
not a retry with different flags; exit 2 means a bad argument or an unreadable
input, including a destination that already exists.

The run directory is `git rev-parse --git-path silly-skills/plan-builds/<run-id>`
in a git project, or a durable path you choose outside the project when there
is none. Pass `--output` as a name relative to the Git directory, for example
`silly-skills/plan-builds/<run-id>/baseline` — never one that already starts
with `.git/`, which the script resolves a second time and rejects. Choose `<run-id>` once per build attempt, typically the plan's date
and slug; a resumed build reuses the same run directory and never recaptures
its existing baseline. Never point `--output` at a temporary directory: a
snapshot must outlive this session.

## Reports

`capture-build-state.ts` always declares the plan's `<stem>.reviews.md` and
`<stem>.build.md` as reports, so appending a receipt or a result review round
is not drift. Pass the spec path T0 builds in, so the declared paths are the
right ones. `--report <path>` adds further report outputs; `--carry` does not
inherit them, so repeat them on every capture. Never declare a wildcard or a
source file as a report to hide drift.

## Keep receipts short

A receipt is a record, not a notebook. It holds only the contract's keys; any
other key, such as a list of changed paths, is an error, because the
before and after snapshots already record what changed. `note`, and each
check's or prerequisite's `observed`, stay under 200 characters: past that the
validator lists a gap, past 400 an error. When a command prints more than that
and the output matters, save it to
`<run directory>/logs/<seq>-<todo>.log` and name that path in the receipt's
`log`.

## One receipt per todo

A todo child writes one receipt, after its work:

- **pass.** Only after the todo's real Acceptance command and every QA part ran and passed, and its commit (if `Commit: yes`) landed. `before` is the previous receipt's end state (the baseline, for the first). `after` is a fresh snapshot taken once the commit has landed; its `headRevision` must equal the commit you recorded. `checks` lists each command actually run, its actual exit code, the expected one, whether it passed, and what it printed — never a planned command you did not execute. Use the ids `validate-plan.ts --todo` prints: `acceptance`, and `qa:<label>` for each labelled QA part that is not `n/a`. The validator refuses a pass without them (`MISSING_CHECK`). Only after this receipt is durable does the todo's box become `- [x] Done`.
- **block.** When the todo cannot finish. `after` is a fresh snapshot of the state you leave, and `note` names what is missing.

A todo with no edits (a pure verification step) may have an `after` equal to its `before`. A todo's first receipt comes only after its dependencies passed.

A fix child writes one **fix** receipt with `F4` as its todo after a result round, and a final-wave child writes one naming the gate it repaired. Its checks are the commands it re-ran, all passing.

## Commits

Commit the paths the todo's `Do`/`Commit` line names plus the plan
directory, with `git --literal-pathspecs commit --only -- <owned-paths>
docs/plans/<stem>` (or its NUL pathspec-file form for paths with unusual
characters), so anything else already staged stays staged and nothing else is
swept in. The plan directory carries the receipts and boxes up to this point.
After committing, check the resulting commit's file list against the owned
paths and the plan directory, and check that unrelated index/worktree state
is unchanged. Use the todo's commit subject; you may shorten it, keeping its
type, scope, and meaning.

T0's commit is the plan directory alone, `docs(plans): add <slug> plan`; the
coordinator makes it. After F4 returns MATCH or ACCEPTED, one more plan-only commit, `docs(plans): complete <slug>
build`, records the final boxes, receipts, and result review; it is not a
todo and gets no receipt. A CHECKPOINT or BLOCKED stop makes no commit of its
own; the next todo commit or the resumed build's final commit carries the
plan directory forward.

If an owned path also holds the project owner's pre-existing changes, or an
edit this build did not intend, do not whole-file stage it and do not attempt
to split its hunks automatically. Record a `block` receipt describing the
collision — which path, whose changes are mixed, and why — and leave the
todo open until the collision is resolved, by the owner's explicit direction
or by separating the edits by hand. Snapshotting, no-commit work, resume, and
attribution all still work on a same-file mixed-owner path; only the
automatic commit-only staging does not, by design.

A commit that fails partway, or a hook that rewrites files during commit, is
reconciled from the actual HEAD, index, and worktree before any retry. Never
assume the pre-attempt state and never roll back over the owner's own work to
get there. Never push, under any circumstance.

## Prerequisite rechecks

A pending todo whose References include a path a completed todo changed needs
a recorded recheck, in its pass receipt's `prerequisites`, or in a recovery
receipt when the recheck fails before any work. `holds` means you traced
the actual current behavior of that source and confirmed this todo's plan
still executes as written against it. `fails` means it does not, and building
this todo further requires a new plan/review, not a receipt that silently
waives the contradiction.

## Resume

The preflight validator run (`--review --resume --json`) already does the
heavy verification: the retained approval, the baseline's cited bytes, the
whole receipt chain, and the current project state against the last recorded
one. Trust its `resumeEligible`, `nextTodo`, `activeTodo`,
`requiredRechecks`, and `reconcileBoxes` fields; do not re-derive them by
hand. `reconcileBoxes` lists a todo with a passed receipt but an `- [ ] Open`
box: fix the box only, without repeating that todo's effects or checks.
`requiredRechecks` lists a pending todo whose referenced sources changed
since the baseline or its receipts: the coordinator passes it to that todo's
child, which records the recheck, per the section above. A new build reaches
the resume command with only T0's receipt; `nextTodo` names the first todo.

## Recovery

`recoveryRequired: true` and a non-empty `drift` mean the current project
state does not match the last recorded receipt's end state. This is not
itself proof of a problem — it means the record does not yet explain the
current state. Investigate what actually changed and why (an interrupted
prior session, a manual edit, a tool crash mid-write) before touching
anything further. Rerun every check that the drifted paths could affect, and
record what you observed, whether or not it matches what the plan expects.
Then append a `recovery` receipt: its `before` is the last recorded end
state, its `after` is a fresh snapshot of the actual current state, and its
`note` explains what you found and what you did about it, briefly; a longer
account goes in the `log` file. A `recovery` receipt makes its todo (or the todo
that was interrupted before its pass receipt) active; it does not itself
advance that todo to passed. A commit made after the last receipt, whose
subject matches the interrupted todo, is that todo's commit: record it, and
never make it again. Never replay a commit, a delete, or any other irreversible action
merely because the record does not show it happened — check the real state
first, since replaying an action that already occurred can double its effect
or destroy evidence of what actually happened.

A required premise that no longer holds — a dependency removed, an external
contract that changed, a Must Have the current code contradicts — is not
something a recovery receipt can wave through. It needs a new plan and a new
review. Checkpoint and say so.

## Final wave

The final-wave child runs every gate before F4:

- **F1 Plan compliance.** Every Must Have is present and every Must NOT Have is absent, with the evidence named.
- **F2 Code quality.** The test, lint, and build commands the project defines, compared with the baseline checks in the evidence index, so a failure that predates the build is named instead of blamed on it. Name any of the three the project lacks. Then a slop pass: empty catches, debug logs, commented-out code, unused imports, and type escapes.
- **F3 Scenario QA.** Every todo's QA scenario, including edge cases.
- **F5 onward**, and any `Acceptance:` line a gate carries, exactly as the plan says.
- **Automated UI QA**, when `ui: yes`: the tool, routes, viewports, steps, and screenshot path the plan names, in a real browser.

A failing gate is fixed in the same child: change the implementation, re-run the affected checks, and append a `fix` receipt naming the gate. Never weaken the gate's check.

## Result review rounds

F4 is a fresh `plan-result-reviewer` child, given the plan path and the project root. Its verdict is `MATCH`, `ACCEPTED (<n> recorded)`, `MISMATCH (<n> blocking, <m> recorded)`, or `INCOMPLETE`. A build runs at most two result rounds. Only blocking differences go to a fix child; recorded ones stay in the round. After a second `MISMATCH`, the build stops and the owner decides.

