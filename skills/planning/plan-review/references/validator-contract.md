# Validator contract

Read this file when you write or check the machine-readable parts of a plan: the evidence index, a review round's gate record, or the build record. The validator is `scripts/validate-plan.ts` in this skill's directory. It uses Bun or Node built-ins only.

```text
bun <plan-review-base>/scripts/validate-plan.ts <plan> [--review [--resume]] [--root <project>] [--json]
bun <plan-review-base>/scripts/validate-plan.ts <plan> --todo <T<n>|F<n>> [--root <project>]
bun <plan-review-base>/scripts/validate-plan.ts <plan> --gate-skeleton [--root <project>]
bun <plan-review-base>/scripts/validate-plan.ts --init --title <title> --slug <slug> --request <text> --intent <intent> --tier <tier> --branch <branch> [--source <chat|ticket:<id>>] [--date <YYYY-MM-DD>] [--ui <yes|no>] [--root <project>]
bun <plan-review-base>/scripts/validate-plan.ts --grammar
bun <plan-review-base>/scripts/stamp-evidence.ts <plan> [--root <project>]
```

In this repository, `bun run validate-plan <plan> ...` runs the same code.

- `--todo` prints one todo or final gate, its slice, the gap rows it closes, the Behavior lines it serves, its dependencies' titles, its strict areas, the check ids its pass receipt must record, and the Must Have and Must NOT Have lines. For a todo in a slice that names a branch, the branch it prints is the slice's, and the last todo of a slice also gets the slice's independent test. A todo child reads this instead of the whole spec. It does not validate.
- `--gate-skeleton` prints a gate record for the next round: every required target already in an obligation (one per requirement, one for all Behavior lines, one per todo with its dependencies, one for all slices, one per final gate, flow, contract, and check), every status `unverified`, and `verdict: INCOMPLETE`. The reviewer fills in evidence and statuses, and splits an obligation when its targets' evidence or status differs. It does not validate.
- `--init` creates a new plan directory, `docs/plans/<stem>/` under the root with `<stem>` as `<date>-<slug>`, and prints the spec path. It writes two files. The spec is a draft with every section and Scope subsection in order, `## Behavior` after `## TL;DR`, T0, an empty todo template, the four final gates, and a placeholder line, `<!-- todo: <slot> -->`, in every empty slot. The evidence index's baseline holds the HEAD revision and the dirty paths, or `"nonGit": true` outside git. The slug is words of lower-case letters and digits joined by single hyphens, and the intent, tier, source, date, and ui values must pass the frontmatter rules; the defaults are `chat`, today's date, and `no`, and `review` is `required` for the `architecture` tier. It never overwrites a file or merges into a directory: when `docs/plans/<stem>` exists, it tries `-2`, `-3`, and so on. A bad argument, or a `docs/plans` that resolves outside the root, exits 2 with one `error:` line and writes nothing. A fresh skeleton reports two `QUESTIONS` errors and one `FLOW` error, and its todo template cannot reach `planned`.
- `--grammar` prints the Plan grammar and Field caps sections of this file, as they stand. It takes no other argument. The validator reads this file only for `--grammar`.
- `stamp-evidence.ts` fills the empty `sha256` of every source citation with the SHA-256 of the cited file as it is now. It never changes a filled hash or any other file. Exit 1 names a cited file it could not read.

## Format 1

This contract is format 2: the evidence index, the gate record, and the build record carry `schemaVersion: 2`. A format 1 record is a `FORMAT_1` error: "This plan uses format 1. Finish it with the plan skills from before 2.0.0, or write it again." The build snapshot manifest keeps its own `schemaVersion: 1`.

## Plan files

A plan is a directory, `docs/plans/<stem>/`, where `<stem>` is `<YYYY-MM-DD>-<slug>` (with `-2` appended to both directory and stem on a collision). `<plan>` names the spec, `<stem>.md`. Four siblings sit beside it:

