/**
 * Tests for the bundled plan validator (skills/planning/plan-review/scripts/validate-plan.ts).
 *
 * Every fixture is generated in a fresh temp directory. Snapshots are written by
 * an independent minimal implementation in this file, not by the validator or by
 * plan-builder's capture helper, so the two implementations check each other.
 */

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  canonicalJson,
  canonicalSpecDigest,
  FORMAT_1_MESSAGE,
  filePathWords,
  parsePlan,
  planIgnored,
  qaLabels,
  requiredCheckIds,
  requiredTargets,
  SCOPE_SUBSECTIONS,
  SECTIONS,
  TODO_FIELDS,
  type Todo,
  validatePlan,
} from "./validate-plan.ts";

// Resume scenarios create git repositories and snapshots; each takes a few seconds.
setDefaultTimeout(30_000);

const repo = join(import.meta.dir, "..");
const bundled = join(repo, "skills/planning/plan-review/scripts/validate-plan.ts");
const rootCli = join(import.meta.dir, "validate-plan.ts");
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "validate-plan-test-"));
  roots.push(dir);
  return dir;
}

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.com",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.com",
  GIT_CONFIG_NOSYSTEM: "1",
};

function git(root: string, ...args: string[]): Buffer {
  return execFileSync("git", ["-c", "commit.gpgSign=false", ...args], { cwd: root, env: GIT_ENV });
}

const sha = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

/** Independent canonical JSON: sorted keys, no whitespace. */
function canon(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );
}

/** Independent main-plan digest for fixture plans, which have no fenced boxes. */
function fixtureMainDigest(text: string): string {
  const kept = text
    .split("\n")
    .filter((line, i, all) => !(/^(status|review_round):/.test(line) && all.indexOf("---", 1) > i))
    .map((line) => (/^- \[[ x]\] (Open|Done)$/.test(line) ? "- [ ] Open" : line));
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  return sha(`${kept.join("\n")}\n`);
}

/** Independent spec digest: both digests in hex, one per line. */
function fixtureSpecDigest(text: string, evidence: string): string {
  return sha(`${fixtureMainDigest(text)}\n${sha(`${evidence.replace(/\n$/, "")}\n`)}\n`);
}

/* ── fixture project and plan ──────────────────────────────────────────────── */

const APP = [
  "export function start(config: string): string {",
  "  return register(config);",
  "}",
  "",
  "export function register(name: string): string {",
  "  return `registered:${name}`;",
  "}",
  "",
].join("\n");
const CLI = ['import { start } from "./app";', 'console.log(start("default"));', ""].join("\n");
const README = "# Fixture\n\nA fixture project.\n";
const STEM = "2026-09-29-fixture";
const DIR = `docs/plans/${STEM}`;
const PLAN = `${DIR}/${STEM}.md`;
const EVIDENCE = `${DIR}/${STEM}.evidence-index.md`;
const REVIEWS = `${DIR}/${STEM}.reviews.md`;
const GATE = `${DIR}/${STEM}.gate-record.json`;
const BUILD = `${DIR}/${STEM}.build.md`;
const LINKS = `Files: [Evidence index](${STEM}.evidence-index.md) · [Reviews](${STEM}.reviews.md) · [Gate record](${STEM}.gate-record.json) · [Build](${STEM}.build.md)`;

function makeProject(): string {
  const root = tempDir();
  git(root, "init", "-q");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/app.ts"), APP);
  writeFileSync(join(root, "src/cli.ts"), CLI);
  writeFileSync(join(root, "README.md"), README);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "baseline");
  mkdirSync(join(root, DIR), { recursive: true });
  return root;
}

function lines(text: string, a: number, b: number): string {
  return text.split("\n").slice(a - 1, b).join("\n");
}

const read = (root: string, rel: string): string => readFileSync(join(root, rel), "utf8");
const write = (root: string, rel: string, text: string): void => writeFileSync(join(root, rel), text);

type PlanOptions = {
  status?: string;
  reviewRound?: number;
  mutateIndex?: (index: Record<string, unknown>) => void;
  mutate?: (text: string) => string;
};

function evidenceIndex(root: string): Record<string, unknown> {
  const app = read(root, "src/app.ts");
  const cli = read(root, "src/cli.ts");
  return {
    schemaVersion: 2,
    citations: [
      { id: "C1", kind: "source", path: "src/app.ts", startLine: 1, endLine: 3, sha256: sha(app) },
      { id: "C2", kind: "source", path: "src/cli.ts", startLine: 1, endLine: 2, sha256: sha(cli) },
      { id: "C3", kind: "self" },
      { id: "C4", kind: "planned", path: "src/new.ts", createdBy: "T2" },
      { id: "C5", kind: "external", url: "https://example.com/spec", version: "1.0", accessed: "2026-09-29", excerpt: "start registers", obligation: "MH1" },
      { id: "C6", kind: "source", path: "src/app.ts", startLine: 5, endLine: 7, sha256: sha(app) },
    ],
    coverage: [
      { id: "V1", paths: ["src/app.ts", "src/cli.ts"], citationIds: ["C1", "C2", "C6"], state: "inspected" },
    ],
    frontier: [],
    flows: [
      { id: "FL1", requirementIds: ["MH1"], todoIds: ["T1"], evidenceIds: ["C1"], entry: "cli start", startingState: "clean checkout", effects: ["call start", "register name"], recovery: "none needed; pure function", counterexample: "empty config name" },
    ],
    baseline: { revision: "fixture", dirty: [], checks: [{ command: "bun test", exit: 0, result: "fixture baseline" }] },
  };
}

function evidenceText(blocks: unknown[]): string {
  return `# Evidence index: Fixture plan\n\n${blocks.map((b) => `\`\`\`json\n${JSON.stringify(b, null, 2)}\n\`\`\`\n`).join("\n")}`;
}

/** Writes the evidence index file for the plan and returns the main plan's text. */
function planText(root: string, options: PlanOptions = {}): string {
  const index = evidenceIndex(root);
  options.mutateIndex?.(index);
  write(root, EVIDENCE, evidenceText([index]));
  const text = `---
title: Fixture plan
request: "Add a greeting to the fixture."
source: chat
date: 2026-09-29
status: ${options.status ?? "planned"}
tier: standard
intent: change
branch: feat/fixture
ui: no
review: optional
review_round: ${options.reviewRound ?? 0}
---

<!-- markdownlint-disable-next-line MD025 -->
# Fixture plan

${LINKS}

## TL;DR

- Effort: S — fixture.

## Scope

### IS / GAP ledger

| Gap | IS today (evidence) | GAP |
| --- | --- | --- |
| G1 | \`src/app.ts:1-3\` — start registers the config | No greeting |
| G2 | \`src/cli.ts:1\` and \`:2\` — the CLI calls start | No flag |

### Risks

| Risk | What breaks | Mitigation | Carried by |
| --- | --- | --- | --- |
| R1 | Registration | Keep register | T1 |

### Must have

- MH1: A greeting.
- MH2: A flag.

### Must NOT have

- MN1: No network access.

### Critical flows

- FL1: CLI start.

### Baseline

Clean fixture.

## Research

No useful public source found.

## Questions

### Product

- Who it is for — answer: fixture users.

### Technical

- Where it lives — answer: src/app.ts.

## Design

Diagram: omitted — a two-file change.

## Execution strategy

Finish T0, then each wave in order, then the final wave.

- T0 runs alone before wave 1.
- Wave 1: T1
- Wave 2: T2 — needs T1

## Todos

Every todo starts with \`- [ ] Open\`.

\`\`\`markdown
### T9 — Example inside a fence is not a todo

- [ ] Open
\`\`\`

### T0 — Copy the plan into the project

- [ ] Open
- Do: keep the existing copy.
- Must not: copy twice.
- Closes gap: none.
- Depends on: none.
- References: this file.
- Acceptance: \`test -f ${PLAN}\` exits 0.
- QA scenario: happy — the file exists; failure — n/a.
- Strict: no.
- Commit: no.

### T1 — Add the greeting

- [ ] Open
- Do: change start.
- Must not: break register.
- Closes gap: G1.
- Depends on: T0.
- References: \`src/app.ts:1-3\`.
- Acceptance: \`bun test\` passes.
- QA scenario: happy — greets; failure — empty name.
- Strict: no.
- Commit: no.

### T2 — Add the flag

- [ ] Open
- Do: add the flag.
- Must not: change register.
- Closes gap: G2.
- Depends on: T1.
- References: \`src/cli.ts:1-2\`, \`src/app.ts:5-7\`, \`src/new.ts\`.
- Acceptance: \`bun test\` passes.
- QA scenario: happy — flag works; failure — unknown flag.
- Strict: no.
- Commit: no.

## Final verification wave

### F1 — Plan compliance

- [ ] Open
- Do: compare with the plan.

### F2 — Code quality

- [ ] Open
- Do: run tests.

### F3 — Scenario QA

- [ ] Open
- Do: run scenarios.

### F4 — Scope fidelity

- [ ] Open
- Do: compare the diff.

## Success criteria

| Gap | Closed by | Proof |
| --- | --- | --- |
| G1 | T1 | tests |
| G2 | T2 | tests |
`;
  return options.mutate ? options.mutate(text) : text;
}

function writePlan(root: string, text: string): void {
  write(root, PLAN, text);
}

/** The current spec digest: the main plan plus the evidence index file on disk. */
function specOf(root: string, text: string): string {
  return canonicalSpecDigest(text, read(root, EVIDENCE));
}

/* ── gate records ──────────────────────────────────────────────────────────── */

const ALL_TARGETS = [
  "MH1", "MH2", "MN1",
  "T0.start", "T0.acceptance", "T0.qa", "T1.start", "T1.acceptance", "T1.qa", "T2.start", "T2.acceptance", "T2.qa",
  "dep:T1:T0", "dep:T2:T1",
  "F1.acceptance", "F2.acceptance", "F3.acceptance", "F4.acceptance",
  "flow:FL1", "contract:C5",
  "check:A", "check:B", "check:C", "check:D", "check:E", "check:F", "check:G", "check:H", "check:I", "check:J",
];

type Obligation = { id: string; targets: string[]; evidenceIds: string[]; observed: string; plannedQa: string; status: string; required?: boolean };

type GateOptions = {
  round?: number;
  verdict?: string;
  obligations?: Obligation[];
  blockers?: unknown[];
  flowStatus?: string;
  checkStatus?: string;
  evidence?: unknown[];
  renderStatus?: (o: Obligation) => string;
  renderVerdict?: string;
  history?: string;
  /** Obligation ids to leave out of the rendered list. */
  hide?: string[];
  /** Blocker paragraphs to render under '#### Blockers'. */
  blockerText?: string[];
};

function gateRecord(root: string, planDigest: string, options: GateOptions = {}) {
  const obligations = options.obligations ?? [
    { id: "O1", targets: ALL_TARGETS, evidenceIds: ["C1", "P1"], observed: "start and register traced; probe passed", plannedQa: "Q1", status: "verified" },
  ];
  return {
    schemaVersion: 2,
    round: options.round ?? 1,
    planDigest,
    repository: { revision: git(root, "rev-parse", "HEAD").toString().trim(), dirty: [PLAN] },
    sources: [{ path: "README.md", sha256: sha(readFileSync(join(root, "README.md"))) }],
    evidence: options.evidence ?? [
      { id: "P1", kind: "probe", command: "bun -e 'start(\"x\")'", inputs: "fixture", exit: 0, result: "registered:x", omissions: "none" },
      { id: "Q1", kind: "planned-qa", command: "bun test" },
    ],
    obligations,
    flows: [{ id: "FL1", status: options.flowStatus ?? "verified", counterexample: "empty config name", evidenceIds: ["P1"] }],
    checks: Object.fromEntries("ABCDEFGHIJ".split("").map((l) => [l, { status: options.checkStatus ?? "verified", evidenceIds: ["C1"], observed: `check ${l} done` }])),
    blockers: options.blockers ?? [],
    verdict: options.verdict ?? "OKAY",
  };
}

type Gate = ReturnType<typeof gateRecord>;

/** One round's body as plan-review writes it: open obligations only, no gate record fence. */
function renderRound(gate: Gate, options: GateOptions = {}): string {
  const obligations = gate.obligations as Obligation[];
  const required = obligations.filter((o) => o.required !== false);
  const verified = required.filter((o) => o.status === "verified").length;
  const flows = gate.flows.filter((f) => f.status === "verified").length;
  const blockers = (gate.blockers as unknown[]).length;
  const verdictText = options.renderVerdict ?? (gate.verdict === "REJECT" ? `REJECT (${blockers} blockers)` : gate.verdict);
  const listed = obligations.filter((o) => o.status !== "verified").filter((o) => !(options.hide ?? []).includes(o.id));
  const status = (o: Obligation) => (options.renderStatus ? options.renderStatus(o) : o.status);
  const blockerList = options.blockerText ? `#### Blockers\n\n${options.blockerText.map((b, i) => `${i + 1}. ${b}`).join("\n")}\n\n` : "";
  const ledger =
    listed.length === 0
      ? ""
      : `#### Open obligations

| Obligation | Targets | Evidence | Observed | Status |
| --- | --- | --- | --- | --- |
${listed.map((o) => `| ${o.id} | ${o.targets.join(", ")} | ${o.evidenceIds.join(", ")} | ${o.observed} | ${status(o)} |`).join("\n")}

`;
  return `### Round ${gate.round}

**Verdict:** PLAN-REVIEW: ${verdictText}

**Scope:** whole plan; ${verified}/${required.length} required obligations verified; ${flows}/1 critical flows verified.

${blockerList}${ledger}`;
}

function historyTable(entries: [number, string, number, string?][]): string {
  return `| Round | Date | Verdict | Blockers | Summary |
| --- | --- | --- | --- | --- |
${entries.map(([n, v, b, s]) => `| ${n} | 2026-09-29 | ${v} | ${b} | ${s ?? "fixture round"} |`).join("\n")}
`;
}

/** Writes the reviews file with the given history and round bodies, newest first. */
function writeReviews(root: string, history: string, rounds: string[]): void {
  write(root, REVIEWS, `# Reviews: Fixture plan\n\n## Review\n\n${history}\n${rounds.join("\n")}`);
}

function writeGate(root: string, gate: unknown): void {
  write(root, GATE, `${JSON.stringify(gate, null, 2)}\n`);
}

/** Writes a plan with one review round and returns the main plan's text. */
function reviewedPlan(
  root: string,
  options: GateOptions & { status?: string; mutateGate?: (g: Gate) => void; mutatePlan?: (t: string) => string } = {},
): string {
  const status = options.status ?? (options.verdict && options.verdict !== "OKAY" ? "planned" : "reviewed");
  const text = planText(root, { status, reviewRound: options.round ?? 1, mutate: options.mutatePlan });
  writePlan(root, text);
  const gate = gateRecord(root, specOf(root, text), options);
  options.mutateGate?.(gate);
  writeGate(root, gate);
  writeReviews(root, options.history ?? historyTable([[gate.round, gate.verdict, (gate.blockers as unknown[]).length]]), [renderRound(gate, options)]);
  return text;
}

function run(root: string, flags: string[] = []) {
  return validatePlan(PLAN, { root, review: flags.includes("--review"), resume: flags.includes("--resume") });
}

function codes(result: { errors: { code: string }[] }): string[] {
  return result.errors.map((e) => e.code);
}

/* ── independent snapshot writer (D4 manifest format) ──────────────────────── */

type TLayer = Record<string, unknown>;

function snapshot(root: string, rel: string, options: { carry?: string[]; reports?: string[] } = {}) {
  const out = join(root, ".git", rel);
  mkdirSync(join(out, "objects"), { recursive: true });
  const objects = new Map<string, Buffer>();
  const layer = (data: Buffer, mode: string): TLayer => {
    const digest = sha(data);
    objects.set(digest, data);
    return { state: mode === "120000" ? "symlink" : "file", mode, length: data.length, sha256: digest };
  };
  const parse = (buf: Buffer, withStage: boolean) => {
    const map = new Map<string, TLayer>();
    for (const row of buf.toString("utf8").split("\0").filter(Boolean)) {
      const [meta, path] = row.split("\t");
      const parts = meta.split(" ");
      const [mode, oid] = withStage ? [parts[0], parts[1]] : [parts[0], parts[2]];
      map.set(path, layer(git(root, "cat-file", "blob", oid), mode));
    }
    return map;
  };
  const head = parse(git(root, "ls-tree", "-r", "-z", "HEAD"), false);
  const index = parse(git(root, "ls-files", "--stage", "-z"), true);
  const untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z").toString("utf8").split("\0").filter(Boolean);
  const all = [...new Set([...head.keys(), ...index.keys(), ...untracked, ...(options.carry ?? [])])].sort((a, b) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  );
  const paths = all.map((path) => {
    let worktree: TLayer = { state: "absent" };
    try {
      const st = lstatSync(join(root, path));
      if (st.isSymbolicLink()) worktree = layer(Buffer.from(readlinkSync(join(root, path))), "120000");
      else worktree = layer(readFileSync(join(root, path)), st.mode & 0o111 ? "100755" : "100644");
    } catch {
      // absent
    }
    return { path, head: head.get(path) ?? { state: "absent" }, index: index.get(path) ?? { state: "absent" }, worktree };
  });
  for (const [digest, data] of objects) writeFileSync(join(out, "objects", digest), data);
  const reports = options.reports ?? [REVIEWS, BUILD];
  const entries = paths
    .filter((p) => !reports.includes(p.path))
    .map((p) =>
      p.path === PLAN && p.worktree.state === "file"
        ? { ...p, worktree: { state: "plan", specDigest: fixtureMainDigest(objects.get(p.worktree.sha256 as string)?.toString("utf8") ?? "") } }
        : p,
    );
  const headRevision = git(root, "rev-parse", "HEAD").toString().trim();
  const stateDigest = sha(canon({ headRevision, paths: entries }));
  const manifest = {
    schemaVersion: 1,
    kind: "silly-skills.build-state",
    runId: "fixture-run",
    repository: repoIdentity(root),
    baseRevision: headRevision,
    headRevision,
    approvedSpecDigest: "",
    plan: { path: PLAN, sha256: "", specDigest: "" },
    administrative: { plan: PLAN, reports },
    includes: [],
    stateDigest,
    paths,
  };
  return { out, manifest, objects };
}

function repoIdentity(root: string) {
  return { kind: "git", rootCommits: git(root, "rev-list", "--max-parents=0", "HEAD").toString().split(/\s+/).filter(Boolean).sort(), branch: null };
}

function saveSnapshot(root: string, s: ReturnType<typeof snapshot>, specDigest: string): { snapshot: string; manifestSha256: string; stateDigest: string } {
  s.manifest.approvedSpecDigest = specDigest;
  const planRow = s.manifest.paths.find((p) => p.path === PLAN);
  if (planRow && planRow.worktree.state === "file") {
    const bytes = s.objects.get(planRow.worktree.sha256 as string) as Buffer;
    s.manifest.plan = { path: PLAN, sha256: sha(bytes), specDigest: fixtureSpecDigest(bytes.toString("utf8"), read(root, EVIDENCE)) };
  }
  const raw = `${JSON.stringify(s.manifest, null, 2)}\n`;
  writeFileSync(join(s.out, "manifest.json"), raw);
  const rel = s.out.split("/.git/")[1];
  return { snapshot: rel, manifestSha256: sha(raw), stateDigest: s.manifest.stateDigest };
}

/* ── build scenario ────────────────────────────────────────────────────────── */

type Ref = { snapshot: string; manifestSha256: string; stateDigest: string };
type ReceiptInput = {
  todo: string;
  event: string;
  after?: Ref | "same";
  prerequisites?: unknown[];
  checks?: unknown[];
  commit?: unknown;
  note?: string;
  extra?: Record<string, unknown>;
};

