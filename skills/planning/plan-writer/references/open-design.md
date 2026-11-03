# OpenDesign project

Read this file when the work uses OpenDesign. The plan then names the OpenDesign project, so the builder and the reviewer open the same design the owner worked on. The result goes in `## Design`, under the diagram or the `Diagram: omitted` line.

## When it applies

The work uses OpenDesign when any of these is true:

- The request, the conversation, or the ticket names OpenDesign, an OpenDesign project, or a design made in it.
- You or the user used OpenDesign for this work: its MCP tools, its CLI, or the app.
- The repository references an OpenDesign project id or project folder.

When none is true, write no block, and do not mention OpenDesign anywhere in the plan. The bundled validator checks the block whenever the spec mentions OpenDesign.

## What to record

Read the project from OpenDesign itself: the MCP `get_project` tool with the project id or name, or the CLI's equivalent. Take its `name`, `id`, `resolvedDir`, and `studioUrl`. Never write them from memory.

- **Project:** the name, and the id in backticks. The id is the one value that never changes.
- **Folder:** `resolvedDir` with the home directory replaced by `~`, in backticks. Never write the absolute path: the plan is committed, and an absolute path names the machine and the user.
- **Link:** the origin of `studioUrl`, then `/projects/<id>`, in angle brackets. Drop `/conversations/…` and `/files/…`: OpenDesign marks a studio URL valid for the current daemon session only, and the conversation part is what stops working first. The link is local and opens only while OpenDesign runs; the line says so.

```markdown
### OpenDesign

- Project: <name> (`<id>`)
- Folder: `~/<path under the home directory>`
- Link: <http://127.0.0.1:<port>/projects/<id>> — local; opens while OpenDesign runs
```

When OpenDesign cannot be reached, or a value is missing, add a frontier item that names the value and the next action, such as "open the project in OpenDesign, then call `get_project`". A folder outside the home directory is an owner question: ask where the design should be referenced from. The plan does not reach `planned` while the block is incomplete.

## Todos that use the design

- Every todo that builds or changes a screen the design covers lists `OpenDesign <id>` under `References`, and its Acceptance checks a selector or a state taken from that design.
- When `ui: yes`, the automated UI QA todo names the OpenDesign link as the expected result's source.
- A design file is not a repository file. Never cite it as `path:line`; name the file inside the project folder in prose.