| File | Holds | Written by |
| --- | --- | --- |
| `<stem>.md` | The spec: frontmatter, sections, todos, gates. | plan-writer; review owns `status` and `review_round`; the builder ticks boxes. |
| `<stem>.evidence-index.md` | The evidence index: fenced `json` blocks only, plus a `# Evidence index: <title>` heading. | plan-writer |
| `<stem>.reviews.md` | `## Review` and `## Result review`: each a history table, then every round, newest first. | plan-review, plan-result-review |
| `<stem>.gate-record.json` | The latest review round's gate record, one JSON object. | plan-review |
| `<stem>.build.md` | The build record and its receipts. | plan-builder |

The line directly under the spec's H1 is exactly:

```text
Files: [Evidence index](<stem>.evidence-index.md) · [Reviews](<stem>.reviews.md) · [Gate record](<stem>.gate-record.json) · [Build](<stem>.build.md)
```

A directory name that differs from the stem, a missing or different links line, or a missing evidence index file is `PLAN_FILES`. The reviews, gate record, and build files may be absent until their writer first runs. Each finding's `file` names the file it is about.

## What the result means

| Exit | Meaning |
| --- | --- |
| 0 | The requested record is structurally consistent. This is not approval. |
| 1 | Invalid structure, inconsistent evidence, or unexpected drift. |
| 2 | Invalid arguments or unreadable input, including a missing snapshot. |

`--json` prints one object: `schemaVersion`, `validationMode` (`plan`, `review`, or `resume`), `plan`, `files` (`plan`, `evidenceIndex`, `reviews`, `gateRecord`, `build`), `errors`, `gaps`, `planDigest`, `sourceDigests`, `expectedVerdict`, `recordedVerdict`, `gateRecordDigest`, `gateEligible`, `resumeEligible`, `nextTodo`, `activeTodo`, `recoveryRequired`, `unresolvedAction`, `requiredRechecks`, `reconcileBoxes`, `drift`, and `exitCode`.

- `gateEligible` is true only in review mode, for a complete, consistent OKAY on the current plan and current source bytes.
- `resumeEligible` is true only in resume mode, after the baseline, the unchanged spec, the live approval, the receipt chain, and the current state all check out. Resume mode always reports `gateEligible: false`.
- A plan with slices adds `slices` in every mode: one `{id, name, branch, todos}` per slice, in order, with `branch` null when the slice names none. Resume mode then adds `nextSlice`, the slice of `nextTodo`, or null for T0 and a final gate, and `sliceStart`, true when no todo is active and `nextTodo` is the first todo of `nextSlice`. A plan without slices gets none of the three keys.
- A plan whose spec git ignores adds `planIgnored: true` in every mode, before the slice keys. The spec is ignored when the project root is a git repository and `git check-ignore -q -- <spec>` exits 0 there. Git never reports a tracked file as ignored. Any other plan gets no such key. `--todo` then prints `Plan directory: ignored by git. Leave it out of every commit.` under the branch line.
- A well-formed REJECT or INCOMPLETE round exits 0 and is not eligible. A blocked build receipt exits 0 and is not eligible.

The validator never edits files, except that `--init` creates a new plan directory, and it never calls a model, fetches a URL, or runs a command from a plan. It checks shape, identity, arithmetic, and agreement. It cannot prove that a reviewer read the code or that a flow works.

## Canonical spec digest

The spec digest identifies the plan's instructions: the spec file and the evidence index together. To compute it:

1. Main digest. Take the spec file. Normalize CRLF and CR to LF. Drop one final empty line. Remove the frontmatter lines that start with `status:` or `review_round:`. Outside code fences, replace each line `- [x] Done` or `- [ ] Open` with `- [ ] Open`. Join the kept lines with LF, add one final LF, and take the SHA-256 of the UTF-8 bytes, in hex.
2. Evidence digest. Take the evidence index file, normalize line endings, drop one final LF, add one LF, and take the SHA-256, in hex.
3. The spec digest is the SHA-256 of `<main digest>\n<evidence digest>\n`.

