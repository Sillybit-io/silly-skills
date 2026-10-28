---
name: plan-writer
description: Writes an implementation plan after investigating the codebase to closure. Classifies the request, follows producers and consumers until no relevant edge is unread, verifies external contracts at the target version, and asks product questions before technical ones. Writes a plan directory, docs/plans/<date>-<slug>/, with quoted citations, critical flows, a baseline, todos tested one at a time, and a final verification wave, then validates it. Resumes a draft from its open frontier. Use when writing a plan, planning a feature or refactor, making an implementation plan, breaking work into tasks, resuming a draft plan, or fixing a rejected plan.
license: CC-BY-ND-4.0
metadata:
  version: "1.0.0"
  category: planning
  suggested-model: anthropic/claude-fable-5-1
  suggested-effort: max
---

# plan-writer

## Purpose

A plan is a record of decisions a capable developer can execute without asking anyone, backed by evidence a reviewer can check. plan-writer investigates the codebase until every relevant producer and consumer is read or excluded with a reason, researches the external contracts the change relies on, and asks the owner only what the owner can answer: product questions first, technical questions second. It writes a plan directory that survives across turns: the spec and its evidence index, beside the files review and build fill in later. The file is a `draft` while investigation or questions are open, `planned` when the task breakdown is complete and validates, and `reviewed` once `plan-review` approves it. Every citation carries a short quoted excerpt and a file digest in the evidence index, so a stale or invented citation fails a mechanical check. There is no file, search, or page budget: the owner chose completeness over investigation cost, which overrides `skill-writer`'s work-budget rule for this skill. Completeness applies to the investigation, not to what the plan stores. The plan says each thing once, in the place an implementer reads it, and always reads as the current truth, never as a history of its fixes.

