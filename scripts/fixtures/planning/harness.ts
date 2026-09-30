#!/usr/bin/env bun
/**
 * Builds disposable evaluation inputs for the planning skills.
 *
 *   bun scripts/fixtures/planning/harness.ts list
 *   bun scripts/fixtures/planning/harness.ts materialize <case> <new-dir>
 *
 * A materialized directory holds only what an evaluated agent may see: the
 * project, and the plan under docs/plans/ when the case has one. Ground truth
 * stays in ../planning/ground-truth/ and is never copied.
 *
 * The D4 snapshot writer here is deliberately independent of plan-builder's
 * capture helper, so the result reviewer and the validator can be tested
 * against snapshots that neither of them produced.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const HERE = import.meta.dir;
const ROLLBACK = resolve(HERE, "../rollback");
const PROJECTS = join(HERE, "projects");
const PLANS = join(HERE, "plans");

export const GREETER_PLAN = "docs/plans/2026-09-28-greeter-shout.md";

type Case = { project: string; plan: string | null; git: boolean; description: string };

export const CASES: Record<string, Case> = {
  "rollback-prior-okay": { project: "rollback", plan: "2026-09-27-memory-new-home.md", git: true, description: "E2: reviewed plan with an unsupported prior OKAY; three seeded blockers" },
  "rollback-five-blockers": { project: "rollback-cron", plan: "2026-09-28-memory-new-home-with-cron.md", git: true, description: "E2: planned plan with five seeded blockers" },
  "rollback-clean": { project: "rollback", plan: "2026-09-28-memory-upgrade-rollback.md", git: true, description: "E3: executable corrected plan" },
  "rollback-missing-contract": { project: "rollback", plan: "2026-09-28-memory-upgrade-hook-protocol.md", git: true, description: "E3: plan that depends on an unreachable external contract" },
  "hidden-consumer": { project: "hidden-consumer", plan: null, git: true, description: "E1/E4: project only; the request names the entry point" },
  "hidden-consumer-paused": { project: "hidden-consumer", plan: "2026-09-28-sliding-window-rate-limit.md", git: true, description: "E1: paused draft with an open frontier" },
  "greeter-reviewed": { project: "two-todo", plan: "2026-09-28-greeter-shout.md", git: true, description: "E5/E6: reviewed two-todo plan" },
};

export const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Fixture Owner",
  GIT_AUTHOR_EMAIL: "owner@example.com",
  GIT_COMMITTER_NAME: "Fixture Owner",
  GIT_COMMITTER_EMAIL: "owner@example.com",
  GIT_AUTHOR_DATE: "2026-09-27T08:00:00Z",
  GIT_COMMITTER_DATE: "2026-09-27T08:00:00Z",
  GIT_CONFIG_NOSYSTEM: "1",
};

export function git(root: string, ...args: string[]): Buffer {
  return execFileSync("git", ["-c", "commit.gpgSign=false", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd: root,
    env: GIT_ENV,
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export const sha256 = (data: string | Buffer): string => createHash("sha256").update(data).digest("hex");

function copyTree(src: string, dest: string): void {
  cpSync(src, dest, { recursive: true, verbatimSymlinks: true, filter: (p) => !p.includes("__pycache__") });
}

/** Copies a case into `dest`, which must not exist. Returns the plan path, if any. */
export function materialize(name: string, dest: string): { root: string; plan: string | null } {
  const c = CASES[name];
  if (!c) throw new Error(`unknown case '${name}'; run 'list'`);
  if (existsSync(dest)) throw new Error(`destination exists: ${dest}`);
  mkdirSync(dest, { recursive: true });
  if (c.project.startsWith("rollback")) {
    copyTree(join(ROLLBACK, "seed"), dest);
    if (c.project === "rollback-cron") copyTree(join(ROLLBACK, "seed-cron"), dest);
    cpSync(join(ROLLBACK, "original", "upgrade.sh"), join(dest, "upgrade.sh"));
  } else {
    copyTree(join(PROJECTS, c.project), dest);
  }
  if (c.git) {
    git(dest, "init", "-q", "-b", "main");
    git(dest, "add", "-A");
    git(dest, "commit", "-q", "-m", "Initial project");
  }
  let plan: string | null = null;
  if (c.plan) {
    plan = `docs/plans/${c.plan}`;
    mkdirSync(join(dest, "docs/plans"), { recursive: true });
    cpSync(join(PLANS, c.plan), join(dest, plan));
  }
  return { root: dest, plan };
}