Any change to a task, decision, dependency, acceptance criterion, citation, or flow changes the digest. Progress and the reviews, gate record, and build files do not. A build snapshot normalizes the spec file to its main digest alone; the evidence index is an ordinary file in the snapshot.

## Canonical JSON

Every digest of a JSON value hashes its canonical JSON. Object keys are sorted, there is no whitespace, and non-ASCII characters are written as themselves, not as `\u` escapes. Numbers are integers. The SHA-256 is taken over the UTF-8 bytes. In JavaScript this is `JSON.stringify` of a key-sorted value. In Python it is `json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)`. Python's default, `ensure_ascii=True`, gives a different digest for any record that holds a non-ASCII character.

## Plan grammar

- **Frontmatter:** exactly `title`, `request`, `source`, `date`, `status`, `tier`, `intent`, `branch`, `ui`, `review`, `review_round`.
- **Top-level sections, in order:** TL;DR, the optional Behavior, Scope, Research, Questions, Design, Execution strategy, Todos, Final verification wave, Success criteria. `## Review`, `## Result review`, and `## Build` in the spec are `SECTION` errors; they live in the sibling files.
- **Scope subsections:** IS / GAP ledger, Risks, Must have, Must NOT have, Critical flows, Baseline. A `### Evidence index` in the spec is a `SECTION` error.
- **Identifiers:** gap rows start with `G<n>`. Must have bullets start `- MH<n>:` and Must NOT have bullets start `- MN<n>:`.
- **Questions:** `### Product` before `### Technical`, neither empty.
- **Design:** a `mermaid` fence whose first line starts with `flowchart`, `sequenceDiagram`, or `stateDiagram`, or the line `Diagram: omitted — <reason>`.
- **OpenDesign:** only when the spec mentions OpenDesign outside a fence, and not in a draft. `## Design` then holds `### OpenDesign` with `- Project:` and the project id in backticks, `- Folder:` starting with `~/`, and `- Link:` with an `http` or `https` URL ending in `/projects/<id>` and no `/conversations/` part. Any miss is an `OPENDESIGN` error.
- **Behavior:** optional. A plan may have one `## Behavior` section, directly after `## TL;DR`. A plan without it skips every rule here. A misplaced or repeated section, and each miss below, is a `BEHAVIOR` error.
  - At every status, each line outside a fence or an HTML comment is a Behavior line, `- B<n> (<case>): Given ..., when ..., then ...`, or an exclusion line, `- No <case> case: <reason>`. Ids count up from B1. The case is `primary`, `alternate`, `error`, or `recovery`. `Given`, `when`, and `then` appear in that order, in any letter case. No word is a file path.
  - From `planned` on, a `primary` line exists, and each other case has a line or an exclusion. Every todo except T0 has a `Serves` field after `Closes gap`, holding `none` or Behavior ids such as `B1, B3`. Every Behavior line is served by at least one todo other than T0.
  - The path check strips wrapping backticks, quotes, and brackets, trailing punctuation, and a trailing line number from each word, and skips a URL. A word is then a file path when it starts with `./`, `../`, or `~/`; when it contains `/` and ends with a dot, one letter, and up to four more letters or digits; or when it has no `/` and ends with a dot and one of `md`, `json`, `ts`, `tsx`, `py`, `sh`, `yml`, `yaml`, `toml`, `lock`, `sql`, `css`, `html`, or `txt`. So `and/or`, `v2.1.0`, `Node.js`, and `/pricing` pass, and `src/app.ts`, `../shared`, `README.md`, and `src/app.ts:12` fail.
  - A vague word in a Behavior line is a gap, `vague word '<word>' in B<n>`, never an error. Like a soft-cap gap, it never changes the expected verdict. The words are fast, quick, quickly, robust, secure, scalable, reliable, efficient, intuitive, seamless, user-friendly, properly, and correctly.
  - There is no rule on the number of lines.
