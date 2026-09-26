---
name: plan-writer
description: Writes an implementation plan after a gap analysis. Classifies the request, sharpens a vague idea with up to three questions, explores the codebase before asking anything else, and asks only what evidence and a default cannot settle. Writes the plan to docs/plans/<date>-<slug>.md, moving it through draft, planned, and reviewed. Use when you write a plan for this, plan this feature, plan this refactor, make an implementation plan, break this into tasks, or draft a plan for review.
license: CC-BY-ND-4.0
metadata:
  version: "0.1.0"
  category: planning
  suggested-model: anthropic/claude-fable-5-1
  suggested-effort: max
---

# plan-writer

## Purpose

A plan is a record of decisions a capable developer can execute without asking anyone, not a transcript of the code to be written. plan-writer sharpens a fuzzy idea into a concrete ask when it needs to, explores the codebase before it asks anything else, decides what the evidence and a defensible default can settle, and asks the user only the decisions that only the user can make. It writes one file that survives across turns: a draft that holds the exploration and the open questions, then a planned file with the full task breakdown and a branch name that follows the repository's own convention, then a reviewed file once a second pass has checked it. It never writes code, and it never reviews its own plan — `plan-review` is the separate step that does that, on a different model so the check has different blind spots than the write. plan-writer is a skill, not your tool's own planning mode, and the two compose rather than conflict. If your session itself is in a read-only planning mode — Claude Code's Plan Mode, Cursor's Plan mode — this skill's exploration and its questions run exactly as described below, but its Write call is held by that mode's own gate: in Claude Code the write waits until you approve the proposed plan, which also switches the session out of Plan Mode; in Cursor the equivalent is the explicit build step after the plan is reviewed. A subagent wrapper carrying its own plan-only permission mode is stricter still — it denies the write outright with no approval path — which is why this skill's own agent wrappers never set one. The `suggested-model` hint above is advisory; this skill runs on any model.

## When to use / when NOT to use

Use plan-writer when you:

- Have a change that touches more than a couple of files, or carries one real design decision.
- Have only a rough idea and want it sharpened into a concrete plan in one pass.
- Need a plan another session, another model, or another person will execute.
- Want a plan that will be reviewed before anyone starts building.
- Are resuming a plan you started earlier and left as a draft.

Do NOT use plan-writer when you:

- Have a trivial change: one or two files, no design decision, no migration, no interface change. Say so and offer to do it directly.
- Want the plan reviewed. That is `plan-review`.
- Want the code written. Plan first, then build from the plan with your normal workflow.
- Want a document, not a plan. That is `tech-writing`.

## Workflow

