---
name: plan-review
description: Reviews implementation plans against repository evidence and critical end-to-end flows. Records coverage, source traces, probes, and unresolved assumptions before returning OKAY, REJECT, or INCOMPLETE. Checks dependencies, QA, research, questions, diagrams, and execution gates. Rechecks whole-plan readiness after fixes and can run a five-round fix loop. Use when reviewing a plan, checking readiness for implementation, challenging an earlier approval, or asking for the plan-review verdict.
license: CC-BY-ND-4.0
metadata:
  version: "0.5.0"
  category: planning
  suggested-model: openai/gpt-6-astra
  suggested-effort: max
---

# plan-review

## Purpose

plan-review answers whether a capable developer can execute a plan without inventing missing decisions or encountering a known failure. Approval requires evidence, not merely an empty blocker list. Missing required evidence produces INCOMPLETE. A demonstrated execution defect produces REJECT. The skill checks the plan; it does not certify unimplemented software. A different reviewer can provide a useful second opinion, but model choice is advisory and never replaces evidence. Review writes obey the host tool's permissions and planning-mode restrictions.

## When to use / when NOT to use

Use plan-review when you:

- Have a plan file with `status: planned` and want to know if it is safe to hand to an implementer.
- Want a second opinion from a different model than the one that wrote the plan.
- Want the loop mode to fix and re-check a plan automatically until it passes.
- Challenge whether an earlier approval was adequately checked.

Do NOT use plan-review when you:

- Want a better plan, not just an executable one. Tell `plan-writer` what to change instead.
- Have no plan file yet. This skill reads a file from disk; it never reviews pasted text.
- Want the code reviewed. That is `ai-review`.
- Want the ticket refined. That is `issue-refiner`.
- Already used five rounds under the current consent without approval. Another round needs fresh consent.

## Workflow

**Review mode** does one round and stops. **Loop mode** fixes and re-reviews until approval, unavailable evidence, or the five-round limit. Start a loop only on explicit consent, including an up-front "review and fix until it passes" request. Record consent in the history table.