- **Todos:** `### T<n> — <title>`, T0 first. The first line is `- [ ] Open` or `- [x] Done`. The fields are `Do`, `Must not`, `Closes gap`, `Depends on`, `References`, `Acceptance`, `QA scenario`, `Strict`, and `Commit`; a plan with `## Behavior` adds `Serves` (see Behavior). `Strict` is `no`, or the strict areas the todo touches, comma-separated: `security` (security, sign-in, and permissions) and `production` (production and shared services). The labelled parts of `QA scenario`, such as `happy — ...; failure — ...`, name the checks a pass receipt must record; a part whose text is `n/a` is not run. Every gap is closed by a todo other than T0, and every todo other than T0 closes a gap.
- **Waves:** `- Wave <n>: T<a>, T<b> — <note>`. Waves count up from 1. T0 runs alone first. A dependency must sit in an earlier wave. Cycles, same-wave dependencies, and missing producers are errors.
- **Slices:** optional. A slice line in the execution strategy, `- Slice S<n> — <name>. Independent test: <test>`, with an optional `. Branch: <branch>` at the end, the branch in backticks, holds the wave lines after it, up to the next slice line. Wave numbers stay global. From `planned` on, each miss below is a `SLICE` error. A plan without a slice line skips every rule here.
  - A line that starts with the word `Slice`, `- Slice ...` but not `- Slices ...`, parses as a slice line, with a name and a test that are not empty.
  - The first slice line comes before `Wave 1`, so every wave is in a slice.
  - Ids count up from S1, and every slice has at least one wave.
  - Slices change neither the order of todos nor `nextTodo`. The last todo of a slice runs its independent test as the `slice:S<n>` check (see the `pass` event).
- **Final wave:** `### F1 —` through `### F4 —` in order, each with a box. With `ui: yes`, `### Automated UI QA` is the last gate.
- **Success criteria:** every gap has a row, and a named todo closes it.
- **Citations in prose:** every backticked `path:line` or `path:start-end`, and a shorthand `:line` after a path on the same line, must fall inside an evidence index citation for that path. Fenced code is not scanned.

A `draft` plan needs only the frontmatter, the links line, the section headings, Scope, Questions, a valid evidence index, and, when it has `## Behavior`, the Behavior rules that hold at every status. Its frontier and pending coverage may be open, and field caps are not measured.

## Field caps

Each capped field has a soft cap and a hard cap at twice the soft one. Past the soft cap the field is listed under `gaps` as `soft cap: <file>:<line> <field> is <n> <unit> (soft cap <s>)`; the plan still validates and the expected verdict does not change. Past the hard cap it is a `FIELD_CAP` error. Words are counted outside backticked spans, so a command or a path costs nothing.

| Field | Soft | Hard |
| --- | --- | --- |
| Todo `Do` | 150 words | 300 |
| Todo `Acceptance`, `QA scenario` | 120 words | 240 |
| Todo `Must not` | 60 words | 120 |
| `MH<n>` / `MN<n>` bullet, Behavior line | 40 words | 80 |
| TL;DR bullet | 60 words | 120 |
| IS / GAP ledger cell | 60 words | 120 |
| Success criteria proof cell | 30 words | 60 |
| Gate record `observed` and evidence `result`; receipt `note`, check and prerequisite `observed` | 200 characters | 400 |
| A numbered blocker paragraph in a review round | 120 words | 240 |

Output longer than a receipt field allows goes to a log file in the run directory, named by the receipt's `log`.

## Evidence index

The evidence index file holds one fenced `json` object, or several fenced `json` blocks: the validator merges them (arrays concatenate, nested objects merge one level deep, other later keys replace earlier ones), and a duplicate citation or flow id across blocks is an error. A `planned` or `reviewed` plan may not contain a skeleton placeholder line, `<!-- todo: ... -->` (error `PLACEHOLDER`).