1. Restate the request in one line. Classify its **intent** as `refactor`, `build` (from scratch), `change` (a mid-sized feature or fix), `architecture`, or `research`. Classify its **tier** with the table below. A `trivial` tier ends the run: in an interactive session, say why in one sentence and offer to do the change directly instead of planning it; in a non-interactive run, reply `trivial: <reason>` and stop. A `standard` tier sets `review: optional` in the plan; an `architecture` tier sets `review: required`.
2. Resume check, in this order, stopping at the first hit: (a) the caller gave a plan path directly; (b) the request names a ticket id and a file under `docs/plans/` has `source: ticket:<id>` in its frontmatter; (c) the slug computed from the request (lowercase, hyphenated, 3 to 6 words) matches an existing `docs/plans/*-<slug>.md`; (d) otherwise, list every `docs/plans/*.md` file with `status: draft` and a frontmatter `date` inside the last 14 days, showing each one's `title` and `request` line, and ask which to resume, or none — in a non-interactive run, skip this and start fresh. A `draft` match resumes from step 10 using its ledger and any owner answers given since it was written, skipping steps 3 and 4 below — the idea was already sharpened and the branch already named on the run that created the draft. A `planned` or `reviewed` match is not resumed: say so and stop unless a new plan was explicitly asked for.
3. Idea refinement. Runs only on a fresh plan (never on a resume) whose `source` is `chat` — a tracked ticket goes through `issue-refiner` instead, at step 7. Test whether the request is idea-level vague: it names no concrete deliverable, it reads as a wish or a problem area rather than a change, or who benefits and what success looks like cannot be inferred from the request or a quick look at the repository. When the request is already concrete, skip this step and say so in one line. When it is not: in an interactive session, ask up to three sharpening questions in a single message, covering whichever of these the request leaves open — who this serves and what problem it solves, what success looks like, and any real constraint or explicit non-goal — then fold the answers into the restated request before continuing. In a non-interactive run, or when the user has nothing to add, proceed anyway and record what you assumed for each open dimension under "Decisions made". This is one round only; never ask a second batch of sharpening questions.
4. Determine the branch name, on a fresh plan only. Look first for a convention the repository states outright — `CONTRIBUTING.md`, `AGENTS.md`, or a pull request template naming a required prefix or pattern. When none is stated, sample the repository's own recent branches (`git branch -a --sort=-committerdate`, or `git log --all --format=%D`) for a real, observed pattern — a Conventional-Commits-style prefix, a ticket-id segment, a username segment — and match it, the same way `conventions-codifier` and `ai-review`'s standardization axis work from evidence rather than a generic style guide. When no pattern is observable either, because the repository has no branches to sample, default to `<type>/<slug>`, where `<type>` is `feat` for `build` or `change`, `fix` for a bug-shaped `change`, `refactor` for `refactor`, or `chore` for `research`, and put the ticket id ahead of the slug when `source: ticket:<id>` — `<type>/<id>-<slug>`. Record it as `branch:` in the plan's frontmatter and name it in the TL;DR, so whoever executes the plan branches the way this repository already does instead of inventing a new pattern.
5. Explore before you ask anything else, inside a budget. Read every file the request names, then their direct callers, their tests, their config, and any docs that describe them. Prefer searching over opening whole files. Budget: 20 files or 1,500 lines read, whichever comes first. When you hit the budget, stop exploring, write down what you have, and list the areas you did not reach under "Owner decisions pending" as `needs a look at <path>`. Record every observation as `path:line` as you go; an observation you cannot cite did not happen.
6. Write the IS/GAP ledger: `G1`, `G2`, and so on. Every `IS` row cites `path:line`. Every gap is something the request needs that the ledger shows is missing or wrong. A todo that closes no gap later is scope inflation and gets cut in step 9.
7. Run the vagueness test, but only when the request came from a tracked ticket rather than a direct ask: after exploring, there is still no stated outcome, no acceptance criterion can be written from the ticket or the code, and the scope is unbounded. When it fails this test: in an interactive session, if the `issue-refiner` skill is available, say in two lines that the ticket is too vague to plan and that issue-refiner will rewrite its description on the tracker, then ask yes or no. On yes, load `issue-refiner`, run it to completion (its own confirmation gate on the write-back still applies), then continue from step 6 using the refined brief in place of the original ticket text. On no, if issue-refiner is unavailable, or in a non-interactive run: write the draft file with its first TL;DR line reading `Blocked: ticket <id> is too vague to plan. Run issue-refiner on it, then re-run plan-writer.`, list what is missing under it, and stop.
8. List the hidden requirements and risks: what the request implies but never states — data migration, backward compatibility, new tests, rollout, permissions, error handling. Each one becomes a gap row only when step 5 found evidence for it; otherwise it becomes a recorded default or an owner question in step 9. Write the Risks table: risk, what breaks if it is not handled, the mitigation, and which todo carries that mitigation.
9. Vet every open question through two filters, in order. Filter 1: can the repository or the request itself answer it? Then answer it and cite the evidence — it is not a question. Filter 2: does a defensible default settle it? Then take the default and record it under "Decisions made" with the one-line reason. Only questions that fail both filters survive, and only when they are irreversible, destructive, costly, or cross-cutting; write each surviving question with the reason only the owner can answer it, plus the default you would take if it goes unanswered. Then run the slop check on the draft scope and move each hit into "Must NOT have": scope inflation (anything the request did not ask for), premature abstraction (a layer, a helper, or a config option with exactly one caller), over-validation (a check an existing layer already performs), documentation bloat (docs nobody named as a deliverable). Name what you cut and why.
10. Write the draft file at `docs/plans/<YYYY-MM-DD>-<slug>.md` (append `-2` on a collision) with `status: draft`, the TL;DR, the Scope section including the Risks table, and the remaining headings present but empty. Approval gate: when at least one owner question is still open, or the tier is `architecture`, reply with the path, the TL;DR, and the open questions, then stop. Otherwise — and always in a non-interactive run, where the defaults are recorded and any open items sit under "Owner decisions pending" — continue to step 11.
11. Write the verification strategy: for every gap, the exact command or check that proves it closed, and the output it should produce.
12. Write the todos, each with the fields in Output format. Every acceptance criterion is something an agent can run and check: a command with its expected output, or a UI selector with its expected state, using concrete data rather than placeholders. Never write "user tests manually", "verify it works", or "check visually" as acceptance. For a prose deliverable — a document, a skill, a config file — acceptance is structural: a section exists, a validator passes, a command printed in the doc actually runs. Never a grep for a specific sentence; that pins today's wording instead of the behavior.
13. Group the todos into waves by dependency: todos that share no file and have no dependency between them go in the same wave.
14. Add the final verification wave. Its first todo runs the project's full check — tests, lint, build, whatever the project defines. Decide whether the project has a user interface: a web framework in its manifest, an `index.html`, a templates or views directory, or a mobile app target. When it does, the LAST todo in the plan is an automated UI QA task naming the tool, the route or screen, the viewport widths, the steps, the expected result at each step, and the screenshot path `reports/ui-qa/<slug>/`. Record the decision in the plan's `ui:` frontmatter key so `plan-review` can check the claim instead of re-deriving it.
15. Apply the transcript test to every todo: it may hold a signature, a path, or a command, and nothing longer. Replace any block of implementation code with the decision it encodes and the reference it came from. A plan that runs several times longer than the request it answers is a transcript, not a plan.
16. Update the file in place: fill every section, set `status: planned`, keep `review_round: 0`, and leave `## Review` empty for the reviewer.
17. Reply with the path and the TL;DR, then close with: "Next: (a) run plan-review on `<path>` on a different model family — required, tier is architecture / recommended otherwise; (b) start building from the plan. Which?" In a non-interactive run, state the recommendation instead of asking, and stop.
18. Follow-up after a rejection (this is the fix-only step `plan-review` runs on its own during its loop mode — see that skill): re-read the plan from disk, read the blockers listed under the latest `### Round n` in `## Review`, fix only those plus whatever the fixes break, set `review_round` to that round's number, append one line per blocker under a `#### Fixed` list for that round describing the change, keep `status: planned`, and reply with the path and a one-line summary of what changed. Never re-explore the codebase from scratch here, and never rewrite a section the blockers do not touch.