1. Resolve the plan path from the request or conversation. Read the entire plan from disk, including previous reviews. Ask for a path only if it cannot be resolved. Record the mode and next round number. Stop on `status: draft`. An explicit confidence challenge such as "are you sure?" requests a re-review even when `status: reviewed`.
2. Record the review identity: plan body digest excluding `## Review`, `status`, and `review_round`; repository revision and dirty state; and content digests for the source files used as evidence, including untracked files. For non-git fixtures, use file digests alone. A prior approval is historical evidence, not proof that the current plan is checked.
3. Count rounds since the last consent, or since the first round when none exists. After five rounds without approval, stop and ask whether to continue for up to five more or stop. Owner acceptance of risk is recorded separately; it never changes an unsupported result to OKAY.
4. Build the coverage ledger before investigating. Map every Must Have, todo dependency, and necessary external contract to its owning todo, required evidence, and QA. Identify critical flows using [references/evidence-gate.md](references/evidence-gate.md). Include the entire plan, not just the current fixes.
5. Check A — references and contracts. Inspect the code that controls behavior, following callers and state changes beyond the cited line. Verify external contracts against sources for the exact target version. Budget: 40 distinct source windows and 5 URLs per round, excluding the plan and this skill. Prioritize critical flows across all waves. List unopened locations and the obligations they affect when the budget ends; required gaps prevent approval. T0 may cite `this file`.
6. Check B — startability. For every todo, check inputs, decisions, APIs, dependencies, and whether Acceptance and QA can pass at its scheduled position. Check dependencies needed by tests as well as by implementation. A future file is valid when a prior or owning todo explicitly creates it; an invented existing API is not.
7. Check C — contradictions and flow. Trace every critical flow from entry point through preconditions, ordered side effects, persistence, external artifacts, and failure/recovery. Compare each trace with the plan's guarantees and file ownership. Record a concrete counterexample attempt for each flow; use an isolated probe when source inspection cannot resolve an ordering or state question.
8. Check D — QA executability. Require commands or tools, concrete inputs, and observable outcomes. Verify that QA reaches the real integration path, not only a stub or a file's existence. Future tests are planned checks, never evidence that the implementation passes. A grep for documentation headings does not establish documentation accuracy.
9. Check E — UI QA. Verify `ui:` against manifests, entry points, templates/views, mobile targets, and the proposed surface. If UI exists or is added, require the last automated UI QA todo to name the tool, route/screen, viewports, steps, expected result, and screenshot path.
10. Checks F–J — read [references/writer-contract.md](references/writer-contract.md). Check research, Product-before-Technical questions, required diagrams, final gates, todo boxes, test-before-next, continuation, and T0. Reuse the source budgets from Check A rather than starting another allowance.
11. Record each observation as verified, contradicted, or unverified, with its evidence kind and actual result. Use Notes only when an observation cannot affect executability or a required outcome. Missing critical evidence belongs under Unverified, not Notes. A defect stays open until evidence resolves it; changed wording alone is not a fix.
12. On every re-review, verify fixes and their affected paths. Before any OKAY, perform the whole-plan approval gate below: revisit every critical flow and requirement-to-todo mapping, including unchanged migration, rollback, and integration sections. Reuse evidence only after comparing its source digests and relevant plan obligations with the current revision, recording what still applies. A previous "passed" label without evidence does not qualify. New evidence-backed correctness findings are allowed in every round; avoid unrelated style or architecture churn.
13. Decide the verdict by the approval gate. Describe at most three blockers in detail, each with location, failure, evidence, and concrete fix. Count and identify any remaining blockers in the ledger; a display limit is not a finding limit. Record skipped checks and missing evidence explicitly.
14. Append the round to `## Review` and update `review_round`. Set `status: reviewed` only for OKAY; use `planned` for REJECT or INCOMPLETE, including when revoking a prior approval. Preserve earlier verdicts and evidence. Re-read the saved result and verify it matches the evidence and current plan digest before replying.
15. On OKAY, stop. On REJECT in review mode, offer the fix loop. In loop mode, invoke `plan-writer`'s fix-only follow-up for the recorded blockers, then re-review. If that skill is unavailable, stop and say so. On INCOMPLETE, name the smallest missing check; continue another round only if loop consent and available evidence permit it. Do not rewrite a requirement merely to eliminate a verification gap.

### Approval gate

Preconditions: the current plan identity is recorded, Checks A–J have results, and the ledger covers the whole plan.

- If any demonstrated execution blocker remains, return **REJECT**, even when other evidence is missing.
- Otherwise, if a required check, critical flow, external contract, or approval precondition is unverified, return **INCOMPLETE**.
- Otherwise, return **OKAY** only after the whole-plan pass confirms every required obligation has supporting evidence and no unresolved contradiction.

The reviewer MUST complete and record this gate. Approval without the gate is forbidden. A claimed check with no source trace or observed tool result fails the gate. Optional improvements do not block approval. Plan approval means the design is executable on the checked evidence; it does not mean future code or tests have passed.

### Handling feedback

A challenge to a finding triggers an evidence check, not automatic removal or defensive repetition. Correct an unsupported finding and explain why. A general confidence challenge triggers the whole-plan gate. If the owner explicitly waives a finding, record the waiver separately from technical resolution; do not claim the contradicted obligation was verified or set `status: reviewed` while it remains unresolved.

## Output format

The final reply starts with exactly one verdict line. Progress messages do not claim a verdict before the gate completes.

```text
PLAN-REVIEW: OKAY
PLAN-REVIEW: REJECT (<n> blockers)
PLAN-REVIEW: INCOMPLETE
```

Append a history row and round body. Include all the sections below, using `None` where appropriate. Evidence entries are concise observed facts, not private reasoning transcripts.