```json
{
  "schemaVersion": 2,
  "citations": [
    { "id": "C1", "kind": "source", "path": "src/app.ts", "startLine": 10, "endLine": 12, "sha256": "<64 hex>" },
    { "id": "C2", "kind": "planned", "path": "src/new.ts", "createdBy": "T2" },
    { "id": "C3", "kind": "self" },
    { "id": "C4", "kind": "external", "url": "https://example.com/docs/v2", "version": "2.1",
      "accessed": "2026-09-29", "excerpt": "<quoted contract>", "obligation": "MH1" }
  ],
  "coverage": [
    { "id": "V1", "paths": ["src/app.ts", "src/cli.ts"], "citationIds": ["C1"], "state": "inspected" }
  ],
  "frontier": [],
  "flows": [
    { "id": "FL1", "requirementIds": ["MH1"], "todoIds": ["T1"], "evidenceIds": ["C1"],
      "entry": "cli start", "startingState": "clean install", "effects": ["write config", "register hook"],
      "recovery": "restore config from backup", "counterexample": "failure after the config write" }
  ],
  "baseline": { "revision": "<commit>", "dirty": [], "checks": [{ "command": "bun test", "exit": 0, "result": "12 passed" }] }
}
```

- A `source` citation needs `path`, `startLine`, `endLine`, and `sha256`, the SHA-256 of the whole cited file. The writer leaves `sha256` empty and runs `stamp-evidence.ts` once; an empty hash is a `CITATION` error. The cited range must exist in the file. An `excerpt` is optional; when present it is either the whole cited range or an anchor of one to three consecutive whole lines inside it, with at least ten non-blank characters, compared after trimming the ends and normalizing line endings.
- A coverage row needs `paths` and `citationIds` arrays. `searches`, `producers`, and `consumers` are optional.
- Paths are project-relative. Absolute paths, `..`, and symlinks that resolve outside the project are errors.
- A `planned` path must not exist yet, unless the build file exists. Existing code cannot be relabelled as planned to avoid reading it.
- Coverage `state` is `inspected` (needs at least one citation), `excluded` (needs a boundary `reason`), or `pending`. Pending rows and a non-empty `frontier` are allowed only in a draft.
- An empty `flows` list needs `noRuntimeFlowReason`.

## Gate record

`<stem>.gate-record.json` holds the latest round's gate record, one JSON object:

```json
{
  "schemaVersion": 2,
  "round": 2,
  "planDigest": "<canonical spec digest>",
  "repository": { "revision": "<commit>", "dirty": ["docs/plans/x.md"] },
  "sources": [{ "path": "src/other.ts", "sha256": "<64 hex>" }],
  "evidence": [
    { "id": "P1", "kind": "probe", "command": "bun test x", "inputs": "fixture A", "exit": 1,
      "result": "hook printed {}", "omissions": "no network" },
    { "id": "Q1", "kind": "planned-qa", "command": "bun test y" }
  ],
  "obligations": [
    { "id": "O1", "targets": ["MH1", "T1.start", "T1.acceptance", "T1.qa"], "evidenceIds": ["C1", "P1"],
      "observed": "<actual result>", "plannedQa": "Q1", "status": "verified" }
  ],
  "flows": [{ "id": "FL1", "status": "verified", "counterexample": "failure after the config write", "evidenceIds": ["P1"] }],
  "checks": { "A": { "status": "verified", "evidenceIds": ["C1"], "observed": "<result>" } },
  "blockers": [],
  "verdict": "OKAY"
}
```

`checks` holds A through J. Evidence kinds are `source`, `probe`, `documentation`, `plan-inspection`, and `planned-qa`. Evidence ids may also name evidence index citations. `sources` lists only files the reviewer inspected outside the evidence index; a path the index already cites is a `GATE_RECORD` error, since its digest is recorded there. A `planned-qa` entry is optional: it never supports a status by itself, so a round may leave it out, and an obligation's `plannedQa` field is optional too.