const check = (id: string, observed = "1 passed") => ({ id, command: "bun test", exit: 0, expectedExit: 0, passed: true, observed });
const PASSING = [check("acceptance"), check("qa:happy"), check("qa:failure")];

function receipts(baseline: Ref, inputs: ReceiptInput[]) {
  const out: Record<string, unknown>[] = [];
  let end = baseline;
  for (const input of inputs) {
    const prev = out[out.length - 1];
    const after = input.after === "same" ? end : input.after ?? null;
    const state = { pass: "passed", block: "blocked", recovery: "active", fix: "passed" }[input.event];
    out.push({
      seq: out.length + 1,
      todo: input.todo,
      event: input.event,
      state,
      prev: prev ? sha(canon(prev)) : null,
      before: end,
      after,
      checks: input.checks ?? (input.event === "pass" || input.event === "fix" ? PASSING : []),
      prerequisites: input.prerequisites ?? [],
      commit: input.commit ?? { none: "Commit: no" },
      note: input.note ?? "",
      ...input.extra,
    });
    if (after) end = after;
  }
  return out;
}

/** Writes the build file: the record with no receipts, then one block per receipt. */
function writeBuild(root: string, record: Record<string, unknown>): void {
  const { receipts: list, ...head } = record as { receipts: unknown[] };
  write(root, BUILD, `# Build: Fixture plan\n\n${[{ ...head, receipts: [] }, ...list.map((r) => ({ receipts: [r] }))]
    .map((b) => `\`\`\`json\n${JSON.stringify(b, null, 2)}\n\`\`\`\n`)
    .join("\n")}`);
}

function setBoxes(root: string, done: string[]): void {
  let text = read(root, PLAN);
  for (const id of done) {
    text = text.replace(new RegExp(`(### ${id} — [^\\n]+\\n\\n)- \\[ \\] Open`), "$1- [x] Done");
  }
  writePlan(root, text);
}

/**
 * An approved two-todo build: T0 passes, T1 edits the cited src/app.ts and
 * passes. Returns the pieces so tests can mutate them.
 */
const T1_COMMIT = (t: string) =>
  t.replace("- QA scenario: happy — greets; failure — empty name.\n- Strict: no.\n- Commit: no.", "- QA scenario: happy — greets; failure — empty name.\n- Strict: no.\n- Commit: yes — `feat: greet`.");

type ScenarioOptions = {
  stopAfter?: "T0";
  t1Commit?: boolean;
  omitCommit?: boolean;
  reports?: string[];
  /** Changes the plan before its review, such as adding slice lines. */
  mutatePlan?: (t: string) => string;
  /** The review's obligations, for a plan with more targets than ALL_TARGETS. */
  obligations?: Obligation[];
  /** The checks on T1's pass receipt; PASSING by default. */
  t1Checks?: unknown[];
  /** Runs after the plan and its review are written and before the baseline, such as to add an ignore rule. */
  beforeBaseline?: (root: string) => void;
};

function buildScenario(options: ScenarioOptions = {}) {
  const root = makeProject();
  const mutatePlan = (t: string): string => {
    const changed = options.mutatePlan ? options.mutatePlan(t) : t;
    return options.t1Commit ? T1_COMMIT(changed) : changed;
  };
  const text = reviewedPlan(root, { mutatePlan, obligations: options.obligations });
  const spec = specOf(root, text);
  const gateDigest = sha(canon(JSON.parse(read(root, GATE))));
  options.beforeBaseline?.(root);
  const baseline = saveSnapshot(root, snapshot(root, "silly-skills/plan-builds/run/baseline", { reports: options.reports }), spec);
  const carry = JSON.parse(readFileSync(join(root, ".git", baseline.snapshot, "manifest.json"), "utf8")).paths.map((p: { path: string }) => p.path);
  const inputs: ReceiptInput[] = [{ todo: "T0", event: "pass", after: "same", checks: [check("acceptance"), check("qa:happy")] }];
  let after: Ref | null = null;
  if (options.stopAfter !== "T0") {
    writeFileSync(join(root, "src/app.ts"), APP.replace("return register(config);", "return register(`hello ${config}`);"));
    if (options.t1Commit) git(root, "commit", "-q", "-am", "T1");
    after = saveSnapshot(root, snapshot(root, "silly-skills/plan-builds/run/T1", { carry, reports: options.reports }), spec);
    const commit = options.t1Commit && !options.omitCommit ? { sha: git(root, "rev-parse", "HEAD").toString().trim() } : undefined;
    const prerequisites = [{ targets: ["T1.start"], sources: [{ path: "src/app.ts", sha256: sha(APP) }], status: "holds", observed: "unchanged since baseline" }];
    inputs.push({ todo: "T1", event: "pass", after, commit, prerequisites, checks: options.t1Checks });
  }
  const record = {
    schemaVersion: 2,
    runId: "fixture-run",
    runDir: "silly-skills/plan-builds/run",
    repository: repoIdentity(root),
    baseRevision: git(root, "rev-parse", "HEAD").toString().trim(),
    approval: { specDigest: spec, round: 1, verdict: "OKAY", gateRecordDigest: gateDigest },
    baseline,
    skill: { name: "plan-builder", version: "1.0.0", sha256: "0".repeat(64) },
    receipts: receipts(baseline, inputs),
  };
  writeBuild(root, record);
  setBoxes(root, options.stopAfter ? ["T0"] : ["T0", "T1"]);
  return { root, record, baseline, after, spec, carry, inputs };
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

/* ── tests ─────────────────────────────────────────────────────────────────── */

describe("canonical JSON", () => {
  test("sorts keys, drops whitespace, and keeps non-ASCII characters unescaped, as Python's ensure_ascii=False does", () => {
    const value = { b: ["checks A–J", { d: 2, c: "naïve" }], a: 1 };
    const text = canonicalJson(value);
    expect(text).toBe('{"a":1,"b":["checks A–J",{"c":"naïve","d":2}]}');
    const python = execFileSync("python3", ["-c", 'import json,sys; print(json.dumps(json.loads(sys.stdin.read()), sort_keys=True, separators=(",", ":"), ensure_ascii=False), end="")'], {
      input: JSON.stringify(value),
    }).toString();
    expect(python).toBe(text);
    const escaped = execFileSync("python3", ["-c", 'import json,sys; print(json.dumps(json.loads(sys.stdin.read()), sort_keys=True, separators=(",", ":")), end="")'], { input: JSON.stringify(value) }).toString();
    expect(createHash("sha256").update(escaped).digest("hex")).not.toBe(createHash("sha256").update(text).digest("hex"));
  });
});

describe("canonical spec digest", () => {
  test("ignores progress, status, and review_round, but not instructions", () => {
    const base = "---\ntitle: x\nstatus: planned\nreview_round: 0\n---\n\n## Todos\n\n### T0 — a\n\n- [ ] Open\n";
    const progressed = base.replace("status: planned", "status: reviewed").replace("review_round: 0", "review_round: 3").replace("- [ ] Open", "- [x] Done");
    expect(canonicalSpecDigest(progressed, "{}")).toBe(canonicalSpecDigest(base, "{}"));
    expect(canonicalSpecDigest(base.replace("### T0 — a", "### T0 — b"), "{}")).not.toBe(canonicalSpecDigest(base, "{}"));
    expect(canonicalSpecDigest(base.replace(/\n/g, "\r\n"), "{}\r\n")).toBe(canonicalSpecDigest(base, "{}\n"));
  });

  test("a change to the evidence index is a change to the spec", () => {
    const base = "---\ntitle: x\n---\n\n## Todos\n";
    expect(canonicalSpecDigest(base, '{"flows": []}')).not.toBe(canonicalSpecDigest(base, '{"flows": [1]}'));
  });

  test("the independent fixture digest agrees on a generated plan", () => {
    const root = makeProject();
    const text = planText(root);
    expect(specOf(root, text)).toBe(fixtureSpecDigest(text, read(root, EVIDENCE)));
  });
});

describe("plan files", () => {
  test("a complete planned plan validates and reports the five files", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    const result = run(root);
    expect(result.errors).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(result.gateEligible).toBe(false);
    expect(result.sourceDigests["src/app.ts"]).toBe(sha(APP));
    expect(result.files).toEqual({ plan: PLAN, evidenceIndex: EVIDENCE, reviews: REVIEWS, gateRecord: GATE, build: BUILD });
  });

  test("a plan outside a directory named after it fails with PLAN_FILES", () => {
    const root = makeProject();
    const text = planText(root);
    mkdirSync(join(root, "docs/plans/other"), { recursive: true });
    writeFileSync(join(root, `docs/plans/other/${STEM}.md`), text);
    writeFileSync(join(root, `docs/plans/other/${STEM}.evidence-index.md`), read(root, EVIDENCE));
    const result = validatePlan(`docs/plans/other/${STEM}.md`, { root });
    expect(result.errors.some((e) => e.code === "PLAN_FILES" && e.message.includes("directory named after it"))).toBe(true);
  });

  test("a missing evidence index file fails with PLAN_FILES", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    rmSync(join(root, EVIDENCE));
    const result = run(root);
    expect(result.errors.some((e) => e.code === "PLAN_FILES" && e.file === EVIDENCE)).toBe(true);
  });

  test("a missing or wrong links line under the H1 fails with PLAN_FILES", () => {
    for (const mutate of [(t: string) => t.replace(`${LINKS}\n\n`, ""), (t: string) => t.replace(".build.md)", ".builds.md)")]) {
      const root = makeProject();
      writePlan(root, planText(root, { mutate }));
      expect(codes(run(root))).toContain("PLAN_FILES");
    }
  });

  test("Review, Result review, Build, and an inline Evidence index are refused in the spec", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutate: (t) => `${t}\n## Review\n\n## Build\n` }));
    const errors = run(root).errors.filter((e) => e.code === "SECTION");
    expect(errors.some((e) => e.message.includes(REVIEWS))).toBe(true);
    expect(errors.some((e) => e.message.includes(BUILD))).toBe(true);
    const root2 = makeProject();
    writePlan(root2, planText(root2, { mutate: (t) => t.replace("### Baseline\n", "### Evidence index\n\nNone.\n\n### Baseline\n") }));
    expect(run(root2).errors.some((e) => e.code === "SECTION" && e.message.includes(EVIDENCE))).toBe(true);
  });
});

describe("plan mode", () => {
  test("CRLF line endings validate the same way", () => {
    const root = makeProject();
    writePlan(root, planText(root).replace(/\n/g, "\r\n"));
    expect(run(root).errors).toEqual([]);
  });

  test("duplicate citation ids fail, attributed to the evidence index file", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutateIndex: (i) => (i.citations as { id: string }[]).push({ ...(i.citations as { id: string }[])[0] }) }));
    const result = run(root);
    expect(result.errors.some((e) => e.code === "CITATION" && e.file === EVIDENCE)).toBe(true);
  });

  test("a fake excerpt fails with EXCERPT", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutateIndex: (i) => ((i.citations as Record<string, unknown>[])[0].excerpt = "export function stop() {") }));
    expect(codes(run(root))).toContain("EXCERPT");
  });

  test("internal whitespace in an excerpt is not normalized away", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutateIndex: (i) => ((i.citations as Record<string, unknown>[])[0].excerpt = lines(APP, 1, 3).replace("return register", "return  register")) }));
    expect(codes(run(root))).toContain("EXCERPT");
  });

  test("one-, two-, and three-line anchors inside a longer cited range validate", () => {
    for (const excerpt of [lines(APP, 2, 2), lines(APP, 1, 2), lines(APP, 5, 7).replace(/\n/g, "\r\n")]) {
      const root = makeProject();
      writePlan(root, planText(root, { mutateIndex: (i) => Object.assign((i.citations as Record<string, unknown>[])[0], { endLine: 7, excerpt }) }));
      expect(run(root).errors).toEqual([]);
    }
  });

  test("ranges of at most three lines require the whole quote", () => {
    for (const endLine of [2, 3]) {
      const root = makeProject();
      writePlan(root, planText(root, { mutateIndex: (i) => Object.assign((i.citations as Record<string, unknown>[])[0], { endLine, excerpt: lines(APP, 2, 2) }) }));
      expect(codes(run(root))).toContain("EXCERPT");
    }
  });

  test("an anchor outside the range, a trivial anchor, and a partial excerpt over three lines fail with EXCERPT", () => {
    const set = (excerpt: string, endLine?: number) => (i: Record<string, unknown>) => {
      const c = (i.citations as Record<string, unknown>[])[0];
      c.excerpt = excerpt;
      if (endLine) c.endLine = endLine;
    };
    for (const mutateIndex of [
      set("export function register(name: string): string {", 4),
      set("}", 7),
      set(lines(APP, 2, 6), 7),
    ]) {
      const root = makeProject();
      writePlan(root, planText(root, { mutateIndex }));
      expect(codes(run(root))).toContain("EXCERPT");
    }
  });

  test("a line range past the end of the file fails", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutateIndex: (i) => ((i.citations as Record<string, unknown>[])[1].endLine = 40) }));
    expect(codes(run(root))).toContain("CITATION");
  });

  test("source drift without a HEAD change fails with CITATION_DRIFT", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    writeFileSync(join(root, "src/cli.ts"), `${CLI}// local edit\n`);
    const result = run(root);
    expect(codes(result)).toContain("CITATION_DRIFT");
    expect(git(root, "status", "--porcelain").toString()).toContain(" M src/cli.ts");
  });

  test("traversal outside the project and symlink escape fail with PATH", () => {
    const root = makeProject();
    const outside = tempDir();
    writeFileSync(join(outside, "secret.txt"), "x\n");
    symlinkSync(join(outside, "secret.txt"), join(root, "src/link.txt"));
    writePlan(root, planText(root, {
      mutateIndex: (i) => {
        (i.citations as Record<string, unknown>[]).push({ id: "C7", kind: "source", path: "../secret.txt", startLine: 1, endLine: 1, excerpt: "x", sha256: sha("x\n") });
        (i.citations as Record<string, unknown>[]).push({ id: "C8", kind: "source", path: "src/link.txt", startLine: 1, endLine: 1, excerpt: "x", sha256: sha("x\n") });
      },
    }));
    const pathErrors = run(root).errors.filter((e) => e.code === "PATH");
    expect(pathErrors.length).toBe(2);
  });

  test("a backticked citation outside every indexed range fails, attributed to the spec", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutate: (t) => t.replace("References: `src/app.ts:1-3`.", "References: `src/app.ts:1-4`.") }));
    const result = run(root);
    expect(result.errors.some((e) => e.code === "UNINDEXED_CITATION" && e.file === PLAN)).toBe(true);
  });

  test("a dependency cycle, a same-wave dependency, and a missing producer fail", () => {
    const root = makeProject();
    writePlan(root, planText(root, {
      mutate: (t) =>
        t
          .replace("- Depends on: T0.\n", "- Depends on: T2.\n")
          .replace("- Wave 2: T2 — needs T1", "- Wave 2: T2 — needs T1\n- Wave 3: T3")
          .replace("- Depends on: T1.\n", "- Depends on: T1, T7.\n"),
    }));
    const result = codes(run(root));
    expect(result).toContain("DEPENDENCY");
    expect(result).toContain("WAVE");
    const root2 = makeProject();
    writePlan(root2, planText(root2, { mutate: (t) => t.replace("- Wave 1: T1\n- Wave 2: T2 — needs T1", "- Wave 1: T1, T2") }));
    expect(run(root2).errors.some((e) => e.code === "WAVE" && e.message.includes("same wave"))).toBe(true);
  });

  test("pending coverage and an open frontier cannot reach planned status", () => {
    const root = makeProject();
    writePlan(root, planText(root, {
      mutateIndex: (i) => {
        (i.coverage as Record<string, unknown>[]).push({ id: "V2", paths: ["src/other.ts"], searches: [], producers: [], consumers: [], citationIds: [], state: "pending" });
        (i.frontier as unknown[]).push({ item: "src/other.ts", reason: "not read", nextAction: "read it" });
      },
    }));
    const result = codes(run(root));
    expect(result).toContain("COVERAGE");
    expect(result).toContain("FRONTIER");
    writePlan(root, planText(root, {
      status: "draft",
      mutateIndex: (i) => (i.frontier as unknown[]).push({ item: "src/other.ts", reason: "not read", nextAction: "read it" }),
    }));
    expect(run(root).errors).toEqual([]);
  });

  test("an existing file cannot be cited as planned", () => {
    const root = makeProject();
    writeFileSync(join(root, "src/new.ts"), "export {};\n");
    writePlan(root, planText(root));
    expect(codes(run(root))).toContain("PLANNED_EXISTS");
  });

  test("a malformed evidence index and wrong frontmatter keys fail", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    write(root, EVIDENCE, read(root, EVIDENCE).replace('"schemaVersion": 2,', '"schemaVersion": 2,,'));
    expect(codes(run(root))).toContain("EVIDENCE_INDEX");
    writePlan(root, planText(root).replace("review: optional\n", ""));
    expect(codes(run(root))).toContain("FRONTMATTER");
  });

  test("an evidence index split into one block per entry validates like a single block", () => {
    const root = makeProject();
    const single = planText(root);
    writePlan(root, single);
    const expected = codes(run(root));
    const index = evidenceIndex(root) as Record<string, unknown[]>;
    write(root, EVIDENCE, evidenceText([
      { schemaVersion: 2, citations: [], coverage: [], frontier: [], flows: [], baseline: index.baseline },
      ...(index.citations as unknown[]).map((c) => ({ citations: [c] })),
      ...(index.coverage as unknown[]).map((c) => ({ coverage: [c] })),
      ...(index.flows as unknown[]).map((f) => ({ flows: [f] })),
    ]));
    expect(codes(run(root))).toEqual(expected);
    expect(codes(run(root))).not.toContain("EVIDENCE_INDEX");
  });

  test("a duplicate citation id across split evidence blocks fails", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    const index = evidenceIndex(root) as Record<string, unknown[]>;
    write(root, EVIDENCE, evidenceText([index, { citations: [index.citations[0]] }]));
    expect(codes(run(root))).toContain("CITATION");
  });

  test("a leftover skeleton placeholder fails in a planned plan but not in a draft", () => {
    const root = makeProject();
    const withPlaceholder = planText(root).replace("### Risks\n", "### Risks\n\n<!-- todo: risks -->\n");
    writePlan(root, withPlaceholder);
    expect(codes(run(root))).toContain("PLACEHOLDER");
    writePlan(root, withPlaceholder.replace(/^status: .*$/m, "status: draft"));
    expect(codes(run(root))).not.toContain("PLACEHOLDER");
  });

  test("a fenced example heading is not parsed as a todo", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    expect(run(root).errors.some((e) => e.message.includes("T9"))).toBe(false);
  });
});