````markdown
## Review

| Round | Date | Verdict | Blockers |
| --- | --- | --- | --- |
| 1 | <date> | REJECT | 2 |
| consent | <date> | — | user approved loop mode |
| 2 | <date> | INCOMPLETE | 0 |
| 3 | <date> | OKAY | 0 |

### Round <n>

**Verdict:** PLAN-REVIEW: REJECT (2 blockers)
**Mode:** <review | loop; consent and rounds used>
**Review identity:** <plan digest; repository revision/dirty state when available; evidence-file digests>
**Scope:** <whole plan; required obligations verified/total; critical flows verified/total>

#### Blockers

1. **<todo/flow> — <failure>.** Evidence: <source/probe and observed result>. Fix: <concrete change and verification>.
2. **<todo/flow> — <failure>.** Evidence: <source/probe and observed result>. Fix: <concrete change and verification>.
<If applicable: N more blockers, identified in the ledger; all count toward the verdict.>

#### Fixed (only on a round after the first)

- Blocker <id> from round <n>: <change and evidence that resolves the failure>.

#### Coverage and evidence

| ID / obligation / owning todos | Required? | Evidence kind and location | Observed result | Planned QA | Status |
| --- | --- | --- | --- | --- | --- |
| <id; requirement, dependency, or flow; todos> | yes/no | source trace / executed probe / versioned documentation / plan inspection | <actual result, or not checked> | <future check> | verified / contradicted / unverified |

#### Critical flows

- <flow>: <entry → preconditions → ordered writes → external effects → recovery>; counterexample checked: <input/state>; evidence: <ledger ids>; outcome: <result>.
- Whole-plan pass: <what was rechecked, evidence reused with identity, and uncovered obligations>.

#### Unverified

- <missing evidence, affected obligation, why it matters, and smallest next check; include budget/access limits>.
- Planned implementation tests not run: <future tests; these are not required review evidence and do not themselves force INCOMPLETE>.
- Owner waivers: <separate from technical resolution; None when absent>.

#### Notes (non-blocking)

- <at most five; observations that would not stop execution>

#### Checked

- References opened: <n> of <n>; <k> broken; omitted locations and affected obligations: <list>.
- Todos startable: <n> of <n>.
- Contradictions: none | <where>.
- QA scenarios executable: <n> of <n>.
- UI claim: `ui: yes | no` verified | contradicted — <evidence>. Automated UI QA todo last: yes | no | not applicable.
- Research: present | missing — sources opened <n> of <n>; <k> broken.
- Questions: Product before Technical | wrong order — open items with neither answer nor default: <n>.
- Diagram: present | omitted — <reason> | required and missing.
- Final wave: F1–F4 present | missing <which> — UI QA last: yes | no | not applicable.
- Todo boxes: every todo starts `- [ ] Open`. The `## Todos` intro says to pass that todo's Acceptance and QA scenario, commit when it says `Commit: yes`, mark `- [x] Done`, and only then start the next todo. The final wave does not inherit that rule | missing | applied to the final wave.
- Waves: the plan says to continue through every wave until every todo and gate is done, and to fix a failed check and continue | stops between waves | missing.
- T0: first todo, copies the plan into `docs/plans/` only when it is not already there, and the build continues there | missing | not first | copies unconditionally | build stays outside.
- Previous blockers fixed: <n> of <n> | first round.
- Approval gate: <PASS | FAIL | INCOMPLETE>; <evidence-backed reason>.
````

Reply block, review mode or the final round of loop mode:

```markdown
PLAN-REVIEW: REJECT (2 blockers)
Round <n>; <rounds used>/5 under current consent — <plan path>
1. <failure, evidence, and fix>
2. <failure, evidence, and fix>
Fix these blockers and re-review until approved? (yes / I will fix them myself)
```

```markdown
PLAN-REVIEW: OKAY
Round <n> — <plan path>. Whole-plan gate passed: <verified/required obligations>, <verified/required critical flows>. Evidence recorded in the plan. <k> optional notes.
```

