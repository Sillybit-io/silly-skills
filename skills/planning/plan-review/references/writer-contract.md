# Writer contract

Read this file when running checks F through I. It restates what `plan-writer` is required to leave in the plan file. A miss is a blocker, same rank as checks A through E.

When more than three flags exist, report in this order: a missing final-wave gate, an unanswered question a todo depends on, missing research, a missing required diagram. Then add one line: "and N more of the same kind."

## Check F — Research

`## Research` is present and either:

- names sources, how others did it, what matters, pros and cons, and what the plan will follow, or
- contains the line `No useful public source found.`

Each source is an `http` or `https` URL. Open at most five. A 404, or a connection failure, is a blocker only when "what this plan will follow" depends on that URL. A 401, a 403, a timeout, or a page the reviewer cannot read is a note, not a blocker. Do not reject a source because the page seems off-topic unless the fetched text contradicts the claim the plan cites. If the network is unavailable, say so under Checked and do not invent a blocker. A "no useful public source" line has nothing to fetch.

## Check G — Questions

`## Questions` has `### Product` before `### Technical`, and neither group is empty. Every item has an answer or a recorded default.

Product is who it is for, what job they are doing, what success looks like, what is out of scope, or which user-facing tradeoff they want. Technical is an approach, a library, data, compatibility, failure behavior, or where the change lives. A question that names a library is technical.

Technical-before-product, a missing group, or an item with neither an answer nor a default is a blocker. Do not judge whether a question was wise.

## Check H — Diagram

`## Design` is present.

A diagram is required when the user asked for a diagram, a flow, or a design, or when the request is about how a process, a user journey, or a system interaction works. A list of file edits is not a flow. The order of the implementation todos does not force a diagram.

When a diagram is required, the section contains a fenced `mermaid` block whose first code line starts with `flowchart`, `sequenceDiagram`, or `stateDiagram`. `flowchart TD` counts. When it is not required, the section contains `Diagram: omitted — <reason>`.

A missing section, a required diagram that is absent, or a required diagram that is not one of those three types is a blocker. An extra diagram on a file-edit plan is not. Do not reject a diagram for node-id style.

## Check I — Final wave

The wave contains todos titled `F1`, `F2`, `F3`, and `F4`, in that order:

- F1 plan compliance: every Must Have is present, every Must NOT Have is absent.
- F2 code quality: the test, lint, and build commands the project defines, plus a slop pass.
- F3 scenario QA: every todo's QA scenario. F3 does not name a browser tool or a screenshot path.
- F4 scope fidelity: the diff matches the spec.

Extra todos titled `F5` onward may sit after `F4`. Fewer than four gates, a missing gate, or a gate out of order is a blocker.

When `ui: yes` — including a plan that adds a web or mobile surface — the automated UI QA todo is present and last. It names the tool, the route or screen, the viewport widths, the steps, the expected result, and a screenshot path under `reports/ui-qa/`. When `ui: no`, that todo is absent and the wave says why in one line.