describe("OpenDesign block", () => {
  const OD_ID = "524751c2-5f7b-405e-87b2-70feb7c98913";
  const block = (folder: string, link: string, project = `Fixture UI (\`${OD_ID}\`)`) =>
    `### OpenDesign\n\n- Project: ${project}\n- Folder: \`${folder}\`\n- Link: <${link}> — local; opens while OpenDesign runs\n\n`;
  const withBlock = (root: string, text: string) =>
    planText(root, { mutate: (t) => t.replace("## Execution strategy\n", `${text}## Execution strategy\n`) });
  const odErrors = (root: string) => run(root).errors.filter((e) => e.code === "OPENDESIGN").map((e) => e.message);

  test("a plan that never mentions OpenDesign needs no block", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    expect(odErrors(root)).toEqual([]);
  });

  test("a complete block validates", () => {
    const root = makeProject();
    writePlan(root, withBlock(root, block(`~/design/projects/${OD_ID}`, `http://127.0.0.1:7456/projects/${OD_ID}`)));
    expect(run(root).errors).toEqual([]);
  });

  test("a mention without a block fails, but not in a draft", () => {
    const root = makeProject();
    const text = planText(root, { mutate: (t) => t.replace("Diagram: omitted — a two-file change.", "Diagram: omitted — a two-file change. The screens come from OpenDesign.") });
    writePlan(root, text);
    expect(odErrors(root).some((m) => m.includes("needs a '### OpenDesign' block"))).toBe(true);
    writePlan(root, text.replace(/^status: .*$/m, "status: draft"));
    expect(odErrors(root)).toEqual([]);
  });

  test("a missing line, a missing id, an absolute folder, and a session-only or foreign link each fail", () => {
    const good = `http://127.0.0.1:7456/projects/${OD_ID}`;
    const cases: [string, string][] = [
      ["### OpenDesign\n\n- Project: Fixture UI (`x`)\n\n", "missing '- Folder:'"],
      [block(`~/design/${OD_ID}`, good, "Fixture UI"), "project id in backticks"],
      [block(`/home/someone/design/${OD_ID}`, good), "start with '~/'"],
      [block(`~/design/${OD_ID}`, `http://127.0.0.1:7456/projects/${OD_ID}/conversations/c1/files/index.html`), "session-only"],
      [block(`~/design/${OD_ID}`, "http://127.0.0.1:7456/projects/other"), `must end in '/projects/${OD_ID}'`],
    ];
    for (const [text, message] of cases) {
      const root = makeProject();
      writePlan(root, withBlock(root, text));
      expect(odErrors(root).some((m) => m.includes(message))).toBe(true);
    }
  });
});

describe("field caps", () => {
  test("a field past its soft cap is a gap and the plan still validates", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutate: (t) => t.replace("- Do: add the flag.", `- Do: ${words(151)}.`) }));
    const result = run(root);
    expect(result.errors).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(result.gaps).toEqual([expect.stringMatching(/^soft cap: .*T2 Do is 151 words \(soft cap 150\)$/)]);
  });

  test("a field past twice its soft cap is a FIELD_CAP error", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutate: (t) => t.replace("- Do: add the flag.", `- Do: ${words(301)}.`) }));
    expect(run(root).errors.some((e) => e.code === "FIELD_CAP" && e.message.includes("T2 Do is 301 words"))).toBe(true);
  });

  test("backticked commands and paths are not counted", () => {
    const root = makeProject();
    const command = `\`${words(400)}\``;
    writePlan(root, planText(root, { mutate: (t) => t.replace("- Acceptance: `bun test` passes.\n- QA scenario: happy — flag", `- Acceptance: ${command} passes.\n- QA scenario: happy — flag`) }));
    const result = run(root);
    expect(result.errors).toEqual([]);
    expect(result.gaps).toEqual([]);
  });

  test("each capped spec field is measured", () => {
    const cases: [string, (t: string) => string][] = [
      ["T1 Must not", (t) => t.replace("- Must not: break register.", `- Must not: ${words(61)}.`)],
      ["T1 Acceptance", (t) => t.replace("- Acceptance: `bun test` passes.\n- QA scenario: happy — greets", `- Acceptance: ${words(121)}.\n- QA scenario: happy — greets`)],
      ["T1 QA scenario", (t) => t.replace("- QA scenario: happy — greets; failure — empty name.", `- QA scenario: ${words(121)}.`)],
      ["MH1 bullet", (t) => t.replace("- MH1: A greeting.", `- MH1: ${words(41)}.`)],
      ["TL;DR bullet", (t) => t.replace("- Effort: S — fixture.", `- Effort: ${words(61)}.`)],
      ["G1 ledger cell 3", (t) => t.replace("| No greeting |", `| ${words(61)} |`)],
      ["Success criteria G1 cell 3", (t) => t.replace("| G1 | T1 | tests |", `| G1 | T1 | ${words(31)} |`)],
    ];
    for (const [label, mutate] of cases) {
      const root = makeProject();
      writePlan(root, planText(root, { mutate }));
      const result = run(root);
      expect(result.errors).toEqual([]);
      expect(result.gaps.some((g) => g.includes(label))).toBe(true);
    }
  });

  test("a draft is not measured", () => {
    const root = makeProject();
    writePlan(root, planText(root, { status: "draft", mutate: (t) => t.replace("- Do: add the flag.", `- Do: ${words(301)}.`) }));
    const result = run(root);
    expect(result.errors).toEqual([]);
    expect(result.gaps).toEqual([]);
  });
});

