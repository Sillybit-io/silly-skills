/**
 * Deterministic checks for the planning evaluation fixtures.
 *
 * Each seeded defect is reproduced by running the fixture's real scripts in a
 * disposable root, each hidden consumer is proved by the project's own imports
 * and strings, and each change fixture's ground truth is recomputed from its D4
 * snapshots. No model is called.
 */

import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  CASES,
  RESULT_VARIANTS,
  type ResultVariant,
  type Row,
  buildCase,
  canon,
  git,
  gitBlobId,
  parseBatch,
  materialize,
  readManifest,
  reconstruct,
  resultReviewCase,
  sha256,
} from "./fixtures/planning/harness.ts";
import { validatePlan, verifySnapshot } from "./validate-plan.ts";

setDefaultTimeout(60_000);

const FIXTURES = join(import.meta.dir, "fixtures");
const ROLLBACK = join(FIXTURES, "rollback");
const TRUTH = join(FIXTURES, "planning", "ground-truth");
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "planning-fixtures-"));
  dirs.push(dir);
  return dir;
}

function files(root: string, base = root): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const abs = join(root, entry.name);
    if (entry.isDirectory()) out.push(...files(abs, base));
    else out.push(relative(base, abs));
  }
  return out.sort();
}

/* ── rollback ──────────────────────────────────────────────────────────────── */

type Install = { parent: string; root: string };

function install(variant: "original" | "corrected", options: { cron?: boolean } = {}): Install {
  const parent = tempDir();
  const root = join(parent, "root");
  cpSync(join(ROLLBACK, "seed"), root, { recursive: true });
  if (options.cron) cpSync(join(ROLLBACK, "seed-cron"), root, { recursive: true });
  cpSync(join(ROLLBACK, variant, "upgrade.sh"), join(root, "upgrade.sh"));
  writeFileSync(join(parent, "sentinel.txt"), "outside the supplied root\n");
  return { parent, root };
}

function upgrade(root: string, args: string[], env: Record<string, string> = {}) {
  const p = spawnSync("sh", [join(root, "upgrade.sh"), ...args], { env: { ...process.env, ROOT: root, ...env }, encoding: "utf8" });
  return { code: p.status, stderr: p.stderr };
}

function hook(root: string): string {
  return spawnSync("sh", [join(root, "hook.sh"), "ping"], { encoding: "utf8" }).stdout;
}

function helperPath(root: string): string {
  return spawnSync("sh", ["-c", '. "$MEMORY_ROOT/helpers.sh"; memory_bin'], { env: { ...process.env, MEMORY_ROOT: root }, encoding: "utf8" }).stdout.trim();
}

function registration(root: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, "tool.json"), "utf8"));
}

/** Writes stayed inside `root`: the parent holds only root and an unchanged sentinel. */
function stayedInside({ parent }: Install): void {
  expect(readdirSync(parent).sort()).toEqual(["root", "sentinel.txt"]);
  expect(readFileSync(join(parent, "sentinel.txt"), "utf8")).toBe("outside the supplied root\n");
}

/** The installation equals the seed, byte for byte and mode for mode. */
function equalsSeed(root: string, seeds: string[] = ["seed"]): void {
  const expected = new Map<string, string>();
  for (const s of seeds) for (const f of files(join(ROLLBACK, s))) expected.set(f, join(ROLLBACK, s, f));
  const actual = files(root).filter((f) => f !== "upgrade.sh" && !f.startsWith(".upgrade-backup/"));
  expect(actual).toEqual([...expected.keys()].sort());
  for (const [f, source] of expected) {
    expect(readFileSync(join(root, f))).toEqual(readFileSync(source));
    expect(statSync(join(root, f)).mode & 0o777).toBe(statSync(source).mode & 0o777);
  }
}