/* ── D4 snapshots (independent writer) ─────────────────────────────────────── */

export type Layer = Record<string, unknown> & { state: string };
export type Row = { path: string; head: Layer; index: Layer; worktree: Layer };

/** Canonical JSON: sorted keys, no whitespace. */
export function canon(value: unknown): string {
  return JSON.stringify(value, (_key, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val,
  );
}

/** Spec digest for fixture plans (no fenced headings or fenced boxes). */
export function fixtureSpecDigest(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const out: string[] = [];
  let frontmatter = false;
  let skip = false;
  let fence = false;
  lines.forEach((line, i) => {
    if (i === 0 && line === "---") {
      frontmatter = true;
      out.push(line);
      return;
    }
    if (frontmatter) {
      if (line === "---") frontmatter = false;
      else if (/^(status|review_round):/.test(line)) return;
      out.push(line);
      return;
    }
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    else if (!fence && /^## /.test(line)) skip = ["## Review", "## Build", "## Result review"].includes(line.trim());
    if (skip) return;
    out.push(!fence && /^- \[[ x]\] (Open|Done)$/.test(line) ? "- [ ] Open" : line);
  });
  return sha256(`${out.join("\n")}\n`);
}

/** Git's object id for blob contents: SHA-1, or SHA-256 in a SHA-256 repository. */
export function gitBlobId(data: Buffer, oid: string): string {
  return createHash(oid.length === 64 ? "sha256" : "sha1").update(`blob ${data.length}\0`).update(data).digest("hex");
}

/**
 * Parses `git cat-file --batch` output for `oids`, in order. Throws on a
 * missing object, an unexpected header, a short read, or contents whose git
 * id is not the requested oid, so a failed read can never become empty bytes.
 */
export function parseBatch(batch: Buffer, oids: string[]): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let pos = 0;
  for (const oid of oids) {
    const nl = batch.indexOf(10, pos);
    if (nl < 0) throw new Error(`cat-file output ended before ${oid}`);
    const header = batch.subarray(pos, nl).toString().split(" ");
    if (header.length !== 3 || header[0] !== oid || header[1] !== "blob" || !/^\d+$/.test(header[2])) {
      throw new Error(`unexpected cat-file header for ${oid}: ${header.join(" ")}`);
    }
    const size = Number(header[2]);
    if (nl + 1 + size > batch.length) throw new Error(`cat-file output is short for ${oid}`);
    const data = Buffer.from(batch.subarray(nl + 1, nl + 1 + size));
    if (gitBlobId(data, oid) !== oid) throw new Error(`cat-file contents for ${oid} do not hash to that id`);
    out.set(oid, data);
    pos = nl + 1 + size + 1;
  }
  return out;
}

/** Reads blobs with one batch call; on failure, reads each blob alone once more, then throws. */
function readBlobs(root: string, oids: string[]): Map<string, Buffer> {
  if (oids.length === 0) return new Map();
  try {
    return parseBatch(execFileSync("git", ["cat-file", "--batch"], { cwd: root, env: GIT_ENV, input: `${oids.join("\n")}\n`, maxBuffer: 1 << 30 }), oids);
  } catch (first) {
    const out = new Map<string, Buffer>();
    for (const oid of oids) {
      const data = git(root, "cat-file", "blob", oid);
      if (gitBlobId(data, oid) !== oid) throw new Error(`blob ${oid} is unreadable after a retry (${(first as Error).message})`);
      out.set(oid, data);
    }
    return out;
  }
}

export type SnapshotRef = { snapshot: string; manifestSha256: string; stateDigest: string };

/**
 * Writes a D4 snapshot of `root` into `.git/<rel>`: HEAD, index, and
 * working-tree bytes for tracked, staged, untracked, and carried paths.
 */
export function writeSnapshot(
  root: string,
  rel: string,
  options: { plan?: string; carry?: string[]; approvedSpecDigest?: string; runId?: string; baseRevision?: string } = {},
): SnapshotRef {
  const out = join(root, ".git", rel);
  if (existsSync(out)) throw new Error(`snapshot exists: ${rel}`);
  const partial = `${out}.partial`;
  mkdirSync(join(partial, "objects"), { recursive: true });
  const objects = new Map<string, Buffer>();
  const layer = (data: Buffer, mode: string): Layer => {
    const digest = sha256(data);
    objects.set(digest, data);
    return { state: mode === "120000" ? "symlink" : "file", mode, length: data.length, sha256: digest };
  };
  const entries_ = (buf: Buffer, stageField: boolean): [string, string, string][] =>
    buf
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((row) => {
        const tab = row.indexOf("\t");
        const parts = row.slice(0, tab).split(" ");
        return [row.slice(tab + 1), parts[0], stageField ? parts[1] : parts[2]];
      });
  const headRows = entries_(git(root, "ls-tree", "-r", "-z", "HEAD"), false);
  const indexRows = entries_(git(root, "ls-files", "--stage", "-z"), true);
  const oids = [...new Set([...headRows, ...indexRows].map((r) => r[2]))];
  const blobs = readBlobs(root, oids);
  const read = (rows: [string, string, string][]): Map<string, Layer> =>
    new Map(rows.map(([path, mode, oid]) => [path, layer(blobs.get(oid) as Buffer, mode)]));
  const headRevision = git(root, "rev-parse", "HEAD").toString().trim();
  const head = read(headRows);
  const index = read(indexRows);
  const untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z").toString("utf8").split("\0").filter(Boolean);
  const names = [...new Set([...head.keys(), ...index.keys(), ...untracked, ...(options.carry ?? [])])].sort((a, b) =>
    Buffer.compare(Buffer.from(a), Buffer.from(b)),
  );
  const paths: Row[] = names.map((path) => {
    let worktree: Layer = { state: "absent" };
    const abs = join(root, path);
    try {
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) worktree = layer(Buffer.from(readlinkSync(abs)), "120000");
      else if (st.isFile()) worktree = layer(readFileSync(abs), st.mode & 0o111 ? "100755" : "100644");
    } catch {
      // absent
    }
    return { path, head: head.get(path) ?? { state: "absent" }, index: index.get(path) ?? { state: "absent" }, worktree };
  });
  const planRel = options.plan ?? "";
  const entries = paths.map((p) =>
    p.path === planRel && p.worktree.state === "file"
      ? { ...p, worktree: { state: "plan", specDigest: fixtureSpecDigest((objects.get(p.worktree.sha256 as string) as Buffer).toString("utf8")) } }
      : p,
  );
  const stateDigest = sha256(canon({ headRevision, paths: entries }));
  const planRow = paths.find((p) => p.path === planRel);
  const planBytes = planRow && planRow.worktree.state === "file" ? (objects.get(planRow.worktree.sha256 as string) as Buffer) : null;
  const manifest = {
    schemaVersion: 1,
    kind: "silly-skills.build-state",
    runId: options.runId ?? "fixture-run",
    repository: repositoryIdentity(root),
    baseRevision: options.baseRevision ?? headRevision,
    headRevision,
    approvedSpecDigest: options.approvedSpecDigest ?? (planBytes ? fixtureSpecDigest(planBytes.toString("utf8")) : ""),
    plan: { path: planRel, sha256: planBytes ? sha256(planBytes) : "", specDigest: planBytes ? fixtureSpecDigest(planBytes.toString("utf8")) : "" },
    administrative: { plan: planRel, reports: [] as string[] },
    includes: [] as string[],
    stateDigest,
    paths,
  };
  for (const [digest, data] of objects) writeFileSync(join(partial, "objects", digest), data);
  const raw = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(partial, "manifest.json"), raw);
  execFileSync("mv", [partial, out]);
  return { snapshot: rel, manifestSha256: sha256(raw), stateDigest };
}