describe("Behavior lines", () => {
  const B1 = "- B1 (primary): Given a configured name, when the owner starts the tool, then it greets that name.";
  const B2 = "- B2 (error): Given an empty name, when the owner starts the tool, then it stops and says the name is missing.";
  const SECTION = ["## Behavior", "", B1, B2, "- No alternate case: the tool has one way to start.", "- No recovery case: a failed start changes nothing.", ""];
  type Fixture = { section?: string[]; before?: string; t1?: string | null; t2?: string | null };

  /** Adds a Behavior section, after TL;DR unless `before` names another heading, and `Serves` fields: B1 and B2 for T1, none for T2. */
  const withBehavior =
    ({ section = SECTION, before = "## Scope\n", t1 = "B1, B2", t2 = "none" }: Fixture = {}) =>
    (t: string): string => {
      let out = t.replace(before, `${section.join("\n")}\n${before}`);
      if (t1 !== null) out = out.replace("- Closes gap: G1.\n", `- Closes gap: G1.\n- Serves: ${t1}.\n`);
      if (t2 !== null) out = out.replace("- Closes gap: G2.\n", `- Closes gap: G2.\n- Serves: ${t2}.\n`);
      return out;
    };
  const behaviorPlan = (fixture: Fixture = {}, status?: string): string => {
    const root = makeProject();
    writePlan(root, planText(root, { status, mutate: withBehavior(fixture) }));
    return root;
  };
  const behaviorErrors = (root: string) =>
    run(root)
      .errors.filter((e) => e.code === "BEHAVIOR")
      .map((e) => e.message);
  /** SECTION with one line replaced. */
  const swap = (from: string, to: string) => SECTION.map((l) => (l === from ? to : l));
  const cli = (root: string, ...args: string[]) => spawnSync("bun", [rootCli, PLAN, ...args, "--root", root], { encoding: "utf8" });

  test("a section directly after TL;DR, with Serves fields, validates and is parsed", () => {
    const root = behaviorPlan();
    const result = run(root);
    expect(result.errors).toEqual([]);
    expect(result.gaps).toEqual([]);
    const plan = parsePlan(read(root, PLAN));
    expect(plan.behavior.map((b) => [b.id, b.case])).toEqual([["B1", "primary"], ["B2", "error"]]);
    expect(plan.behavior[0].text).toBe("Given a configured name, when the owner starts the tool, then it greets that name.");
    expect(plan.todos.map((t) => [t.id, t.serves])).toEqual([["T0", []], ["T1", ["B1", "B2"]], ["T2", []]]);
  });

  test("the section is accepted only directly after TL;DR, and only once", () => {
    const moved = run(behaviorPlan({ before: "## Research\n" }));
    expect(moved.errors.map((e) => [e.code, e.message])).toEqual([["BEHAVIOR", "'## Behavior' must come directly after '## TL;DR'"]]);
    const twice = makeProject();
    writePlan(twice, planText(twice, { mutate: (t) => withBehavior()(t).replace("## Research\n", `${SECTION.join("\n")}\n## Research\n`) }));
    expect(behaviorErrors(twice)).toEqual(["section '## Behavior' appears more than once"]);
  });

  test("each line outside a fence or a comment is a Behavior line or an exclusion line", () => {
    const section = [
      "## Behavior",
      "",
      "<!-- The owner approved these lines. -->",
      "<!--",
      "A note that spans lines.",
      "-->",
      "```text",
      "- B9 (happy): an example, not a line",
      "```",
      B1,
      B2,
      "These lines need approval.",
      "- No alternate case: the tool has one way to start.",
      "- No recovery case: a failed start changes nothing.",
      "",
    ];
    const root = behaviorPlan({ section });
    const errors = run(root).errors;
    expect(errors.map((e) => e.code)).toEqual(["BEHAVIOR"]);
    expect(errors[0].message).toBe("a Behavior section line must be '- B<n> (<case>): Given ..., when ..., then ...' or '- No <case> case: <reason>'");
    expect(read(root, PLAN).split("\n")[errors[0].line - 1]).toBe("These lines need approval.");
  });

  test("ids count up from B1", () => {
    expect(behaviorErrors(behaviorPlan({ section: swap(B2, B2.replace("B2", "B3")), t1: "B1, B3" }))).toEqual([
      "Behavior B3 is out of sequence; ids count up from B1, so expected B2",
    ]);
    expect(behaviorErrors(behaviorPlan({ section: swap(B2, B2.replace("B2", "B1")), t1: "B1" }))).toEqual(["duplicate Behavior line B1"]);
  });

  test("the case is primary, alternate, error, or recovery", () => {
    const section = swap(B2, B2.replace("(error)", "(failure)")).map((l) => l.replace("No recovery case", "No restart case"));
    const errors = behaviorErrors(behaviorPlan({ section }));
    expect(errors).toContain("Behavior B2 has unknown case 'failure'; use primary, alternate, error, recovery");
    expect(errors).toContain("the 'No restart case' line has unknown case 'restart'; use primary, alternate, error, recovery");
  });

  test("Given, when, and then appear in that order", () => {
    const message = "Behavior B1 needs 'Given', 'when', and 'then' in that order";
    const reordered = "- B1 (primary): When the owner starts the tool, given a configured name, then it greets that name.";
    expect(behaviorErrors(behaviorPlan({ section: swap(B1, reordered) }))).toEqual([message]);
    const noThen = B1.replace(", then it greets", " and it greets");
    expect(behaviorErrors(behaviorPlan({ section: swap(B1, noThen) }))).toEqual([message]);
  });

  test("a file path in a Behavior line or an exclusion line is an error", () => {
    const section = swap(B1, B1.replace("a configured name", "a name in `src/app.ts`")).map((l) =>
      l.replace("a failed start changes nothing.", "a failed start leaves ~/notes as it was."),
    );
    expect(behaviorErrors(behaviorPlan({ section }))).toEqual([
      "Behavior B1 names the file path 'src/app.ts'; say what a user or an operator sees",
      "the 'No recovery case' line names the file path '~/notes'; say what a user or an operator sees",
    ]);
  });

  test("the path check passes the must-pass words and fails the must-fail words", () => {
    const line = (word: string) => `Given ${word}, when it runs, then it works.`;
    for (const word of ["and/or", "read/write", "v2.1.0", "e.g.", "Node.js", "https://example.com/a.html", "/pricing", "1.0/2.0"]) {
      expect(filePathWords(line(word))).toEqual([]);
    }
    for (const word of ["src/app.ts", "./run.sh", "../shared", "~/notes", "README.md", "package.json", "src/app.ts:12"]) {
      expect(filePathWords(line(word))).toEqual([word.replace(/:12$/, "")]);
    }
    expect(filePathWords('Given `src/app.ts:12-14`, (README.md) and "./run.sh".')).toEqual(["src/app.ts", "README.md", "./run.sh"]);
  });

  test("from planned on, a primary line exists and each other case has a line or an exclusion; a draft is exempt", () => {
    const section = swap(B1, B1.replace("(primary)", "(alternate)")).filter((l) => !l.startsWith("- No recovery case"));
    expect(behaviorErrors(behaviorPlan({ section }))).toEqual([
      "Behavior needs a primary line",
      "Behavior has no recovery line and no '- No recovery case: <reason>' line",
    ]);
    expect(behaviorErrors(behaviorPlan({ section }, "draft"))).toEqual([]);
  });

  test("every todo except T0 has Serves after Closes gap, holding none or known Behavior ids", () => {
    const missing = "T2 is missing '- Serves:' after '- Closes gap:'; write none or the Behavior ids it serves";
    expect(behaviorErrors(behaviorPlan({ t2: null }))).toEqual([missing]);
    const early = makeProject();
    writePlan(early, planText(early, { mutate: (t) => withBehavior({ t2: null })(t).replace("- Closes gap: G2.\n", "- Serves: none.\n- Closes gap: G2.\n") }));
    expect(behaviorErrors(early)).toEqual([missing]);
    expect(behaviorErrors(behaviorPlan({ t2: "B1, B7" }))).toEqual(["T2 serves unknown Behavior line B7"]);
    expect(behaviorErrors(behaviorPlan({ t2: "the greeting" }))).toEqual(["T2 Serves names no Behavior id; write none or ids such as B1"]);
  });

  test("every Behavior line is served by at least one todo", () => {
    expect(behaviorErrors(behaviorPlan({ t1: "B1" }))).toEqual(["Behavior B2 is not served by any todo"]);
  });

  test("a Behavior line has the word caps of a Must have bullet", () => {
    const long = (n: number) => swap(B1, `- B1 (primary): Given ${words(n)}, when the owner starts the tool, then it greets that name.`);
    const soft = run(behaviorPlan({ section: long(29) }));
    expect(soft.errors).toEqual([]);
    expect(soft.gaps).toEqual([expect.stringMatching(/^soft cap: .*Behavior B1 is 41 words \(soft cap 40\)$/)]);
    const hard = run(behaviorPlan({ section: long(69) }));
    expect(hard.errors.some((e) => e.code === "FIELD_CAP" && e.message.includes("Behavior B1 is 81 words"))).toBe(true);
  });

  test("a vague word is a gap, never an error, and does not change the verdict", () => {
    const section = swap(B1, B1.replace("then it greets that name.", "then it quickly greets that name, properly."));
    const root = makeProject();
    reviewedPlan(root, {
      mutatePlan: withBehavior({ section }),
      obligations: [{ id: "O1", targets: [...ALL_TARGETS, "behavior:B1", "behavior:B2"], evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" }],
    });
    const plan = run(root);
    expect(plan.errors).toEqual([]);
    expect(plan.gaps).toEqual(["vague word 'quickly' in B1", "vague word 'properly' in B1"]);
    const review = run(root, ["--review"]);
    expect(review.errors).toEqual([]);
    expect(review.gaps).toEqual(plan.gaps);
    expect(review.expectedVerdict).toBe("OKAY");
    expect(review.gateEligible).toBe(true);
  });

  test("--todo prints the Behavior lines a todo serves", () => {
    const root = behaviorPlan();
    const t1 = cli(root, "--todo", "T1");
    expect(t1.status).toBe(0);
    expect(t1.stdout).toContain(`Behavior lines it serves:\n\n${B1}\n${B2}\n`);
    expect(cli(root, "--todo", "T2").stdout).not.toContain("Behavior lines it serves:");
  });

  test("each Behavior line is a review target, and --gate-skeleton puts them in one group", () => {
    const root = behaviorPlan();
    const plan = parsePlan(read(root, PLAN), read(root, EVIDENCE));
    expect(requiredTargets(plan, new Map()).filter((t) => t.startsWith("behavior:"))).toEqual(["behavior:B1", "behavior:B2"]);
    const gate = JSON.parse(cli(root, "--gate-skeleton").stdout);
    const groups = gate.obligations.map((o: Obligation) => o.targets).filter((t: string[]) => t.some((x) => x.startsWith("behavior:")));
    expect(groups).toEqual([["behavior:B1", "behavior:B2"]]);
    const uncovered = makeProject();
    reviewedPlan(uncovered, { mutatePlan: withBehavior() });
    const review = run(uncovered, ["--review"]);
    expect(review.gaps).toContain("required target behavior:B1 has no required obligation");
    expect(review.expectedVerdict).toBe("INCOMPLETE");
  });

  test("there is no rule on the number of lines", () => {
    const one = ["## Behavior", "", B1, "- No alternate case: one way to start.", "- No error case: a start cannot fail.", "- No recovery case: nothing to recover.", ""];
    expect(run(behaviorPlan({ section: one, t1: "B1" })).errors).toEqual([]);
    const cases = ["primary", "alternate", "error", "recovery"];
    const nine = Array.from({ length: 9 }, (_, i) => `- B${i + 1} (${cases[i % 4]}): Given name ${i + 1}, when the owner starts the tool, then it greets that name.`);
    const ids = nine.map((_, i) => `B${i + 1}`).join(", ");
    expect(run(behaviorPlan({ section: ["## Behavior", "", ...nine, ""], t1: ids })).errors).toEqual([]);
  });

  test("a plan without the section gets no BEHAVIOR error, no behavior: target, and no Serves requirement", () => {
    const root = makeProject();
    const text = planText(root);
    writePlan(root, text);
    const plan = parsePlan(text, read(root, EVIDENCE));
    expect(plan.behavior).toEqual([]);
    expect(plan.todos.some((t) => "Serves" in t.fields)).toBe(false);
    expect(run(root).errors).toEqual([]);
    expect(requiredTargets(plan, new Map()).some((t) => t.startsWith("behavior:"))).toBe(false);
    const gate = JSON.parse(cli(root, "--gate-skeleton").stdout);
    expect(gate.obligations.flatMap((o: Obligation) => o.targets).sort()).toEqual([...ALL_TARGETS].sort());
    writePlan(root, text.replace("- Closes gap: G1.\n", "- Closes gap: G1.\n- Serves: B7.\n"));
    expect(run(root).errors).toEqual([]);
  });
});

describe("slices", () => {
  const WAVES = ["- T0 runs alone before wave 1.", "- Wave 1: T1", "- Wave 2: T2 — needs T1"];
  const S1 = "- Slice S1 — greeting. Independent test: `bun test` greets a configured name. Branch: `feat/fixture-greeting`";
  const S2 = "- Slice S2 — flag. Independent test: the CLI accepts the flag.";
  /** Two slices: S1 holds wave 1 (T1) and S2 holds wave 2 (T2). */
  const TWO = [WAVES[0], S1, WAVES[1], S2, WAVES[2]];
  /** One slice that holds both waves, so T1 is not its last todo. */
  const ONE = [WAVES[0], S1, WAVES[1], WAVES[2]];
  const KEYS = ["slices", "nextSlice", "sliceStart"];

  /** Replaces the execution strategy's bullet lines. */
  const strategy =
    (bullets: string[]) =>
    (t: string): string =>
      t.replace(`${WAVES.join("\n")}\n`, `${bullets.join("\n")}\n`);
  const slicePlan = (bullets = TWO, status?: string): string => {
    const root = makeProject();
    writePlan(root, planText(root, { status, mutate: strategy(bullets) }));
    return root;
  };
  const sliceErrors = (root: string) =>
    run(root)
      .errors.filter((e) => e.code === "SLICE")
      .map((e) => e.message);
  const cli = (root: string, ...args: string[]) => spawnSync("bun", [rootCli, PLAN, ...args, "--root", root], { encoding: "utf8" });
  /** buildScenario on the two-slice plan. T1, the last todo of S1, records the slice check unless `t1Checks` says otherwise. */
  const sliceBuild = (options: { stopAfter?: "T0"; t1Checks?: unknown[] } = {}) =>
    buildScenario({
      stopAfter: options.stopAfter,
      mutatePlan: strategy(TWO),
      obligations: [{ id: "O1", targets: [...ALL_TARGETS, "slice:S1", "slice:S2"], evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" }],
      t1Checks: options.t1Checks ?? [...PASSING, check("slice:S1")],
    });

  test("a slice line holds the wave lines after it, up to the next slice line, and wave numbers stay global", () => {
    const root = slicePlan();
    const result = run(root);
    expect(result.errors).toEqual([]);
    expect(result.gaps).toEqual([]);
    const plan = parsePlan(read(root, PLAN));
    expect(plan.slices.map(({ id, name, test, branch, waves, todos }) => ({ id, name, test, branch, waves, todos }))).toEqual([
      { id: "S1", name: "greeting", test: "`bun test` greets a configured name", branch: "feat/fixture-greeting", waves: [1], todos: ["T1"] },
      { id: "S2", name: "flag", test: "the CLI accepts the flag", branch: null, waves: [2], todos: ["T2"] },
    ]);
    const one = parsePlan(read(slicePlan(ONE), PLAN));
    expect(one.slices.map((s) => [s.id, s.waves, s.todos])).toEqual([["S1", [1, 2], ["T1", "T2"]]]);
  });

  test("a line that starts with the word Slice must parse, with a name and a test that are not empty", () => {
    const form = "a slice line must be '- Slice S<n> — <name>. Independent test: <test>', with an optional '. Branch: `<branch>`' at the end";
    for (const bad of [
      "- Slice S2: flag, tested by the CLI.",
      "- Slice S2 — flag.",
      `${S2.slice(0, -1)}. Branch: feat/fixture-flag`,
    ]) {
      expect(sliceErrors(slicePlan([WAVES[0], S1, WAVES[1], bad, WAVES[2]]))).toEqual([form]);
    }
    expect(sliceErrors(slicePlan([WAVES[0], S1, WAVES[1], "- Slice S2 — . Independent test:", WAVES[2]]))).toEqual([
      "Slice S2 needs a name",
      "Slice S2 needs an independent test",
    ]);
    const prose = slicePlan([...WAVES, "- Slices: none; the plan ships as one pull request."]);
    expect(run(prose).errors).toEqual([]);
    expect(parsePlan(read(prose, PLAN)).slices).toEqual([]);
  });

  test("the first slice line comes before Wave 1, so every wave is in a slice", () => {
    expect(sliceErrors(slicePlan([WAVES[0], WAVES[1], S1, WAVES[2]]))).toEqual(["the first slice line must come before Wave 1, so every wave is in a slice"]);
  });

  test("ids count up from S1", () => {
    expect(sliceErrors(slicePlan([WAVES[0], S1, WAVES[1], S2.replace("S2", "S3"), WAVES[2]]))).toEqual([
      "Slice S3 is out of sequence; ids count up from S1, so expected S2",
    ]);
    expect(sliceErrors(slicePlan([WAVES[0], S1, WAVES[1], S2.replace("S2", "S1"), WAVES[2]]))).toEqual(["duplicate slice S1"]);
  });

  test("every slice has at least one wave", () => {
    expect(sliceErrors(slicePlan([WAVES[0], S1, WAVES[1], WAVES[2], S2]))).toEqual(["Slice S2 has no wave"]);
  });

  test("the rules hold from planned on: a draft is exempt", () => {
    const bad = [WAVES[0], WAVES[1], "- Slice S3 — . Independent test:", WAVES[2]];
    expect(sliceErrors(slicePlan(bad)).length).toBe(4);
    expect(sliceErrors(slicePlan(bad, "draft"))).toEqual([]);
  });

  test("slices change neither the order of todos nor the choice of nextTodo", () => {
    const plain = parsePlan(planText(makeProject()));
    const sliced = parsePlan(planText(makeProject(), { mutate: strategy(TWO) }));
    expect(sliced.todos.map((t) => t.id)).toEqual(plain.todos.map((t) => t.id));
    expect(sliced.waves.map(({ wave, todos }) => ({ wave, todos }))).toEqual(plain.waves.map(({ wave, todos }) => ({ wave, todos })));
    for (const stopAfter of ["T0", undefined] as const) {
      const unsliced = run(buildScenario({ stopAfter }).root, ["--review", "--resume"]);
      const twoSlices = run(sliceBuild({ stopAfter }).root, ["--review", "--resume"]);
      expect(twoSlices.errors).toEqual([]);
      expect([twoSlices.nextTodo, twoSlices.activeTodo]).toEqual([unsliced.nextTodo, unsliced.activeTodo]);
    }
  });

  test("every mode's JSON adds slices with id, name, branch, and todos; only resume mode adds nextSlice and sliceStart", () => {
    const want = [
      { id: "S1", name: "greeting", branch: "feat/fixture-greeting", todos: ["T1"] },
      { id: "S2", name: "flag", branch: null, todos: ["T2"] },
    ];
    const { root } = sliceBuild();
    for (const flags of [[], ["--review"]]) {
      const result = run(root, flags);
      expect(result.slices).toEqual(want);
      expect("nextSlice" in result || "sliceStart" in result).toBe(false);
    }
    const resume = JSON.parse(cli(root, "--review", "--resume", "--json").stdout);
    expect(resume.slices).toEqual(want);
    expect([resume.nextSlice, resume.sliceStart]).toEqual(["S2", true]);
  });

  test("sliceStart is true at a slice's first todo, stays true with STATE_DRIFT after a plan-only commit, and is false after a recovery receipt", () => {
    const { root, record, baseline, spec, carry, inputs } = sliceBuild();
    const start = run(root, ["--review", "--resume"]);
    expect(start.errors).toEqual([]);
    expect(start.resumeEligible).toBe(true);
    expect([start.nextTodo, start.activeTodo, start.nextSlice, start.sliceStart]).toEqual(["T2", null, "S2", true]);

    git(root, "add", "--", DIR);
    git(root, "commit", "-q", "-m", "docs(plans): complete fixture slice S1");
    const stopped = run(root, ["--review", "--resume"]);
    expect(codes(stopped)).toEqual(["STATE_DRIFT"]);
    expect(stopped.recoveryRequired).toBe(true);
    expect(stopped.drift.some((d) => d.startsWith("HEAD "))).toBe(true);
    expect([stopped.nextTodo, stopped.activeTodo, stopped.nextSlice, stopped.sliceStart]).toEqual(["T2", null, "S2", true]);

    const recovered = saveSnapshot(root, snapshot(root, "silly-skills/plan-builds/run/T2-recovery", { carry }), spec);
    record.receipts = receipts(baseline, [...inputs, { todo: "T2", event: "recovery", after: recovered, note: "the slice S1 commit; nothing to replay" }]);
    writeBuild(root, record);
    const resumed = run(root, ["--review", "--resume"]);
    expect(resumed.errors).toEqual([]);
    expect(resumed.resumeEligible).toBe(true);
    expect([resumed.nextTodo, resumed.activeTodo, resumed.nextSlice, resumed.sliceStart]).toEqual(["T2", "T2", "S2", false]);
  });

  test("nextSlice is null for T0 and for a final gate", () => {
    const first = sliceBuild({ stopAfter: "T0" });
    first.record.receipts = [];
    writeBuild(first.root, first.record);
    writePlan(first.root, read(first.root, PLAN).replace("- [x] Done", "- [ ] Open"));
    const t0 = run(first.root, ["--review", "--resume"]);
    expect(t0.errors).toEqual([]);
    expect([t0.nextTodo, t0.nextSlice, t0.sliceStart]).toEqual(["T0", null, false]);

    const last = sliceBuild();
    last.record.receipts = receipts(last.baseline, [...last.inputs, { todo: "T2", event: "pass", after: "same", checks: [...PASSING, check("slice:S2")] }]);
    writeBuild(last.root, last.record);
    setBoxes(last.root, ["T2"]);
    const gate = run(last.root, ["--review", "--resume"]);
    expect(gate.errors).toEqual([]);
    expect([gate.nextTodo, gate.nextSlice, gate.sliceStart]).toEqual(["F1", null, false]);
  });

  test("the pass receipt of a slice's last todo needs a passing slice check, or it is MISSING_CHECK", () => {
    const result = run(sliceBuild({ t1Checks: PASSING }).root, ["--review", "--resume"]);
    expect(result.errors.map((e) => [e.code, e.message.includes("'slice:S1'")])).toEqual([["MISSING_CHECK", true]]);
    expect(result.resumeEligible).toBe(false);
    const plan = parsePlan(planText(makeProject(), { mutate: strategy(ONE) }));
    const [t0, t1, t2] = plan.todos;
    expect(requiredCheckIds(t0, plan)).toEqual(["acceptance", "qa:happy"]);
    expect(requiredCheckIds(t1, plan)).toEqual(["acceptance", "qa:happy", "qa:failure"]);
    expect(requiredCheckIds(t2, plan)).toEqual(["acceptance", "qa:happy", "qa:failure", "slice:S1"]);
    expect(requiredCheckIds(t2)).toEqual(["acceptance", "qa:happy", "qa:failure"]);
  });

  test("--todo prints the slice and its branch, and for its last todo the check id and the independent test", () => {
    const root = slicePlan();
    const t1 = cli(root, "--todo", "T1");
    expect(t1.status).toBe(0);
    expect(t1.stdout).toContain("Branch: `feat/fixture-greeting`\nSlice: S1 — greeting\n\n### T1 — Add the greeting");
    expect(t1.stdout).toContain(
      "Checks its pass receipt must record: `acceptance`, `qa:happy`, `qa:failure`, `slice:S1`\nIndependent test of S1, recorded as `slice:S1`: `bun test` greets a configured name\n",
    );
    const t2 = cli(root, "--todo", "T2").stdout;
    expect(t2).toContain("Branch: `feat/fixture`\nSlice: S2 — flag\n");
    expect(t2).toContain("Independent test of S2, recorded as `slice:S2`: the CLI accepts the flag\n");
    const t0 = cli(root, "--todo", "T0").stdout;
    expect(t0).toContain("Branch: `feat/fixture`\n\n### T0");
    expect(t0).not.toContain("Slice:");
    const notLast = cli(slicePlan(ONE), "--todo", "T1").stdout;
    expect(notLast).toContain("Slice: S1 — greeting\n");
    expect(notLast).not.toContain("slice:S1");
    expect(notLast).not.toContain("Independent test");
  });

  test("each slice is a review target, and --gate-skeleton puts them in one group", () => {
    const root = slicePlan();
    const plan = parsePlan(read(root, PLAN), read(root, EVIDENCE));
    expect(requiredTargets(plan, new Map()).filter((t) => t.startsWith("slice:"))).toEqual(["slice:S1", "slice:S2"]);
    const gate = JSON.parse(cli(root, "--gate-skeleton").stdout);
    const groups = gate.obligations.map((o: Obligation) => o.targets).filter((t: string[]) => t.some((x) => x.startsWith("slice:")));
    expect(groups).toEqual([["slice:S1", "slice:S2"]]);
    const uncovered = makeProject();
    reviewedPlan(uncovered, { mutatePlan: strategy(TWO) });
    const review = run(uncovered, ["--review"]);
    expect(review.gaps).toContain("required target slice:S1 has no required obligation");
    expect(review.expectedVerdict).toBe("INCOMPLETE");
  });

  test("a plan without slices gets none of the three keys, no slice: target, and no slice check", () => {
    const { root } = buildScenario();
    for (const flags of [[], ["--review"], ["--review", "--resume"]]) {
      const result = run(root, flags);
      for (const key of KEYS) expect(key in result).toBe(false);
    }
    const json = JSON.parse(cli(root, "--review", "--resume", "--json").stdout);
    for (const key of KEYS) expect(key in json).toBe(false);
    const plan = parsePlan(read(root, PLAN), read(root, EVIDENCE));
    expect(plan.slices).toEqual([]);
    expect(requiredTargets(plan, new Map()).some((t) => t.startsWith("slice:"))).toBe(false);
    expect(plan.todos.map((t) => requiredCheckIds(t, plan))).toEqual(plan.todos.map((t) => requiredCheckIds(t)));
    expect(cli(root, "--todo", "T2").stdout).not.toContain("Slice:");
  });
});

describe("review mode", () => {
  test("a complete evidence-backed OKAY is gate eligible", () => {
    const root = makeProject();
    reviewedPlan(root);
    const result = run(root, ["--review"]);
    expect(result.errors).toEqual([]);
    expect(result.gaps).toEqual([]);
    expect(result.expectedVerdict).toBe("OKAY");
    expect(result.gateEligible).toBe(true);
    expect(result.gateRecordDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a soft-cap gap in the spec does not change the expected verdict", () => {
    const root = makeProject();
    reviewedPlan(root, { mutatePlan: (t) => t.replace("- Do: add the flag.", `- Do: ${words(160)}.`) });
    const result = run(root, ["--review"]);
    expect(result.errors).toEqual([]);
    expect(result.gaps.length).toBe(1);
    expect(result.expectedVerdict).toBe("OKAY");
    expect(result.gateEligible).toBe(true);
  });

  test("an honest REJECT is valid but not eligible", () => {
    const root = makeProject();
    reviewedPlan(root, {
      verdict: "REJECT",
      obligations: [
        { id: "O1", targets: ALL_TARGETS, evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" },
        { id: "O2", targets: ["T2.acceptance"], evidenceIds: ["P1"], observed: "flag test cannot fail", plannedQa: "Q1", status: "contradicted" },
      ],
      blockers: [{ id: "B1", obligationIds: ["O2"], location: "T2 Acceptance", failure: "cannot detect a broken flag", evidenceIds: ["P1"], fix: "assert the flag output" }],
    });
    const result = run(root, ["--review"]);
    expect(result.errors).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(result.expectedVerdict).toBe("REJECT");
    expect(result.gateEligible).toBe(false);
  });

  test("an honest INCOMPLETE is valid but not eligible", () => {
    const root = makeProject();
    reviewedPlan(root, {
      verdict: "INCOMPLETE",
      obligations: [
        { id: "O1", targets: ALL_TARGETS.filter((t) => t !== "contract:C5"), evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" },
        { id: "O2", targets: ["contract:C5"], evidenceIds: [], observed: "page unreachable", plannedQa: "Q1", status: "unverified" },
      ],
    });
    const result = run(root, ["--review"]);
    expect(result.errors).toEqual([]);
    expect(result.expectedVerdict).toBe("INCOMPLETE");
    expect(result.gateEligible).toBe(false);
  });

  test("a missing reviews file or gate record file is a GATE_RECORD error", () => {
    const root = makeProject();
    reviewedPlan(root);
    rmSync(join(root, GATE));
    expect(run(root, ["--review"]).errors.some((e) => e.code === "GATE_RECORD" && e.file === GATE)).toBe(true);
    const root2 = makeProject();
    reviewedPlan(root2);
    rmSync(join(root2, REVIEWS));
    expect(run(root2, ["--review"]).errors.some((e) => e.code === "GATE_RECORD" && e.file === REVIEWS)).toBe(true);
  });

  test("an OKAY with a deleted required target is inconsistent and not eligible", () => {
    const root = makeProject();
    reviewedPlan(root, { obligations: [{ id: "O1", targets: ALL_TARGETS.filter((t) => t !== "T2.qa"), evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" }] });
    const result = run(root, ["--review"]);
    expect(codes(result)).toContain("VERDICT");
    expect(result.gaps.some((g) => g.includes("T2.qa"))).toBe(true);
    expect(result.gateEligible).toBe(false);
  });

  test("marking a target optional does not cover it", () => {
    const root = makeProject();
    reviewedPlan(root, {
      obligations: [
        { id: "O1", targets: ALL_TARGETS.filter((t) => t !== "MH2"), evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" },
        { id: "O2", targets: ["MH2"], evidenceIds: ["C1"], observed: "skipped", plannedQa: "Q1", status: "verified", required: false },
      ],
    });
    const result = run(root, ["--review"]);
    expect(result.gaps.some((g) => g.includes("MH2"))).toBe(true);
    expect(result.gateEligible).toBe(false);
  });

  test("a runtime claim verified only by planned QA fails", () => {
    const root = makeProject();
    reviewedPlan(root, { obligations: [{ id: "O1", targets: ALL_TARGETS, evidenceIds: ["Q1"], observed: "the future test will pass", plannedQa: "Q1", status: "verified" }] });
    const result = run(root, ["--review"]);
    expect(codes(result)).toContain("PLANNED_QA_AS_EVIDENCE");
    expect(result.gateEligible).toBe(false);
  });

  test("a contradicted obligation without a detailed blocker fails", () => {
    const root = makeProject();
    reviewedPlan(root, {
      verdict: "REJECT",
      obligations: [
        { id: "O1", targets: ALL_TARGETS, evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" },
        { id: "O2", targets: ["T1.qa"], evidenceIds: ["P1"], observed: "failure path missing", plannedQa: "Q1", status: "contradicted" },
      ],
      blockers: [],
    });
    expect(codes(run(root, ["--review"]))).toContain("GATE_BLOCKER");
  });

  test("a rendered verdict that disagrees with the gate record fails", () => {
    const root = makeProject();
    reviewedPlan(root, { renderVerdict: "INCOMPLETE" });
    expect(run(root, ["--review"]).errors.some((e) => e.code === "RENDERED_MISMATCH" && e.file === REVIEWS)).toBe(true);
  });

  const REJECTED: GateOptions = {
    verdict: "REJECT",
    obligations: [
      { id: "O1", targets: ALL_TARGETS, evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" },
      { id: "O2", targets: ["T2.acceptance"], evidenceIds: ["P1"], observed: "flag test cannot fail", plannedQa: "Q1", status: "contradicted" },
    ],
    blockers: [{ id: "B1", obligationIds: ["O2"], location: "T2 Acceptance", failure: "cannot detect a broken flag", evidenceIds: ["P1"], fix: "assert the flag output" }],
  };

  test("a round renders only its open obligations and validates", () => {
    const root = makeProject();
    reviewedPlan(root, REJECTED);
    const reviews = read(root, REVIEWS);
    expect(reviews).toContain("#### Open obligations");
    expect(reviews).not.toContain("| O1 |");
    const result = run(root, ["--review"]);
    expect(result.errors).toEqual([]);
    expect(result.expectedVerdict).toBe("REJECT");
  });

  test("an OKAY round with no open obligation needs no rendered list", () => {
    const root = makeProject();
    reviewedPlan(root);
    expect(read(root, REVIEWS)).not.toContain("#### Open obligations");
    expect(run(root, ["--review"]).gateEligible).toBe(true);
  });

  test("an open obligation left out of the rendered list fails", () => {
    const root = makeProject();
    reviewedPlan(root, { ...REJECTED, hide: ["O2"] });
    expect(run(root, ["--review"]).errors.some((e) => e.code === "RENDERED_MISMATCH" && e.message.includes("O2"))).toBe(true);
    const root2 = makeProject();
    const obligations = [
      ...(REJECTED.obligations as Obligation[]),
      { id: "O3", targets: ["MH2"], evidenceIds: [], observed: "flag contract page unreachable", plannedQa: "Q1", status: "unverified" },
    ];
    reviewedPlan(root2, { ...REJECTED, obligations, hide: ["O3"] });
    const errors = run(root2, ["--review"]).errors;
    expect(errors.some((e) => e.code === "RENDERED_MISMATCH" && e.message === "open obligation O3 is missing from the rendered list")).toBe(true);
  });

  test("duplicate rows cannot hide a wrong status", () => {
    const root = makeProject();
    reviewedPlan(root, REJECTED);
    const reviews = read(root, REVIEWS);
    const row = reviews.split("\n").find((line) => line.startsWith("| O2 |")) as string;
    write(root, REVIEWS, reviews.replace(row, `${row.replace("| contradicted |", "| verified |")}\n${row}`));
    const result = run(root, ["--review"]);
    expect(result.errors.some((e) => e.message.includes("duplicate rendered obligation O2"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("rendered status of O2 is 'verified'"))).toBe(true);
  });

  test("unknown rendered obligations and an incorrect status are refused", () => {
    const root = makeProject();
    reviewedPlan(root, { ...REJECTED, renderStatus: () => "verified" });
    write(root, REVIEWS, read(root, REVIEWS).replace(/(\| O2 \|[^\n]*\n)/, "$1| O99 | x | P1 | unknown | unknown |\n"));
    const result = run(root, ["--review"]);
    expect(result.errors.some((e) => e.message.includes("rendered status of O2"))).toBe(true);
    expect(result.errors.some((e) => e.message.includes("rendered row O99 is not in the gate record"))).toBe(true);
  });

  test("rounds are newest first and the highest number is the latest", () => {
    const root = makeProject();
    const text = planText(root, { status: "reviewed", reviewRound: 2 });
    writePlan(root, text);
    const r1 = gateRecord(root, specOf(root, text), { ...REJECTED, round: 1 });
    const r2 = gateRecord(root, specOf(root, text), { round: 2 });
    writeGate(root, r2);
    const history = historyTable([[1, "REJECT", 1, "B1 T2 flag test cannot fail"], [2, "OKAY", 0, "B1 fixed"]]);
    writeReviews(root, history, [renderRound(r2), renderRound(r1, REJECTED)]);
    const result = run(root, ["--review"]);
    expect(result.errors).toEqual([]);
    expect(result.gateEligible).toBe(true);
    // The gate record file holds the latest round only.
    writeGate(root, r1);
    expect(run(root, ["--review"]).errors.some((e) => e.code === "GATE_RECORD" && e.message.includes("does not match the latest round"))).toBe(true);
  });

  test("the history row for the latest round needs a Summary", () => {
    const root = makeProject();
    reviewedPlan(root, { history: historyTable([[1, "OKAY", 0, ""]]) });
    expect(run(root, ["--review"]).errors.some((e) => e.code === "RENDERED_MISMATCH" && e.message.includes("Summary"))).toBe(true);
  });

  test("a gate source the evidence index already cites is refused", () => {
    const root = makeProject();
    reviewedPlan(root, { mutateGate: (g) => (g.sources as unknown[]).push({ path: "src/app.ts", sha256: sha(APP) }) });
    expect(run(root, ["--review"]).errors.some((e) => e.code === "GATE_RECORD" && e.file === GATE && e.message.includes("src/app.ts"))).toBe(true);
  });

  test("gate record prose and blocker paragraphs are capped", () => {
    const root = makeProject();
    reviewedPlan(root, { mutateGate: (g) => ((g.obligations as Obligation[])[0].observed = "x".repeat(250)) });
    const soft = run(root, ["--review"]);
    expect(soft.errors).toEqual([]);
    expect(soft.gaps.some((g) => g.includes("obligation O1 observed is 250 characters"))).toBe(true);
    expect(soft.expectedVerdict).toBe("OKAY");
    const root2 = makeProject();
    reviewedPlan(root2, { mutateGate: (g) => ((g.checks as Record<string, { observed: string }>).A.observed = "x".repeat(401)) });
    expect(codes(run(root2, ["--review"]))).toContain("FIELD_CAP");
    const root3 = makeProject();
    reviewedPlan(root3, { ...REJECTED, blockerText: [`**B1 — T2 — ${words(241)}.**`] });
    expect(run(root3, ["--review"]).errors.some((e) => e.code === "FIELD_CAP" && e.file === REVIEWS)).toBe(true);
  });

  test("editing the plan or its evidence index after review makes the review stale", () => {
    const root = makeProject();
    const text = reviewedPlan(root);
    writePlan(root, text.replace("- Do: add the flag.", "- Do: add two flags."));
    expect(codes(run(root, ["--review"]))).toContain("STALE_REVIEW");
    const root2 = makeProject();
    reviewedPlan(root2);
    write(root2, EVIDENCE, read(root2, EVIDENCE).replace('"counterexample": "empty config name"', '"counterexample": "a null config"'));
    const result = run(root2, ["--review"]);
    expect(codes(result)).toContain("STALE_REVIEW");
    expect(result.gateEligible).toBe(false);
  });

  test("a reviewed source that changed afterwards is drift, even with an unchanged HEAD", () => {
    const root = makeProject();
    reviewedPlan(root);
    const head = git(root, "rev-parse", "HEAD").toString();
    writeFileSync(join(root, "README.md"), `${README}drift\n`);
    writeFileSync(join(root, "src/app.ts"), `${APP}// drift\n`);
    const result = run(root, ["--review"]);
    expect(git(root, "rev-parse", "HEAD").toString()).toBe(head);
    expect(codes(result)).toContain("SOURCE_DRIFT");
    expect(codes(result)).toContain("CITATION_DRIFT");
    expect(result.gateEligible).toBe(false);
  });

  test("an OKAY round must set status: reviewed", () => {
    const root = makeProject();
    reviewedPlan(root, { status: "planned" });
    expect(codes(run(root, ["--review"]))).toContain("STATUS");
  });
});

describe("resume mode", () => {
  test("after T1 changes a cited file, normal review reports drift while resume selects T2", () => {
    const { root } = buildScenario();
    const review = run(root, ["--review"]);
    expect(codes(review)).toContain("CITATION_DRIFT");
    expect(review.gateEligible).toBe(false);
    const resume = run(root, ["--review", "--resume"]);
    expect(resume.errors).toEqual([]);
    expect(resume.resumeEligible).toBe(true);
    expect(resume.gateEligible).toBe(false);
    expect(resume.nextTodo).toBe("T2");
    expect(resume.requiredRechecks).toEqual([{ todo: "T2", paths: ["src/app.ts"] }]);
  });

  test("an extra unrecorded byte blocks advancement and asks for recovery", () => {
    const { root } = buildScenario();
    writeFileSync(join(root, "src/app.ts"), `${read(root, "src/app.ts")} `);
    const result = run(root, ["--review", "--resume"]);
    expect(codes(result)).toContain("STATE_DRIFT");
    expect(result.resumeEligible).toBe(false);
    expect(result.recoveryRequired).toBe(true);
    expect(result.drift).toContain("src/app.ts [worktree]");
    expect(result.unresolvedAction).toContain("src/app.ts");
  });

  test("receipt and review appends keep the state identity; an instruction change does not", () => {
    const { root } = buildScenario();
    write(root, REVIEWS, `${read(root, REVIEWS)}\n## Result review\n\n### Result round 1\n\nMATCH\n`);
    write(root, BUILD, `${read(root, BUILD)}\nA build note.\n`);
    expect(run(root, ["--review", "--resume"]).resumeEligible).toBe(true);
    writePlan(root, read(root, PLAN).replace("- Do: add the flag.", "- Do: add the flag and a logger."));
    const changed = run(root, ["--review", "--resume"]);
    expect(codes(changed)).toContain("SPEC_CHANGED");
    expect(changed.resumeEligible).toBe(false);
  });

  test("an unrelated new file in the plan directory is drift", () => {
    const { root } = buildScenario();
    write(root, `${DIR}/notes.md`, "unrecorded work\n");
    const result = run(root, ["--review", "--resume"]);
    expect(result.resumeEligible).toBe(false);
    expect(result.drift).toContain(`${DIR}/notes.md [worktree]`);
  });

  test("a baseline captured without the sibling reports is refused", () => {
    const { root } = buildScenario({ reports: [] });
    const result = run(root, ["--review", "--resume"]);
    expect(result.errors.some((e) => e.code === "BUILD_RECORD" && e.message.includes("as reports"))).toBe(true);
    expect(result.resumeEligible).toBe(false);
  });

  test("a later rejection revokes the approval the build started from", () => {
    const { root } = buildScenario();
    const text = read(root, PLAN).replace("status: reviewed", "status: planned").replace("review_round: 1", "review_round: 2");
    writePlan(root, text);
    const gate = gateRecord(root, specOf(root, text), {
      round: 2,
      verdict: "REJECT",
      obligations: [
        { id: "O1", targets: ALL_TARGETS, evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" },
        { id: "O2", targets: ["T2.qa"], evidenceIds: ["P1"], observed: "missing failure path", plannedQa: "Q1", status: "contradicted" },
      ],
      blockers: [{ id: "B1", obligationIds: ["O2"], location: "T2", failure: "no failure path", evidenceIds: ["P1"], fix: "add one" }],
    });
    writeGate(root, gate);
    const old = read(root, REVIEWS).split("### Round 1")[1];
    writeReviews(root, historyTable([[1, "OKAY", 0], [2, "REJECT", 1]]), [renderRound(gate), `### Round 1${old}`]);
    const result = run(root, ["--review", "--resume"]);
    expect(codes(result)).toContain("APPROVAL_CHANGED");
    expect(result.resumeEligible).toBe(false);
  });

  test("a Done box without a passed receipt is forged", () => {
    const { root } = buildScenario();
    setBoxes(root, ["T2"]);
    const result = run(root, ["--review", "--resume"]);
    expect(result.errors.some((e) => e.code === "DONE_WITHOUT_RECEIPT" && e.file === PLAN)).toBe(true);
  });

  test("a passed receipt with an Open box is reconciled, not repeated", () => {
    const { root } = buildScenario();
    writePlan(root, read(root, PLAN).replace("### T1 — Add the greeting\n\n- [x] Done", "### T1 — Add the greeting\n\n- [ ] Open"));
    const result = run(root, ["--review", "--resume"]);
    expect(result.resumeEligible).toBe(true);
    expect(result.reconcileBoxes).toEqual(["T1"]);
    expect(result.nextTodo).toBe("T2");
  });

  test("starting a todo before its dependency passed fails", () => {
    const { root, record, baseline } = buildScenario({ stopAfter: "T0" });
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "pass", after: "same", checks: [check("acceptance"), check("qa:happy")] },
      { todo: "T2", event: "pass", after: "same" },
    ]);
    writeBuild(root, record);
    expect(codes(run(root, ["--review", "--resume"]))).toContain("DEPENDENCY_ORDER");
  });

  test("a tampered blob and a tampered receipt are detected", () => {
    const { root, after } = buildScenario();
    const manifest = JSON.parse(readFileSync(join(root, ".git", (after as Ref).snapshot, "manifest.json"), "utf8"));
    const row = manifest.paths.find((p: { path: string }) => p.path === "src/app.ts");
    writeFileSync(join(root, ".git", (after as Ref).snapshot, "objects", row.worktree.sha256), "tampered\n");
    expect(codes(run(root, ["--review", "--resume"]))).toContain("SNAPSHOT_CORRUPT");

    const second = buildScenario();
    write(second.root, BUILD, read(second.root, BUILD).replace('"note": ""', '"note": "edited later"'));
    expect(codes(run(second.root, ["--review", "--resume"]))).toContain("RECEIPT_CHAIN");
  });

  test("a receipt key outside the schema, such as changedPaths, is refused", () => {
    const { root, record, baseline } = buildScenario({ stopAfter: "T0" });
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "pass", after: "same", checks: [check("acceptance"), check("qa:happy")], extra: { changedPaths: [], log: "silly-skills/plan-builds/run/logs/t0.log" } },
    ]);
    writeBuild(root, record);
    const errors = run(root, ["--review", "--resume"]).errors.filter((e) => e.code === "RECEIPT_FIELD");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("changedPaths");
    expect(errors[0].file).toBe(BUILD);
  });

  test("receipt prose is capped: a long observed is a gap, a very long one an error", () => {
    for (const [size, expectError] of [[250, false], [401, true]] as const) {
      const { root, record, baseline } = buildScenario({ stopAfter: "T0" });
      record.receipts = receipts(baseline, [
        { todo: "T0", event: "pass", after: "same", checks: [check("acceptance", "x".repeat(size)), check("qa:happy")] },
      ]);
      writeBuild(root, record);
      const result = run(root, ["--review", "--resume"]);
      expect(codes(result).includes("FIELD_CAP")).toBe(expectError);
      if (!expectError) {
        expect(result.resumeEligible).toBe(true);
        expect(result.gaps.some((g) => g.includes("observed is 250 characters"))).toBe(true);
      }
    }
  });

  test("a Build record from another repository fails", () => {
    const { root, record } = buildScenario();
    record.repository = { kind: "git", rootCommits: ["f".repeat(40)], branch: null };
    writeBuild(root, record);
    expect(codes(run(root, ["--review", "--resume"]))).toContain("REPOSITORY_MISMATCH");
  });

  test("a missing snapshot or a missing build file is an unreadable input", () => {
    const { root, after } = buildScenario();
    rmSync(join(root, ".git", (after as Ref).snapshot), { recursive: true });
    const result = run(root, ["--review", "--resume"]);
    expect(codes(result)).toContain("SNAPSHOT_MISSING");
    expect(result.exitCode).toBe(2);
    expect(result.resumeEligible).toBe(false);
    const second = buildScenario();
    rmSync(join(second.root, BUILD));
    const noBuild = run(second.root, ["--review", "--resume"]);
    expect(noBuild.exitCode).toBe(2);
    expect(noBuild.errors.some((e) => e.code === "BUILD_RECORD" && e.file === BUILD)).toBe(true);
  });

  test("a recovery receipt that matches the workspace resumes only that todo", () => {
    const { root, record, baseline, spec, carry } = buildScenario({ stopAfter: "T0" });
    writeFileSync(join(root, "src/app.ts"), `${APP}// partial\n`);
    const partial = saveSnapshot(root, snapshot(root, "silly-skills/plan-builds/run/T1-recovery", { carry }), spec);
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "pass", after: "same", checks: [check("acceptance"), check("qa:happy")] },
      { todo: "T1", event: "recovery", after: partial, note: "T1 edits from an interrupted attempt; kept" },
    ]);
    writeBuild(root, record);
    const result = run(root, ["--review", "--resume"]);
    expect(result.errors).toEqual([]);
    expect(result.resumeEligible).toBe(true);
    expect(result.activeTodo).toBe("T1");
    expect(result.nextTodo).toBe("T1");
  });

  test("edits with no receipt after them require recovery before the next todo", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    writeFileSync(join(root, "src/app.ts"), `${APP}// partial\n`);
    const result = run(root, ["--review", "--resume"]);
    expect(result.resumeEligible).toBe(false);
    expect(result.recoveryRequired).toBe(true);
    expect(result.activeTodo).toBeNull();
    expect(result.nextTodo).toBe("T1");
    expect(result.unresolvedAction).toContain("recovery receipt");
  });

  test("a commit whose receipt was lost is drift, not a completed todo", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    writeFileSync(join(root, "src/app.ts"), `${APP}// committed\n`);
    git(root, "commit", "-q", "-am", "unrecorded");
    const result = run(root, ["--review", "--resume"]);
    expect(result.recoveryRequired).toBe(true);
    expect(result.drift.some((d) => d.startsWith("HEAD "))).toBe(true);
    expect(result.nextTodo).toBe("T1");
  });

  test("a Commit: yes todo needs its commit, and the after-state HEAD must be that commit", () => {
    const ok = buildScenario({ t1Commit: true });
    expect(ok.after).not.toBeNull();
    const result = run(ok.root, ["--review", "--resume"]);
    expect(result.errors).toEqual([]);
    expect(result.resumeEligible).toBe(true);
    const missing = buildScenario({ t1Commit: true, omitCommit: true });
    const bad = run(missing.root, ["--review", "--resume"]);
    expect(codes(bad)).toContain("COMMIT");
    expect(bad.resumeEligible).toBe(false);
  });

  test("a recorded failing prerequisite recheck blocks resume; a holding one clears it", () => {
    for (const status of ["fails", "holds"]) {
      const { root, record, baseline, after } = buildScenario();
      record.receipts = receipts(baseline, [
        { todo: "T0", event: "pass", after: "same", checks: [check("acceptance"), check("qa:happy")] },
        { todo: "T1", event: "pass", after: after as Ref },
        { todo: "T2", event: "recovery", after: "same", note: "recheck before T2", prerequisites: [{ targets: ["T2.start"], sources: [{ path: "src/app.ts", sha256: sha(readFileSync(join(root, "src/app.ts"))) }], status, observed: "register signature" }] },
      ]);
      writeBuild(root, record);
      const result = run(root, ["--review", "--resume"]);
      if (status === "fails") {
        expect(codes(result)).toContain("PREREQUISITE_FAILED");
        expect(result.resumeEligible).toBe(false);
      } else {
        expect(result.resumeEligible).toBe(true);
        expect(result.requiredRechecks).toEqual([]);
        expect(result.activeTodo).toBe("T2");
      }
    }
  });

  test("a blocked receipt is a valid checkpoint that does not permit advancement", () => {
    const { root, record, baseline } = buildScenario({ stopAfter: "T0" });
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "pass", after: "same", checks: [check("acceptance"), check("qa:happy")] },
      { todo: "T1", event: "block", after: "same", note: "needs a credential" },
    ]);
    writeBuild(root, record);
    const result = run(root, ["--review", "--resume"]);
    expect(result.errors).toEqual([]);
    expect(result.exitCode).toBe(0);
    expect(result.resumeEligible).toBe(false);
    expect(result.unresolvedAction).toContain("needs a credential");
  });
});

describe("ignored plan directory", () => {
  const LINE = "Plan directory: ignored by git. Leave it out of every commit.";
  /** T0 with `Commit: yes`, as a 2.1.0 writer leaves it. */
  const T0_COMMIT = (t: string): string =>
    t.replace("- QA scenario: happy — the file exists; failure — n/a.\n- Strict: no.\n- Commit: no.", "- QA scenario: happy — the file exists; failure — n/a.\n- Strict: no.\n- Commit: yes — `docs(plans): add fixture plan`.");
  /** One slice that holds both waves. */
  const ONE_SLICE = (t: string): string => t.replace("- Wave 1: T1\n", "- Slice S1 — greeting. Independent test: `bun test` greets a configured name.\n- Wave 1: T1\n");
  /** An ignore rule for the plan directory, committed. */
  const ignorePlans = (root: string): void => {
    write(root, ".gitignore", "/docs/plans/\n");
    git(root, "add", ".gitignore");
    git(root, "commit", "-q", "-m", "ignore plans");
  };
  /** The plan directory, committed, as T0 does where git tracks plans. */
  const trackPlans = (root: string): void => {
    git(root, "add", "--", DIR);
    git(root, "commit", "-q", "-m", "docs(plans): add fixture plan");
  };
  const T0_PASS: ReceiptInput = { todo: "T0", event: "pass", after: "same", checks: [check("acceptance"), check("qa:happy")], commit: { none: "git ignores the plan directory" } };
  /** buildScenario on a plan whose T0 says Commit: yes, with a T0 pass receipt that names no commit. */
  const scenario = (beforeBaseline: (root: string) => void, options: ScenarioOptions = {}) => {
    const s = buildScenario({ ...options, mutatePlan: T0_COMMIT, beforeBaseline });
    s.record.receipts = receipts(s.baseline, [T0_PASS, ...s.inputs.slice(1)]);
    writeBuild(s.root, s.record);
    return s;
  };
  const resume = (root: string) => run(root, ["--review", "--resume"]);
  const commitErrors = (result: { errors: { code: string; message: string }[] }): string[] => result.errors.filter((e) => e.code === "COMMIT").map((e) => e.message);
  const noCommit = (seq: number, id: string) => `receipt ${seq}: ${id} says Commit: yes but its passed receipt has no commit`;
  const cli = (root: string, ...args: string[]) => spawnSync("bun", [rootCli, PLAN, ...args, "--root", root], { encoding: "utf8" });

  test("the check is true only in a git repository whose ignore rules match an untracked spec", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    expect(planIgnored(root, PLAN)).toBe(false);
    mkdirSync(join(root, ".git/info"), { recursive: true });
    write(root, ".git/info/exclude", "/docs/plans/\n");
    expect(planIgnored(root, PLAN)).toBe(true);
    write(root, ".git/info/exclude", "");
    expect(planIgnored(root, PLAN)).toBe(false);
    ignorePlans(root);
    expect(planIgnored(root, PLAN)).toBe(true);
    git(root, "add", "-f", "--", PLAN);
    git(root, "commit", "-q", "-m", "track the spec");
    expect(planIgnored(root, PLAN)).toBe(false);
    const outside = tempDir();
    mkdirSync(join(outside, DIR), { recursive: true });
    write(outside, ".gitignore", "/docs/plans/\n");
    write(outside, PLAN, "# Fixture plan\n");
    expect(planIgnored(outside, PLAN)).toBe(false);
  });

  test("the JSON has planIgnored: true in plan, review, and resume mode there, before the slice keys, and the existing fixtures have no such key", () => {
    const { root } = scenario(ignorePlans, { stopAfter: "T0" });
    for (const flags of [[], ["--review"], ["--review", "--resume"]]) expect(run(root, flags).planIgnored).toBe(true);
    expect(JSON.parse(cli(root, "--review", "--resume", "--json").stdout).planIgnored).toBe(true);
    const sliced = makeProject();
    ignorePlans(sliced);
    writePlan(sliced, planText(sliced, { mutate: ONE_SLICE }));
    const keys = Object.keys(run(sliced));
    expect(keys.slice(keys.indexOf("exitCode"))).toEqual(["exitCode", "planIgnored", "slices"]);
    const plain = buildScenario();
    for (const flags of [[], ["--review"], ["--review", "--resume"]]) expect("planIgnored" in run(plain.root, flags)).toBe(false);
    expect(cli(plain.root, "--review", "--resume", "--json").stdout).not.toContain("planIgnored");
  });

  test("a Commit: yes T0 whose pass receipt names no commit resumes there, and is a COMMIT error where git tracks the plan", () => {
    const ignored = resume(scenario(ignorePlans, { stopAfter: "T0" }).root);
    expect(ignored.errors).toEqual([]);
    expect(ignored.resumeEligible).toBe(true);
    expect(ignored.nextTodo).toBe("T1");
    const tracked = resume(scenario(trackPlans, { stopAfter: "T0" }).root);
    expect(codes(tracked)).toEqual(["COMMIT"]);
    expect(commitErrors(tracked)).toEqual([noCommit(1, "T0")]);
    expect(tracked.resumeEligible).toBe(false);
    expect("planIgnored" in tracked).toBe(false);
    // A T0 receipt that names a commit is still checked against its after-state HEAD.
    const named = scenario(ignorePlans, { stopAfter: "T0" });
    named.record.receipts = receipts(named.baseline, [{ ...T0_PASS, commit: { sha: "f".repeat(40) } }]);
    writeBuild(named.root, named.record);
    expect(commitErrors(resume(named.root))).toEqual([`receipt 1: after-state HEAD is not the recorded commit ${"f".repeat(12)}`]);
  });

  test("another Commit: yes todo without a commit is a COMMIT error in both", () => {
    const ignored = resume(scenario(ignorePlans, { t1Commit: true, omitCommit: true }).root);
    expect(commitErrors(ignored)).toEqual([noCommit(2, "T1")]);
    expect(ignored.resumeEligible).toBe(false);
    const tracked = resume(scenario(trackPlans, { t1Commit: true, omitCommit: true }).root);
    expect(commitErrors(tracked)).toEqual([noCommit(1, "T0"), noCommit(2, "T1")]);
    expect(tracked.resumeEligible).toBe(false);
  });

  test("--todo prints the plan-directory line directly under the branch only there", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    expect(cli(root, "--todo", "T1").stdout).not.toContain("Plan directory");
    ignorePlans(root);
    const ignored = cli(root, "--todo", "T1");
    expect(ignored.status).toBe(0);
    expect(ignored.stdout).toContain(`Branch: \`feat/fixture\`\n${LINE}\n\n### T1 — Add the greeting`);
    expect(ignored.stdout.split(LINE).length).toBe(2);
    writePlan(root, planText(root, { mutate: ONE_SLICE }));
    expect(cli(root, "--todo", "T1").stdout).toContain(`Branch: \`feat/fixture\`\n${LINE}\nSlice: S1 — greeting\n\n### T1`);
    git(root, "add", "-f", "--", DIR);
    expect(cli(root, "--todo", "T1").stdout).not.toContain("Plan directory");
  });

  test("in that build, a later todo commits its own file, the build resumes, and no commit holds a plan file", () => {
    const { root } = scenario(ignorePlans, { t1Commit: true });
    const result = resume(root);
    expect(result.errors).toEqual([]);
    expect(result.resumeEligible).toBe(true);
    expect(result.nextTodo).toBe("T2");
    const paths = git(root, "log", "--name-only", "--format=").toString().split("\n").filter(Boolean);
    expect(paths).toContain("src/app.ts");
    expect(paths.filter((p) => p.startsWith("docs/plans/"))).toEqual([]);
  });
});

