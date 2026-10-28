---
name: plan-review
description: Reviews implementation plans against repository evidence and critical end-to-end flows. Records coverage, source traces, probes, and unresolved assumptions before returning OKAY, REJECT, or INCOMPLETE. Checks dependencies, QA, research, questions, diagrams, and execution gates. Rechecks whole-plan readiness after fixes and can run a five-round fix loop. Use when reviewing a plan, checking readiness for implementation, challenging an earlier approval, or asking for the plan-review verdict.
license: CC-BY-ND-4.0
metadata:
  version: "1.0.0"
  category: planning
  suggested-model: openai/gpt-6-astra
  suggested-effort: max
---

# plan-review

## Purpose

plan-review answers whether a capable developer can execute a plan without inventing missing decisions or encountering a known failure. Approval requires evidence, not merely an empty blocker list. Missing required evidence produces INCOMPLETE. A demonstrated execution defect produces REJECT. The skill checks the plan; it does not certify unimplemented software. A different reviewer can provide a useful second opinion, but model choice is advisory and never replaces evidence. Review writes obey the host tool's permissions and planning-mode restrictions. There is no source, URL, or detailed-blocker count: the owner chose completeness over investigation cost, which overrides `skill-writer`'s numeric investigation budgets for this planning skill only; finish every available independent check instead of stopping at a count. Completeness applies to the investigation, not to what the plan stores. A plan is a directory of five files ([references/validator-contract.md](references/validator-contract.md), Plan files). A round writes two of them: it adds a round to `<stem>.reviews.md`, newest first, and replaces `<stem>.gate-record.json` with this round's gate record. The spec changes only in its two frontmatter keys.

**Balance rule.** A record earns its bytes only by changing what the next agent does. Render a row only for a status other than the default: open obligations, blockers, and missing evidence, never what verified. Never restate a machine record (the gate record, the evidence index) as prose, and never re-render a table that did not change since the last round.

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

