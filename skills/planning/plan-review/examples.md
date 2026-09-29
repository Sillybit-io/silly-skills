## Prompt

> You approved this earlier. Are you sure? Recheck docs/plans/plan.md against the fixture and record one new review round. Do not fix the plan.

Both runs received identical copies of an isolated rollback fixture. Its plan was
`status: reviewed`, with one earlier OKAY and no recorded source traces. T1
promised a working installation after rollback but restricted restoration to the
legacy engine and bank. Its tests checked directory existence and bank contents.

The relevant source copied the legacy installation to `new-home`, rewrote a
hook, a shell helper, and a tool registration to that destination, and restored
only the legacy directory on rollback. The registration write also replaced an
unrelated configuration value. The proposed failure handler ran after
installation, leaving failures inside installation uncovered.

These are excerpts from actual evaluation outputs, not hypothetical weaker and
stronger answers. The no-skill run loaded no plan-review instructions. The
with-skill run loaded version 1.0.0 and its two workflow reference files. Neither
run changed the plan's implementation instructions.

## Without skill

The no-skill reviewer found the main defect and reproduced it by calling the
fixture's real functions in a disposable directory. Its reply was:

```text
PLAN-REVIEW: REJECT (round 2; one blocker). The rollback plan restores `legacy` and the bank, but leaves `hook.sh`, `helpers.sh`, and the registered `tool.json` memory command pointing at the deleted `new-home`. The T1 assertions would miss this violation of the Must Have. The plan was not fixed.

Reviewed plan: `../outputs/plan.md`; evidence: `../outputs/evidence.md`.
```

Its evidence recorded that the hook printed `{}`, the helper and registration
still referenced `new-home`, and the bank and legacy engine had been restored.
This baseline was a valid rejection; the comparison does not claim that a
competent reviewer needs the skill to find the defect.

## With skill

The skill-guided reviewer re-read the plan, recorded source digests, built the
whole-plan ledger, and traced successful installation, post-install rollback,
and failure during installation. It used isolated calls to the existing
functions to check the entry points and configuration values. It distinguished
those probes from the future tests named in T1.

Its reply was:

```text
PLAN-REVIEW: REJECT (3 blockers)

Round 2; 2/5 since first review — `fixture/docs/plans/plan.md`. The prior approval lacked source evidence and is revoked.

1. Rollback restores the legacy engine and bank but leaves `hook.sh`, `helpers.sh`, and `tool.json` pointing to deleted `new-home`; an isolated invocation reproduced broken hook/tool behavior. Plan restoration/rewiring and test the actual entry points after rollback.
2. Installation overwrites unrelated `tool.json` values, and rollback does not restore them. A seed with `enabled: false` and a `label` became `enabled: true`. Plan a value-preserving update/restore and assert exact preservation.
3. A failure *inside* `install_new` can leave a partially installed destination before the plan's “after install_new” rollback path. An isolated failing-`cat` probe exited 17 with `new-home` still present. Cover failures during installation and test that boundary.

Fix these blockers and re-review until approved? (yes / I will fix them myself)

Outputs: `../outputs/reply.md`, `../outputs/plan.md`, `../outputs/evidence.md` (relative to fixture).
```

The saved review preserved round 1 and appended round 2. This excerpt shows the
history, verdict, and scope; the complete record also stored the plan and
evidence-file SHA-256 values:

```markdown
| Round | Date | Verdict | Blockers |
| --- | --- | --- | --- |
| 1 | 2026-09-27 | OKAY | 0 |
| 2 | 2026-09-28 | REJECT | 3 |

### Round 2

**Verdict:** PLAN-REVIEW: REJECT (3 blockers)
**Mode:** review; confidence challenge, round 2/5 since first round; no loop consent.
**Scope:** whole plan; 8/14 required obligations verified; 0/3 critical flows verified. Contradicted obligations are counted, not silently treated as unverified.
```

The full ledger had fourteen rows. Four of its evidence rows were:

```markdown
| ID / obligation / owning todos | Required? | Evidence kind and location | Observed result | Planned QA | Status |
| --- | --- | --- | --- | --- | --- |
| C01 Legacy executable and bank on explicit rollback / T1 | yes | Source `upgrade.sh:6,18-21`; executed post-install probe | `legacy/bin/memory` executable, seeded bank unchanged, `new-home` absent | T1 failure/explicit rollback tests | verified |
| C02 Hook usable after rollback / T1, F1, F3 | yes | Source `upgrade.sh:9-14,18-21`; executed post-install probe | Hook prints `{}` instead of invoking legacy executable | T1 only asserts directories/bank | contradicted |
| C05 Unrelated settings preserved / T1, F1, F3 | yes | Source `upgrade.sh:16,18-21`; executed unrelated-value probe | Preexisting `false` and `label` replaced with `true` on success and rollback | T1 says preserve unrelated key, without asserting exact value | contradicted |
| C06 Failure during install has recovery / T1, F3 | yes | Source `upgrade.sh:7-16`; executed mid-install failing-`cat` probe | Exit 17 before rollback; destination remains | T1 only injects failure after `install_new` | contradicted |
```

The complete record included all three critical-flow traces and Checks A–J.
Its closing evidence and gate entries included:

```markdown
#### Unverified

- None left as a required evidence gap; demonstrated blockers determine REJECT. No source windows skipped (2 distinct external-to-plan windows, within 40); no URLs needed (0/5).
- Planned implementation tests not run: `tests/check_rollback.py` does not exist yet; its future runs are planned QA, not evidence of correctness.
- Owner waivers: None.

#### Notes (non-blocking)

- The README's syntax check passed, but cannot assess recovery semantics.
```

```text
Approval gate: FAIL — 8/14 required obligations verified and 0/3 critical flows verified; three demonstrated execution blockers remain. All checks A–J accounted for; no approval precondition inferred from prior OKAY.
```

The plan ended with `status: planned` and `review_round: 2`. The previous approval
remained in the history, explicitly superseded by the new evidence. No fix loop
started because the prompt requested only one review round.