```markdown
PLAN-REVIEW: INCOMPLETE
Round <n> — <plan path>. Approval withheld: <required evidence missing>.
Next check: <smallest action/input needed>. Status remains planned.
```

Reply block, cap reached mid-loop:

```markdown
<current verdict line>
Five rounds used — <plan path>. Continue for up to five more rounds, or stop here?
```

## Guardrails

MUST:

- MUST read the plan from disk on every round; never review pasted text.
- MUST record evidence before deciding the verdict; open a source before judging its claim.
- MUST account for Checks A–J, required obligations, and critical flows in every round.
- MUST put the exact verdict string on the first line of the final reply.
- MUST limit detailed blockers to three while counting and identifying every unresolved blocker.
- MUST cap non-blocking notes at five.
- MUST write `## Review`, update `review_round`, and set `status` correctly on every round.
- MUST stop and ask before a sixth round without a fresh consent.
- MUST enter loop mode only after a yes or an explicit instruction, never on its own.
- MUST run the whole-plan approval gate after fixes, including unchanged critical flows.
- MUST distinguish observed results, source-traced conclusions, assumptions, and future QA.
- MUST report missing required evidence as INCOMPLETE when no demonstrated blocker remains.
- MUST preserve prior evidence and state why a prior verdict changes.

NEVER:

- NEVER block on architecture preference, naming, code style, or optimality alone.
- NEVER edit the plan file outside `## Review` and the two frontmatter keys it owns, except through `plan-writer`'s own fix-only follow-up step during the fix loop.
- NEVER fix a plan itself; only `plan-writer`, invoked explicitly, changes the plan's content.
- NEVER add a blocker to look thorough. Zero blockers is a legitimate, common outcome.
- NEVER infer approval from zero blockers, elapsed effort, a passing structural script, or user pressure.
- NEVER label a required verification gap non-blocking or call a planned test a passed test.
- NEVER mark a guarantee verified solely because a future test asserts it; trace the planned change that makes it true.
- NEVER invent tool output, coverage counts, source inspection, or independent review. Name an independent reviewer only if one actually reviewed this revision.
- NEVER mutate live data or configuration for a probe; use a disposable fixture or source trace.
- NEVER run a round past the fifth since the last consent without asking again.
- NEVER review a `draft` plan.
- NEVER read an entire referenced file when a window around the cited line answers the question.

## QA checklist

- [ ] The plan was read from disk; the reply names its path.
- [ ] The run's mode (review or loop) is recorded and followed correctly.
- [ ] The round number is correct and no more than 5 since the last consent.
- [ ] The plan identity and whole-plan obligation ledger are recorded; unopened evidence is listed honestly.
- [ ] All ten checks (A–J) each produced a line under "Checked". Check J produces the todo-box line, including the test-before-next instruction, the waves line, and the T0 line.
- [ ] Detailed blockers are capped at three; all blockers are counted and identified, with evidence and fixes.
- [ ] Notes are capped at five.
- [ ] The verdict is OKAY, REJECT, or INCOMPLETE under the gate, and is the final reply's first line.
- [ ] `## Review` was written with the round appended to the history table, never overwriting an earlier round's body.
- [ ] `review_round` and `status` match the outcome of this round.
- [ ] Every critical flow has a recorded trace and counterexample check, including its applicable recovery path.
- [ ] Reused evidence matches the current plan/source identity; a prior pass alone was not reused as evidence.
- [ ] Missing critical evidence prevents approval, even after every previously reported blocker is fixed.
- [ ] Planned tests are separate from executed probes; optional notes cannot hide required work.
- [ ] The saved verdict, coverage totals, frontmatter, and final reply agree.
- [ ] Nothing outside `## Review` and the two frontmatter keys changed, unless `plan-writer`'s fix-only follow-up step ran during a loop round.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
