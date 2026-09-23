---
name: ai-audit
description: Runs a full read-only health audit of how a project uses AI. It inventories every AI surface, including prompts embedded in code, skill files, agent configuration files, tool and MCP descriptions, and every model ID the project references, checks each surface against a checklist fetched from upstream, assigns each finding a severity from critical to info, and writes one deep-dive report file. Use when you say audit this project's AI usage, check our prompts and skills for problems, run an AI health check, are our prompts out of date for the current model, review our agent configuration, or find the dead prompt instructions in this repository. It also audits against Mastra guidance when the project depends on Mastra. It reads the audited project and writes nothing there except its own report.
license: CC-BY-ND-4.0
metadata:
  version: "0.1.0"
  category: ai-health
---

# ai-audit

## Purpose

ai-audit inspects how a whole project uses AI and writes one deep-dive report about it. The surfaces it reads are the ones nobody owns: a system prompt assembled across three files, a skill file that grew one line per incident, a tool description that no longer matches what the tool returns, a model ID pinned two releases ago. Each of those is text that reaches a model on every request, and none of them fail loudly. This skill finds them, judges each against a published checklist, gives every finding a severity, and reports the result. It audits the project you point it at, which is usually not this repository. It reads that project and changes nothing in it except the single report file it creates.

## When to use / when NOT to use

Use ai-audit when you:

- Want a full audit of a project's prompts, skills, agent configuration, and tool descriptions.
- Are about to change the model a project targets, or just changed it.
- Inherited a repository whose prompt text nobody can justify.
- Want findings ranked by severity and kept in a file you can act on later.
- Want a per-area verdict on prompts, skills, config files, and tool descriptions.

Do NOT use ai-audit when you:

- Want one pull request or diff reviewed. Use ai-review.
- Want the findings fixed. This skill reports and proposes in words. It applies nothing.
- Want prose documentation rewritten. Use doc-cleanup.
- Want only a credential and privacy scan. Use secret-and-privacy-sweep.
- Are looking at a project with no prompts, no skill files, no agent config, and no model IDs. Say so and stop.

## Workflow

1. Fix the scope and name the target model before you read anything. Scope covers whatever path the user points you at; absent such a pointer, treat the entire audited project as in scope. Which model reads the surface decides what counts as cruft — wording an older generation truly depended on can turn into inert filler once a stronger successor reads it — so no finding is valid until a target model has been named. Settle that target by looking first at the request itself, next at any migration the project has written down, and last at the freshest model identifier appearing anywhere in the project's source or prose. Record the scope and the resolved model in the report header before anything else.
2. Fetch the base checklist into a temporary directory outside the audited project, so that nothing lands in its working tree. Create the directory first and write both the body and the response headers into it:

   ```sh
   audit_tmp="$(mktemp -d)"
   curl -sS --fail -D "$audit_tmp/headers.txt" \
     -o "$audit_tmp/prompt-audit.md" \
     https://raw.githubusercontent.com/anthropics/skills/main/skills/claude-api/shared/prompt-audit.md
   ```

   Then record which revision you fetched, so the report is reproducible. Use the first handle available:

   ```sh
   gh api 'repos/anthropics/skills/commits?path=skills/claude-api/shared/prompt-audit.md&per_page=1' \
     --jq '.[0] | {sha: .sha, date: .commit.committer.date}'
   ```

   If `gh` is absent or unauthenticated, record the `etag` value from `$audit_tmp/headers.txt`, which is a content hash of the bytes you actually received. If neither is available, record the UTC fetch timestamp. Put whichever handle you got in the report header and say which kind it is. The checklist also points at two sibling files, `model-migration.md` and `prompt-caching.md`, in the same upstream directory. Fetch them into `$audit_tmp` the same way when a finding turns on a per-model error or on cache ordering, and record their revisions too. Everything downloaded during the audit stays under `$audit_tmp`; the audited project receives no file from this step.