export function repositoryIdentity(root: string) {
  const roots = git(root, "rev-list", "--max-parents=0", "HEAD").toString().split(/\s+/).filter(Boolean).sort();
  return { kind: "git", rootCommits: roots, branch: git(root, "symbolic-ref", "-q", "--short", "HEAD").toString().trim() || null };
}

export function readManifest(dir: string): { paths: Row[]; stateDigest: string; headRevision: string } {
  return JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
}

/** Rebuilds one layer of a snapshot into `dest`, checking every object digest. */
export function reconstruct(snapshotDir: string, which: "head" | "index" | "worktree", dest: string): number {
  let count = 0;
  for (const row of readManifest(snapshotDir).paths) {
    const l = row[which];
    if (l.state !== "file" && l.state !== "symlink") continue;
    const data = readFileSync(join(snapshotDir, "objects", l.sha256 as string));
    if (sha256(data) !== l.sha256 || data.length !== l.length) throw new Error(`corrupt object for ${row.path}`);
    const target = join(dest, row.path);
    mkdirSync(dirname(target), { recursive: true });
    if (l.state === "symlink") symlinkSync(data.toString(), target);
    else {
      writeFileSync(target, data);
      chmodSync(target, l.mode === "100755" ? 0o755 : 0o644);
    }
    count++;
  }
  return count;
}

