# Differences and verdicts

Read this file when you record a difference and before you decide the verdict.

## Kinds

| Kind | Meaning |
| --- | --- |
| missing | A requirement, todo, or acceptance criterion has no change and no existing code that satisfies it |
| partial | A change addresses the requirement but not all of it, its acceptance fails, or an execution commitment is not followed, such as the planned branch, a commit's files, or a commit subject whose type, scope, or meaning differs |
| extra | A changed artifact belongs to no todo |
| changed-behavior | A change alters behavior the plan did not ask to alter, or breaks a Must NOT Have |
| obsolete-or-renamed | An artifact the plan names was renamed, moved, or deleted, or a new one replaced it |
| owner-work-changed | Work present at the baseline, staged, unstaged, or untracked, was changed, restored to HEAD, or removed |
| unverified | Evidence needed to judge a requirement or an artifact is unavailable, including a planned Acceptance or QA check that no pass receipt records |

## Fields

Every difference records:

- **Clause:** the plan text it is judged against, as `T3 Acceptance`, `MH2`, or `D4`, with a short quote.
- **Changed part:** `path:line`, a diff hunk, or `path (deleted)`, `path (binary)`, `path (symlink a → b)`, `path (mode 100755 → 100644)`.
- **Expected** and **actual**, as observable facts.
- **Reason** and its **source**: `approved` when the owner's recorded decision authorizes it, with where it is recorded; `inferred` when the reason comes from evidence such as a commit message or a receipt note, with that evidence; `unknown` when nothing states it. Never invent a builder's intention.
- **Weight:** `blocking` or `recorded`, by the table below.
- **Disposition:** `accepted-approved`, `fix-required` (blocking only), `recorded`, `needs-owner`, or `needs-evidence`.
- **Next:** the check or fix that closes it.

A recorded difference is rendered as one line: its id, kind, clause, and location. A blocking one carries every field.

## Weight

| Difference | Weight |
| --- | --- |
| A test, Acceptance, or QA check fails or cannot run | blocking |
| Anything in a strict area: security, sign-in, and permissions; production and shared services | blocking |
| A UI todo with no browser check | blocking |
| Owner work from before the build was changed or lost (`owner-work-changed`) | blocking |
| A todo or Must Have with nothing built (`missing`) | blocking |
| A file no todo names (`extra`) | recorded |
| A file renamed or moved (`obsolete-or-renamed`) | recorded |
| Commit subject, commit files, or branch differ from the plan (`partial` on an execution commitment) | recorded |
| Behavior changed outside strict areas, and tests pass (`changed-behavior`) | recorded |

A strict area is found two ways: the todo's `Strict:` field, and your own reading of the changed paths. When unsure, the difference is blocking. A `partial` difference whose acceptance fails is blocking.

The validator refuses a pass receipt that lacks its Acceptance and QA checks, so a missing check stops the build before the review. When the brief still shows a todo with no recorded checks, report it as `unverified` with disposition `needs-evidence`.

A reason does not make a violation acceptable. Only an owner's recorded approval does, and the difference stays listed, as one line under Approved deviations.

These are not differences: a commit subject the builder shortened but kept in type, scope, and meaning; a todo that edits a file an earlier wave also edited, within its own `Do`; the plan directory in a todo commit.

## Verdict

Decide in this order:

1. **MISMATCH (<n> blocking, <m> recorded)** when any blocking difference is not approved by the owner and is not `unverified`.
2. **INCOMPLETE** when no such difference remains but required evidence is missing: an unreadable or corrupt baseline, a requirement you could not check, or an acceptance command that could not run.
3. **ACCEPTED (<m> recorded)** when only recorded differences remain. The build is complete; the differences stay in the round.
4. **MATCH** when every requirement maps to a change or to existing code that satisfies it, every changed artifact maps to a todo, all owner work is preserved, and every remaining difference is owner-approved.

MATCH and ACCEPTED certify the compared implementation and its evidence. It does not certify other workflow gates that have not run, and it does not waive a gate the builder still owes.