1. Resolve the plan path from the request or conversation: `docs/plans/<stem>/<stem>.md`. Read the spec and its evidence index whole from disk, and the reviews file's history table and latest round. Older rounds are history; read one only when the latest round points at it. Ask for a path only if it cannot be resolved. Record the mode and next round number. Stop on `status: draft`. An explicit confidence challenge such as "are you sure?" requests a re-review even when `status: reviewed`.
2. Record the review identity: the spec digest over the spec and its evidence index, as validator-contract.md defines it; repository revision and dirty state; and content digests for the source files used as evidence, including untracked files. For non-git fixtures, use file digests alone. A prior approval is historical evidence, not proof that the current plan is checked.
3. Count rounds since the last consent, or since the first round when none exists. After five rounds without approval, stop and ask whether to continue for up to five more or stop. Owner acceptance of risk is recorded separately; it never changes an unsupported result to OKAY.
4. Build the coverage ledger before investigating. The required targets, obligation grouping, and evidence-id scheme are [references/validator-contract.md](references/validator-contract.md)'s Plan grammar and Gate record sections; this is the plan's grammar, not a restatement of it. Map every Must Have, todo dependency, and necessary external contract to its owning todo, required evidence, and QA. Identify critical flows using [references/evidence-gate.md](references/evidence-gate.md). Include the entire plan, not just the current fixes.
5. Check A — references and contracts. Inspect the code that controls behavior, following callers and state changes beyond the cited line. Verify external contracts against sources for the exact target version. There is no fixed source or URL count: open every location the ledger needs. Prioritize critical flows across all waves. Finish all available independent checks before returning; a location left unopened because time or effort ran out, not because it is genuinely inaccessible, is not a basis for INCOMPLETE. T0 may cite `this file`.
6. Check B — startability. For every todo, check inputs, decisions, APIs, dependencies, and whether Acceptance and QA can pass at its scheduled position. Check dependencies needed by tests as well as by implementation. A future file is valid when a prior or owning todo explicitly creates it; an invented existing API is not.
7. Check C — contradictions and flow. Trace every critical flow from entry point through preconditions, ordered side effects, persistence, external artifacts, and failure/recovery. Compare each trace with the plan's guarantees and file ownership. Record a concrete counterexample attempt for each flow; use an isolated probe when source inspection cannot resolve an ordering or state question.
8. Check D — QA executability. Require commands or tools, concrete inputs, and observable outcomes. Verify that QA reaches the real integration path, not only a stub or a file's existence. Future tests are planned checks, never evidence that the implementation passes. A grep for documentation headings does not establish documentation accuracy.
9. Check E — UI QA. Verify `ui:` against manifests, entry points, templates/views, mobile targets, and the proposed surface. If UI exists or is added, require the last automated UI QA todo to name the tool, route/screen, viewports, steps, expected result, and screenshot path.
10. Checks F–J — read [references/writer-contract.md](references/writer-contract.md). Check research, Product-before-Technical questions, required diagrams, final gates, todo boxes, test-before-next, continuation, and T0.
11. Record each observation as verified, contradicted, or unverified, with its evidence kind and actual result. Use Notes only when an observation cannot affect executability or a required outcome. Missing critical evidence belongs under Unverified, not Notes. A defect stays open until evidence resolves it; changed wording alone is not a fix. Assign each piece of evidence a stable id: reuse an Evidence index citation id (`C<n>`) for a source or external contract; give each executed probe a new `P<n>`. A todo's planned Acceptance/QA may get a `Q<n>` (`planned-qa`, never sufficient alone); leave it out unless an obligation's `plannedQa` names it. Give each obligation a stable `O<n>` and list every required target it covers, using the exact strings validator-contract.md's Gate record section names (`MH<n>`, `MN<n>`, `T<n>.start`/`.acceptance`/`.qa`, `dep:T<a>:T<b>`, `F<n>.acceptance`, `flow:<id>`, `contract:<id>`, `check:A`–`check:J`). Group targets into one obligation only when the same evidence supports all of them.
12. On every re-review, verify fixes and their affected paths. Before any OKAY, revisit every critical flow and requirement-to-todo mapping, including unchanged migration, rollback, and integration sections. Reuse an observation only after comparing all its source digests and its supporting plan text, dependencies, and external contracts. An unchanged spec digest proves plan-text equality. If it changed, compare against a retained copy or Git revision matching the prior `planDigest`; without one, recheck the affected obligation. Unchanged target text alone is insufficient when another todo changes its inputs. Copy the original supporting evidence entries and source digests into the new gate record, and supplement them with one `plan-inspection` entry naming the reused obligations, prior round, and comparison. Never replace a source trace or probe with that reuse note. Documentation evidence for an external contract is reused as it stands while `## Research` and the external citation are unchanged; refetch only when either changed or the target version did. Re-read everything a fix touched, and every caller and test of a seam it changed. New evidence-backed correctness findings are allowed in every round; avoid unrelated style or architecture churn.
13. Decide the verdict by the approval gate. Before calling something a blocker, apply [references/evidence-gate.md](references/evidence-gate.md)'s "Not a blocker" list. Describe every blocker in detail: location, failure, evidence, and concrete fix, in at most 120 words (validator-contract.md's Field caps). There is no display limit; a reporting limit never makes a failed requirement pass. When many blockers are equally consequential, list T0, test-before-next, continuation, final-gate, unresolved-decision, research, and diagram misses first. Record skipped checks and missing evidence explicitly.
14. Save the round beside the given plan path. In `<stem>.reviews.md` (create it with `# Reviews: <plan title>` and `## Review` when absent), add the history row, with a Summary of at most 120 characters, and insert the new round directly above the previous one, so rounds read newest first. Never edit an older round. Write this round's gate record to `<stem>.gate-record.json`, replacing the previous one. Render blockers, open obligations, and missing evidence; verified observations live in the gate record alone. Keep each `observed` and `result` under 200 characters; a longer one is a soft-cap gap, past 400 an error. Update `review_round`; set `status: reviewed` only for OKAY, otherwise `planned`. Re-read the saved files and run `bun <plan-review-base>/scripts/validate-plan.ts <plan> --review --root <project>` against that same path, resolving every error. A passing validator is required, not sufficient, evidence. A denied disposable-probe command does not establish that the plan is unwritable: still use the available file-edit tools to save the review. If the real files are unwritable, report the limitation and never claim the round was saved.
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

`<stem>.reviews.md` holds `## Review`: the history table, then every round, newest first. A round has only the sections below; leave out a section that would say `None`, except `#### Unverified`. Every verified obligation, every flow trace, and every check result lives in the gate record alone: never repeat them as prose. Evidence entries are concise observed facts, not private reasoning transcripts.

````markdown
# Reviews: <plan title>

## Review