**Rounds.** The reviews file's `## Review` holds a history table (`| Round | Date | Verdict | Blockers | Summary |`, one row per round, a non-empty Summary), then every `### Round <n>`, newest first. The validator reads the round with the highest number, wherever it sits, and the gate record file, whose `round` must equal it. Older rounds stay as they were written; nobody rewrites them. The latest round must still carry every unresolved item, so a fix or a build never needs an older one.

**Required targets.** Every one needs a required obligation (`required` omitted or `true`): each `MH<n>` and `MN<n>`; `behavior:B<n>` for every Behavior line; `T<n>.start`, `T<n>.acceptance`, and `T<n>.qa` for every todo; `dep:T<a>:T<b>` for every dependency; `slice:S<n>` for every slice; `F<n>.acceptance` for every final gate; `flow:<id>` for every Evidence index flow; `contract:<id>` for every external citation; and `check:A` through `check:J`. Setting `required: false` does not cover a target.

**Evidence rules.** A verified or contradicted obligation cites evidence. Evidence of kind `planned-qa`, or a `planned` citation, alone cannot support it: a future test is not evidence. Every contradicted obligation is named by a blocker with `location`, `failure`, `evidenceIds`, and `fix`.

**Expected verdict**, in this order:

1. Any contradicted required obligation, flow, or check gives REJECT.
2. Otherwise, any uncovered target, unverified obligation, or missing or unverified flow or check gives INCOMPLETE.
3. Otherwise, OKAY.

The recorded verdict must equal the expected verdict. OKAY sets `status: reviewed`. REJECT and INCOMPLETE set `status: planned`. The rendered round must agree with the JSON: the `**Verdict:** PLAN-REVIEW: ...` line and its blocker count; a `**Scope:**` line containing `<v>/<r> required obligations verified` and `<v>/<r> critical flows verified`; the last row of the history table; the history row for the latest round; and, under `#### Open obligations`, one row for every obligation whose status is not `verified`, its id first and its status in the last cell. Verified obligations are not rendered; the gate record holds them, and a round with no open obligation needs no list. Every rendered row must name a gate record obligation with the same status; duplicate ids are errors. `planDigest` must equal the current spec digest, and every `sources` entry must match the current file bytes. `gateRecordDigest` is the SHA-256 of the gate record's canonical JSON.

## Build record and snapshots

`plan-builder` writes `<stem>.build.md`: a `# Build: <title>` heading, then one fenced `json` block holding the build record with `"receipts": []`, then one fenced `json` block `{"receipts": [<receipt>]}` appended per receipt. The validator merges the blocks in order. Nothing else in the file is read.

```json
{
  "schemaVersion": 2,
  "runId": "2026-09-29-feature-r1",
  "runDir": "silly-skills/plan-builds/2026-09-29-feature-r1",
  "repository": { "kind": "git", "rootCommits": ["<commit>"], "branch": "feat/x" },
  "baseRevision": "<commit>",
  "approval": { "specDigest": "<digest>", "round": 2, "verdict": "OKAY", "gateRecordDigest": "<digest>" },
  "baseline": { "snapshot": "silly-skills/plan-builds/2026-09-29-feature-r1/baseline", "manifestSha256": "<digest>", "stateDigest": "<digest>" },
  "skill": { "name": "plan-builder", "version": "0.1.0", "sha256": "<digest>" },
  "receipts": []
}
```

A snapshot is a directory with `manifest.json` and `objects/<sha256>` raw bytes. In a git project its location is relative to the Git directory: resolve it with `git rev-parse --git-path <snapshot>`. An absolute location is used as given. The manifest has `schemaVersion: 1`, `kind: "silly-skills.build-state"`, `runId`, `repository`, `baseRevision`, `headRevision`, `approvedSpecDigest`, `plan` (`path`, `sha256`, `specDigest`), `administrative` (`plan`, `reports`), `includes`, `stateDigest`, and `paths`.