describe("rollback fixture", () => {
  test("original rollback leaves dangling entry points", () => {
    const run = install("original");
    expect(upgrade(run.root, ["upgrade"]).code).toBe(0);
    expect(hook(run.root)).toContain('"engine": "new-home"');
    expect(upgrade(run.root, ["rollback"]).code).toBe(0);
    // What the flawed plan's T1 acceptance checks still passes...
    expect(statSync(join(run.root, "legacy/bin/memory")).mode & 0o111).not.toBe(0);
    expect(readFileSync(join(run.root, "legacy/bank/notes.txt"))).toEqual(readFileSync(join(ROLLBACK, "seed/legacy/bank/notes.txt")));
    expect(existsSync(join(run.root, "new-home"))).toBe(false);
    // ...while every entry point is broken.
    expect(hook(run.root)).toBe("{}\n");
    expect(helperPath(run.root)).toBe(`${run.root}/new-home/bin/memory`);
    expect(registration(run.root).command).toBe("new-home/bin/memory");
    stayedInside(run);
  });

  test("original activation failure rolls back to the same dangling entry points", () => {
    const run = install("original");
    expect(upgrade(run.root, ["upgrade"], { FIXTURE_FAIL: "activate" }).code).toBe(1);
    expect(existsSync(join(run.root, "legacy/bin/memory"))).toBe(true);
    expect(hook(run.root)).toBe("{}\n");
    stayedInside(run);
  });

  test("original install overwrites unrelated registration values", () => {
    const run = install("original");
    expect(registration(run.root)).toMatchObject({ enabled: false, label: "work profile" });
    upgrade(run.root, ["upgrade"]);
    expect(registration(run.root).enabled).toBe(true);
    expect(registration(run.root).label).toBeUndefined();
    upgrade(run.root, ["rollback"]);
    expect(registration(run.root).enabled).toBe(true);
    expect(registration(run.root).label).toBeUndefined();
    stayedInside(run);
  });

  test("original failure inside installation is not rolled back", () => {
    const run = install("original");
    expect(upgrade(run.root, ["upgrade"], { FIXTURE_FAIL: "bank-copy" }).code).toBe(17);
    expect(existsSync(join(run.root, "new-home/bin/memory"))).toBe(true);
    expect(existsSync(join(run.root, ".upgrade-backup/legacy"))).toBe(true);
    stayedInside(run);
  });

  test("corrected upgrade restores working entry points and the owner's values on every path", () => {
    const success = install("corrected");
    expect(upgrade(success.root, ["upgrade"]).code).toBe(0);
    expect(hook(success.root)).toContain('"engine": "new-home"');
    expect(registration(success.root)).toEqual({ name: "memory", command: "new-home/bin/memory", enabled: false, label: "work profile" });
    expect(upgrade(success.root, ["rollback"]).code).toBe(0);
    expect(hook(success.root)).toContain('"engine": "legacy"');
    expect(helperPath(success.root)).toBe(`${success.root}/legacy/bin/memory`);
    equalsSeed(success.root);
    stayedInside(success);
    for (const [step, status] of [["bank-copy", 17], ["activate", 1]] as const) {
      const run = install("corrected");
      expect(upgrade(run.root, ["upgrade"], { FIXTURE_FAIL: step }).code).toBe(status);
      expect(existsSync(join(run.root, "new-home"))).toBe(false);
      expect(hook(run.root)).toContain('"engine": "legacy"');
      equalsSeed(run.root);
      stayedInside(run);
    }
  });

  test("the cron consumer breaks after an upgrade", () => {
    for (const variant of ["original", "corrected"] as const) {
      const run = install(variant, { cron: true });
      expect(spawnSync("sh", [join(run.root, "cron/memory-sync.sh")]).status).toBe(0);
      expect(upgrade(run.root, ["upgrade"]).code).toBe(0);
      const cron = spawnSync("sh", [join(run.root, "cron/memory-sync.sh")], { encoding: "utf8" });
      expect(cron.status).toBe(3);
      expect(cron.stderr).toContain("engine not found");
      stayedInside(run);
    }
  });

  test("an or-true acceptance cannot fail", () => {
    const run = install("original");
    mkdirSync(join(run.root, "tests"));
    writeFileSync(join(run.root, "tests/check_rollback.sh"), "exit 1\n");
    expect(spawnSync("sh", ["-c", "sh tests/check_rollback.sh"], { cwd: run.root }).status).toBe(1);
    expect(spawnSync("sh", ["-c", "sh tests/check_rollback.sh || true"], { cwd: run.root }).status).toBe(0);
  });

  test("every seed in the rollback ground truth names a test in this file", () => {
    const truth = JSON.parse(readFileSync(join(TRUTH, "rollback.json"), "utf8"));
    const source = readFileSync(import.meta.path, "utf8");
    for (const seed of Object.values(truth.seeds) as { test: string }[]) {
      expect(source).toContain(`test("${seed.test}"`);
    }
  });
});