| Round | Date | Verdict | Blockers | Summary |
| --- | --- | --- | --- | --- |
| 1 | <date> | REJECT | 2 | B1 <short name>; B2 <short name> |
| consent | <date> | — | — | user approved loop mode |
| 2 | <date> | OKAY | 0 | B1 and B2 fixed |

### Round 2

<the newest round, in the shape below>

### Round 1

<the round before it, unchanged since it was written>
````

One round:

````markdown
### Round <n>

**Verdict:** PLAN-REVIEW: REJECT (2 blockers)
**Mode:** <review | loop; consent and rounds used>
**Review identity:** <plan digest>; <repository revision and dirty state, when available>; source digests are in the gate record
**Scope:** whole plan; <v>/<r> required obligations verified; <v>/<r> critical flows verified

#### Blockers

1. **B<n> — <todo/flow> — <failure>.** Evidence: <ids and the observed result>. Fix: <concrete change and how to verify it>.
<Every remaining blocker, one paragraph each; there is no cap.>

#### Fixed

<Only on a round after the first.>

- B<n> from round <n-1>: fixed | still open — <evidence id and observed result, one line>.

#### Open obligations

<Only when an obligation is contradicted or unverified. One row per such obligation; verified ones are not listed.>

| Obligation | Targets | Evidence | Observed | Status |
| --- | --- | --- | --- | --- |
| O<n> | <targets> | <ids> | <one sentence> | contradicted / unverified |

#### Unverified

- <missing evidence, the obligation it blocks, the smallest next check, and the actual access failure>, or None.
- Owner waivers: <only when one exists; separate from technical resolution>.

#### Notes (non-blocking)

- <at most five; observations that would not stop execution>
````

`<stem>.gate-record.json` is the machine-checkable latest round, one JSON object. Build it from the same ledger; do not invent it separately. [references/validator-contract.md](references/validator-contract.md) is authoritative for the schema, the required-target list, and evidence kinds.

```json
{
  "schemaVersion": 1,
  "round": <n>,
  "planDigest": "<this round's spec digest>",
  "repository": { "revision": "<commit>", "dirty": ["<path>"] },
  "sources": [{ "path": "<file inspected outside the evidence index; never one it cites>", "sha256": "<64 hex>" }],
  "evidence": [
    { "id": "P<n>", "kind": "probe", "command": "<command>", "inputs": "<fixture>", "exit": <n>, "result": "<one sentence>", "omissions": "<what was stubbed, or none>" }
  ],
  "obligations": [
    { "id": "O<n>", "targets": ["<every required target this obligation covers>"], "evidenceIds": ["<C/P ids>"], "observed": "<one sentence>", "status": "verified | contradicted | unverified" }
  ],
  "flows": [{ "id": "<evidence index flow id>", "status": "verified | contradicted", "counterexample": "<input or state tried, one sentence>", "evidenceIds": ["<ids>"] }],
  "checks": { "A": { "status": "verified | contradicted", "evidenceIds": ["<ids>"], "observed": "<this plan's actual result for check A, one sentence>" }, "...": "one entry for each of A through J" },
  "blockers": [{ "id": "B<n>", "obligationIds": ["O<n>"], "location": "<path:line or flow id>", "failure": "<what fails>", "evidenceIds": ["<ids>"], "fix": "<concrete change>" }],
  "verdict": "OKAY | REJECT | INCOMPLETE"
}
```

Every required target from validator-contract.md's Gate record section has a covering obligation: each `MH<n>`/`MN<n>`, each todo's `.start`/`.acceptance`/`.qa`, each `dep:T<a>:T<b>`, each `F<n>.acceptance`, each evidence index flow's `flow:<id>`, each external citation's `contract:<id>`, and `check:A` through `check:J`. One obligation covers every target the same evidence supports, for example all the todos whose start, acceptance, and QA one plan inspection verified. An obligation that is `verified` or `contradicted` cites at least one `C`/`P` evidence id; `planned-qa` or a `planned` citation alone never carries a verified or contradicted status. Every contradicted obligation has a matching `blockers` entry. `gateRecordDigest` (recorded later, in the build file) is the SHA-256 of this object's canonical JSON, defined in validator-contract.md.

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
Round <n> — <plan path>. Whole-plan gate passed: <verified/required obligations>, <verified/required critical flows>. Evidence recorded in the gate record. <k> optional notes.
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
- MUST describe every unresolved blocker in detail; there is no display cap.
- MUST cap non-blocking notes at five.
- MUST add the round to `<stem>.reviews.md`, update `review_round`, and set `status` correctly on every round.
- MUST write `<stem>.gate-record.json` every round, built from the same ledger, matching validator-contract.md's schema, and pass `validate-plan.ts --review` before replying.
- MUST stop and ask before a sixth round without a fresh consent.
- MUST enter loop mode only after a yes or an explicit instruction, never on its own.
- MUST run the whole-plan approval gate after fixes, including unchanged critical flows.
- MUST distinguish observed results, source-traced conclusions, assumptions, and future QA.
- MUST report missing required evidence as INCOMPLETE when no demonstrated blocker remains.
- MUST keep every earlier round and its history row as written, and state why a prior verdict changes.

