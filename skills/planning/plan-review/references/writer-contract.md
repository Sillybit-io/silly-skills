# Writer contract

Read this file when running checks F through J. It restates what `plan-writer` is required to leave in the plan file. A miss is a blocker, same rank as checks A through E.

Describe every execution blocker in detail; there is no reporting cap, and a display limit never makes a failed requirement pass. For equally consequential writer-contract misses, prioritize T0, test-before-next, continuation, final gates, unresolved decisions, research, and diagrams.

## Check F — Research

`## Research` is present and either:

- names its sources and what the plan will follow, or
- contains the line `No useful public source found.`

Each source is an `http` or `https` URL. Verify the claim against the fetched content and the target version when the plan relies on a version-specific contract. An inaccessible source is not proof of a defect: record the access failure and any substitute evidence. If a necessary contract remains unverified, the approval gate produces INCOMPLETE unless a demonstrated blocker already requires REJECT. A fetched contradiction is evidence for a blocker. A "no useful public source" line satisfies the format but does not waive a necessary external-contract check.

## Check G — Questions

`## Questions` has `### Product` before `### Technical`, and neither group is empty. Every item has an answer or a recorded default.

Product is who it is for, what job they are doing, what success looks like, what is out of scope, or which user-facing tradeoff they want. Technical is an approach, a library, data, compatibility, failure behavior, or where the change lives. A question that names a library is technical.

Technical-before-product, a missing group, or an item with neither an answer nor a default is a blocker. Do not judge whether a question was wise.

## Check H — Diagram

`## Design` is present.

A diagram is required when the user asked for a diagram, a flow, or a design, or when the request is about how a process, a user journey, or a system interaction works. A list of file edits is not a flow. The order of the implementation todos does not force a diagram.

When a diagram is required, the section contains a fenced `mermaid` block whose first code line starts with `flowchart`, `sequenceDiagram`, or `stateDiagram`. `flowchart TD` counts. When it is not required, the section contains `Diagram: omitted — <reason>`.

A missing section, a required diagram that is absent, or a required diagram that is not one of those three types is a blocker. An extra diagram on a file-edit plan is not. Do not reject a diagram for node-id style.

When the plan, its request, or its ticket shows the work uses OpenDesign, `## Design` has a `### OpenDesign` block with three lines: `- Project:` with the project id in backticks, `- Folder:` starting with `~/`, and `- Link:` ending in `/projects/<id>`. Each of these is a blocker: a missing block or line, an absolute folder path, a link with `/conversations/` or another session-only part, an id that differs from the one OpenDesign reports, or a todo that builds a screen the design covers without `OpenDesign <id>` under `References`. Confirm the id and folder against OpenDesign when it is reachable; when it is not, record that under Unverified. A plan with no sign of OpenDesign needs no block.

## Check I — Final wave

The wave contains todos titled `F1`, `F2`, `F3`, and `F4`, in that order, each with a box and a one-line `Do`. Their full rules live in `plan-builder`, so short standard text is correct. An extra `Acceptance:` line or a gate `F5` onward is allowed. Fewer than four gates, a missing gate, or a gate out of order is a blocker. F3 names no browser tool and no screenshot path.

When `ui: yes` — including a plan that adds a web or mobile surface — the automated UI QA todo is present and last. It names the tool, the route or screen, the viewport widths, the steps, the expected result, and a screenshot path under `reports/ui-qa/`. When `ui: no`, that todo is absent and the wave says why in one line.

## Check J — Todo boxes, standard sentences, T0, and strict fields

Each of these is a blocker. Judge what the text says, not its exact wording:

- Every todo under `## Todos` and every gate under `## Final verification wave` starts with `- [ ] Open` on a freshly planned file. Do not reject a box that is already `- [x]` on a re-review after the build has started.
- The `## Todos` introduction says, in one sentence or more, that a todo passes its Acceptance and every QA part and commits when it says `Commit: yes` before it is marked Done, and that the final wave is exempt. An introduction that applies this rule to the final wave is a blocker.
- `## Execution strategy` says, above the wave list, that the build runs T0, then each wave in order, then the final wave, without stopping to ask, and that a failing todo is fixed and its checks rerun until they pass. An instruction to stop after a wave, or to stop and wait when a check fails, is a blocker.
- `T0` is the first todo. It copies the plan directory into `docs/plans/` when it is not already there and commits it as `docs(plans): add <slug> plan`. Its details live in `plan-builder`. A missing T0, or a T0 that copies unconditionally or overwrites a destination, is a blocker.
- Every todo has a `Strict:` field. A todo whose changes touch security, sign-in, or permissions, or production and shared services, says so; when unsure, it counts as strict. A strict todo marked `no` is a blocker.
- Every todo's QA scenario labels its parts, such as `happy — ...; failure — ...`, or marks a part `n/a`, so the builder knows which checks to record.