describe("format 2", () => {
  test("format 1 evidence indexes, gate records, and build records are refused with one message", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutateIndex: (i) => (i.schemaVersion = 1) }));
    const plan = run(root);
    expect(plan.errors.some((e) => e.code === "FORMAT_1" && e.message === FORMAT_1_MESSAGE)).toBe(true);
    const root2 = makeProject();
    reviewedPlan(root2, { mutateGate: (g) => (g.schemaVersion = 1) });
    expect(codes(run(root2, ["--review"]))).toContain("FORMAT_1");
    const { root: root3, record } = buildScenario();
    writeBuild(root3, { ...record, schemaVersion: 1 });
    expect(codes(run(root3, ["--review", "--resume"]))).toContain("FORMAT_1");
  });

  test("a source citation needs no excerpt but needs a stamped sha256", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    expect(run(root).errors).toEqual([]);
    writePlan(root, planText(root, { mutateIndex: (i) => ((i.citations as Record<string, unknown>[])[0].sha256 = "") }));
    expect(run(root).errors.some((e) => e.code === "CITATION" && e.message.includes("stamp-evidence.ts"))).toBe(true);
  });

  test("a todo needs a Strict field that names no or a known strict area", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutate: (t) => t.replace("- Do: add the flag.", "- Do: add the flag.\n- Strict: security, production.").replace(/(flag works; failure — unknown flag\.\n)- Strict: no\.\n/, "$1") }));
    expect(run(root).errors).toEqual([]);
    writePlan(root, planText(root, { mutate: (t) => t.replace(/(flag works; failure — unknown flag\.\n)- Strict: no\./, "$1- Strict: billing.") }));
    expect(run(root).errors.some((e) => e.code === "TODO" && e.message.includes("unknown strict area 'billing'"))).toBe(true);
    writePlan(root, planText(root, { mutate: (t) => t.replace(/(flag works; failure — unknown flag\.\n)- Strict: no\.\n/, "$1") }));
    expect(run(root).errors.some((e) => e.code === "TODO" && e.message.includes("T2 is missing '- Strict:'"))).toBe(true);
  });

  test("a pass receipt needs a passing acceptance check and one passing check per QA part that is not n/a", () => {
    const { root, record, baseline, after } = buildScenario();
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "pass", after: "same", checks: [check("acceptance"), check("qa:happy")] },
      { todo: "T1", event: "pass", after: after as Ref, checks: [check("acceptance"), check("qa:happy")] },
    ]);
    writeBuild(root, record);
    const result = run(root, ["--review", "--resume"]);
    expect(result.errors.some((e) => e.code === "MISSING_CHECK" && e.message.includes("'qa:failure'"))).toBe(true);
    expect(result.resumeEligible).toBe(false);
  });

  test("a fix receipt follows the last todo, names a final gate, and needs passing checks", () => {
    const build = () => {
      const s = buildScenario();
      setBoxes(s.root, ["T0", "T1", "T2"]);
      return s;
    };
    const ok = build();
    ok.record.receipts = receipts(ok.baseline, [
      ...ok.inputs.slice(0, 1),
      { todo: "T1", event: "pass", after: ok.after as Ref },
      { todo: "T2", event: "pass", after: "same" },
      { todo: "F4", event: "fix", after: "same", checks: [check("blocking:D1")] },
    ]);
    writeBuild(ok.root, ok.record);
    const good = run(ok.root, ["--review", "--resume"]);
    expect(good.errors).toEqual([]);
    expect(good.resumeEligible).toBe(true);
    const early = build();
    early.record.receipts = receipts(early.baseline, [...early.inputs.slice(0, 1), { todo: "F4", event: "fix", after: "same", checks: [check("blocking:D1")] }]);
    writeBuild(early.root, early.record);
    expect(run(early.root, ["--review", "--resume"]).errors.some((e) => e.code === "RECEIPT_ORDER" && e.message.includes("before T1, T2 passed"))).toBe(true);
  });

  test("qaLabels and requiredCheckIds read labelled QA parts and skip n/a", () => {
    const parsed = parsePlan(planText(makeProject()));
    const t0 = parsed.todos.find((t) => t.id === "T0") as Todo;
    const t1 = parsed.todos.find((t) => t.id === "T1") as Todo;
    expect(qaLabels(t0)).toEqual(["happy"]);
    expect(requiredCheckIds(t1)).toEqual(["acceptance", "qa:happy", "qa:failure"]);
    expect(requiredCheckIds({ ...t1, fields: { ...t1.fields, "QA scenario": "open the page and see the list" } })).toEqual(["acceptance", "qa"]);
  });
});

