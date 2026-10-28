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
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { canonicalJson, canonicalSpecDigest, validatePlan } from "./validate-plan.ts";

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
    schemaVersion: 1,
    citations: [
      { id: "C1", kind: "source", path: "src/app.ts", startLine: 1, endLine: 3, excerpt: lines(app, 1, 3), sha256: sha(app) },
      { id: "C2", kind: "source", path: "src/cli.ts", startLine: 1, endLine: 2, excerpt: lines(cli, 1, 2), sha256: sha(cli) },
      { id: "C3", kind: "self" },
      { id: "C4", kind: "planned", path: "src/new.ts", createdBy: "T2" },
      { id: "C5", kind: "external", url: "https://example.com/spec", version: "1.0", accessed: "2026-09-29", excerpt: "start registers", obligation: "MH1" },
      { id: "C6", kind: "source", path: "src/app.ts", startLine: 5, endLine: 7, excerpt: lines(app, 5, 7), sha256: sha(app) },
    ],
    coverage: [
      { id: "V1", paths: ["src/app.ts", "src/cli.ts"], searches: ["rg -n start src"], producers: ["src/app.ts"], consumers: ["src/cli.ts"], citationIds: ["C1", "C2", "C6"], state: "inspected" },
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

### Affected users

Fixture users.

### Ideal state

The fixture greets.

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

### Coverage

Recorded in the Evidence index.

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

## Verification strategy

| Gap | Proof | Expected |
| --- | --- | --- |
| G1 | \`bun test\` | passes |

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
    schemaVersion: 1,
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

function receipts(baseline: Ref, inputs: ReceiptInput[]) {
  const out: Record<string, unknown>[] = [];
  let end = baseline;
  for (const input of inputs) {
    const prev = out[out.length - 1];
    const after = input.after === "same" ? end : input.after ?? null;
    const state = { start: "active", checkpoint: "active", pass: "passed", block: "blocked", recovery: "active" }[input.event];
    out.push({
      seq: out.length + 1,
      todo: input.todo,
      event: input.event,
      state,
      prev: prev ? sha(canon(prev)) : null,
      before: end,
      after,
      checks: input.checks ?? (input.event === "pass" ? [{ id: "acceptance", command: "bun test", exit: 0, expectedExit: 0, passed: true, observed: "1 passed" }] : []),
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
  t.replace("- QA scenario: happy — greets; failure — empty name.\n- Commit: no.", "- QA scenario: happy — greets; failure — empty name.\n- Commit: yes — `feat: greet`.");

function buildScenario(options: { stopAfter?: "T1-start" | "T1-checkpoint"; t1Commit?: boolean; omitCommit?: boolean; reports?: string[] } = {}) {
  const root = makeProject();
  const text = reviewedPlan(root, { mutatePlan: options.t1Commit ? T1_COMMIT : undefined });
  const spec = specOf(root, text);
  const gateDigest = sha(canon(JSON.parse(read(root, GATE))));
  const baseline = saveSnapshot(root, snapshot(root, "silly-skills/plan-builds/run/baseline", { reports: options.reports }), spec);
  const carry = JSON.parse(readFileSync(join(root, ".git", baseline.snapshot, "manifest.json"), "utf8")).paths.map((p: { path: string }) => p.path);
  const inputs: ReceiptInput[] = [
    { todo: "T0", event: "start" },
    { todo: "T0", event: "pass", after: "same" },
    { todo: "T1", event: "start", prerequisites: [{ targets: ["T1.start"], sources: [{ path: "src/app.ts", sha256: sha(APP) }], status: "holds", observed: "unchanged since baseline" }] },
  ];
  let after: Ref | null = null;
  if (options.stopAfter !== "T1-start") {
    writeFileSync(join(root, "src/app.ts"), APP.replace("return register(config);", "return register(`hello ${config}`);"));
    if (options.t1Commit) git(root, "commit", "-q", "-am", "T1");
    after = saveSnapshot(root, snapshot(root, "silly-skills/plan-builds/run/T1", { carry, reports: options.reports }), spec);
    inputs.push({ todo: "T1", event: "checkpoint", after });
    if (options.stopAfter !== "T1-checkpoint") {
      const commit = options.t1Commit && !options.omitCommit ? { sha: git(root, "rev-parse", "HEAD").toString().trim() } : undefined;
      inputs.push({ todo: "T1", event: "pass", after: "same", commit });
    }
  }
  const record = {
    schemaVersion: 1,
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
    write(root, EVIDENCE, read(root, EVIDENCE).replace('"schemaVersion": 1,', '"schemaVersion": 1,,'));
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
      { schemaVersion: 1, citations: [], coverage: [], frontier: [], flows: [], baseline: index.baseline },
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
    const withPlaceholder = planText(root).replace("### Affected users\n", "### Affected users\n\n<!-- todo: affected users -->\n");
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
      ["Coverage paragraph", (t) => t.replace("Recorded in the Evidence index.", words(121))],
      ["Verification strategy G1 cell 3", (t) => t.replace("| G1 | `bun test` | passes |", `| G1 | \`bun test\` | ${words(31)} |`)],
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
    const { root, record, baseline } = buildScenario({ stopAfter: "T1-start" });
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "start" },
      { todo: "T0", event: "pass", after: "same" },
      { todo: "T2", event: "start" },
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
    const { root, record, baseline } = buildScenario({ stopAfter: "T1-start" });
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "start", extra: { changedPaths: [] } },
      { todo: "T0", event: "pass", after: "same" },
      { todo: "T1", event: "start", extra: { log: "silly-skills/plan-builds/run/logs/t1.log" } },
    ]);
    writeBuild(root, record);
    const errors = run(root, ["--review", "--resume"]).errors.filter((e) => e.code === "RECEIPT_FIELD");
    expect(errors.length).toBe(1);
    expect(errors[0].message).toContain("changedPaths");
    expect(errors[0].file).toBe(BUILD);
  });

  test("receipt prose is capped: a long observed is a gap, a very long one an error", () => {
    for (const [size, expectError] of [[250, false], [401, true]] as const) {
      const { root, record, baseline } = buildScenario({ stopAfter: "T1-start" });
      record.receipts = receipts(baseline, [
        { todo: "T0", event: "start" },
        { todo: "T0", event: "pass", after: "same", checks: [{ id: "acceptance", command: "bun test", exit: 0, expectedExit: 0, passed: true, observed: "x".repeat(size) }] },
        { todo: "T1", event: "start" },
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

  test("an active checkpoint that matches the workspace resumes only that todo", () => {
    const { root } = buildScenario({ stopAfter: "T1-checkpoint" });
    const result = run(root, ["--review", "--resume"]);
    expect(result.errors).toEqual([]);
    expect(result.resumeEligible).toBe(true);
    expect(result.activeTodo).toBe("T1");
    expect(result.nextTodo).toBe("T1");
  });

  test("effects after a start receipt with no checkpoint require recovery", () => {
    const { root } = buildScenario({ stopAfter: "T1-start" });
    writeFileSync(join(root, "src/app.ts"), `${APP}// partial\n`);
    const result = run(root, ["--review", "--resume"]);
    expect(result.resumeEligible).toBe(false);
    expect(result.recoveryRequired).toBe(true);
    expect(result.activeTodo).toBe("T1");
    expect(result.unresolvedAction).toContain("recovery receipt");
  });

  test("a commit whose receipt was lost is drift, not a completed todo", () => {
    const { root, record, baseline } = buildScenario({ stopAfter: "T1-start" });
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "start" },
      { todo: "T0", event: "pass", after: "same" },
      { todo: "T1", event: "start" },
    ]);
    writeBuild(root, record);
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
        { todo: "T0", event: "start" },
        { todo: "T0", event: "pass", after: "same" },
        { todo: "T1", event: "start" },
        { todo: "T1", event: "checkpoint", after: after as Ref },
        { todo: "T1", event: "pass", after: "same" },
        { todo: "T2", event: "start", prerequisites: [{ targets: ["T2.start"], sources: [{ path: "src/app.ts", sha256: sha(readFileSync(join(root, "src/app.ts"))) }], status, observed: "register signature" }] },
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
    const { root, record, baseline } = buildScenario({ stopAfter: "T1-start" });
    record.receipts = receipts(baseline, [
      { todo: "T0", event: "start" },
      { todo: "T0", event: "pass", after: "same" },
      { todo: "T1", event: "start" },
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

describe("CLI", () => {
  function cli(script: string, args: string[]) {
    const p = spawnSync("bun", [script, ...args], { encoding: "utf8" });
    return { code: p.status, out: p.stdout, err: p.stderr };
  }

  test("--help exits 0 and lists every flag", () => {
    const result = cli(rootCli, ["--help"]);
    expect(result.code).toBe(0);
    for (const flag of ["--review", "--resume", "--root", "--json", "--help"]) expect(result.out).toContain(flag);
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