### Handling feedback

A hedged or uncertain remark from the user — "I'm not sure", "I think", "maybe", or anything ending in a question mark — never changes the plan by itself. Answer with your reasoning, the evidence behind it, a recommendation, and a yes/no question; change the plan only once the user confirms. Example: "I'm not sure T3 is needed" gets the gap T3 closes, what breaks without it, and a recommendation to keep or cut, then a question. A plain instruction is applied directly: "Remove T3" removes it, and if a gap is left uncovered as a result, say so in one line.

## Output format

The plan file, written at `docs/plans/<YYYY-MM-DD>-<slug>.md`:

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

# <title>

## TL;DR

- Effort: S | M | L — <one reason>
- Risk: low | medium | high — <what can break>
- Decisions made: <default taken> because <reason>; ...
- Owner decisions pending: none | <question> — why only the owner can answer it; default if unanswered: <default>
- Cut from scope: <what the slop check removed, or "none">
- Branch: `<branch name>` — <the observed convention it follows, or "no existing branches to sample; used the type/slug default">

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

- <one line per item, each traceable to a gap>

### Must NOT have

- <one line per item cut by the slop check>

## Verification strategy

| Gap | Proof | Expected |
| --- | --- | --- |
| G1 | `<command or check>` | `<output or state>` |

## Execution strategy

- Wave 1: T1, T2 (independent)
- Wave 2: T3 (needs T1)
- Final wave: T4, T5

## Todos

### T1 — <verb phrase>

- Do: <the decision, not the code>
- Must not: <the tempting wrong move>
- Closes gap: G1
- Depends on: none | T<n>
- References: `path:line`, `path:line`
- Acceptance: `<command>` prints `<expected>` | element `<selector>` shows `<state>`
- QA scenario: happy — <steps, expected>; failure — <steps, expected>
- Commit: yes — `<type>(<scope>): <subject>` | no, folds into T<n>

## Final verification wave

### T<n> — Run the full check

- Do: run `<test command>`, `<lint command>`, `<build command>`
- Acceptance: each exits 0
- Commit: no

### T<n+1> — Automated UI QA