describe("stamp-evidence", () => {
  const stamp = join(repo, "skills/planning/plan-review/scripts/stamp-evidence.ts");

  test("fills empty source hashes in split blocks, keeps one-line blocks on one line, and the plan then validates", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    const index = evidenceIndex(root) as Record<string, Record<string, unknown>[]>;
    const filled = index.citations[1].sha256;
    index.citations[0].sha256 = "";
    delete index.citations[5].sha256;
    const blocks = [
      { ...index, citations: index.citations.slice(0, 5) },
      { citations: [index.citations[5]] },
    ];
    write(root, EVIDENCE, `# Evidence index: Fixture plan\n\n\`\`\`json\n${JSON.stringify(blocks[0], null, 2)}\n\`\`\`\n\n\`\`\`json\n${JSON.stringify(blocks[1])}\n\`\`\`\n`);
    expect(codes(run(root))).toContain("CITATION");
    const p = spawnSync("bun", [stamp, PLAN, "--root", root], { encoding: "utf8" });
    expect(p.status).toBe(0);
    expect(p.stdout).toContain("stamped 2 citation(s): C1, C6");
    const after = read(root, EVIDENCE);
    expect(after).toContain(`{"citations":[{"id":"C6","kind":"source","path":"src/app.ts","startLine":5,"endLine":7,"sha256":"${sha(APP)}"}]}`);
    expect(after).toContain(filled as string);
    expect(run(root).errors).toEqual([]);
    const again = spawnSync("bun", [stamp, PLAN, "--root", root], { encoding: "utf8" });
    expect(again.stdout).toContain("stamped 0 citation(s)");
    expect(read(root, EVIDENCE)).toBe(after);
  });

  test("a missing or unsafe cited file stays empty and exits 1", () => {
    const root = makeProject();
    writePlan(root, planText(root, {
      mutateIndex: (i) => (i.citations as Record<string, unknown>[]).push({ id: "C7", kind: "source", path: "../outside.ts", startLine: 1, endLine: 1, sha256: "" }),
    }));
    const p = spawnSync("bun", [stamp, PLAN, "--root", root], { encoding: "utf8" });
    expect(p.status).toBe(1);
    expect(p.stdout).toContain("unreadable: C7 (../outside.ts)");
  });
});

describe("CLI", () => {
  function cli(script: string, args: string[]) {
    const p = spawnSync("bun", [script, ...args], { encoding: "utf8" });
    return { code: p.status, out: p.stdout, err: p.stderr };
  }

  test("--todo prints one todo with its gaps, dependencies, strict areas, and required checks", () => {
    const root = makeProject();
    writePlan(root, planText(root));
    const result = cli(rootCli, [PLAN, "--todo", "T2", "--root", root]);
    expect(result.code).toBe(0);
    expect(result.out).toContain("### T2 — Add the flag");
    expect(result.out).toContain("| G2 |");
    expect(result.out).toContain("Depends on: T1 — Add the greeting");
    expect(result.out).toContain("Strict areas: none");
    expect(result.out).toContain("`acceptance`, `qa:happy`, `qa:failure`");
    expect(result.out).not.toContain("### T1 — Add the greeting");
    expect(cli(rootCli, [PLAN, "--todo", "F3", "--root", root]).out).toContain("### F3 — Scenario QA");
    expect(cli(rootCli, [PLAN, "--todo", "T7", "--root", root]).code).toBe(2);
    expect(cli(rootCli, [PLAN, "--todo", "nope", "--root", root]).code).toBe(2);
  });

  test("--gate-skeleton covers every required target, and filling it in yields an eligible OKAY", () => {
    const root = makeProject();
    const text = planText(root, { status: "reviewed", reviewRound: 1 });
    writePlan(root, text);
    const result = cli(rootCli, [PLAN, "--gate-skeleton", "--root", root]);
    expect(result.code).toBe(0);
    const gate = JSON.parse(result.out);
    expect(gate.schemaVersion).toBe(2);
    expect(gate.round).toBe(2);
    expect(gate.planDigest).toBe(specOf(root, text));
    expect(gate.obligations.flatMap((o: Obligation) => o.targets).sort()).toEqual([...ALL_TARGETS].sort());
    expect(gate.obligations.find((o: Obligation) => o.targets.includes("T2.start")).targets).toEqual(["T2.start", "T2.acceptance", "T2.qa", "dep:T2:T1"]);
    writePlan(root, text.replace("review_round: 1", "review_round: 2"));
    gate.planDigest = specOf(root, read(root, PLAN));
    gate.evidence = [{ id: "P1", kind: "probe", command: "bun -e 'start(\"x\")'", inputs: "fixture", exit: 0, result: "registered:x", omissions: "none" }];
    for (const o of gate.obligations) Object.assign(o, { status: "verified", evidenceIds: ["C1"], observed: "traced" });
    for (const f of gate.flows) Object.assign(f, { status: "verified", counterexample: "empty config name", evidenceIds: ["P1"] });
    for (const c of Object.values(gate.checks) as Record<string, unknown>[]) Object.assign(c, { status: "verified", evidenceIds: ["C1"], observed: "done" });
    gate.verdict = "OKAY";
    writeGate(root, gate);
    writeReviews(root, historyTable([[2, "OKAY", 0]]), [renderRound(gate)]);
    const review = run(root, ["--review"]);
    expect(review.errors).toEqual([]);
    expect(review.gateEligible).toBe(true);
  });

  test("--help exits 0 and lists every flag", () => {
    const result = cli(rootCli, ["--help"]);
    expect(result.code).toBe(0);
    for (const flag of ["--review", "--resume", "--root", "--json", "--help", "--init", "--grammar"]) expect(result.out).toContain(flag);
  });

  test("bun run validate-plan --help works from the repository", () => {
    const p = spawnSync("bun", ["run", "validate-plan", "--help"], { cwd: repo, encoding: "utf8" });
    expect(p.status).toBe(0);
    expect(p.stdout).toContain("--resume");
  });

  test("invalid arguments and unreadable plans exit 2", () => {
    expect(cli(rootCli, ["plan.md", "--resume"]).code).toBe(2);
    expect(cli(rootCli, []).code).toBe(2);
    expect(cli(rootCli, ["--bogus", "plan.md"]).code).toBe(2);
    expect(cli(rootCli, ["does-not-exist.md", "--root", tempDir()]).code).toBe(2);
  });

  test("text output uses ERROR[CODE] file:line findings and exits 1 on errors", () => {
    const root = makeProject();
    writePlan(root, planText(root, { mutateIndex: (i) => ((i.citations as Record<string, unknown>[])[0].excerpt = "nope") }));
    const result = cli(rootCli, [PLAN, "--root", root]);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(new RegExp(`ERROR\\[EXCERPT\\] ${EVIDENCE.replace(/\//g, "\\/")}:\\d+ `));
  });

  test("a detached copy of the bundled script reports the same JSON as the root entry point", () => {
    const root = makeProject();
    reviewedPlan(root);
    const detached = join(tempDir(), "validate-plan.ts");
    copyFileSync(bundled, detached);
    const a = cli(rootCli, [PLAN, "--review", "--json", "--root", root]);
    const b = cli(detached, [PLAN, "--review", "--json", "--root", root]);
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);
    expect(JSON.parse(b.out)).toEqual(JSON.parse(a.out));
    expect(JSON.parse(a.out).gateEligible).toBe(true);
    expect(readFileSync(detached, "utf8")).not.toContain("../../../../scripts");
    expect(dirname(detached)).not.toContain(repo);
    expect(existsSync(detached)).toBe(true);
  });
});