3. If the fetch fails for any reason, a network block, a 404, a moved path, or a rate limit, use the embedded fallback checklist below instead. Say in the report that the fetch failed, give the reason, and name the fallback as the checklist that was used. Never continue silently on a failed fetch, and never reconstruct the upstream checklist from memory.
4. Inventory every AI surface in the audited project, and write the list into the report before you judge any of it. The inventory covers:

   - Prompts embedded in code. Look for string literals passed to an LLM API call, including prompts assembled from template files, f-strings, and conditional fragments.
   - Every skills directory that may exist: `skills/`, `.claude/skills/`, `.agents/skills/`, and `.opencode/skills/`.
   - `CLAUDE.md` and `AGENTS.md`, at the repository root and nested.
   - `.cursorrules` and every file under `.cursor/rules/`.
   - `opencode.json` and anything under `.opencode/`.
   - Claude Code settings, such as `.claude/settings.json` and its local variants.
   - Tool descriptions, including MCP server tool and parameter descriptions, wherever they are defined.
   - Every model ID referenced anywhere in the project, in code, in configuration, in documentation, and in lock files.

   A surface you could not read, because it is generated at runtime or lives outside the repository, goes in the report as a gap. Do not guess its contents.
5. If the audited project's `package.json`, or the equivalent manifest for its language, depends on `mastra` or on any `@mastra/*` package, audit its agent, tool, workflow, and memory definitions against Mastra's documented best practices as well. Cite `mastra.ai/docs` as the source for every Mastra-specific finding, and name the specific guidance you applied. Skip this step entirely when the dependency is absent, and say in the report that it was skipped.
6. Judge each inventoried surface against the checklist. Verify every finding against the file before you write it: open the line, read its context, and drop the finding if it does not survive that check. Keep the checklist's own restraint rule, because it is the part an audit gets wrong most often. Size is not the defect, and a word count is not an argument. Whatever the model has no way to work out for itself stays on the page: how the surrounding system actually behaves, the rationale that put each constraint there, what the product is for, the standard the output is judged by, and who ends up reading it. A prohibition that heads off a mistake the target model still makes stays. Where only one route through an operation avoids damage, spelling out each command verbatim is the right call. Tool descriptions usually fail by saying too little, not too much, so the fix there is often more text. An audit may end with no findings at all; when a surface holds up, log it as clean and leave every line of it alone.
7. Give every finding exactly one severity: `critical`, `major`, `minor`, or `info`. Use the table below. Then write the per-area health summary, one line for each of prompts, skills, config files, and tool descriptions, so a reader sees which area needs attention without reading every finding.
8. Write the report. Create `reports/` inside the audited project if it does not exist, then write to `reports/ai-audit-<YYYY-MM-DD>.md` using today's date. If that exact file already exists, append a numeric suffix and write `reports/ai-audit-<YYYY-MM-DD>-2.md`, then `-3`, and so on until the name is free. Never overwrite an existing report.
9. Say where the report is, which checklist revision it used, and how many findings it holds at each severity. Then walk the QA checklist.

### Embedded fallback checklist

Use this only when step 2's fetch failed. It is a shorter checklist built from the same ideas as the upstream one, restated in this project's own words, and it keeps the restraint rule from step 6. Put one test to every line of every surface ahead of all the others: would the model arrive at this unprompted? A line it would reach on its own is a candidate for removal; a line carrying knowledge that only the person who wrote the surface holds stays where it is.

| Area | Ask on every surface |
| --- | --- |
| Role and context clarity | Can a reader tell from the text who it serves, what is being built, what the runtime looks like, and what counts as good work? One sentence of persona costs nothing; raise it only where that sentence is standing in for all of the above. |
| Instruction specificity | Does the latitude the text allows track the cost of getting this particular task wrong? A numbered script imposed on a judgment call leaves too little room. Loose prose covering a deletion or a login flow leaves far too much. |
| Output-format contracts | Is the shape of the answer declared once, and checked by machinery rather than by prose wherever machinery can do it? Raise hand-built format scaffolding that a structured-output setting now handles, together with the stop sequences, re-parse loops, and trailing assistant turns that grew up around it. |
| Example quality | Do the samples span a range and announce themselves as samples, or does a single showcase answer lock in the cadence of whatever model it was written against? Samples survive where the output really does have to land in one exact shape. |
| Tool-description accuracy | Does the text promise exactly what the tool delivers and withholds, name every argument, and say where the tool is the wrong reach? Too little detail is the usual fault here, so expect the repair to lengthen the entry. Worked examples and nudges about conversational behaviour belong somewhere else. |
| Model fit | Was this written for the model named in step 1, or for the one before it? Piled-up emphasis now fires the behaviour more often than anyone wanted, and a softener such as try to or if possible sitting on top of a hard requirement now reads as permission to skip it. |
| Deprecated-model usage | Do retired model identifiers still sit in source, configuration, prose, or comments? Does any patch here exist to route around behaviour that only an earlier generation showed? Does the request carry arguments or headers the target model will refuse? |
| Token efficiency | Is each paragraph worth what it costs every time the surface loads? A skill pays its full size on each trigger. Raise copies of one rule that have drifted into disagreeing with each other, and raise restatements added to make a point land harder. A smaller file is never on its own a reason to cut. |
| Eval and regression coverage | Would anything notice if this text quietly stopped working? Raise instructions that no test, hook, or reviewer ever looks at, above all the ones the project's own logs show being ignored. Raise a missing per-surface cost breakdown too, since without one none of the other answers can be measured. |

