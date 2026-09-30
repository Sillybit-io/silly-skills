# Planning evaluation fixtures

Everything under this directory is made up: an invented Python service, an invented two-file greeter, invented plans, and invented scoring keys. None of it is a real project, real credentials, or real user data — it exists only so the planning skills (`plan-writer`, `plan-review`, `plan-scout`, `plan-builder`, `plan-loop`, `plan-result-review`) have something concrete to read, edit, and be graded against.

Inputs and the protocol for the planning skills' behavioral evaluations (E1–E8). The deterministic checks in `scripts/planning-fixtures.test.ts` prove that every seed fails or passes as advertised. They never call a model. Model runs happen outside `bun test` and CI.

## Layout

| Path | Contents |
| --- | --- |
| `projects/hidden-consumer/` | A Python service. One entry point has 23 relevant producers and consumers: direct and transitive callers, a string-based plugin registration, configuration, key-format readers, an ops script, docs, and tests |
| `projects/two-todo/` | A two-file Python greeter for build and result-review runs |
| `plans/` | Plans in the plan-writer 0.5.0 format. Each validates with `bun run validate-plan` inside its materialized project |
| `harness.ts` | Materializes a case into a new directory. It also builds the E5 and E6 git states and their D4 snapshots with its own snapshot writer |
| `ground-truth/` | Scoring keys. Evaluator-only |

`../rollback/` holds the rollback installation and scripts.

The plans cite fixture files by line and SHA-256. After editing a fixture file, update the citations that name it. `bun test scripts/planning-fixtures.test.ts` reports any excerpt or digest that no longer matches.

## Keep ground truth out of the run

1. Materialize the case into a new directory outside this repository:

   ```sh
   bun scripts/fixtures/planning/harness.ts list
   bun scripts/fixtures/planning/harness.ts materialize rollback-prior-okay /tmp/eval-e2-1
   ```

2. Start the agent with that directory as its working directory, and name only that directory in the prompt.
3. Install the skill under test into that directory, or load it from the skill's installed location. Never point the agent at this repository.
4. After the run, search the transcript for `ground-truth`, `scripts/fixtures`, and this repository's path. A run that read any of them is void and is recorded as void.

A host whose tools can read the whole filesystem cannot enforce step 2. The transcript audit is the control, and its limit is stated with the results.

## Cases and prompts

Use the prompt text exactly. The no-skill baseline gets the same directory and the same request, without the skill.

| Eval | Case | Prompt | Expected, scored against |
| --- | --- | --- | --- |
| E1 fresh | `hidden-consumer` | `Use the plan-writer skill non-interactively. Request: "Change app/core/rate_limit.py to a sliding-window limit instead of fixed windows. Keep check_rate_limit's signature." Record defaults instead of asking.` | Every relevant path in `ground-truth/hidden-consumer.json` is inspected or excluded with a reason; `status: planned` only with an empty frontier |
| E1 resume | `hidden-consumer-paused` | `Use the plan-writer skill non-interactively to resume docs/plans/2026-09-28-sliding-window-rate-limit.md.` | The open frontier is investigated before any todo is written; same coverage key |
| E2 | `rollback-prior-okay` | `Use the plan-review skill on docs/plans/2026-09-27-memory-new-home.md. One review round. Do not fix the plan.` Then, in the same session: `Are you sure?` | REJECT with S1–S3; the challenge keeps every supported blocker |
| E2 five | `rollback-five-blockers` | `Use the plan-review skill on docs/plans/2026-09-28-memory-new-home-with-cron.md. One review round. Do not fix the plan.` | REJECT with S1–S5, each with a fix |
| E3 clean | `rollback-clean` | `Use the plan-review skill on docs/plans/2026-09-28-memory-upgrade-rollback.md. One review round. Do not fix the plan.` | OKAY with a complete gate record |
| E3 contract | `rollback-missing-contract` | Same prompt with `docs/plans/2026-09-28-memory-upgrade-hook-protocol.md` | INCOMPLETE naming the unreachable 3.0 contract |
| E3 drift | `rollback-clean` after an E3 clean OKAY | Append a line to `hook.sh` without committing, then: `Use the plan-review skill to check whether docs/plans/2026-09-28-memory-upgrade-rollback.md is still approved.` | The earlier approval is not reused |
| E4 | `hidden-consumer` | `Use the plan-scout skill: find every producer and consumer of app/core/rate_limit.py.` | Paths, excerpts, and search scopes for the coverage key; no verdict; repository bytes unchanged |
| E5 | `build:dirty-disjoint`, `build:mixed-owner` | `build this plan: docs/plans/2026-09-28-greeter-shout.md` | `ground-truth/build.json` |
| E6 | `result:<variant>` | `Use the plan-result-review skill to compare the implementation with docs/plans/2026-09-28-greeter-shout.md.` | `ground-truth/result-review.json` |
| E7 | `rollback-five-blockers` with the personas installed | `Use the plan-loop skill: review docs/plans/2026-09-28-memory-new-home-with-cron.md, fix it, and re-review until approved.` | Distinct writer, fixer, and reviewer sessions; a whole-plan gate before any OKAY; a handback when a child cannot launch |
| E8 | `greeter-reviewed` in each host | `build this plan: docs/plans/2026-09-28-greeter-shout.md` to the normal coding agent | Loaded skill and version, actual model, delegation tree, and receipts |

## Matched runs

- Run the skill cohort and the no-skill cohort from identical materialized inputs, in fresh sessions, with the same prompt text.
- F5 repeats E1, E2, E3, and E6 three times per cohort on the final skill revision.
- Keep every run, including failures, in ignored `reports/planning-evals/<run-id>/`. Record the fixture case, the skill file SHA-256, host and version, the model that actually ran, the prompt, and the raw output or transcript.
- Score each run for missed required seeds, false approvals, clean-control rejections, and uncovered consumers or artifacts. Report every run, not the best one.
- The skill cohort passes with zero false approvals, zero missed required seeds, and no clean-control rejection. The baseline may do as well; say so when it does. No finite evaluation proves a skill always works.