describe("skeleton and grammar commands", () => {
  const ARGS = ["--title", "Demo plan", "--slug", "demo", "--request", "Add a demo.", "--intent", "change", "--tier", "standard", "--branch", "feat/demo", "--date", "2026-09-29"];
  const DEMO = "2026-09-29-demo";
  const specRel = (stem: string) => `docs/plans/${stem}/${stem}.md`;
  const evidenceRel = (stem: string) => `docs/plans/${stem}/${stem}.evidence-index.md`;
  const cli = (...args: string[]) => spawnSync("bun", [rootCli, ...args], { encoding: "utf8" });
  const init = (root: string, ...args: string[]) => cli("--init", ...args, "--root", root);
  /** ARGS with the value after `flag` replaced, or without `flag` and its value. */
  const withValue = (flag: string, value: string) => ARGS.map((a, i) => (ARGS[i - 1] === flag ? value : a));
  const without = (flag: string) => ARGS.filter((_, i) => ARGS[i] !== flag && ARGS[i - 1] !== flag);
  /** Every entry under a directory, the Git directory left out, with the bytes of each file and the target of each link. */
  const tree = (root: string, rel = ""): string[] =>
    readdirSync(join(root, rel), { withFileTypes: true })
      .filter((e) => !(rel === "" && e.name === ".git"))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
      .flatMap((e) => {
        const path = rel === "" ? e.name : `${rel}/${e.name}`;
        if (e.isSymbolicLink()) return [`${path} -> ${readlinkSync(join(root, path))}`];
        if (e.isDirectory()) return [`${path}/`, ...tree(root, path)];
        return [`${path} ${sha(readFileSync(join(root, path)))}`];
      });
  const baselineOf = (evidence: string) => JSON.parse(evidence.split("```json\n")[1].split("\n```")[0]).baseline;
  const localToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const SKELETON_ERRORS = ["FLOW", "QUESTIONS", "QUESTIONS"];

  test("--init with the six required values creates the directory and the two files, prints the spec path, and exits 0", () => {
    const root = tempDir();
    const days = [localToday()];
    const p = init(root, "--title", "Demo\n  plan", "--slug", "demo", "--request", 'Add a "demo"\n\tthing.', "--intent", "change", "--tier", "standard", "--branch", "feat/demo");
    days.push(localToday());
    expect(p.status).toBe(0);
    const stem = days.map((day) => `${day}-demo`).find((s) => p.stdout === `${specRel(s)}\n`) as string;
    expect(stem).toBeDefined();
    expect(tree(root)).toEqual(["docs/", "docs/plans/", `docs/plans/${stem}/`, expect.stringMatching(new RegExp(`^docs/plans/${stem}/${stem}\\.evidence-index\\.md `)), expect.stringMatching(new RegExp(`^docs/plans/${stem}/${stem}\\.md `))]);
    const head = read(root, specRel(stem)).split("\n").slice(0, 13);
    expect(head).toEqual(["---", "title: Demo plan", `request: "Add a 'demo' thing."`, "source: chat", `date: ${stem.slice(0, 10)}`, "status: draft", "tier: standard", "intent: change", "branch: feat/demo", "ui: no", "review: optional", "review_round: 0", "---"]);
    const other = tempDir();
    expect(init(other, ...withValue("--tier", "architecture"), "--source", "ticket:ABC-1", "--ui", "yes").status).toBe(0);
    const front = parsePlan(read(other, specRel(DEMO))).frontmatter;
    expect([front.date, front.source, front.ui, front.tier, front.review]).toEqual(["2026-09-29", "ticket:ABC-1", "yes", "architecture", "required"]);
  });

  test("the validator's errors on that skeleton are two QUESTIONS errors and one FLOW error", () => {
    const root = makeProject();
    expect(init(root, ...ARGS).status).toBe(0);
    const result = validatePlan(specRel(DEMO), { root });
    expect(codes(result).sort()).toEqual(SKELETON_ERRORS);
    expect(result.errors.filter((e) => e.code === "QUESTIONS").map((e) => e.message)).toEqual(["'### Product' is empty", "'### Technical' is empty"]);
    expect(result.errors.find((e) => e.code === "FLOW")?.file).toBe(evidenceRel(DEMO));
    expect(result.gaps).toEqual([]);
  });

  test("set to planned, the skeleton reports PLACEHOLDER and TODO errors: the template cannot pass", () => {
    const root = makeProject();
    expect(init(root, ...ARGS).status).toBe(0);
    write(root, specRel(DEMO), read(root, specRel(DEMO)).replace("\nstatus: draft\n", "\nstatus: planned\n"));
    const result = validatePlan(specRel(DEMO), { root });
    expect(codes(result)).toContain("PLACEHOLDER");
    const todo = result.errors.filter((e) => e.code === "TODO").map((e) => e.message);
    for (const field of TODO_FIELDS) expect(todo).toContain(`T1 is missing '- ${field}:'`);
    expect(todo.filter((m) => m.startsWith("T0 "))).toEqual([]);
  });

  test("the spec holds the validator's sections and Scope subsections in order, the gates, the template, and a T0 with the stem and the slug", () => {
    const root = tempDir();
    expect(init(root, ...ARGS).status).toBe(0);
    const text = read(root, specRel(DEMO));
    const parsed = parsePlan(text);
    expect(parsed.sections.map((s) => s.title)).toEqual([SECTIONS[0], "Behavior", ...SECTIONS.slice(1)]);
    const scope = text.slice(text.indexOf("\n## Scope\n"), text.indexOf("\n## Research\n")).split("\n");
    expect(scope.filter((l) => l.startsWith("### ")).map((l) => l.slice(4))).toEqual([...SCOPE_SUBSECTIONS]);
    expect(text).toContain("## Questions\n\n### Product\n\n<!-- todo: product -->\n\n### Technical\n\n<!-- todo: technical -->\n");
    expect(parsed.finals.map((f) => [f.id, f.box])).toEqual([["F1", "Open"], ["F2", "Open"], ["F3", "Open"], ["F4", "Open"]]);
    expect(parsed.todos.map((t) => [t.id, t.title, t.box])).toEqual([["T0", "Copy the plan into the project", "Open"], ["T1", "Title", "Open"]]);
    const t0 = parsed.todos[0];
    expect(Object.keys(t0.fields)).toEqual([...TODO_FIELDS]);
    expect(t0.fields.Acceptance).toBe(`\`test -f ${specRel(DEMO)}\` exits 0`);
    expect(t0.fields.Commit).toBe("yes — `docs(plans): add demo plan`");
    const template = text.slice(text.indexOf("### T1 — Title\n"), text.indexOf("\n## Final verification wave\n")).trim().split("\n").slice(2);
    expect(template).toEqual(["- [ ] Open", ...TODO_FIELDS.flatMap((f) => (f === "Closes gap" ? [f, "Serves"] : [f])).map((f) => `- ${f}:`)]);
    expect(text.endsWith("| Gap | Closed by | Proof |\n| --- | --- | --- |\n\n<!-- todo: success criteria -->\n")).toBe(true);
  });

  test("a second call with the same slug creates a directory that ends in -2 and leaves the first byte-identical", () => {
    const root = tempDir();
    expect(init(root, ...ARGS).stdout).toBe(`${specRel(DEMO)}\n`);
    const first = tree(root);
    const again = init(root, ...ARGS);
    expect(again.status).toBe(0);
    expect(again.stdout).toBe(`${specRel(`${DEMO}-2`)}\n`);
    expect(tree(root).filter((e) => !e.startsWith(`docs/plans/${DEMO}-2/`))).toEqual(first);
    const second = read(root, specRel(`${DEMO}-2`));
    expect(second).toContain(`[Evidence index](${DEMO}-2.evidence-index.md)`);
    expect(second).toContain(`- Acceptance: \`test -f ${specRel(`${DEMO}-2`)}\` exits 0`);
    expect(second).toContain("- Commit: yes — `docs(plans): add demo plan`");
    expect(codes(validatePlan(specRel(`${DEMO}-2`), { root })).sort()).toEqual(SKELETON_ERRORS);
    // A name is taken by any kind of entry: a file, and a symlink to nothing.
    write(root, `docs/plans/${DEMO}-3`, "a file\n");
    symlinkSync("missing", join(root, `docs/plans/${DEMO}-4`));
    const taken = tree(root);
    expect(init(root, ...ARGS).stdout).toBe(`${specRel(`${DEMO}-5`)}\n`);
    expect(tree(root).filter((e) => !e.startsWith(`docs/plans/${DEMO}-5/`))).toEqual(taken);
    expect(readdirSync(join(root, "docs/plans")).filter((name) => name.startsWith("."))).toEqual([]);
  });

  test("in a git repository the baseline holds the HEAD revision and the dirty paths; outside git it holds nonGit", () => {
    const root = makeProject();
    write(root, "README.md", "# Fixture\n\nChanged.\n");
    write(root, "notes.txt", "untracked\n");
    expect(init(root, ...ARGS).status).toBe(0);
    const inGit = baselineOf(read(root, evidenceRel(DEMO)));
    expect(inGit.revision).toBe(git(root, "rev-parse", "HEAD").toString().trim());
    expect([...inGit.dirty].sort()).toEqual(["README.md", "notes.txt"]);
    expect(inGit.checks).toEqual([]);
    expect("nonGit" in inGit).toBe(false);
    const outside = tempDir();
    write(outside, "notes.txt", "untracked\n");
    expect(init(outside, ...ARGS).status).toBe(0);
    expect(baselineOf(read(outside, evidenceRel(DEMO)))).toEqual({ nonGit: true, dirty: [], checks: [] });
    expect(codes(validatePlan(specRel(DEMO), { root: outside })).sort()).toEqual(SKELETON_ERRORS);
  });

  test("a slug with a slash or dots, a missing required flag, an unknown tier, and a combination with --json each exit 2 and create nothing", () => {
    const root = tempDir();
    const cases: [string[], string][] = [
      [withValue("--slug", "../x"), "--slug"],
      [withValue("--slug", "a/b"), "--slug"],
      [withValue("--slug", "a.b"), "--slug"],
      [without("--slug"), "--slug"],
      [without("--branch"), "--branch"],
      [withValue("--tier", "huge"), "--tier"],
      [[...ARGS, "--json"], "--json"],
      [withValue("--title", " \n "), "--title"],
      [withValue("--branch", "feat/a b"), "--branch"],
      [withValue("--date", "today"), "--date"],
      [[...ARGS, "--grammar"], "--grammar"],
      [[...ARGS, "--slug", "other"], "--slug"],
      [[...ARGS, "plan.md"], "plan path"],
      [[...ARGS, "--bogus"], "--bogus"],
    ];
    for (const [args, named] of cases) {
      const p = init(root, ...args);
      expect([p.status, p.stdout.trimEnd().split("\n").length, p.stdout.startsWith("error: ")]).toEqual([2, 1, true]);
      expect(p.stdout).toContain(named);
    }
    const stray = cli("--title", "Demo plan", "--root", root);
    expect([stray.status, stray.stdout.trimEnd()]).toEqual([2, "error: --title needs --init"]);
    expect(tree(root)).toEqual([]);
  });

  test("a docs/plans that is a symlink to a directory outside the root exits 2 and writes nothing there", () => {
    const outside = tempDir();
    const root = tempDir();
    mkdirSync(join(root, "docs"));
    symlinkSync(outside, join(root, "docs/plans"));
    const p = init(root, ...ARGS);
    expect([p.status, p.stdout.trimEnd()]).toEqual([2, "error: docs/plans resolves outside the root"]);
    const viaDocs = tempDir();
    symlinkSync(outside, join(viaDocs, "docs"));
    expect(init(viaDocs, ...ARGS).stdout.trimEnd()).toBe("error: docs resolves outside the root");
    expect(readdirSync(outside)).toEqual([]);
    // A symlink that stays inside the root is followed.
    const inside = tempDir();
    mkdirSync(join(inside, "docs"));
    mkdirSync(join(inside, "kept"));
    symlinkSync("../kept", join(inside, "docs/plans"));
    expect(init(inside, ...ARGS).stdout).toBe(`${specRel(DEMO)}\n`);
    expect(readdirSync(join(inside, "kept", DEMO)).sort()).toEqual([`${DEMO}.evidence-index.md`, `${DEMO}.md`]);
  });

  test("--grammar prints the Plan grammar and Field caps sections of the contract as they stand", () => {
    const contract = readFileSync(join(repo, "skills/planning/plan-review/references/validator-contract.md"), "utf8");
    const start = contract.indexOf("\n## Plan grammar\n") + 1;
    const end = contract.indexOf("\n## ", contract.indexOf("\n## Field caps\n") + 1) + 1;
    for (const script of [rootCli, bundled]) {
      const p = spawnSync("bun", [script, "--grammar"], { encoding: "utf8" });
      expect(p.status).toBe(0);
      expect(p.stdout.split("\n")[0]).toBe("## Plan grammar");
      expect(p.stdout).toContain("\n## Field caps\n");
      expect(p.stdout).toContain("\n| Todo `Do` | 150 words | 300 |\n");
      expect(p.stdout.split("\n")).not.toContain("## Evidence index");
      expect(p.stdout).toBe(`${contract.slice(start, end).trimEnd()}\n`);
    }
    for (const extra of [["--root", "."], ["plan.md"], ["--json"], ["--todo", "T1"]]) {
      const p = cli("--grammar", ...extra);
      expect([p.status, p.stdout.trimEnd().split("\n").length, p.stdout.startsWith("error: ")]).toEqual([2, 1, true]);
    }
  });

  test("a copy of the script alone exits 2 for --grammar and still validates a plan", () => {
    const dir = join(tempDir(), "scripts");
    mkdirSync(dir);
    const alone = join(dir, "validate-plan.ts");
    copyFileSync(bundled, alone);
    const grammar = spawnSync("bun", [alone, "--grammar"], { encoding: "utf8" });
    expect(grammar.status).toBe(2);
    expect(grammar.stdout.startsWith("error: cannot read ")).toBe(true);
    const root = makeProject();
    writePlan(root, planText(root));
    const checked = spawnSync("bun", [alone, PLAN, "--root", root, "--json"], { encoding: "utf8" });
    expect(checked.status).toBe(0);
    expect(JSON.parse(checked.stdout).errors).toEqual([]);
  });

  test("--help lists --init and --grammar", () => {
    const p = cli("--help");
    expect(p.status).toBe(0);
    expect(p.stdout).toContain("validate-plan --init --title <title> --slug <slug> --request <text>");
    expect(p.stdout).toContain("validate-plan --grammar\n");
    for (const flag of ["--init", "--grammar", "--title", "--slug", "--request", "--intent", "--tier", "--branch", "--source", "--date", "--ui"]) expect(p.stdout).toContain(flag);
  });
});

describe("Design subsections", () => {
  /** `--todo T2` on the fixture plan, as the validator printed it before it printed Design subsections. */
  const BEFORE_T2 = [
    "# Fixture plan: T2 — Add the flag",
    "",
    "Branch: `feat/fixture`",
    "",
    "### T2 — Add the flag",
    "",
    "- [ ] Open",
    "- Do: add the flag.",
    "- Must not: change register.",
    "- Closes gap: G2.",
    "- Depends on: T1.",
    "- References: `src/cli.ts:1-2`, `src/app.ts:5-7`, `src/new.ts`.",
    "- Acceptance: `bun test` passes.",
    "- QA scenario: happy — flag works; failure — unknown flag.",
    "- Strict: no.",
    "- Commit: no.",
    "",
    "Gaps it closes:",
    "",
    "| G2 | `src/cli.ts:1` and `:2` — the CLI calls start | No flag |",
    "",
    "Depends on: T1 — Add the greeting",
    "",
    "Strict areas: none",
    "Checks its pass receipt must record: `acceptance`, `qa:happy`, `qa:failure`",
    "",
    "Must have and must not have (whole plan):",
    "",
    "- MH1: A greeting.",
    "- MH2: A flag.",
    "- MN1: No network access.",
  ].join("\n");
  const CHECKS = "Checks its pass receipt must record: `acceptance`, `qa:happy`, `qa:failure`";
  const MUST = "Must have and must not have (whole plan):";
  const DIAGRAM = "Diagram: omitted — a two-file change.\n";
  /** A subsection with a deeper heading inside it. */
  const GREETING = ["### Greeting format", "", "The greeting is `hello <name>`.", "", "#### Empty name", "", "An empty name greets `hello`.", ""];
  /** A subsection with a fenced heading inside it, and two blank lines at its end. */
  const FLAG = ["### Flag parsing", "", "```text", "### Not a subsection", "```", "", "The flag is `--greet`, and it takes no value.", "", ""];
  /** GREETING and FLAG as `--todo` prints them, without trailing blank lines. */
  const GREETING_OUT = GREETING.slice(0, -1);
  const FLAG_OUT = FLAG.slice(0, -2);
  /** The fixture plan with these lines after the Design diagram line, and each [from, to] replacement applied. */
  const designPlan = (design: string[], ...swaps: [string, string][]): string => {
    const root = makeProject();
    let text = planText(root).replace(DIAGRAM, `${DIAGRAM}\n${design.join("\n")}`);
    for (const [from, to] of swaps) text = text.replace(from, to);
    writePlan(root, text);
    return root;
  };
  const brief = (root: string, id: string): string => {
    const p = spawnSync("bun", [rootCli, PLAN, "--todo", id, "--root", root], { encoding: "utf8" });
    expect(p.status).toBe(0);
    return p.stdout;
  };
  const headers = (out: string): string[] => out.split("\n").filter((l) => l.startsWith("Design — "));

  test("a todo that names one subsection gets that subsection and no other", () => {
    const root = designPlan([...GREETING, ...FLAG], ["- Do: change start.", '- Do: change start as "Greeting format" in Design says.']);
    const out = brief(root, "T1");
    expect(out).toContain([CHECKS, "", "Design — Greeting format:", "", ...GREETING_OUT, "", MUST, ""].join("\n"));
    expect(headers(out)).toEqual(["Design — Greeting format:"]);
    expect(out).not.toContain("Flag parsing");
  });

  test("a todo that names two gets both, in document order, each once", () => {
    const root = designPlan([...GREETING, ...FLAG], ["- Do: add the flag.", "- Do: add the flag as Flag parsing says, keep the Greeting format, and test the flag parsing."]);
    const out = brief(root, "T2");
    expect(out).toContain([CHECKS, "", "Design — Greeting format:", "", ...GREETING_OUT, "", "Design — Flag parsing:", "", ...FLAG_OUT, "", MUST, ""].join("\n"));
    expect(headers(out)).toEqual(["Design — Greeting format:", "Design — Flag parsing:"]);
  });

  test("a todo that names none gets the output it had before, byte for byte", () => {
    const root = designPlan([...GREETING, ...FLAG]);
    expect(brief(root, "T2")).toBe(`${BEFORE_T2}\n`);
    const plain = makeProject();
    writePlan(plain, planText(plain));
    for (const id of ["T0", "T1", "F1", "F2", "F3", "F4"]) expect(brief(root, id)).toBe(brief(plain, id));
  });

  test("a title written inside backticks, or in another letter case, still matches", () => {
    const ticked = ["### The `--greet` flag", "", "It takes no value.", ""];
    const root = designPlan([...GREETING, ...ticked], ["- Do: change start.", "- Do: change start as `GREETING   Format` says."], ["- Do: add the flag.", "- Do: add the --GREET flag."]);
    const t1 = brief(root, "T1");
    expect(t1).toContain(["", "Design — Greeting format:", "", ...GREETING_OUT, ""].join("\n"));
    expect(headers(t1)).toEqual(["Design — Greeting format:"]);
    const t2 = brief(root, "T2");
    expect(t2).toContain(["", "Design — The `--greet` flag:", "", ...ticked.slice(0, -1), "", MUST].join("\n"));
    expect(headers(t2)).toEqual(["Design — The `--greet` flag:"]);
  });

  test("a title that is only part of a longer word does not match", () => {
    const root = designPlan(["### Greet", "", "Say hello.", "", "### Flag", "", "One flag.", ""], ["- Do: change start.", "- Do: change start; greet2, 2greet, and égreet are ids."]);
    // T1 says greeting, greets, greet2, 2greet, and égreet, and never greet alone.
    expect(headers(brief(root, "T1"))).toEqual([]);
    // T2 says flag between a space and a full stop.
    const t2 = brief(root, "T2");
    expect(headers(t2)).toEqual(["Design — Flag:"]);
    expect(t2).toContain(["", "Design — Flag:", "", "### Flag", "", "One flag.", "", MUST].join("\n"));
  });

  test("a final gate that names a subsection gets it, and so does the UI QA block", () => {
    const ui = "### Automated UI QA\n\n- [ ] Open\n- Do: open the page as the Greeting format says.\n\n";
    const root = designPlan([...GREETING, ...FLAG], ["- Do: run scenarios.", "- Do: run scenarios as Flag parsing says."], ["## Success criteria", `${ui}## Success criteria`]);
    const f3 = brief(root, "F3");
    expect(f3).toContain(["### F3 — Scenario QA", "", "- [ ] Open", "- Do: run scenarios as Flag parsing says.", "", "Design — Flag parsing:", "", ...FLAG_OUT, "", MUST, ""].join("\n"));
    expect(headers(f3)).toEqual(["Design — Flag parsing:"]);
    const block = brief(root, "UI");
    expect(block).toContain(["- Do: open the page as the Greeting format says.", "", "Design — Greeting format:", "", ...GREETING_OUT, "", MUST, ""].join("\n"));
    expect(headers(block)).toEqual(["Design — Greeting format:"]);
    expect(headers(brief(root, "F1"))).toEqual([]);
  });

  test("a plan with no subsection under Design is unchanged", () => {
    const plain = makeProject();
    writePlan(plain, planText(plain));
    expect(brief(plain, "T2")).toBe(`${BEFORE_T2}\n`);
    // A fenced heading and a deeper heading are no subsections, though T2 says flag.
    const other = designPlan(["```markdown", "### Flag", "```", "", "#### Flag", "", "The flag is `--greet`.", ""]);
    expect(brief(other, "T2")).toBe(`${BEFORE_T2}\n`);
    const none = makeProject();
    writePlan(none, planText(none).replace(`## Design\n\n${DIAGRAM}\n`, ""));
    expect(read(none, PLAN)).not.toContain("## Design");
    expect(brief(none, "T2")).toBe(`${BEFORE_T2}\n`);
  });
});