Each `paths` entry has a `path` and three layers: `head`, `index`, and `worktree`. A layer is `{"state": "absent"}`, `{"state": "unavailable"}` (HEAD and index outside git), or `{"state": "file" | "symlink", "mode", "length", "sha256"}`. A symlink layer stores the link target, never the target's contents. The path set is the union of HEAD, the index (`git ls-files --stage -z`), non-ignored untracked files, every walked `includes` path, and every path of the snapshots the capture carried forward. It keeps deleted, restored, and newly ignored paths as `absent` or retained entries.

`stateDigest` is the SHA-256 of the canonical JSON `{"headRevision": ..., "paths": [...]}`. Declared report paths are left out. The plan's working-tree layer is replaced by `{"state": "plan", "specDigest": ...}`, so appending a receipt is not drift. Paths sort by UTF-8 bytes.

`<stem>.reviews.md` and `<stem>.build.md` change during a build by design, so every capture declares them in `administrative.reports`; `capture-build-state.ts` does this itself. A baseline that does not declare both is a `BUILD_RECORD` error. Report bytes remain in snapshot inventories. Any other file in the plan directory that changes is drift. When git ignores the plan directory, its files are in no snapshot, so the spec digest alone guards the spec and the evidence index.

A receipt:

```json
{
  "seq": 3, "todo": "T1", "event": "pass", "state": "passed", "prev": "<digest of receipt 2>",
  "before": { "snapshot": "...", "manifestSha256": "...", "stateDigest": "..." },
  "after": { "snapshot": "...", "manifestSha256": "...", "stateDigest": "..." },
  "checks": [{ "id": "acceptance", "command": "bun test", "exit": 0, "expectedExit": 0, "passed": true, "observed": "12 passed" }],
  "prerequisites": [{ "targets": ["T2.start"], "sources": [{ "path": "src/app.ts", "sha256": "..." }], "status": "holds", "observed": "..." }],
  "commit": { "sha": "<commit>" },
  "note": "",
  "log": "silly-skills/plan-builds/<run-id>/logs/t1.log"
}
```

A receipt holds only `seq`, `todo`, `event`, `state`, `prev`, `before`, `after`, `checks`, `prerequisites`, `commit`, `note`, and `log`; any other key is `RECEIPT_FIELD`. What changed is the difference between the `before` and `after` snapshots, so a receipt never lists it. `log` is optional. `prev` is the SHA-256 of the previous receipt's canonical JSON, or `null` for the first receipt. A todo with no commit records `{"none": "<reason>"}`. Every receipt has an `after` snapshot.

One record per todo. `event` is one of:

| Event | State | Meaning |
| --- | --- | --- |
| `pass` | `passed` | The todo's Acceptance and every QA part passed and its commit landed. It may be the todo's first receipt, once every dependency passed. `checks` holds a passing `acceptance` check and one passing `qa:<label>` check per QA part that is not `n/a` (`qa` when the scenario has no labels), and the last todo of a slice adds a passing `slice:S<n>` check, the slice's independent test; a missing one is `MISSING_CHECK`. |
| `block` | `blocked` | The todo cannot finish. `note` names what is missing. Resume is not eligible after it. |
| `recovery` | `active` | State the record did not explain, investigated and recorded. It makes its todo active until that todo passes or blocks. |
| `fix` | `passed` | A fix child repaired blocking result-review differences. Its `todo` is a final gate such as `F4`, every todo has passed before it, and its checks all pass. |

`start` and `checkpoint` belong to format 1.

## Resume rules

`--review --resume` passes only when all of these hold:

- The current spec digest equals `approval.specDigest`.
- The live plan is `status: reviewed`, its latest round and the gate record file's `round` are `approval.round`, the gate record digest equals `approval.gateRecordDigest`, and its verdict is OKAY. A later REJECT, INCOMPLETE, or superseding round blocks resume.
- The baseline and every receipt snapshot exist, match their recorded manifest digests, and verify: every object's length and digest, and the recomputed `stateDigest`. The baseline's repository matches the build record and the current project, and the baseline declares the reviews and build files as reports.
- The gate record's sources and the evidence index citations match the baseline bytes, not the current files.
- The receipts chain: sequential `seq`, correct `prev`, and each `before` equals the previous end state. One todo is active at a time. A todo's first receipt comes only after its dependencies passed, and a todo has no receipt after its pass.
- A `pass` receipt records checks that all passed. For `Commit: yes`, it names the commit, and its after-state HEAD equals that commit. With `planIgnored`, T0's pass receipt may name no commit; a commit it names is still checked. Every other todo keeps the rule.
- Every `- [x] Done` box has a passed receipt. A passed receipt with an Open box is listed in `reconcileBoxes`; set the box without repeating the work.
- The current project state equals the last receipt's end state. Otherwise the result lists `drift`, sets `recoveryRequired: true`, and names the `unresolvedAction`.
- No recorded prerequisite recheck for a pending todo says `fails`. Pending todos whose referenced paths changed get `requiredRechecks`. Record those rechecks in that todo's pass receipt, or in a recovery receipt when one fails before any work.

`nextTodo` is the active todo, or else the first todo without a passed receipt in T0-then-wave order, or else the first open final gate. Resume mode reports `nextTodo` even with an empty receipt chain, so a new build asks it for the first todo. A `recovery` receipt records observed effects after drift, such as a todo interrupted before its pass. It makes its todo active.

## Error codes

| Code | Meaning |
| --- | --- |
| PLAN_FILES | The plan directory, the links line, or the evidence index file |
| FRONTMATTER, SECTION, QUESTIONS, DESIGN, OPENDESIGN, PLACEHOLDER | Plan shape |
| BEHAVIOR | The `## Behavior` section, its lines, and the `Serves` field |
| FIELD_CAP | A field past its hard cap |
| REQUIREMENT_ID, GAP_MAP, SUCCESS_MAP | Identifiers and gap mapping |
| TODO, DEPENDENCY, WAVE, FINAL_WAVE | Todos, dependency graph, waves, and gates |
| SLICE | Slice lines in the execution strategy |
| EVIDENCE_INDEX | Malformed evidence index |
| CITATION, EXCERPT, CITATION_DRIFT, PATH, PLANNED_EXISTS, UNINDEXED_CITATION | Citations |
| COVERAGE, FRONTIER, FLOW, BASELINE | Investigation record |
| GATE_RECORD, GATE_EVIDENCE, GATE_BLOCKER, PLANNED_QA_AS_EVIDENCE, VERDICT, STATUS, RENDERED_MISMATCH | Review round |
| STALE_REVIEW, SOURCE_DRIFT | The review no longer matches the current plan or sources |
| BUILD_RECORD, SNAPSHOT_MISSING, SNAPSHOT_CORRUPT, REPOSITORY_MISMATCH, APPROVAL_BASELINE_MISMATCH | Build file and snapshots |
| SPEC_CHANGED, APPROVAL_CHANGED | The approval a build started from no longer holds |
| RECEIPT_CHAIN, RECEIPT_ORDER, RECEIPT_FIELD, DEPENDENCY_ORDER, PASS_WITHOUT_CHECKS, MISSING_CHECK, COMMIT, DONE_WITHOUT_RECEIPT | Receipts |
| FORMAT_1 | A format 1 record; finish it on the old install |
| STATE_DRIFT, PREREQUISITE_FAILED | The current state or a premise no longer matches the record |
| UNREADABLE | The plan cannot be read |