/* ── owner work and implementation variants (E5/E6) ────────────────────────── */

/** Unrelated owner work present before the build starts. */
export function applyOwnerWork(root: string, options: { mixedInGreet?: boolean } = {}): void {
  writeFileSync(join(root, "HISTORY.txt"), "0.1 first release\n");
  writeFileSync(join(root, "LICENSE.txt"), "Owner license text.\n");
  writeFileSync(join(root, "run.sh"), "#!/bin/sh\npython3 cli.py \"$@\"\n");
  chmodSync(join(root, "run.sh"), 0o755);
  writeFileSync(join(root, "logo.bin"), Buffer.from([0, 1, 2, 3, 255, 254, 0, 10]));
  symlinkSync("greet.py", join(root, "latest"));
  git(root, "add", "-A", "--", "HISTORY.txt", "LICENSE.txt", "run.sh", "logo.bin", "latest");
  execFileSync("git", ["-c", "commit.gpgSign=false", "-c", "core.hooksPath=/dev/null", "commit", "-q", "-m", "Owner files"], {
    cwd: root,
    env: { ...GIT_ENV, GIT_AUTHOR_DATE: "2026-09-28T09:30:00Z", GIT_COMMITTER_DATE: "2026-09-28T09:30:00Z" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Staged and unstaged owner edits in one file.
  writeFileSync(join(root, "README.md"), `${readFileSync(join(root, "README.md"), "utf8")}\nStaged by the owner.\n`);
  git(root, "add", "README.md");
  writeFileSync(join(root, "README.md"), `${readFileSync(join(root, "README.md"), "utf8")}Unstaged by the owner.\n`);
  writeFileSync(join(root, "notes.txt"), `${readFileSync(join(root, "notes.txt"), "utf8")}Unstaged note.\n`);
  writeFileSync(join(root, "owner-todo.txt"), "Untracked owner file.\n");
  git(root, "rm", "-q", "HISTORY.txt");
  unlinkSync(join(root, "LICENSE.txt"));
  if (options.mixedInGreet) {
    writeFileSync(join(root, "greet.py"), `${readFileSync(join(root, "greet.py"), "utf8")}\n# Owner: keep this helper small.\n`);
  }
}

export const T1_GREET = '"""Greeting helpers."""\n\n\ndef greet(name, punctuation="!"):\n    return f"Hello, {name}{punctuation}"\n';
export const T1_TEST = [
  "import unittest",
  "",
  "from cli import main",
  "from greet import greet",
  "",
  "",
  "class GreetTest(unittest.TestCase):",
  "    def test_greets_by_name(self):",
  '        self.assertEqual(greet("Ana"), "Hello, Ana!")',
  "",
  "    def test_punctuation_can_be_empty(self):",
  '        self.assertEqual(greet("Ana", punctuation=""), "Hello, Ana")',
  "",
  "    def test_cli_returns_zero(self):",
  '        self.assertEqual(main(["Ben"]), 0)',
  "",
].join("\n");
export const T2_CLI = [
  '"""Prints a greeting."""',
  "import sys",
  "",
  "from greet import greet",
  "",
  "",
  "def main(argv):",
  '    shout = bool(argv) and argv[0] == "--shout"',
  "    if shout:",
  "        argv = argv[1:]",
  '    text = greet(argv[0] if argv else "world")',
  "    print(text.upper() if shout else text)",
  "    return 0",
  "",
  "",
  'if __name__ == "__main__":',
  "    sys.exit(main(sys.argv[1:]))",
  "",
].join("\n");
export const T2_TEST = [
  "import contextlib",
  "import io",
  ...T1_TEST.split("\n"),
].join("\n").replace(/\n$/, "") + [
  "",
  "",
  "    def test_shout_upper_cases(self):",
  "        out = io.StringIO()",
  "        with contextlib.redirect_stdout(out):",
  '            self.assertEqual(main(["--shout", "Ana"]), 0)',
  '        self.assertEqual(out.getvalue(), "HELLO, ANA!\\n")',
  "",
].join("\n");

/** Commits exactly `paths`, dated `at` so commit times agree with the receipt timeline. */
function commitOnly(root: string, message: string, paths: string[], at: string): string {
  execFileSync("git", ["-c", "commit.gpgSign=false", "-c", "core.hooksPath=/dev/null", "--literal-pathspecs", "commit", "-q", "--only", "-m", message, "--", ...paths], {
    cwd: root,
    env: { ...GIT_ENV, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at },
    stdio: ["pipe", "pipe", "pipe"],
  });
  return git(root, "rev-parse", "HEAD").toString().trim();
}

export const RESULT_VARIANTS = [
  "clean",
  "missing-t2",
  "partial-t2",
  "extra-untracked",
  "staged-not-committed",
  "renamed-test",
  "owner-restored",
  "untracked-removed",
  "newly-ignored",
  "binary-symlink-mode",
  "missing-blob",
  "corrupt-blob",
  "wrong-branch",
  "unrecorded-checks",
  "misreported-paths",
  "commit-before-checks",
] as const;
export type ResultVariant = (typeof RESULT_VARIANTS)[number];

/**
 * E6: a greeter build with owner work, a baseline snapshot, receipts, and an
 * implementation that differs from the plan in one named way.
 */
export function resultReviewCase(variant: ResultVariant, dest: string): { root: string; plan: string; baseline: SnapshotRef } {
  const { root } = materialize("greeter-reviewed", dest);
  const plan = GREETER_PLAN;
  applyOwnerWork(root);
  const planText = readFileSync(join(root, plan), "utf8");
  const spec = fixtureSpecDigest(planText);
  const gateRecordDigest = sha256(canon(JSON.parse((/#### Gate record\n\n```json\n([\s\S]*?)\n```/.exec(planText) as RegExpExecArray)[1])));
  // The builder switches to the plan's branch before capturing the baseline; one variant stays on main.
  // Dated after the owner's commit and before the first receipt, so the reflog stays in order.
  if (variant !== "wrong-branch") {
    execFileSync("git", ["switch", "-q", "-c", "feat/greeter-shout"], {
      cwd: root,
      env: { ...GIT_ENV, GIT_AUTHOR_DATE: "2026-09-28T09:59:00Z", GIT_COMMITTER_DATE: "2026-09-28T09:59:00Z" },
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  const baseline = writeSnapshot(root, "silly-skills/plan-builds/fixture/baseline", { plan, approvedSpecDigest: spec });
  const baseRevision = readManifest(join(root, ".git", baseline.snapshot)).headRevision;
  const carry = readManifest(join(root, ".git", baseline.snapshot)).paths.map((p) => p.path);
  const commits: Record<string, string> = {};
  const early = variant === "commit-before-checks";
  const snap = (label: string) => writeSnapshot(root, `silly-skills/plan-builds/fixture/${label}`, { plan, carry, approvedSpecDigest: spec, baseRevision });

  // Each pass receipt records the todo's planned Acceptance and QA commands with
  // the output the builder reported. The unrecorded-checks variant records only
  // the unit tests. A defective variant's receipts still claim success.
  const ran = (id: string, command: string, observed: string) => ({ id, command, exit: 0, expectedExit: 0, passed: true, observed });
  const tests = (n: number) => ran("acceptance-tests", "python3 -m unittest -q", `Ran ${n} tests; OK`);
  const planned: Record<string, Record<string, unknown>[]> = {
    T0: [ran("acceptance", `test -f ${GREETER_PLAN}`, "exit 0"), ran("qa-happy", "ls docs/plans", "2026-09-28-greeter-shout.md; no second copy")],
    T1: [
      tests(3),
      ran("acceptance-greet", "python3 -c 'from greet import greet; assert greet(\"Ana\") == \"Hello, Ana!\"'", "exit 0"),
      ran("qa-happy", "python3 cli.py Ana", "Hello, Ana!"),
      ran("qa-failure", "python3 -c 'from greet import greet; print(greet(\"Ana\", punctuation=\"\"))'", "Hello, Ana"),
    ],
    T2: [ran("acceptance-shout", "python3 cli.py --shout Ana", "HELLO, ANA!"), tests(4), ran("qa-failure", "python3 cli.py Ana", "Hello, Ana!")],
  };
  const checksFor = (todo: string) => (variant === "unrecorded-checks" ? [tests(todo === "T0" ? 2 : todo === "T1" ? 3 : 4)] : planned[todo]);

  // changedPaths lists every path and layer that differs between a receipt's before and
  // after snapshots, the plan included.
  const manifestOf = (ref: SnapshotRef) => readManifest(join(root, ".git", ref.snapshot));
  const changed = (before: SnapshotRef, after: SnapshotRef | null): string[] => {
    if (!after) return [];
    const a = new Map(manifestOf(before).paths.map((r) => [r.path, r]));
    const b = new Map(manifestOf(after).paths.map((r) => [r.path, r]));
    const out: string[] = [];
    for (const path of [...new Set([...a.keys(), ...b.keys()])].sort()) {
      for (const layer of ["head", "index", "worktree"] as const) {
        if (canon(a.get(path)?.[layer] ?? { state: "absent" }) !== canon(b.get(path)?.[layer] ?? { state: "absent" })) out.push(`${path} [${layer}]`);
      }
    }
    return out;
  };
  const digestOf = (path: string, ref: SnapshotRef) => (manifestOf(ref).paths.find((r) => r.path === path)?.worktree.sha256 as string) ?? null;
  const none = (why: string) => ({ none: why });

  // The builder rewrites the plan's Build section after every receipt and ticks a
  // todo's box right after its pass, so each snapshot holds the plan as it stood.
  const receipts: Record<string, unknown>[] = [];
  const done = new Set<string>();
  const writePlan = () => {
    let text = planText;
    for (const id of done) text = text.replace(new RegExp(`(### ${id} — [^\\n]+\\n\\n)- \\[ \\] Open`), "$1- [x] Done");
    const record = {
      schemaVersion: 1,
      runId: "fixture-run",
      runDir: "silly-skills/plan-builds/fixture",
      repository: repositoryIdentity(root),
      baseRevision,
      approval: { specDigest: spec, round: 1, verdict: "OKAY", gateRecordDigest },
      baseline,
      skill: { name: "plan-builder", version: "fixture", sha256: null, note: "Hand-built fixture record; no plan-builder run produced it." },
      receipts,
    };
    writeFileSync(join(root, plan), `${text}\n## Build\n\nSnapshot paths are relative to the Git directory: resolve one with \`git rev-parse --git-path <snapshot>\`.\n\n### Build record\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`);
  };
  const add = (todo: string, event: string, before: SnapshotRef, after: SnapshotRef | null, commit: Record<string, string>, prerequisites: unknown[] = []) => {
    const prev = receipts[receipts.length - 1];
    let paths = changed(before, after);
    // The misreported-paths variant's T2 checkpoint leaves out the test file it changed.
    if (variant === "misreported-paths" && todo === "T2" && event === "checkpoint") paths = paths.filter((p) => !p.startsWith("test_greet.py"));
    receipts.push({
      seq: receipts.length + 1,
      todo,
      event,
      state: event === "pass" ? "passed" : "active",
      prev: prev ? sha256(canon(prev)) : null,
      before,
      after,
      changedPaths: paths,
      checks: event === "pass" ? checksFor(todo) : [],
      prerequisites,
      commit,
      note: "",
      recordedAt: new Date(Date.parse("2026-09-28T10:00:00Z") + receipts.length * 120_000).toISOString(),
    });
    if (event === "pass") done.add(todo);
    writePlan();
  };
  writePlan();

  // T0: the plan is already in docs/plans; no copy.
  add("T0", "start", baseline, null, none("no commit at this event"));
  add("T0", "pass", baseline, baseline, none("Commit: no; no-copy branch"));

  // T1, the same in every variant: edits, checkpoint, checks, commit, pass.
  // Receipts are recorded every two minutes from 10:00: T1's checkpoint at 10:06 and pass at 10:08, T2's at 10:12 and 10:14.
  // A commit made after the checks falls between its checkpoint and its pass; an early commit falls before the checkpoint.
  add("T1", "start", baseline, null, none("no commit at this event"), [
    {
      targets: ["T1.start"],
      sources: ["greet.py", "test_greet.py", "run.sh", "latest"].map((path) => ({ path, sha256: digestOf(path, baseline) })),
      status: "holds",
      observed:
        "greet.py and test_greet.py match the reviewed sources. Since the review, the owner's commit added run.sh, which passes its arguments to cli.py, and latest, a symlink to greet.py; neither pins the greeting text, so T1's plan still holds.",
    },
  ]);
  writeFileSync(join(root, "greet.py"), T1_GREET);
  writeFileSync(join(root, "test_greet.py"), T1_TEST);
  const commitT1 = () => (commits.T1 = commitOnly(root, "feat: end greetings with punctuation", ["greet.py", "test_greet.py"], early ? "2026-09-28T10:05:00Z" : "2026-09-28T10:07:00Z"));
  if (early) commitT1();
  const editedT1 = snap("T1-edited");
  add("T1", "checkpoint", baseline, editedT1, early ? { sha: commits.T1 } : none("commit after the checks pass"));
  if (!early) commitT1();
  const afterT1 = snap("T1");
  add("T1", "pass", editedT1, afterT1, { sha: commits.T1 });

  // T2 and the variant's difference, made during T2.
  add("T2", "start", afterT1, null, none("no commit at this event"), [
    {
      targets: ["T2.start"],
      sources: ["cli.py", "greet.py", "run.sh"].map((path) => ({ path, sha256: digestOf(path, afterT1) })),
      status: "holds",
      observed:
        "T1 changed greet.py: greet(name, punctuation=\"!\") still returns the text main prints. cli.py is unchanged since the baseline, and run.sh passes a leading --shout through to main.",
    },
  ]);
  if (variant !== "missing-t2") {
    const cli = variant === "partial-t2" ? T2_CLI.replace("print(text.upper() if shout else text)", "print(text)") : T2_CLI;
    writeFileSync(join(root, "cli.py"), cli);
    writeFileSync(join(root, "test_greet.py"), T2_TEST);
  }
  if (variant === "extra-untracked") writeFileSync(join(root, "scratch.py"), "print('debug')\n");
  if (variant === "owner-restored") git(root, "restore", "--source=HEAD", "--staged", "--worktree", "--", "README.md");
  if (variant === "untracked-removed") unlinkSync(join(root, "owner-todo.txt"));
  if (variant === "newly-ignored") writeFileSync(join(root, ".gitignore"), "owner-todo.txt\n");
  if (variant === "binary-symlink-mode") {
    writeFileSync(join(root, "logo.bin"), Buffer.from([0, 9, 9, 255]));
    unlinkSync(join(root, "latest"));
    symlinkSync("cli.py", join(root, "latest"));
    chmodSync(join(root, "run.sh"), 0o644);
  }
  const commitT2 = () => {
    if (variant === "missing-t2") return;
    if (variant === "staged-not-committed") git(root, "add", "--", "cli.py", "test_greet.py");
    else commits.T2 = commitOnly(root, "feat: add a shout flag", ["cli.py", "test_greet.py"], early ? "2026-09-28T10:11:00Z" : "2026-09-28T10:13:00Z");
  };
  const t2Commit = () => (commits.T2 ? { sha: commits.T2 } : none(variant === "staged-not-committed" ? "staged; commit pending" : "no commit made"));
  if (early) commitT2();
  const editedT2 = snap("T2-edited");
  add("T2", "checkpoint", afterT1, editedT2, early ? t2Commit() : none("commit after the checks pass"));
  if (!early) commitT2();
  if (variant === "renamed-test") {
    git(root, "mv", "test_greet.py", "test_greeter.py");
    commits.T2 = commitOnly(root, "test: rename the test module", ["test_greet.py", "test_greeter.py"], "2026-09-28T10:13:30Z");
  }
  const final = snap("final");
  add("T2", "pass", editedT2, final, t2Commit());
  if (variant === "missing-blob" || variant === "corrupt-blob") {
    const manifest = readManifest(join(root, ".git", baseline.snapshot));
    const row = manifest.paths.find((p) => p.path === "README.md") as Row;
    const object = join(root, ".git", baseline.snapshot, "objects", row.worktree.sha256 as string);
    if (variant === "missing-blob") rmSync(object);
    else writeFileSync(object, "corrupted\n");
  }
  return { root, plan, baseline };
}

/** E5: a greeter ready to build, with unrelated owner work, or an owner edit inside T1's file. */
export function buildCase(variant: "dirty-disjoint" | "mixed-owner", dest: string): { root: string; plan: string } {
  const { root } = materialize("greeter-reviewed", dest);
  applyOwnerWork(root, { mixedInGreet: variant === "mixed-owner" });
  return { root, plan: GREETER_PLAN };
}

if (import.meta.main) {
  const [command, name, dest] = process.argv.slice(2);
  if (command === "list") {
    for (const [key, c] of Object.entries(CASES)) console.log(`${key}\t${c.description}`);
    for (const v of RESULT_VARIANTS) console.log(`result:${v}\tE6: greeter build, variant ${v}`);
    console.log("build:dirty-disjoint\tE5: owner work outside the plan's files");
    console.log("build:mixed-owner\tE5: owner edit inside T1's file");
  } else if (command === "materialize" && name && dest) {
    const target = resolve(dest);
    if (name.startsWith("result:")) console.log(JSON.stringify(resultReviewCase(name.slice(7) as ResultVariant, target)));
    else if (name.startsWith("build:")) console.log(JSON.stringify(buildCase(name.slice(6) as "dirty-disjoint" | "mixed-owner", target)));
    else console.log(JSON.stringify(materialize(name, target)));
  } else {
    console.error("usage: harness.ts list | materialize <case> <new-dir>");
    process.exit(2);
  }
}
