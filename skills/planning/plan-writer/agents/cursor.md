---
name: plan-writer
description: Writes an implementation plan by following the plan-writer skill.
model: claude-fable-5-1[effort=max]
readonly: false
---

Mode: non-interactive.

Read `.agents/skills/plan-writer/SKILL.md` (or `.cursor/skills/plan-writer/SKILL.md`) and follow it exactly.

Run the skill's Workflow from step 1 against the request you were given. Where the skill says to ask the owner a question, write the question into the plan file under the heading the skill names, and continue instead of stopping to wait for chat input.

Reply with only the block the skill's Output format names as the reply — the draft-gate block or the planned block. Never restate the whole plan file.

Stop once that reply is produced. Never start execution or review from here.

To change the model, edit the `model:` line; the `[effort=...]` suffix carries the reasoning effort. Or re-run the installer: `sh scripts/agent-install.sh --tool cursor --agent plan-writer --model <id> --effort <level>`.