describe("record-receipt", () => {
  const RECORD = join(repo, "skills/planning/plan-builder/scripts/record-receipt.ts");
  const RUN = ".git/silly-skills/plan-builds/run";
  /** One --check argument for a check that ran `bun test` and exited 0, with any field replaced or added. */
  const arg = (id: string, more: Record<string, unknown> = {}): string[] => ["--check", JSON.stringify({ id, command: "bun test", exit: 0, ...more })];
  /** The checks T1 and T2 need: each has a happy and a failure QA part. */
  const CHECKS = ["acceptance", "qa:happy", "qa:failure"].flatMap((id) => arg(id));
  const NOTE = (text: string): string[] => ["--note", text];
  /** T1's edit, as the build fixture makes it. */
  const editT1 = (root: string): void => writeFileSync(join(root, "src/app.ts"), APP.replace("return register(config);", "return register(`hello ${config}`);"));
  /** Two slices: S1 ends with T1, and S2 holds T2. */
  const SLICES = (t: string): string =>
    t.replace(
      "- Wave 1: T1\n- Wave 2: T2 — needs T1\n",
      "- Slice S1 — greeting. Independent test: `bun test` greets a configured name.\n- Wave 1: T1\n- Slice S2 — flag. Independent test: the CLI accepts the flag.\n- Wave 2: T2 — needs T1\n",
    );
  /** T0 with `Commit: yes`, as a 2.1.0 writer leaves it. */
  const T0_COMMIT = (t: string): string =>
    t.replace("- QA scenario: happy — the file exists; failure — n/a.\n- Strict: no.\n- Commit: no.", "- QA scenario: happy — the file exists; failure — n/a.\n- Strict: no.\n- Commit: yes — `docs(plans): add fixture plan`.");
  const ignorePlans = (root: string): void => {
    write(root, ".gitignore", "/docs/plans/\n");
    git(root, "add", ".gitignore");
    git(root, "commit", "-q", "-m", "ignore plans");
  };
  const trackPlans = (root: string): void => {
    git(root, "add", "--", DIR);
    git(root, "commit", "-q", "-m", "docs(plans): add fixture plan");
  };
  const obligation = (targets: string[]): Obligation[] => [{ id: "O1", targets, evidenceIds: ["C1", "P1"], observed: "traced", plannedQa: "Q1", status: "verified" }];

  const call = (root: string, todo: string, event: string, ...more: string[]) => {
    const p = spawnSync("bun", [RECORD, PLAN, "--root", root, "--todo", todo, "--event", event, ...more], { encoding: "utf8" });
    return { code: p.status, out: `${p.stdout}${p.stderr}`.trim() };
  };
  /** The receipts of the build file, read without the validator. */
  const recorded = (root: string) => [...read(root, BUILD).matchAll(/```json\n([\s\S]*?)\n```/g)].flatMap((m) => JSON.parse(m[1]).receipts ?? []);
  /** What a refused call leaves as it was: the bytes of the spec and the build file, and the entries of the run directory. */
  const untouched = (root: string) => ({ plan: sha(readFileSync(join(root, PLAN))), build: sha(readFileSync(join(root, BUILD))), run: readdirSync(join(root, RUN)).sort() });
  /** Runs the command, expects one refusal line that changed nothing, and returns the line. */
  const refused = (root: string, todo: string, event: string, ...more: string[]): string => {
    const before = untouched(root);
    const result = call(root, todo, event, ...more);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(new RegExp(`^RECEIPT: REFUSED ${todo} ${event}; [^\\n]+$`));
    expect(untouched(root)).toEqual(before);
    return result.out;
  };
  const resume = (root: string) => run(root, ["--review", "--resume"]);
  /** The codes the validator's resume check reports when the fixture's own receipt writer appends `input` after `inputs`. The build file is restored. */
  const orderCodes = (s: ReturnType<typeof buildScenario>, inputs: ReceiptInput[], input: ReceiptInput): string[] => {
    const original = read(s.root, BUILD);
    writeBuild(s.root, { ...s.record, receipts: receipts(s.baseline, [...inputs, input]) });
    const found = codes(resume(s.root));
    write(s.root, BUILD, original);
    return found;
  };

  test("record-receipt records a pass", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    editT1(root);
    expect(call(root, "T1", "pass", ...CHECKS)).toEqual({ code: 0, out: "RECEIPT: T1 pass seq 2; resumeEligible true; next T2" });
    const [t0, t1] = recorded(root);
    expect(Object.keys(t1)).toEqual(["seq", "todo", "event", "state", "prev", "before", "after", "checks", "prerequisites", "commit", "note"]);
    expect([t1.seq, t1.todo, t1.event, t1.state, t1.prev, t1.before]).toEqual([2, "T1", "pass", "passed", sha(canon(t0)), t0.after]);
    expect(t1.after.snapshot).toBe("silly-skills/plan-builds/run/2-T1");
    expect(t1.checks).toEqual(["acceptance", "qa:happy", "qa:failure"].map((id) => ({ id, command: "bun test", exit: 0, expectedExit: 0, passed: true })));
    expect([t1.prerequisites, t1.commit, t1.note]).toEqual([[], { none: "no commit" }, ""]);
    expect(read(root, PLAN)).toContain("### T1 — Add the greeting\n\n- [x] Done");
    const result = resume(root);
    expect(result.errors).toEqual([]);
    expect([result.resumeEligible, result.nextTodo]).toEqual([true, "T2"]);
  });

  test("record-receipt refuses a pass without a required check", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    editT1(root);
    expect(refused(root, "T1", "pass", ...arg("acceptance"), ...arg("qa:happy"))).toContain('T1 has no passing check "qa:failure"');
    expect(call(root, "T1", "pass", ...CHECKS).code).toBe(0);
    expect(recorded(root).filter((r) => r.todo === "T1").length).toBe(1);
    expect(resume(root).errors).toEqual([]);
  });

  test("record-receipt refuses a failing check, a check with another key, a second pass, and a slice's last todo without its slice check", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    editT1(root);
    expect(refused(root, "T1", "pass", ...arg("acceptance"), ...arg("qa:happy"), ...arg("qa:failure", { exit: 1 }))).toContain('check "qa:failure" failed: exit 1, expected 0');
    expect(refused(root, "T1", "pass", ...CHECKS, ...arg("lint", { passed: true }))).toContain('check "lint" has the key "passed"');
    expect(call(root, "T1", "pass", ...CHECKS).code).toBe(0);
    expect(refused(root, "T1", "pass", ...CHECKS)).toContain("T1 already has a pass receipt");
    // In a plan whose slice S1 ends with T1, T1's pass also needs the slice's independent test.
    const sliced = buildScenario({ stopAfter: "T0", mutatePlan: SLICES, obligations: obligation([...ALL_TARGETS, "slice:S1", "slice:S2"]) });
    editT1(sliced.root);
    expect(refused(sliced.root, "T1", "pass", ...CHECKS)).toContain('T1 has no passing check "slice:S1"');
    expect(call(sliced.root, "T1", "pass", ...CHECKS, ...arg("slice:S1")).out).toBe("RECEIPT: T1 pass seq 2; resumeEligible true; next T2");
  });

  test("record-receipt needs the commit of a Commit: yes todo, and it must be HEAD", () => {
    const { root } = buildScenario({ stopAfter: "T0", t1Commit: true });
    editT1(root);
    git(root, "commit", "-q", "-am", "feat: greet");
    expect(refused(root, "T1", "pass", ...CHECKS)).toContain("T1 says Commit: yes; name its commit with --commit");
    expect(refused(root, "T1", "pass", ...CHECKS, "--no-commit", "nothing to commit")).toContain("T1 says Commit: yes");
    expect(refused(root, "T1", "pass", ...CHECKS, "--commit", "HEAD~1")).toContain("which is not HEAD");
    expect(refused(root, "T1", "pass", ...CHECKS, "--commit", "no-such-revision")).toContain("does not resolve to a commit");
    expect(refused(root, "T1", "pass", ...CHECKS, "--commit", "--output=x")).toContain("does not resolve to a commit");
    expect(call(root, "T1", "pass", ...CHECKS, "--commit", "HEAD").out).toBe("RECEIPT: T1 pass seq 2; resumeEligible true; next T2");
    expect(recorded(root)[1].commit).toEqual({ sha: git(root, "rev-parse", "HEAD").toString().trim() });
    expect(resume(root).errors).toEqual([]);
  });

  test("record-receipt records a block with its note, and resume is not eligible", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    expect(refused(root, "T1", "block")).toContain("a block needs --note");
    expect(call(root, "T1", "block", ...NOTE("needs a credential"))).toEqual({ code: 0, out: "RECEIPT: T1 block seq 2; resumeEligible false; next T1" });
    const t1 = recorded(root)[1];
    expect([t1.state, t1.note, t1.checks]).toEqual(["blocked", "needs a credential", []]);
    expect(read(root, PLAN)).toContain("### T1 — Add the greeting\n\n- [ ] Open");
    const result = resume(root);
    expect(result.errors).toEqual([]);
    expect(result.unresolvedAction).toContain("needs a credential");
  });

  test("record-receipt records a recovery after an unrecorded edit, and the todo is active", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    writeFileSync(join(root, "src/app.ts"), `${APP}// partial\n`);
    expect(resume(root).recoveryRequired).toBe(true);
    expect(refused(root, "T1", "recovery")).toContain("a recovery needs --note");
    expect(call(root, "T1", "recovery", ...NOTE("T1 edits from an interrupted attempt; kept"))).toEqual({ code: 0, out: "RECEIPT: T1 recovery seq 2; resumeEligible true; next T1" });
    expect(recorded(root)[1].state).toBe("active");
    const result = resume(root);
    expect(result.errors).toEqual([]);
    expect([result.activeTodo, result.recoveryRequired]).toEqual(["T1", false]);
  });

  test("record-receipt records a fix naming F4 after every todo passed, and refuses a fix naming a todo or with a check that has no command", () => {
    const s = buildScenario();
    s.record.receipts = receipts(s.baseline, [...s.inputs, { todo: "T2", event: "pass", after: "same" }]);
    writeBuild(s.root, s.record);
    setBoxes(s.root, ["T2"]);
    expect(refused(s.root, "T2", "fix", ...arg("blocking:D1"))).toContain("T2 is not a final gate of the plan");
    expect(refused(s.root, "F4", "fix", "--check", JSON.stringify({ id: "blocking:D1", exit: 0 }))).toContain('check "blocking:D1" lacks a command or a numeric exit');
    expect(refused(s.root, "F4", "fix")).toContain("a fix needs a check");
    expect(call(s.root, "F4", "fix", ...arg("blocking:D1"), "--commit", "HEAD")).toEqual({ code: 0, out: "RECEIPT: F4 fix seq 4; resumeEligible true; next F1" });
    expect(recorded(s.root)[3]).toMatchObject({ todo: "F4", event: "fix", state: "passed", commit: { sha: git(s.root, "rev-parse", "HEAD").toString().trim() } });
    expect(resume(s.root).errors).toEqual([]);
  });

  test("record-receipt carries every earlier snapshot into the capture", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    editT1(root);
    write(root, "notes.txt", "scratch notes from T1\n");
    expect(call(root, "T1", "pass", ...CHECKS).code).toBe(0);
    rmSync(join(root, "notes.txt"));
    writeFileSync(join(root, "src/cli.ts"), `${CLI}// --greet\n`);
    const recheck = { targets: ["T2.start"], paths: ["src/app.ts"], status: "holds", observed: "register is unchanged" };
    expect(call(root, "T2", "pass", ...CHECKS, "--recheck", JSON.stringify(recheck)).out).toBe("RECEIPT: T2 pass seq 3; resumeEligible true; next F1");
    const [t0, t1, t2] = recorded(root);
    const row = (ref: { snapshot: string }) => JSON.parse(read(root, `.git/${ref.snapshot}/manifest.json`)).paths.find((p: { path: string }) => p.path === "notes.txt");
    // Only T1's snapshot saw notes.txt; T2's snapshot keeps it, as absent, because the capture carried T1's.
    expect(row(t0.after)).toBeUndefined();
    expect(row(t1.after).worktree.state).toBe("file");
    expect(row(t2.after)).toEqual({ path: "notes.txt", head: { state: "absent" }, index: { state: "absent" }, worktree: { state: "absent" } });
    expect(t2.prerequisites).toEqual([{ targets: ["T2.start"], sources: [{ path: "src/app.ts", sha256: sha(readFileSync(join(root, "src/app.ts"))) }], status: "holds", observed: "register is unchanged" }]);
    expect(resume(root).errors).toEqual([]);
  });

  test("record-receipt runs no command", () => {
    const { root } = buildScenario({ stopAfter: "T0" });
    editT1(root);
    const marker = join(root, "marker");
    const command = `touch ${marker} && echo $(touch ${marker}-2) \`touch ${marker}-3\``;
    const r = call(root, "T1", "pass", "--check", JSON.stringify({ id: "acceptance", command, exit: 0, observed: `$(touch ${marker}-4)` }), ...arg("qa:happy"), ...arg("qa:failure"), ...NOTE(`$(touch ${marker}-5)`), "--log", `$(touch ${marker}-6)`);
    expect(r).toEqual({ code: 0, out: "RECEIPT: T1 pass seq 2; resumeEligible true; next T2" });
    const t1 = recorded(root)[1];
    expect(t1.checks[0]).toEqual({ id: "acceptance", command, exit: 0, expectedExit: 0, passed: true, observed: `$(touch ${marker}-4)` });
    expect([t1.note, t1.log]).toEqual([`$(touch ${marker}-5)`, `$(touch ${marker}-6)`]);
    expect(readdirSync(root).filter((name) => name.startsWith("marker"))).toEqual([]);
  });

  test("record-receipt appends one block after one blank line, and the file ends with one newline", () => {
    for (const ending of ["\n", "", "\n\n\n"]) {
      const { root } = buildScenario({ stopAfter: "T0" });
      const kept = read(root, BUILD).replace(/\n+$/, "");
      write(root, BUILD, `${kept}${ending}`);
      editT1(root);
      expect(call(root, "T1", "pass", ...CHECKS).code).toBe(0);
      const text = read(root, BUILD);
      expect(text.startsWith(kept)).toBe(true);
      expect(text.slice(kept.length)).toMatch(/^\n\n```json\n\{"receipts":\[\{"seq":2,[^\n]*\}\]\}\n```\n$/);
    }
  });

  test("record-receipt lets a Commit: yes T0 name no commit only where git ignores the plan directory", () => {
    for (const ignored of [true, false]) {
      const s = buildScenario({ stopAfter: "T0", mutatePlan: T0_COMMIT, beforeBaseline: ignored ? ignorePlans : trackPlans });
      writeBuild(s.root, { ...s.record, receipts: [] });
      writePlan(s.root, read(s.root, PLAN).replace("- [x] Done", "- [ ] Open"));
      const args = [...arg("acceptance"), ...arg("qa:happy"), "--no-commit", "git ignores the plan directory"];
      if (!ignored) {
        expect(refused(s.root, "T0", "pass", ...args)).toContain("T0 says Commit: yes");
        continue;
      }
      expect(call(s.root, "T0", "pass", ...args)).toEqual({ code: 0, out: "RECEIPT: T0 pass seq 1; resumeEligible true; next T1" });
      const [t0] = recorded(s.root);
      expect([t0.prev, t0.before, t0.commit]).toEqual([null, s.baseline, { none: "git ignores the plan directory" }]);
      expect(read(s.root, PLAN)).toContain("### T0 — Copy the plan into the project\n\n- [x] Done");
    }
  });

  test("record-receipt --help exits 0, and no argument exits 2", () => {
    const cli = (...args: string[]) => spawnSync("bun", [RECORD, ...args], { encoding: "utf8" });
    const help = cli("--help");
    expect(help.status).toBe(0);
    expect(help.stdout.split("\n")[0]).toStartWith("Usage: record-receipt");
    expect(cli().status).toBe(2);
    const { root } = buildScenario({ stopAfter: "T0" });
    const base = [PLAN, "--root", root, "--todo", "T1"];
    for (const bad of [
      [...base, "--event", "start"],
      [...base, "--event", "pass", "--check", "[1]"],
      [...base, "--event", "pass", "--check", "{not json"],
      [...base, "--event", "pass", "--bogus"],
      [...base, "--event", "pass", "--commit", "HEAD", "--no-commit", "none"],
      ["../outside.md", "--root", root, "--todo", "T1", "--event", "pass"],
    ]) {
      expect({ bad, status: cli(...bad).status }).toEqual({ bad, status: 2 });
    }
    rmSync(join(root, BUILD));
    expect(cli(...base, "--event", "pass", ...CHECKS).status).toBe(2);
  });

  test("record-receipt refuses an event out of order", () => {
    // T2 depends on T1, which has not passed.
    const s = buildScenario({ stopAfter: "T0" });
    const cases: [string, string[], ReceiptInput][] = [
      ["pass", CHECKS, { todo: "T2", event: "pass", after: "same" }],
      ["block", NOTE("blocked early"), { todo: "T2", event: "block", after: "same", note: "blocked early" }],
      ["recovery", NOTE("T2 edits found"), { todo: "T2", event: "recovery", after: "same", note: "T2 edits found" }],
    ];
    for (const [event, more, input] of cases) {
      expect(refused(s.root, "T2", event, ...more)).toContain("T2 depends on T1, which has no pass receipt");
      expect(orderCodes(s, s.inputs, input)).toContain("DEPENDENCY_ORDER");
    }
    expect(refused(s.root, "F4", "fix", ...arg("blocking:D1"))).toContain("T1, T2 have no pass receipt");
    expect(orderCodes(s, s.inputs, { todo: "F4", event: "fix", after: "same", checks: [check("blocking:D1")] })).toContain("RECEIPT_ORDER");
    editT1(s.root);
    expect(call(s.root, "T1", "pass", ...CHECKS).out).toBe("RECEIPT: T1 pass seq 2; resumeEligible true; next T2");
    expect(call(s.root, "T2", "pass", ...CHECKS).out).toBe("RECEIPT: T2 pass seq 3; resumeEligible true; next F1");
    expect(resume(s.root).errors).toEqual([]);
  });

  test("record-receipt refuses a block or a recovery for a todo that passed", () => {
    const s = buildScenario();
    for (const event of ["block", "recovery"]) {
      expect(refused(s.root, "T1", event, ...NOTE("one more try"))).toContain("T1 already has a pass receipt");
      expect(orderCodes(s, s.inputs, { todo: "T1", event, after: "same", note: "one more try" })).toContain("RECEIPT_ORDER");
    }
  });

  test("record-receipt refuses every event for another todo while one is active", () => {
    // T2 depends only on T0, and a recovery receipt makes T1 active.
    const T2_ON_T0 = (t: string): string => t.replace("- Closes gap: G2.\n- Depends on: T1.", "- Closes gap: G2.\n- Depends on: T0.");
    const s = buildScenario({ stopAfter: "T0", mutatePlan: T2_ON_T0, obligations: obligation(ALL_TARGETS.map((t) => (t === "dep:T2:T1" ? "dep:T2:T0" : t))) });
    writeFileSync(join(s.root, "src/app.ts"), `${APP}// partial\n`);
    const partial = saveSnapshot(s.root, snapshot(s.root, "silly-skills/plan-builds/run/T1-recovery", { carry: s.carry }), s.spec);
    const inputs: ReceiptInput[] = [...s.inputs, { todo: "T1", event: "recovery", after: partial, note: "T1 edits from an interrupted attempt; kept" }];
    writeBuild(s.root, { ...s.record, receipts: receipts(s.baseline, inputs) });
    const active = resume(s.root);
    expect(active.errors).toEqual([]);
    expect(active.activeTodo).toBe("T1");
    const cases: [string, string[], ReceiptInput][] = [
      ["pass", CHECKS, { todo: "T2", event: "pass", after: "same" }],
      ["block", NOTE("blocked early"), { todo: "T2", event: "block", after: "same", note: "blocked early" }],
      ["recovery", NOTE("T2 edits found"), { todo: "T2", event: "recovery", after: "same", note: "T2 edits found" }],
    ];
    for (const [event, more, input] of cases) {
      expect(refused(s.root, "T2", event, ...more)).toContain("T1 is active until its pass or block receipt");
      expect(orderCodes(s, inputs, input)).toContain("RECEIPT_ORDER");
    }
    editT1(s.root);
    expect(call(s.root, "T1", "pass", ...CHECKS).out).toBe("RECEIPT: T1 pass seq 3; resumeEligible true; next T2");
    expect(call(s.root, "T2", "pass", ...CHECKS).out).toBe("RECEIPT: T2 pass seq 4; resumeEligible true; next F1");
    expect(resume(s.root).errors).toEqual([]);
  });
});