<Only present when `ui: yes`. Tool, route, viewport widths, steps with expected results, screenshot path `reports/ui-qa/<slug>/`. Omit this todo and say why in one line when `ui: no`.>

## Success criteria

| Gap | Closed by | Proof |
| --- | --- | --- |
| G1 | T1 | `<command>` → `<expected>` |

## Review

<Empty. plan-review writes here.>
````

Two reply shapes, depending on where the run stopped:

Draft-gate reply, used when step 10 stops for an open question or an `architecture` tier:

```markdown
Plan drafted: `docs/plans/<date>-<slug>.md` — tier <tier>.
<the TL;DR block verbatim>
Owner decisions needed before this plan can be filled in:
1. <question> — <why only the owner can answer it>. Default if unanswered: <default>.
```

Planned reply, used when step 17 completes the plan:

```markdown
Plan written: `docs/plans/<date>-<slug>.md` — tier <tier>, review <required | optional>, <n> todos in <m> waves.
<the TL;DR block verbatim>
Next: (a) run plan-review on this path on a different model family — <required | recommended>; (b) start building from the plan. Which?
```

## Guardrails

MUST:

- MUST run idea refinement before exploring when a fresh, chat-sourced request is idea-level vague, and cap it at three questions in one message.
- MUST explore the codebase before asking any question beyond idea refinement, within the stated budget.
- MUST cite `path:line` on every IS row and every todo reference.
- MUST derive the branch name from a convention the repository states or the repository's own recent branches before falling back to the `type/slug` default, and record it as `branch:` in the frontmatter.
- MUST route every open question through both filters before it reaches the user, and record every default under "Decisions made".
- MUST give every surviving owner question its reason and its default.
- MUST keep a "Must NOT have" list, and it is never empty when the slop check found something to cut.
- MUST make every acceptance criterion something an agent can run and check, with concrete data.
- MUST end the plan with the final verification wave, and end that wave with the automated UI QA todo whenever `ui: yes`.
- MUST write to `docs/plans/<date>-<slug>.md` and set `status: draft` before `status: planned`.
- MUST re-read the plan from disk on every resume or follow-up rather than trusting memory of an earlier turn.
- MUST answer a hedged remark with reasoning and a question before changing the plan.

NEVER:

- NEVER write or change code, tests, or configuration. This skill writes a plan file only.
- NEVER run `plan-review` itself, or spawn a subagent to review the plan.
- NEVER ask a second round of idea-refinement questions; three questions, once, or none at all.
- NEVER invent a branch pattern the repository does not show any evidence of using.
- NEVER put implementation code in a todo beyond a signature, a path, or a command — the transcript test.
- NEVER write "user tests manually", "verify it works", or "check visually" as an acceptance criterion.
- NEVER write a grep-for-a-sentence acceptance criterion for a prose deliverable.
- NEVER answer an owner decision silently. It is either a recorded default with its reason, or a listed question.
- NEVER plan a change classified `trivial`.
- NEVER paste the whole plan into the chat reply; reply with the path and the TL;DR only.
- NEVER include a secret, personal data, an internal hostname, or an absolute local path in the plan file.
- NEVER commit the plan file. The user commits it.

## QA checklist

- [ ] The reply names the intent and the tier on its first line, or the `trivial` short-circuit fired instead.
- [ ] Idea refinement ran, was explicitly skipped as already-concrete, or does not apply (a resume, or a tracked ticket) — and never asked more than three questions in one message.
- [ ] The branch name traces to a stated convention, an observed one, or the documented default, and appears in both the frontmatter and the TL;DR.
- [ ] Every IS row and every todo reference has `path:line`, and each was actually opened.
- [ ] Every gap is closed by at least one todo, and every todo closes at least one gap.
- [ ] "Must NOT have" is present, and lists anything the slop check removed.
- [ ] Every acceptance criterion names a command or selector and a concrete expected result.
- [ ] No todo holds more than a signature, a path, or a command.
- [ ] The execution strategy's waves respect every "Depends on" field.
- [ ] The final verification wave is present, and its last todo is the automated UI QA task whenever `ui: yes`, with tool, route, widths, steps, and a screenshot path.
- [ ] The frontmatter has all ten keys, with `status` matching where the run stopped.
- [ ] `## Review` is present and empty on a freshly planned file.
- [ ] The reply is the draft-gate block or the planned block, never the full plan file.
- [ ] Nothing outside `docs/plans/` was created or changed.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