/* ── hidden consumer ───────────────────────────────────────────────────────── */

const HIDDEN = join(FIXTURES, "planning/projects/hidden-consumer");

/** Python import graph: module file → imported module files. */
function importGraph(root: string): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const moduleFile = (mod: string): string | null => {
    const base = mod.replace(/\./g, "/");
    if (existsSync(join(root, `${base}.py`))) return `${base}.py`;
    if (existsSync(join(root, base, "__init__.py"))) return `${base}/__init__.py`;
    return null;
  };
  for (const f of files(root).filter((x) => x.endsWith(".py"))) {
    const deps = new Set<string>();
    for (const m of readFileSync(join(root, f), "utf8").matchAll(/^\s*from (app[\w.]*) import ([\w, ]+)$/gm)) {
      for (const name of m[2].split(",").map((s) => s.trim())) {
        const sub = moduleFile(`${m[1]}.${name}`);
        if (sub) deps.add(sub);
        else {
          const mod = moduleFile(m[1]);
          if (mod) deps.add(mod);
        }
      }
    }
    graph.set(f, deps);
  }
  return graph;
}

function reaches(graph: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const f = stack.pop() as string;
    if (f === to) return true;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const d of graph.get(f) ?? []) stack.push(d);
  }
  return false;
}

describe("hidden-consumer fixture", () => {
  const truth = JSON.parse(readFileSync(join(TRUTH, "hidden-consumer.json"), "utf8"));
  const graph = importGraph(HIDDEN);

  test("more than 20 relevant files, each with the relation the ground truth advertises", () => {
    expect(truth.relevant.length).toBeGreaterThan(20);
    for (const item of truth.relevant) {
      const text = readFileSync(join(HIDDEN, item.path), "utf8");
      expect({ path: item.path, found: text.includes(item.token) }).toEqual({ path: item.path, found: true });
      if (item.relation === "import" || item.relation === "transitive" || item.relation === "test") {
        expect({ path: item.path, reaches: reaches(graph, item.path, truth.entry) }).toEqual({ path: item.path, reaches: true });
      }
      if (item.relation === "transitive") {
        expect(text.includes("check_rate_limit") || text.includes("RateLimited")).toBe(false);
      }
    }
    expect(readFileSync(join(HIDDEN, "app/plugins/registry.py"), "utf8")).not.toContain("import app.core.rate_limit");
    expect(reaches(graph, "app/plugins/registry.py", truth.entry)).toBe(false);
  });

  test("distractors do not depend on the limiter", () => {
    for (const item of truth.distractors) {
      expect({ path: item.path, reaches: reaches(graph, item.path, truth.entry) }).toEqual({ path: item.path, reaches: false });
      expect(readFileSync(join(HIDDEN, item.path), "utf8")).not.toMatch(/rate_limit|throttle|RateLimited/);
    }
  });

  test("the project's own tests pass", () => {
    const root = join(tempDir(), "p");
    materialize("hidden-consumer", root);
    const p = spawnSync("python3", ["-m", "unittest", "discover", "-s", "tests", "-t", "."], {
      cwd: root,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      encoding: "utf8",
    });
    expect(p.stderr).toContain("OK");
    expect(p.status).toBe(0);
  });
});

