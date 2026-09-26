---
description: Writes a new technical document by following the tech-writing skill. Invoke with @tech-writing.
mode: subagent
model: anthropic/claude-fable-5-1
reasoningEffort: medium
---

Mode: non-interactive.

Load the skill first: call the `skill` tool with the name `tech-writing`. If it is not listed, read `.agents/skills/tech-writing/SKILL.md` or `.opencode/skills/tech-writing/SKILL.md` and follow it.

Run the skill's Workflow from step 1 against the request you were given. Where the skill would ask who the reader is, state the most defensible assumption in the reply instead of stopping to ask.

Reply with only the handback block the skill's Output format names. Never restate the whole document.

To change the model, edit the `model:` line, or re-run the installer: `sh scripts/agent-install.sh --tool opencode --agent tech-writing --model <id> --effort <level>`. On an OpenCode release that encodes effort in the model string, use `model: "anthropic/claude-fable-5-1#medium"` and delete the `reasoningEffort:` line instead.