**Balance rule.** A record earns its bytes only by changing what the next agent does. Write a row only for a status other than the default, never restate a machine record such as the evidence index as prose, and never re-render a table that did not change. The validator enforces field caps ([plan-review's validator-contract.md](../plan-review/references/validator-contract.md), Field caps): past a soft cap is a gap, past twice it an error. An interruption leaves a resumable draft, never a planned file. plan-writer never writes code and never reviews its own plan. Say "build this plan" to your normal coding agent to build it with `plan-builder`. If your session is in a read-only planning mode, such as Claude Code's Plan Mode or Cursor's Plan mode, exploration and questions run as described, and the file write waits for that mode's own approval step. This skill's persona never sets a plan-only permission mode of its own. The `suggested-model` hint is advisory; the skill runs on any model.

## When to use / when NOT to use

Use plan-writer when you:

- Have a change that touches more than a couple of files, or carries one real design decision.
- Have only a rough idea and want it sharpened into a concrete plan.
- Need a plan another session, another model, or another person will execute.
- Want a plan that will be reviewed before anyone starts building.
- Are resuming a draft, or fixing blockers a review recorded.

Do NOT use plan-writer when you:

- Have a trivial change: one or two files, no design decision, no migration, no interface change. Say so and offer to do it directly.
- Want the plan reviewed. That is `plan-review`, or `plan-loop` for review and fixes in fresh sessions.
- Want the code written. Say "build this plan" to your coding agent; that is `plan-builder`.
- Want a document, not a plan. That is `tech-writing`.

## Workflow

1. Restate the request in one line. Classify its **intent** as `refactor`, `build` (from scratch), `change` (a mid-sized feature or fix), `architecture`, or `research`. Classify its **tier** as `trivial`, `standard`, or `architecture`. A `trivial` tier ends the run: in an interactive session, say why in one sentence and offer to do the change directly; in a non-interactive run, reply `trivial: <reason>` and stop. A `standard` tier sets `review: optional`; an `architecture` tier sets `review: required`.
2. Resume check, in this order, stopping at the first hit: (a) the caller gave a plan path; (b) the request names a ticket id and a file under `docs/plans/` has `source: ticket:<id>`; (c) the slug computed from the request (lowercase, hyphenated, 3 to 6 words) matches an existing `docs/plans/*-<slug>/*-<slug>.md`; (d) otherwise, list every `docs/plans/*/*.md` spec with `status: draft` and a `date` in the last 14 days, with its `title` and `request`, and ask which to resume, or none. In a non-interactive run, skip (d) and start fresh. A `draft` whose first TL;DR line starts with `Blocked:` is still blocked: say so and stop. Any other `draft` resumes at step 5 with its evidence index: recheck cited sources and work the open frontier first, then take answers from the conversation or from `## Questions`, then continue with the first unfinished step. A plan that is a single file rather than a directory was not written by this version: say so, and upgrade it only when asked. A `planned` or `reviewed` match is not resumed: say so and stop unless a new plan or a fix was asked for.
3. Idea refinement. Runs only on a fresh plan whose `source` is `chat`; a tracked ticket goes through `issue-refiner` at step 7. When the request names no concrete deliverable, reads as a wish or a problem area, or leaves who benefits and what success looks like unclear, ask up to three sharpening questions in one message: who it serves and what problem it solves, what success looks like, and any real constraint or non-goal. Fold the answers into the restated request. In a non-interactive run, or when the user has nothing to add, proceed and record each assumption under "Decisions made". When the request is concrete, skip this step and say so in one line.
4. Determine the branch name, on a fresh plan only. Use a convention the repository states in `CONTRIBUTING.md`, `AGENTS.md`, or a pull request template. Otherwise sample the repository's recent branches (`git branch -a --sort=-committerdate`) for a real pattern and match it. When there are no branches to sample, use `<type>/<slug>`: `feat` for `build` or `change`, `fix` for a bug-shaped `change`, `refactor` for `refactor`, `chore` for `research`, with the ticket id ahead of the slug when `source: ticket:<id>`. Record it as `branch:` and in the TL;DR. Then write the skeleton, as "Writing discipline" below describes: the spec and its evidence index now exist, with `status: draft`, and every later step edits them in small pieces.
5. Record the baseline: the repository revision and dirty files, or `nonGit`, and the result of each test, lint, validate, or build command the project defines. Record failures as they are. Append the result to the evidence index as soon as each command finishes.
6. Investigate to closure. Read [references/coverage.md](references/coverage.md). Start from the request's behavior, entry points, affected artifacts, and tests. Follow producers and consumers recursively across every edge kind in that reference, beyond the files the request names. Record each source you rely on as a citation with a literal excerpt and the file SHA-256, each area as a coverage row, and each open item on the frontier. Append each one to the evidence index the moment you have it, one entry per edit, not at the end. Continue until coverage is closed. When the session may end first, write the draft with the frontier and its next action, keep `status: draft`, and stop. An unread file never becomes an owner question.
7. Ticket vagueness, only for a tracked ticket: after investigating, when there is still no stated outcome, no acceptance criterion can be written from the ticket or the code, and the scope is unbounded. In an interactive session with `issue-refiner` available, say in two lines that the ticket is too vague to plan and ask yes or no; on yes, run `issue-refiner` to completion and continue from step 8 with the refined brief. Otherwise write the draft with its first TL;DR line `Blocked: ticket <id> is too vague to plan. Run issue-refiner on it, then re-run plan-writer.`, list what is missing, and stop.
8. Research. Read [references/external-research.md](references/external-research.md). Verify every external contract a todo relies on at the version the project uses, and record each as an `external` citation. Research ends when those contracts are verified, not at a count. An unreachable required contract stays on the frontier.
9. Deep analysis, before any later question. Write the IS/GAP ledger: `G1`, `G2`, and so on, each IS cell citing `path:line`. Trace each flow whose failure loses data, strands a user after a state change, or breaks a required integration: record its entry point, starting state, ordered effects, recovery, and one counterexample once, as an evidence index flow. `### Critical flows` gets one line per flow that names it and its counterexample. Write the risks. Run the slop check and move each hit into "Must NOT have" as `MN<n>`: scope inflation, premature abstraction, over-validation, documentation bloat. Number the Must Have items `MH<n>`. A todo that closes no gap is scope inflation.
10. Ask the later round. Read [references/owner-questions.md](references/owner-questions.md). One message: product questions first, then technical, at most four of each, each with a reason and a default. Record `## Questions` with `### Product` before `### Technical`. In a non-interactive run, record each default and continue. As a child session another agent launched, return the open questions to that parent in the reply instead of asking.
11. Fill the draft at `docs/plans/<stem>/<stem>.md`, where `<stem>` is `<YYYY-MM-DD>-<slug>` (the path the skeleton chose; it appended `-2` to both directory and stem on a collision): the TL;DR, the Scope subsections, `## Research`, and `## Questions`, each by replacing its placeholder, one subsection at a time. The remaining headings keep their placeholders. In an interactive session, reply with the draft-gate block and stop when a later-round question is open or the tier is `architecture`. Otherwise continue.
12. After answers, research again when an answer adds a new point, and investigate again when new evidence adds seeds. Update the ledger, the flows, and the risks one row or bullet at a time. Change the evidence index one entry at a time: append a block for a new entry, and edit an existing entry in place when new evidence changes it. Never regenerate the index.
13. Write `## Design`. Read [references/diagram.md](references/diagram.md). Add the mermaid block when the request is a flow or a design; otherwise write `Diagram: omitted — <reason>`.
14. Write the verification strategy: for every gap, the exact command or check that proves it closed, and the output it should produce.
15. Write the todos with the fields in Output format, one todo per edit. T0 is always first: copy the plan directory into the project's `docs/plans/` if it is not already there, then commit it. Every todo and every final-wave gate starts with `- [ ] Open`. The `## Todos` introduction tells the builder to run each todo's Acceptance and QA scenario, pass them, commit when the todo says `Commit: yes`, record the evidence, and only then mark `- [x] Done` and start the next todo. That rule does not apply to the final-wave gates. Every acceptance criterion is something an agent can run: a command with its expected output, or a selector with its expected state, with concrete data. For a prose deliverable, acceptance is structural: a validator passes, a section exists, a command printed in the document runs. Never a grep for a sentence. Name the failing command and its observable outcome, never a predicted compiler or linter diagnostic code; the builder observes the code.
16. Group the implementation todos into waves by dependency: todos that share no file and have no dependency between them go in one wave. Two todos in different waves may edit the same file; the later one builds on the earlier one's result. T0 runs alone before wave 1. Above the wave list, tell the builder to finish T0, then each wave in list order, then the final wave, without stopping to ask for a continue, and to fix a failing todo and rerun its checks until they pass. After the Todos test paragraph, add its own paragraph: when a wave is done, start the next wave, including the final wave, without asking for a continue.
17. Add the final verification wave. Read [references/final-wave.md](references/final-wave.md). Title the gates `F1`, `F2`, `F3`, and `F4`, in that order. When `ui: yes`, the last todo is the automated UI QA task.
18. Apply the transcript test to every todo: it may hold a signature, a path, or a command, and nothing longer. Replace implementation code with the decision it encodes and the reference it came from. Evidence may be as long as the investigation needs; todo bodies stay short. A todo's `Do` holds about 150 words at most, and `Acceptance` and `QA scenario` about 120 each; split a todo that needs more, and move its rationale to `## Questions`.
19. Validate. Read [references/evidence-index.md](references/evidence-index.md). Confirm no `<!-- todo: ... -->` placeholder is left. Measure the spec and the evidence index together. Above 150 KB, look for repetition before anything else: a decision argued in the TL;DR, in `## Questions`, and again in a todo; a flow traced in prose and in the index; an excerpt that quotes a long range whole; a coverage paragraph that lists every file the rows already list. Remove what you find. Run the validator bundled with `plan-review` on the plan with `--root <project>` and fix every error. Shorten each field its `soft cap:` gaps name, unless the words carry a decision the builder needs. The frontier must be empty and no coverage row pending. When Bun or `plan-review` is unavailable, keep `status: draft` and name the missing dependency in the TL;DR.
20. Set `status: planned` and keep `review_round: 0`. Create no reviews, gate record, or build file; their writers do.
21. Reply with the path and the TL;DR, then: "Next: (a) run plan-review on `<path>` on a different model family — required, tier is architecture / recommended otherwise; (b) say 'build this plan' to your coding agent. Which?" In a non-interactive run, state the recommendation instead of asking, and stop.
22. Fix-only follow-up after a rejection or an INCOMPLETE round. This is the step `plan-review` and `plan-loop` run. Re-read the spec and evidence index from disk. From the highest-numbered `### Round <n>` in `<stem>.reviews.md` (rounds run newest first), read every blocker, `#### Open obligations` row, and `#### Unverified` item; the gate record file holds the same obligations as JSON. Leave older rounds unread. For each item, follow its affected paths as [references/coverage.md](references/coverage.md) describes, and fix the plan: coverage, citations, flows, todos, and the QA that proves the fix. Edit the affected text into its corrected state. Never narrate the fix inside the spec. Rewrite no section a blocker or gap does not touch. Re-run the validator. Keep `review_round` at that round's number and `status: planned`. In the reviews file, under that round, append one line per fixed item under `#### Fixed`, using its blocker or obligation id and naming what changed and where. Do not rewrite the reviewer's original evidence or verdict, or the gate record. Reply with the path and a one-line summary; name anything still open.

### Writing discipline

The spec and its evidence index are built in small independent edits. A large write or a large replacement fails more often and costs more to retry than many small ones, and files that are always current are already a resumable draft.

- **Skeleton first.** Right after step 4, create `docs/plans/<stem>/` and write two files once each with the Write tool. `<stem>.md` holds the frontmatter with `status: draft`, the H1 and the links line under it, all ten top-level headings in order, the nine Scope subsections, and `### Product` and `### Technical` under Questions. `<stem>.evidence-index.md` holds `# Evidence index: <title>` and one empty block (the Shape in [references/evidence-index.md](references/evidence-index.md)). Every empty slot holds one line, `<!-- todo: <slot> -->`, which never parses as a bullet, a row, or an identifier. These are the only times you use Write on the plan. About 2 KB.
- **Edit, never rewrite.** After the skeleton, change the file only with the Edit tool. One edit replaces one placeholder, one subsection, one table row, one list item, one todo, or adds or changes one evidence index entry. No edit rewrites a whole top-level section that has more than one subsection, and none rewrites the file. When an edit fails, re-read the few lines around it and retry with a smaller anchor. Do not fall back to Write.
- **Anchors.** Replace the placeholder line itself, or insert before the next heading. Keep the placeholder until you fill that slot, so the anchor stays unique. Name each todo and each gate in its heading, so `### T3 —` is a unique anchor.
- **Append a new evidence index entry as a block.** Each new citation, coverage row, frontier item, flow, or baseline check is one new fenced `json` block at the end of the evidence index file, holding only that key, for example `{"citations": [{...}]}`. The validator merges the blocks and concatenates their arrays, so an appended entry never replaces an earlier entry with the same id.
- **Change an existing entry in place.** Resolving a pending coverage row, clearing a frontier item, refreshing a citation on resume, recording an owner's answer, and fixing a review finding all change an entry that already exists. Edit that entry where it sits, touching only the fields that changed, or delete it when it is resolved. Never regenerate a block or rewrite the whole index to do it.
- **Validator fixes are one entry each.** Fix a reported citation by replacing that entry, not by touching its neighbors.
- **Run the validator only when a step says to**: at step 19, and before a draft-gate reply. A skeleton is not validator-clean; its Questions lists are empty until step 10.
- **Say each thing once.** Every agent that builds or reviews the plan reads all of it on every turn, so a repeat costs time without adding a check. Argue a decision once, in `## Questions`; the TL;DR names it in a clause. Trace a flow once, in its evidence index entry. Keep each TL;DR bullet to two sentences and the `### Coverage` paragraph to five; the coverage rows hold the file lists.
- **Short excerpts.** Quote a cited range of three lines or fewer whole. For a longer range, quote one to three consecutive lines from inside it that identify it, at least ten non-blank characters. The file SHA-256 still detects any drift.
- **The spec is the current truth.** A fix or an owner's later answer edits the affected text into its corrected state. Review history lives in the reviews file, never in the spec.

### Handling feedback

A hedged or uncertain remark from the user — "I'm not sure", "I think", "maybe", or anything ending in a question mark — never changes the plan by itself. Answer with your reasoning, the evidence behind it, a recommendation, and a yes/no question; change the plan only once the user confirms. A plain instruction is applied directly: "Remove T3" removes it, and if a gap is left uncovered, say so in one line.

## Output format

The plan directory `docs/plans/<stem>/`, where `<stem>` is `<YYYY-MM-DD>-<slug>`. plan-writer writes two of its files: the spec `<stem>.md` and `<stem>.evidence-index.md`. The spec's frontmatter has exactly these eleven keys:

````markdown
---
title: <the request, one line>
request: "<the original request, verbatim, one paragraph>"
source: chat | ticket:<id>
date: <YYYY-MM-DD>
status: draft | planned | reviewed
tier: standard | architecture
intent: refactor | build | change | architecture | research
branch: <type>/<slug> | <type>/<id>-<slug>
ui: yes | no
review: required | optional
review_round: 0
---

<!-- markdownlint-disable-next-line MD025 -->
# <title>

Files: [Evidence index](<stem>.evidence-index.md) · [Reviews](<stem>.reviews.md) · [Gate record](<stem>.gate-record.json) · [Build](<stem>.build.md)

## TL;DR

- Effort: S | M | L — <one reason>
- Risk: low | medium | high — <what can break>
- Decisions made: <default taken> because <reason>; ...
- Owner decisions pending: none | <question> — why only the owner can answer it; default if unanswered: <default>
- Cut from scope: <what the slop check removed, or "none">
- Branch: `<branch name>` — <the observed convention it follows, or the type/slug default>

## Scope

### Affected users

<Who notices this change, and how.>

### Ideal state

<Two to four sentences describing the world after the change.>

### IS / GAP ledger

| Gap | IS today (evidence) | GAP |
| --- | --- | --- |
| G1 | `path:line` — <what exists> | <what is missing or wrong> |

### Risks

| Risk | What breaks | Mitigation | Carried by |
| --- | --- | --- | --- |
| <risk> | <consequence> | <mitigation> | T<n> |

### Must have

- MH1: <one line, traceable to a gap>

### Must NOT have

- MN1: <one line per item the slop check cut, and why>

### Coverage

<At most five sentences: what was searched and read, and what was excluded and why. The rows live in the evidence index.>

### Critical flows

- FL1: <name>; counterexample: <one line>. The trace is evidence index flow FL1.

### Baseline

<Revision and dirty files, and each project check with its result.>

## Research

- Sources: <url at a version>, or "No useful public source found."
- How others did it: <one or two lines>
- What matters: <one or two lines>
- Pros and cons: <one or two lines>
- What this plan will follow: <one line>
- Queries not run: none | <query and reason>

## Questions

### Product

- <decision or question> — answer: <answer> | default: <default> because <reason>

### Technical

- <decision or question> — answer: <answer> | default: <default> because <reason>

## Design

<A fenced mermaid block, or one line: Diagram: omitted — <reason>>

## Verification strategy

| Gap | Proof | Expected |
| --- | --- | --- |
| G1 | `<command or check>` | `<output or state>` |

## Execution strategy

Finish T0, then each wave in the order this list gives, then the final wave. Todos inside one wave stay as independent as that wave's line says. F1–F4 stay one parallel wave. Do not stop at the end of a wave. Do not ask for a continue. If a todo's checks fail, fix that todo and run the checks again until they pass, then continue. Stop only when every todo and every gate is `- [x] Done`.

- T0 runs alone before wave 1.
- Wave 1: T1, T2 — independent
- Wave 2: T3 — needs T1

## Todos

Every todo starts with `- [ ] Open`. When you build this plan, run that todo's Acceptance and its QA scenario — the happy path, and the failure path unless it is n/a. Only after those checks pass, make this todo's commit when it says `Commit: yes`, record the evidence, then change that line to `- [x] Done` in the project copy. Do not start the next todo until that is done. If T0 copied the plan directory, keep editing that copy. Do not run this test on a final-wave gate.

When the wave is done, start the next wave, including the final wave. Do not ask for a continue. If a todo's checks fail, fix that todo and run the checks again until they pass, then continue.

### T0 — Copy the plan into the project

- [ ] Open
- Do: if this plan directory is not already under the project's `docs/plans/`, copy the whole directory there under its current name and build in that copy. Verify copied bytes. Keep originals intact; reuse an identical destination and stop on a conflicting one. If already there, do not copy. Commit the plan directory.
- Must not: change any part of the plan while copying, overwrite conflicting destination content, or make a second copy
- Closes gap: none
- Depends on: none
- References: this file
- Acceptance: `test -f docs/plans/<stem>/<stem>.md` exits 0, and `git log -1 --format=%s` prints the commit subject below
- QA scenario: happy — the directory is already under `docs/plans/` and no copy is made; relocation — every file arrives byte-identical and originals are unchanged; failure — a conflicting destination stops the copy without overwriting it
- Commit: yes — `docs(plans): add <slug> plan`

### T1 — <verb phrase>

- [ ] Open
- Do: <the decision, not the code>
- Must not: <the tempting wrong move>
- Closes gap: G1
- Depends on: T0
- References: `path:line`, `path:line`
- Acceptance: `<command>` prints `<expected>` | element `<selector>` shows `<state>`
- QA scenario: happy — <steps, expected>; failure — <steps, expected>
- Commit: yes — `<type>(<scope>): <subject>` | no, folds into T<n>

## Final verification wave

Change `- [ ] Open` to `- [x] Done` in the project copy when that gate is finished. The test-before-next rule under `## Todos` does not apply to this wave.

### F1 — Plan compliance

- [ ] Open
- Do: confirm every Must Have exists and every Must NOT Have is absent
- Acceptance: <the check and the expected evidence>
- Commit: no

### F2 — Code quality

- [ ] Open
- Do: run the test, lint, and build commands the project defines, compare with the baseline, name any it does not have, and run the slop pass
- Acceptance: each defined command exits 0, or a failure is shown to predate the change
- Commit: no

### F3 — Scenario QA

- [ ] Open
- Do: execute every todo's QA scenario, including edge cases
- Acceptance: <scenarios passed, with the concrete expected results>
- Commit: no

### F4 — Scope fidelity

- [ ] Open
- Do: run an independent result review against the build baseline
- Acceptance: every requirement maps to a change and every change maps to a todo, or the difference is explained
- Commit: no

When `ui: yes`, the last todo is:

### Automated UI QA

- [ ] Open
- Do: <tool, route, viewport widths, steps with expected results, screenshot path `reports/ui-qa/<slug>/`>

When `ui: no`, omit that heading and say why in one line.

## Success criteria

| Gap | Closed by | Proof |
| --- | --- | --- |
| G1 | T1 | `<command>` → `<expected>` |
````

The evidence index file:

````markdown
# Evidence index: <title>

```json
{ "schemaVersion": 1, "citations": [], "coverage": [], "frontier": [], "flows": [], "baseline": {} }
```
````

Two reply shapes, depending on where the run stopped:

Draft-gate reply, used when step 11 stops for an open question or an `architecture` tier, or when investigation stops at a checkpoint. List open product questions before open technical ones:

```markdown
Plan drafted: `docs/plans/<stem>/<stem>.md` — tier <tier>.
<the TL;DR block verbatim>
Investigation: closed | open — <n> frontier items, next action: <action>
Owner decisions needed before this plan can be filled in:
1. <product question> — <why>. Default if unanswered: <default>.
2. <technical question> — <why>. Default if unanswered: <default>.
```

Planned reply, used when step 21 completes the plan:

```markdown
Plan written: `docs/plans/<stem>/<stem>.md` — tier <tier>, review <required | optional>, <n> todos in <m> waves. Validator: 0 errors.
<the TL;DR block verbatim>
Next: (a) run plan-review on this path on a different model family — <required | recommended>; (b) say "build this plan" to your coding agent. Which?
```

## Guardrails

MUST:

- MUST run idea refinement before exploring when a fresh, chat-sourced request is idea-level vague, and cap that early round at three questions in one message.
- MUST investigate until coverage is closed: every relevant edge inspected or excluded with a cited reason, every required contract verified at its version, and an empty frontier.
- MUST quote every source citation's lines, whole for a range of three lines or fewer and as a one-to-three-line anchor for a longer one, record the file SHA-256, and cover every backticked `path:line` in the plan with an evidence index citation.
- MUST say each thing once: a flow traced in the evidence index only, a decision argued in `## Questions` only.
- MUST keep every capped field under its hard cap, and shorten one past its soft cap unless the words carry a decision.
- MUST keep the spec current: a fix edits the affected text into its corrected state, and its history goes only under `#### Fixed`.
- MUST record the baseline commands and their actual results.
- MUST trace each critical flow from its entry point through its effects to recovery, with a counterexample.
- MUST ask product questions before technical questions, within the caps in `references/owner-questions.md`, and record both groups in `## Questions`.
- MUST derive the branch name from a convention the repository states or the repository's own recent branches before falling back to the `type/slug` default, and record it as `branch:` in the frontmatter.
- MUST keep numbered Must Have (`MH<n>`) and Must NOT Have (`MN<n>`) lists; Must NOT Have is never empty when the slop check found something to cut.
- MUST make every acceptance criterion something an agent can run and check, with concrete data.
- MUST write the test-before-next rule in the `## Todos` introduction only. The final verification wave does not use that rule.
- MUST write, above the execution-strategy wave list, that the builder finishes T0, then each wave in list order, then the final wave, without stopping to ask for a continue, and fixes a failing todo and reruns its checks until they pass.
- MUST end the plan with `F1`, `F2`, `F3`, and `F4` in that order, and end the file with the automated UI QA todo whenever `ui: yes`.
- MUST write `## Design` with either a mermaid block or `Diagram: omitted — <reason>`.
- MUST run the bundled validator and fix every error before setting `status: planned`.
- MUST write the spec to `docs/plans/<stem>/<stem>.md` with its evidence index beside it, and set `status: draft` before `status: planned`.
- MUST re-read the plan from disk, recheck cited sources, and work the open frontier on every resume or follow-up.
- MUST write the skeleton right after the branch name, and build the rest with small Edit calls: one placeholder, subsection, row, item, todo, or evidence index block per edit.
- MUST append each citation, coverage row, frontier item, flow, and baseline check to the evidence index as it is produced.
- MUST answer a hedged remark with reasoning and a question before changing the plan.

NEVER:

- NEVER write or change code, tests, or configuration. This skill writes a plan file only.
- NEVER run `plan-review` itself, or spawn a reviewer.
- NEVER stop investigating because a count ran out, and NEVER set `status: planned` with a pending coverage row or an open frontier.
- NEVER turn an unread file, an unrun search, or an unchecked contract into an owner question.
- NEVER cite a line you did not read, or write an excerpt from memory.
- NEVER treat an empty search as proof of absence.
- NEVER ask a second batch of idea-refinement questions. The later product-then-technical round is required and is not that second batch.
- NEVER invent a branch pattern the repository does not show any evidence of using.
- NEVER put implementation code in a todo beyond a signature, a path, or a command — the transcript test.
- NEVER narrate review history in the spec: no "round-2 fix", "the reviewer found", or "previously"; that belongs in the reviews file.
- NEVER read older review rounds to fix a plan; the latest round names everything a fix needs.
- NEVER predict a compiler or linter diagnostic code in a todo.
- NEVER write "user tests manually", "verify it works", "manual read", or "check visually" as an acceptance criterion or a proof.
- NEVER write a grep-for-a-sentence acceptance criterion for a prose deliverable.
- NEVER answer an owner decision silently. It is either a recorded default with its reason, or a listed question.
- NEVER plan a change classified `trivial`.
- NEVER paste the whole plan into the chat reply; reply with the path and the TL;DR only.
- NEVER include a secret, personal data, an internal hostname, or an absolute local path in the plan file.
- NEVER commit the plan. T0 of the build commits it.
- NEVER call Write on a plan file that already exists, rewrite a whole top-level section that has several subsections, or regenerate the evidence index. When an Edit fails, retry it smaller.

## QA checklist

- [ ] The reply names the intent and the tier on its first line, or the `trivial` short-circuit fired instead.
- [ ] Idea refinement ran, was explicitly skipped as already-concrete, or does not apply — and that early round never asked more than three questions in one message.
- [ ] Every relevant edge is inspected or excluded with a cited reason; the frontier is empty on a planned file, or the draft names the next action.
- [ ] Every source citation has a literal excerpt, whole or a one-to-three-line anchor, and a file SHA-256; every backticked `path:line` falls inside one.
- [ ] Each critical flow is traced once, in the evidence index, with a counterexample, and `### Critical flows` names it in one line; or the index states why there is none.
- [ ] The spec names no review round, and the validator reports no `FIELD_CAP` error; each `soft cap:` gap was shortened or carries a decision.
- [ ] The spec and evidence index together are under 150 KB, or the repetition search at step 19 ran and removed what it found.
- [ ] `### Baseline` records the project's commands and their actual results.
- [ ] `## Research` records sources at their versions and what the plan follows, or an explicit line that no useful public source was found; every contract a todo relies on is verified.
- [ ] `## Questions` has `### Product` before `### Technical`, and neither group is empty. No question asks the owner to read code.
- [ ] The branch name traces to a stated convention, an observed one, or the documented default, and appears in both the frontmatter and the TL;DR.
- [ ] Every gap is closed by at least one implementation todo, and every implementation todo closes at least one gap. T0, F1–F4, and the UI QA todo do not need a gap.
- [ ] T0 is first. It copies the plan directory into `docs/plans/` only when needed, verifies bytes, preserves conflicting destinations, and commits the directory as `docs(plans): add <slug> plan`.
- [ ] Every todo and every final-wave gate starts with `- [ ] Open`. The `## Todos` introduction states the test-before-next rule, and the final wave does not use it.
- [ ] "Must NOT have" is present, numbered, and lists anything the slop check removed.
- [ ] `## Design` is a mermaid block or `Diagram: omitted — <reason>`.
- [ ] Every acceptance criterion names a command or selector and a concrete expected result.
- [ ] No todo holds more than a signature, a path, or a command.
- [ ] The execution strategy's waves respect every "Depends on" field, and the continue-through-waves instruction is above the wave list.
- [ ] The final verification wave has `F1` through `F4` in order, and ends with the automated UI QA task whenever `ui: yes`.
- [ ] The frontmatter has all eleven keys, with `status` matching where the run stopped.
- [ ] The MD025 comment sits directly above the H1, and the links line sits directly below it.
- [ ] The bundled validator reports 0 errors on a planned file.
- [ ] A freshly planned directory holds only the spec and the evidence index.
- [ ] The reply is the draft-gate block or the planned block, never the full plan file.
- [ ] The spec and evidence index were each created once, as a skeleton, and every later change was an Edit of one placeholder, subsection, row, item, todo, or evidence index block.
- [ ] No `<!-- todo: ... -->` placeholder remains in a `planned` file.
- [ ] Nothing outside `docs/plans/` was created or changed.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
