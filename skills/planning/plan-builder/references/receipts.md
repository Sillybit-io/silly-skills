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

## The receipt sequence, per todo

1. **start.** Before any effect. `before` is the previous receipt's end state
   (or the baseline, for the first todo). `after` is absent. If this todo
   references a path a completed todo changed since the last time this
   todo's prerequisites were checked, recheck it now and record the result
   under `prerequisites`: the target IDs, the checked source's path and
   SHA-256, `holds` or `fails`, and what you observed. A `fails` result means
   the plan needs a new review, not a receipt that quietly proceeds anyway.
2. **checkpoint.** After the todo's edits are made, before its checks run.
   `before` is the start receipt's `before`. `after` is a fresh snapshot.
   This receipt exists so a crash between the edit and the check
   still has a recorded, resumable state.
3. **pass.** Only after the todo's real Acceptance command and every QA
   scenario ran and passed, and its commit (if `Commit: yes`) landed.
   `checks` lists each command actually run, its actual exit code, the
   expected one, whether it passed, and what it printed — never a planned
   command you did not execute. `before` is the checkpoint's `after`.
   `after` is a fresh snapshot taken once the commit (if any) has landed;
   its `headRevision` must equal the commit you recorded. Only after this
   receipt is durable does the todo's box become `- [x] Done`.

A todo with no edits between its start and its checks (a pure verification
step) may have an `after` equal to its `before` at the checkpoint; do not
force a snapshot that would be byte-identical to the last one, but do not
skip recording the checkpoint event itself.

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

T0's commit is the plan directory alone, `docs(plans): add <slug> plan`. After
F4 returns MATCH, one more plan-only commit, `docs(plans): complete <slug>
build`, records the final boxes, receipts, and result review; it is not a
todo and gets no receipt. A CHECKPOINT or BLOCKED stop makes no commit of its
own; the next todo commit or the resumed build's final commit carries the
plan directory forward.

If an owned path also holds the project owner's pre-existing changes, or an
edit this build did not intend, do not whole-file stage it and do not attempt
to split its hunks automatically. Record a `checkpoint` receipt describing the
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
a recorded recheck before it starts, even mid-build. `holds` means you traced
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
since the baseline or its receipts: record the recheck in that todo's start
receipt before proceeding, per the section above.

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
whose start receipt precedes the drift, if the drift began before any start
receipt was recorded) active again; it does not itself advance that todo to
passed. Never replay a commit, a delete, or any other irreversible action
merely because the record does not show it happened — check the real state
first, since replaying an action that already occurred can double its effect
or destroy evidence of what actually happened.

A required premise that no longer holds — a dependency removed, an external
contract that changed, a Must Have the current code contradicts — is not
something a recovery receipt can wave through. It needs a new plan and a new
review. Checkpoint and say so.