/* ── plans and isolation ───────────────────────────────────────────────────── */

describe("fixture plans", () => {
  test("every fixture plan validates in its materialized project", () => {
    for (const [name, c] of Object.entries(CASES)) {
      if (!c.plan) continue;
      const { root, plan } = materialize(name, join(tempDir(), name));
      const result = validatePlan(plan as string, { root });
      expect({ name, errors: result.errors }).toEqual({ name, errors: [] });
    }
  });

  test("the greeter's fixture review is gate eligible, and the prior OKAY is not", () => {
    const greeter = materialize("greeter-reviewed", join(tempDir(), "g"));
    expect(validatePlan(greeter.plan as string, { root: greeter.root, review: true }).gateEligible).toBe(true);
    const prior = materialize("rollback-prior-okay", join(tempDir(), "p"));
    const result = validatePlan(prior.plan as string, { root: prior.root, review: true });
    expect(result.errors.map((e) => e.code)).toContain("GATE_RECORD");
    expect(result.gateEligible).toBe(false);
  });

  test("the missing-contract plan relies on an external source that cannot be reached", () => {
    const text = readFileSync(join(FIXTURES, "planning/plans/2026-09-28-memory-upgrade-hook-protocol.md"), "utf8");
    const index = JSON.parse((/### Evidence index\n\n```json\n([\s\S]*?)\n```/.exec(text) as RegExpExecArray)[1]);
    const external = index.citations.filter((c: { kind: string }) => c.kind === "external");
    expect(external.length).toBe(1);
    expect(new URL(external[0].url).hostname.endsWith(".invalid")).toBe(true);
  });

  test("a materialized case never contains ground truth", () => {
    const truthDigests = new Set(readdirSync(TRUTH).map((f) => sha256(readFileSync(join(TRUTH, f)))));
    for (const name of Object.keys(CASES)) {
      const { root } = materialize(name, join(tempDir(), name));
      for (const f of files(root)) {
        expect(f).not.toContain("ground-truth");
        expect(truthDigests.has(sha256(readFileSync(join(root, f))))).toBe(false);
        expect(readFileSync(join(root, f), "utf8")).not.toMatch(/seeded defect|on purpose|ground truth/i);
      }
    }
  });
});

/* ── change fixtures and D4 snapshots ──────────────────────────────────────── */

const RESULT_TRUTH = JSON.parse(readFileSync(join(TRUTH, "result-review.json"), "utf8"));

function row(manifest: { paths: Row[] }, path: string): Row | undefined {
  return manifest.paths.find((r) => r.path === path);
}

describe("change fixtures", () => {
  test("each result-review variant's ground truth is recomputed from its snapshots", () => {
    const owned = new Set<string>([...RESULT_TRUTH.ownedPaths.T1, ...RESULT_TRUTH.ownedPaths.T2]);
    for (const variant of RESULT_VARIANTS) {
      const { root, plan, baseline } = resultReviewCase(variant, join(tempDir(), variant));
      const base = readManifest(join(root, ".git", baseline.snapshot));
      const final = readManifest(join(root, ".git", "silly-skills/plan-builds/fixture/final"));
      const names = new Set([...base.paths, ...final.paths].map((r) => r.path));
      const unplanned: string[] = [];
      for (const path of names) {
        if (path === plan || owned.has(path)) continue;
        if (canon(row(base, path)) !== canon(row(final, path))) unplanned.push(path);
      }
      unplanned.sort();
      const truth = RESULT_TRUTH.variants[variant];
      const truthPaths = truth.differences.flatMap((d: { paths: string[] }) => d.paths).filter((p: string) => !owned.has(p)).sort();
      expect({ variant, unplanned }).toEqual({ variant, unplanned: truthPaths });
      const cli = row(final, "cli.py") as Row;
      const cliText = readFileSync(join(root, "cli.py"), "utf8");
      if (variant === "missing-t2") expect(cli.worktree).toEqual((row(base, "cli.py") as Row).worktree);
      if (variant === "partial-t2") expect(cliText).not.toContain(".upper()");
      if (variant === "clean") expect(cliText).toContain(".upper()");
      if (variant === "staged-not-committed") {
        expect(cli.head).toEqual((row(base, "cli.py") as Row).head);
        expect(cli.index).not.toEqual((row(base, "cli.py") as Row).index);
      }
      if (variant === "renamed-test") expect(row(final, "test_greet.py")?.worktree.state).toBe("absent");

      // Execution commitments: the plan's branch, and receipts that record each todo's planned checks.
      const branch = git(root, "branch", "--show-current").toString().trim();
      expect({ variant, branch }).toEqual({ variant, branch: variant === "wrong-branch" ? "main" : RESULT_TRUTH.branch });
      const text = readFileSync(join(root, plan), "utf8");
      const record = JSON.parse((/### Build record\n\n```json\n([\s\S]*?)\n```/.exec(text) as RegExpExecArray)[1]);
      for (const receipt of record.receipts.filter((r: { event: string }) => r.event === "pass")) {
        const recorded = receipt.checks.map((c: { command: string }) => c.command);
        const acceptance = (new RegExp(`### ${receipt.todo} — [^\\n]+\\n[\\s\\S]*?\\n- Acceptance: (.+)`).exec(text) as RegExpExecArray)[1];
        const planned = [...acceptance.matchAll(/`([^`]+)`/g)].map((m) => m[1]).filter((c) => /^(python3|test) /.test(c));
        if (variant === "unrecorded-checks") expect(recorded).toEqual(["python3 -m unittest -q"]);
        else for (const command of planned) expect({ todo: receipt.todo, recorded: recorded.includes(command), command }).toEqual({ todo: receipt.todo, recorded: true, command });
      }
      // Receipts list what their snapshots show changed; one variant's T2 checkpoint omits a path.
      for (const receipt of record.receipts) {
        if (!receipt.after) continue;
        const before = new Map(readManifest(join(root, ".git", receipt.before.snapshot)).paths.map((r) => [r.path, r]));
        const after = new Map(readManifest(join(root, ".git", receipt.after.snapshot)).paths.map((r) => [r.path, r]));
        const actual: string[] = [];
        for (const path of [...new Set([...before.keys(), ...after.keys()])].sort()) {
          for (const layer of ["head", "index", "worktree"] as const) {
            if (canon(before.get(path)?.[layer] ?? { state: "absent" }) !== canon(after.get(path)?.[layer] ?? { state: "absent" })) actual.push(`${path} [${layer}]`);
          }
        }
        const misreported = variant === "misreported-paths" && receipt.todo === "T2" && receipt.event === "checkpoint";
        if (misreported) {
          const omitted = actual.filter((p) => !receipt.changedPaths.includes(p));
          expect(omitted.length).toBeGreaterThan(0);
          expect(omitted.every((p) => p.startsWith("test_greet.py "))).toBe(true);
        }
        else expect({ variant, seq: receipt.seq, changedPaths: receipt.changedPaths }).toEqual({ variant, seq: receipt.seq, changedPaths: actual });
      }
      // Every snapshot keeps the build's base revision and holds the plan as it stood then:
      // a todo's box is Done exactly when its pass receipt came before the snapshot's receipt.
      for (const receipt of record.receipts) {
        for (const ref of [receipt.before, receipt.after].filter(Boolean)) {
          const baseRevision = readManifest(join(root, ".git", ref.snapshot)).baseRevision;
          expect({ variant, seq: receipt.seq, baseRevision }).toEqual({ variant, seq: receipt.seq, baseRevision: record.baseRevision });
        }
        if (!receipt.after) continue;
        const planRow = row(readManifest(join(root, ".git", receipt.after.snapshot)), plan) as Row;
        const planThen = readFileSync(join(root, ".git", receipt.after.snapshot, "objects", planRow.worktree.sha256 as string), "utf8");
        const passed = new Set(record.receipts.filter((r: { event: string; seq: number }) => r.event === "pass" && r.seq < receipt.seq).map((r: { todo: string }) => r.todo));
        for (const todo of ["T0", "T1", "T2"]) {
          const done = new RegExp(`### ${todo} — [^\\n]+\\n\\n- \\[x\\] Done`).test(planThen);
          expect({ variant, seq: receipt.seq, todo, done }).toEqual({ variant, seq: receipt.seq, todo, done: passed.has(todo) });
        }
      }
      // Checks, then commit: a Commit: yes todo's checkpoint leaves HEAD alone; its pass moves HEAD to the commit.
      const head = (ref: { snapshot: string }) => readManifest(join(root, ".git", ref.snapshot)).headRevision;
      for (const todo of ["T1", "T2"]) {
        const checkpoint = record.receipts.find((r: { todo: string; event: string }) => r.todo === todo && r.event === "checkpoint");
        const pass = record.receipts.find((r: { todo: string; event: string }) => r.todo === todo && r.event === "pass");
        const committedAtCheckpoint = head(checkpoint.before) !== head(checkpoint.after);
        const committed = Boolean(pass.commit.sha);
        expect({ variant, todo, committedAtCheckpoint }).toEqual({ variant, todo, committedAtCheckpoint: variant === "commit-before-checks" && committed });
        if (committed) expect({ variant, todo, passHead: head(pass.after) }).toEqual({ variant, todo, passHead: pass.commit.sha });
        // Commit times agree with the receipt timeline: after the checkpoint and before the pass, or before the checkpoint when committed early.
        const commitTime = Date.parse(git(root, "show", "-s", "--format=%cI", checkpoint.commit.sha ?? pass.commit.sha ?? "HEAD").toString().trim());
        if (committed) {
          const inOrder = commitTime > Date.parse(checkpoint.recordedAt) && commitTime < Date.parse(pass.recordedAt);
          expect({ variant, todo, inOrder }).toEqual({ variant, todo, inOrder: variant !== "commit-before-checks" });
          if (variant === "commit-before-checks") expect(commitTime).toBeLessThan(Date.parse(checkpoint.recordedAt));
        }
      }
      const expected =
        variant === "clean" ? "MATCH" : variant.endsWith("-blob") || variant === "unrecorded-checks" || variant === "misreported-paths" ? "INCOMPLETE" : "MISMATCH";
      expect({ variant, expected: truth.expected }).toEqual({ variant, expected });
    }
  }, 300_000);

  test("the snapshot writer rejects a missing, short, or wrong cat-file result instead of recording empty bytes", () => {
    const data = Buffer.from("owner text\n");
    const oid = gitBlobId(data, "0".repeat(40));
    expect(oid).toBe(execFileSync("git", ["hash-object", "--stdin"], { input: data }).toString().trim());
    const ok = Buffer.concat([Buffer.from(`${oid} blob ${data.length}\n`), data, Buffer.from("\n")]);
    expect(parseBatch(ok, [oid]).get(oid)).toEqual(data);
    expect(() => parseBatch(Buffer.from(`${oid} missing\n`), [oid])).toThrow(/unexpected cat-file header/);
    expect(() => parseBatch(ok.subarray(0, ok.length - 4), [oid])).toThrow(/short/);
    const wrong = Buffer.concat([Buffer.from(`${oid} blob ${data.length}\n`), Buffer.from("other text\n"), Buffer.from("\n")]);
    expect(() => parseBatch(wrong, [oid])).toThrow(/do not hash/);
  });

  test("every snapshot layer the harness records matches git's own objects", () => {
    for (const variant of ["clean", "owner-restored", "binary-symlink-mode"] as ResultVariant[]) {
      const { root } = resultReviewCase(variant, join(tempDir(), variant));
      for (const snap of ["baseline", "T1", "final"]) {
        const m = readManifest(join(root, ".git/silly-skills/plan-builds/fixture", snap));
        for (const r of m.paths) {
          for (const layer of ["head", "index"] as const) {
            const l = r[layer];
            if (l.state !== "file" && l.state !== "symlink") continue;
            const data = readFileSync(join(root, ".git/silly-skills/plan-builds/fixture", snap, "objects", l.sha256 as string));
            // The blob with these bytes must exist in the repository's object store.
            expect({ snap, path: r.path, layer, known: spawnSync("git", ["cat-file", "-e", gitBlobId(data, "0".repeat(40))], { cwd: root }).status === 0 }).toEqual({ snap, path: r.path, layer, known: true });
          }
        }
      }
    }
  });

  test("the greeter's review, the owner's commit, and the build follow one timeline", () => {
    const { root, plan } = resultReviewCase("clean", join(tempDir(), "timeline"));
    const text = readFileSync(join(root, plan), "utf8");
    const record = JSON.parse((/### Build record\n\n```json\n([\s\S]*?)\n```/.exec(text) as RegExpExecArray)[1]);
    const gate = JSON.parse((/#### Gate record\n\n```json\n([\s\S]*?)\n```/.exec(text) as RegExpExecArray)[1]);
    const reviewed = git(root, "rev-list", "--max-parents=0", "HEAD").toString().trim();
    const time = (rev: string) => Date.parse(git(root, "show", "-s", "--format=%cI", rev).toString().trim());
    // The Evidence index baseline and the gate record name the reviewed revision.
    const revisions = [...text.split("## Build")[0].matchAll(/"revision": "([0-9a-f]*)"/g)].map((m) => m[1]);
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    expect(new Set(revisions)).toEqual(new Set([reviewed]));
    expect(gate.repository.revision).toBe(reviewed);
    // Reviewed revision on or before the plan's date, then the owner's commit, then the first receipt.
    const planDate = (/^date: (\S+)$/m.exec(text) as RegExpExecArray)[1];
    expect(time(reviewed)).toBeLessThanOrEqual(Date.parse(`${planDate}T23:59:59Z`));
    expect(git(root, "rev-parse", `${record.baseRevision}^`).toString().trim()).toBe(reviewed);
    expect(time(record.baseRevision)).toBeGreaterThan(time(reviewed));
    expect(time(record.baseRevision)).toBeLessThan(Date.parse(record.receipts[0].recordedAt));
    // Git's own reflog runs forward and ends by the last receipt.
    for (const log of ["HEAD", "refs/heads/feat/greeter-shout"]) {
      const stamps = readFileSync(join(root, ".git/logs", log), "utf8").trim().split("\n").map((line) => Number(/> (\d+) [+-]\d{4}\t/.exec(line)?.[1]) * 1000);
      expect(stamps.every((t) => Number.isFinite(t))).toBe(true);
      expect({ log, stamps }).toEqual({ log, stamps: [...stamps].sort((x, y) => x - y) });
      expect(stamps[stamps.length - 1]).toBeLessThanOrEqual(Date.parse(record.receipts[record.receipts.length - 1].recordedAt));
    }
  });

  test("the clean control's build record passes the validator's resume check", () => {
    const { root, plan } = resultReviewCase("clean", join(tempDir(), "clean"));
    const result = validatePlan(plan, { root, review: true, resume: true });
    expect(result.errors).toEqual([]);
    expect(result.resumeEligible).toBe(true);
    expect(result.nextTodo).toBe("F1");
  });

  test("the clean control passes its tests and the partial variant fails the shout test", () => {
    for (const [variant, ok] of [["clean", true], ["partial-t2", false]] as const) {
      const { root } = resultReviewCase(variant, join(tempDir(), variant));
      const p = spawnSync("python3", ["-m", "unittest", "-q"], { cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, encoding: "utf8" });
      expect({ variant, passed: p.status === 0 }).toEqual({ variant, passed: ok });
      if (!ok) expect(p.stderr).toContain("test_shout_upper_cases");
    }
  });

  test("owner work restored to HEAD is invisible to git diff but visible in the snapshots", () => {
    const { root, baseline } = resultReviewCase("owner-restored", join(tempDir(), "r"));
    const changed = [
      git(root, "diff", "--name-only", "-z", "HEAD").toString(),
      git(root, "diff", "--cached", "--name-only", "-z").toString(),
      git(root, "ls-files", "--others", "--exclude-standard", "-z").toString(),
    ].join("\0");
    expect(changed.split("\0")).not.toContain("README.md");
    const before = row(readManifest(join(root, ".git", baseline.snapshot)), "README.md") as Row;
    const after = row(readManifest(join(root, ".git", "silly-skills/plan-builds/fixture/final")), "README.md") as Row;
    expect(before.index).not.toEqual(before.head);
    expect(before.worktree).not.toEqual(before.index);
    expect(after.worktree).toEqual(after.head);
  });

  test("the validator accepts the hand-built snapshots and rejects missing or corrupt objects", () => {
    const clean = resultReviewCase("clean", join(tempDir(), "c"));
    for (const s of ["baseline", "T1", "final"]) {
      expect(() => verifySnapshot(join(clean.root, ".git/silly-skills/plan-builds/fixture", s))).not.toThrow();
    }
    for (const variant of ["missing-blob", "corrupt-blob"] as ResultVariant[]) {
      const bad = resultReviewCase(variant, join(tempDir(), variant));
      expect(() => verifySnapshot(join(bad.root, ".git", bad.baseline.snapshot))).toThrow(/missing|corrupt/);
    }
  });

  test("every baseline layer reconstructs byte for byte after the repository is deleted", () => {
    const { root, baseline } = resultReviewCase("clean", join(tempDir(), "c"));
    const kept = join(tempDir(), "kept");
    renameSync(join(root, ".git", baseline.snapshot), kept);
    const manifest = readManifest(kept);
    rmSync(root, { recursive: true, force: true });
    let total = 0;
    for (const layer of ["head", "index", "worktree"] as const) {
      const dest = join(tempDir(), layer);
      total += reconstruct(kept, layer, dest);
      for (const r of manifest.paths) {
        if (r[layer].state === "file") expect(sha256(readFileSync(join(dest, r.path)))).toBe(r[layer].sha256 as string);
        if (r[layer].state === "absent") expect(existsSync(join(dest, r.path))).toBe(false);
      }
    }
    const readme = row(manifest, "README.md") as Row;
    expect(new Set([readme.head.sha256, readme.index.sha256, readme.worktree.sha256]).size).toBe(3);
    expect(row(manifest, "HISTORY.txt")?.index.state).toBe("absent");
    expect(row(manifest, "LICENSE.txt")?.worktree.state).toBe("absent");
    expect(row(manifest, "latest")?.worktree.state).toBe("symlink");
    expect(row(manifest, "run.sh")?.worktree.mode).toBe("100755");
    expect(total).toBeGreaterThan(20);
  });

  test("the fixture build record's receipts chain", () => {
    const { root, plan } = resultReviewCase("clean", join(tempDir(), "c"));
    const text = readFileSync(join(root, plan), "utf8");
    const record = JSON.parse((/### Build record\n\n```json\n([\s\S]*?)\n```/.exec(text) as RegExpExecArray)[1]);
    let prev: unknown = null;
    for (const r of record.receipts) {
      expect(r.prev).toBe(prev === null ? null : sha256(canon(prev)));
      prev = r;
    }
  });

  test("build cases hold owner work outside, or inside, the plan's files", () => {
    const disjoint = buildCase("dirty-disjoint", join(tempDir(), "d"));
    const status = git(disjoint.root, "status", "--porcelain").toString();
    for (const line of ["D  HISTORY.txt", " D LICENSE.txt", "MM README.md", " M notes.txt", "?? owner-todo.txt"]) expect(status).toContain(line);
    expect(status).not.toContain("greet.py");
    const mixed = buildCase("mixed-owner", join(tempDir(), "m"));
    expect(git(mixed.root, "diff", "--name-only").toString()).toContain("greet.py");
    expect(git(mixed.root, "show", "HEAD:greet.py").toString()).not.toContain("Owner:");
  });
});