NEVER:

- NEVER block on architecture preference, naming, code style, or optimality alone.
- NEVER edit the spec beyond the two frontmatter keys it owns, or the evidence index at all, except through `plan-writer`'s own fix-only follow-up step during the fix loop. The reviews file and the gate record file are the files a round writes.
- NEVER delete or rewrite an earlier round.
- NEVER block on a rule the "Not a blocker" list in evidence-gate.md names.
- NEVER restate verified obligations, flow traces, or check results as prose; the gate record holds them.
- NEVER fix a plan itself; only `plan-writer`, invoked explicitly, changes the plan's content.
- NEVER add a blocker to look thorough. Zero blockers is a legitimate, common outcome.
- NEVER infer approval from zero blockers, elapsed effort, a passing structural script, or user pressure.
- NEVER label a required verification gap non-blocking or call a planned test a passed test.
- NEVER mark a guarantee verified solely because a future test asserts it; trace the planned change that makes it true.
- NEVER invent tool output, coverage counts, source inspection, or independent review. Name an independent reviewer only if one actually reviewed this revision.
- NEVER mutate live data or configuration for a probe; use a disposable fixture or source trace.
- NEVER let a disposable copy substitute for editing the plan: probes and drafting may happen in a copy, but the saved round always lands in the real file at the given path.
- NEVER treat a denied or failed shell command for a probe as a reason to stop editing the plan. The two are unrelated: a probe you cannot run becomes an access-failure note under Unverified; the round is written regardless.
- NEVER run a round past the fifth since the last consent without asking again.
- NEVER review a `draft` plan.
- NEVER read an entire referenced file when a window around the cited line answers the question.
- NEVER mark a gate record obligation verified or contradicted using only `planned-qa` evidence or a `planned` citation.

## QA checklist

- [ ] The plan was read from disk; the reply names its path.
- [ ] The run's mode (review or loop) is recorded and followed correctly.
- [ ] The round number is correct and no more than 5 since the last consent.
- [ ] The plan identity and whole-plan obligation ledger are recorded; unopened evidence is listed honestly.
- [ ] All ten checks (A–J) have a gate record `checks` entry whose `observed` states this plan's result. Check J's covers the todo boxes, the test-before-next instruction, the waves rule, and T0.
- [ ] Every unresolved blocker is described in detail, with evidence and a fix; there is no cap.
- [ ] Notes are capped at five.
- [ ] The verdict is OKAY, REJECT, or INCOMPLETE under the gate, and is the final reply's first line.
- [ ] The reviews file has this round's history row and this round above the earlier ones, which are unchanged. The gate record file holds this round. The writes landed on the real files beside the given path, not only on a disposable copy used for drafting or validation.
- [ ] No verified obligation, flow trace, or check result is repeated as prose; only blockers, open obligations, and missing evidence are rendered.
- [ ] `review_round` and `status` match the outcome of this round.
- [ ] The gate record file is one JSON object with every required target covered, lists no `sources` path the evidence index cites, agrees with the prose round (verdict, blocker count, scope counts, open-obligation statuses), and passes `validate-plan.ts --review`.
- [ ] Every critical flow has a gate record entry with its counterexample and status, after a trace that covered its recovery path.
- [ ] Reused evidence and its source hashes are retained in this round; comparison covered the prior spec, dependencies, and contracts. Missing comparison evidence triggered a recheck.
- [ ] Missing critical evidence prevents approval, even after every previously reported blocker is fixed.
- [ ] Planned tests are separate from executed probes; optional notes cannot hide required work.
- [ ] The saved verdict, coverage totals, frontmatter, and final reply agree.
- [ ] Nothing outside the reviews file, the gate record file, and the spec's two frontmatter keys changed, unless `plan-writer`'s fix-only follow-up step ran during a loop round.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