### Severity scale

| Severity | Meaning |
| --- | --- |
| `critical` | The surface is broken or unsafe as written. A rejected parameter, a retired model ID on a live path, a tool description that contradicts the tool, or a prompt that leaks data into a place it must not reach. |
| `major` | A real defect that degrades output or will cost significantly more to fix later. Contradictory duplicated rules, a prompt calibrated for a retired generation, a materially under-described tool. |
| `minor` | A genuine improvement with a small cost. Stale wording, a narrow conditional that a principle would cover, mild redundancy. |
| `info` | An observation with no action attached. A gap you could not read, a low-confidence idiom match, or a surface confirmed clean. |

## Output format

Write one report file in this shape. Proposed changes are report text only. Nothing in the report is applied to the audited project.

````markdown
# AI health audit — <project name> — <YYYY-MM-DD>

> AI-generated audit. An automated agent read this project's AI surfaces and wrote these findings. Each item is a claim to check, not a verdict.

**Scope:** <paths audited, or "whole project">
**Target model:** <model ID> — resolved from <request | migration doc | repository reference>
**Checklist:** upstream prompt-audit at <commit SHA | etag | fetch timestamp UTC>, kind `<sha|etag|timestamp>`
**Mastra audit:** applied, citing mastra.ai/docs | skipped, dependency absent

## Health summary

| Area | Verdict | critical | major | minor | info |
| --- | --- | --- | --- | --- | --- |
| Prompts | <one line> | 0 | 1 | 2 | 0 |
| Skills | <one line> | 0 | 0 | 1 | 1 |
| Config files | <one line> | 1 | 0 | 0 | 0 |
| Tool descriptions | <one line> | 0 | 2 | 0 | 0 |

## Inventory

| Surface | Path | Read |
| --- | --- | --- |
| Prompt in code | `path/to/module` | yes |
| Skill file | `path/to/SKILL.md` | yes |
| Agent config | `path/to/config` | yes |
| Tool description | `path/to/tools` | yes |
| Model ID | `path/to/file:12` | yes |
| Runtime-assembled prompt | `path/to/builder` | no — assembled at run time |

## Findings

### 1. [critical] <one-line title> — `path/to/file:42`

- **Area:** config files
- **Evidence:** the offending line, reproduced word for word.
- **Checklist item:** which checklist area or row it matches.
- **Why it matters:** the consequence for the target model, concretely.
- **Proposed change:** what to change, in words. Not applied.

### 2. [major] <one-line title> — `path/to/other:88`

- **Area:** tool descriptions
- **Evidence:** a verbatim quotation of the text in question.
- **Checklist item:** tool-description accuracy.
- **Why it matters:** the cost you expect, and when it lands.
- **Proposed change:** the text to add. Not applied.

## What I checked

| Surface | Checklist areas | Result |
| --- | --- | --- |
| `path/to/file` | <areas of the checklist actually used> | finding 1 |
| `path/to/other` | <areas of the checklist actually used> | finding 2 |
| `path/to/third` | <areas of the checklist actually used> | clean |

## Not covered by this audit

- <what you could not read, and why: runtime assembly, external service, no access.>
````

Rules for the report:

- Order findings by severity, `critical` first, then by path.
- One finding per block. Do not merge two problems into one entry to shorten the list.
- The health summary and the "What I checked" table are mandatory in every report, and above all in a report with no findings. Reporting a surface as clean is a real result; handing back nothing at all is not.
- Fill the "Checklist areas" column from whichever checklist step 2 actually produced. The upstream file is not organised into nine areas, so write `all nine` only where the embedded fallback was the checklist in play.
- Name the checklist revision and its kind in the header. A report that cannot say which checklist it used is not reproducible.
- State proposed changes in words. Do not attach a patch and do not apply one.

## Guardrails

MUST:

- MUST fix the scope and the target model up front, before opening a single file, and record both in the report.
- MUST attempt the pinned upstream fetch first, and MUST record which revision was fetched, as a commit SHA, an `etag`, or a UTC timestamp, naming which kind it is.
- MUST say in the report when the fetch failed, why it failed, and that the embedded fallback checklist was used instead.
- MUST inventory every surface named in the workflow, and MUST list the inventory in the report before any judgement.
- MUST record a surface it could not read as a gap rather than guessing its contents.
- MUST audit against Mastra guidance when the manifest depends on `mastra` or `@mastra/*`, and MUST cite `mastra.ai/docs` for each such finding.
- MUST give every finding exactly one severity from `critical`, `major`, `minor`, `info`.
- MUST include a per-area health summary covering prompts, skills, config files, and tool descriptions.
- MUST verify a finding against the file at its cited line before writing it.
- MUST write the report to `reports/ai-audit-<YYYY-MM-DD>.md` in the audited project, creating `reports/` if needed, and MUST use the next free numeric suffix when that name is taken.
- MUST describe a discovered credential by location and kind only. Point at `file:line`, name what kind of value it is, and never repeat the value itself.
- MUST report what it could not check, and why.

NEVER:

- NEVER change anything in the audited project except creating its one report file. No code, no prompts, no skill files, no configuration, no dependencies.
- NEVER overwrite an existing report, including one written earlier the same day. Add a numeric suffix instead.
- NEVER apply a proposed change, and never attach a patch that a later step could apply by accident.
- NEVER create a branch, a commit, or a tag, and never push.
- NEVER paste a secret value, a token, a private key, a password, a personal email address, or a customer identifier into the report. Location and kind only.
- NEVER argue for cutting text on the grounds that it shrinks the file. A long surface is not, by that fact, a padded one.
- NEVER file a finding against what the product is meant to do, the bar the work is measured against, the audience it is written for, the reasoning that put a constraint in place, or the operating realities of the system around it. None of that is recoverable by the model unaided, so it stays on the page.
- NEVER recommend trimming a tool description that is already too short. Say what to add.
- NEVER invent a finding so the report looks thorough, and never invent checklist content. Fetch it or use the embedded fallback.
- NEVER report a surface as clean without listing it in the "What I checked" table.
- NEVER pin a model ID or a checklist line into this skill. Both rot; read them from the project and from upstream at run time.

## QA checklist

Run this list before you hand over the report.

- [ ] The scope and the target model are named in the report header.
- [ ] The upstream fetch was attempted, and its revision handle plus kind is in the header.
- [ ] A failed fetch is reported with its reason, and the fallback checklist is named as the one used.
- [ ] Every surface in the workflow inventory was searched for, and the inventory table lists what was found.
- [ ] Surfaces that could not be read appear as gaps, not as guesses.
- [ ] The Mastra step was applied with a `mastra.ai/docs` citation, or reported as skipped.
- [ ] Every finding was verified at its cited line before it was written.
- [ ] Every finding carries exactly one severity from `critical`, `major`, `minor`, `info`.
- [ ] Findings are ordered by severity, `critical` first.
- [ ] The per-area health summary covers prompts, skills, config files, and tool descriptions.
- [ ] The "What I checked" table lists every inventoried surface, including the clean ones.
- [ ] No cut is defended on the grounds that it shrinks the file, and nothing the model had no way to reach on its own was raised as a finding.
- [ ] No under-described tool description was told to get shorter.
- [ ] The report contains no secret value, no personal data, and no customer identifier.
- [ ] The report is at `reports/ai-audit-<YYYY-MM-DD>.md`, or at the next free numeric suffix, and no prior report was overwritten.
- [ ] Nothing in the audited project changed except that one report file.
- [ ] The limits of the audit are stated.

<!-- markdownlint-disable-next-line MD034 -->
© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.
