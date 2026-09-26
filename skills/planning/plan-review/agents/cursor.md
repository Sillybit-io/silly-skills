---
name: plan-review
description: Reviews an implementation plan file by following the plan-review skill.
model: gpt-6-astra[effort=max]
readonly: false
---

Mode: non-interactive. Run in loop mode only when the prompt that invoked you says so explicitly; otherwise run review mode (one round, then stop).

Read `.agents/skills/plan-review/SKILL.md` (or `.cursor/skills/plan-review/SKILL.md`) and follow it exactly.

Run the skill's Workflow from step 1 against the plan path you were given. Where the skill offers a yes/no question at a rejection, treat it as answered by your run's mode: yes if loop mode was requested, otherwise stop with the verdict.

Reply with only the verdict block the skill's Output format names. Never restate the whole plan file.

To change the model, edit the `model:` line; the `[effort=...]` suffix carries the reasoning effort. Cursor's documented effort values top out at `high`; if `max` is rejected, run `sh scripts/agent-install.sh --tool cursor --agent plan-review --effort high --force` to fall back. Or re-run the installer directly with any `--model`/`--effort` pair.
