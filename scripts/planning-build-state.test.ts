/**
 * Tests capture-build-state.ts against real projects and the bundled
 * plan-review validator, per T9's Acceptance: the actual capture helper and
 * the actual validator, tested together, not a reimplementation of either.
 */
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

setDefaultTimeout(60_000);

const repo = join(import.meta.dir, "..");
const CAPTURE = join(repo, "skills/planning/plan-builder/scripts/capture-build-state.ts");
const VALIDATOR = join(repo, "skills/planning/plan-review/scripts/validate-plan.ts");
const INVENTORY = join(repo, "skills/planning/plan-result-review/scripts/inventory-changes.ts");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "build-state-"));
  dirs.push(d);
  return d;
}

function run(args: string[], cwd: string): { code: number; out: string } {
  const p = Bun.spawnSync(["bun", CAPTURE, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
}

describe("capture-build-state", () => {
  test("--help prints usage and exits 0", () => {
    const r = run(["--help"], repo);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage: capture-build-state");
  });

  test("rejects a relative --output in a non-git project (D4: a durable location outside the project)", () => {
    const dir = tempDir();
    const plan = "docs/plans/x.md";
    require("node:fs").mkdirSync(join(dir, "docs/plans"), { recursive: true });
    writeFileSync(join(dir, plan), "---\ntitle: x\n---\n\nbody\n");
    const r = run([plan, "--root", dir, "--output", "relative/output"], dir);
    expect(r.code).toBe(2);
    expect(r.out).toContain("must be an absolute path");
  });

  test("captures a non-git project to an absolute destination and the validator reads it", () => {
    const dir = tempDir();
    const plan = "docs/plans/x.md";
    require("node:fs").mkdirSync(join(dir, "docs/plans"), { recursive: true });
    writeFileSync(join(dir, plan), "---\ntitle: x\n---\n\nbody\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    const dest = join(tempDir(), "snap");
    const r = run([plan, "--root", dir, "--output", dest], dir);
    expect(r.code).toBe(0);
    const v = require(VALIDATOR);
    const verified = v.verifySnapshot(dest);
    expect(verified.manifest.repository).toEqual({ kind: "none" });
    expect(verified.manifest.headRevision).toBe(null);
    const row = verified.manifest.paths.find((p: { path: string }) => p.path === "app.py");
    expect(row.head).toEqual({ state: "unavailable" });
    expect(row.index).toEqual({ state: "unavailable" });
    expect(row.worktree.state).toBe("file");
  });

  test("declared history appends preserve state identity but remain in the result inventory", () => {
    const dir = tempDir();
    const plan = "docs/plans/x.md";
    const history = "docs/plans/x.review-history.md";
    mkdirSync(join(dir, "docs/plans"), { recursive: true });
    writeFileSync(join(dir, plan), "---\ntitle: x\n---\n\nbody\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    const baseline = join(tempDir(), "baseline");
    const first = run([plan, "--root", dir, "--output", baseline, "--report", history], dir);
    expect(first.code).toBe(0);
    const archived = "# Review history: x\n\n### Result round 1\n\nArchived result.\n";
    writeFileSync(join(dir, history), archived);
    const after = join(tempDir(), "after");
    const second = run([plan, "--root", dir, "--output", after, "--carry", baseline, "--report", history], dir);
    expect(second.code).toBe(0);
    expect(JSON.parse(second.out).stateDigest).toBe(JSON.parse(first.out).stateDigest);
    const v = require(VALIDATOR);
    const verified = v.verifySnapshot(after);
    const row = verified.manifest.paths.find((p: { path: string }) => p.path === history);
    expect(readFileSync(join(after, "objects", row.worktree.sha256), "utf8")).toBe(archived);

    const inventory = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--baseline", baseline, "--json"], { stdout: "pipe", stderr: "pipe" });
    expect(inventory.exitCode).toBe(0);
    const changes = JSON.parse(inventory.stdout.toString()).changes;
    expect(changes.map((c: { path: string }) => c.path)).toEqual([history]);
    expect(changes[0].diff).toContain("Archived result.");

    writeFileSync(join(dir, "app.py"), "print('changed')\n");
    const changed = run([plan, "--root", dir, "--output", join(tempDir(), "changed"), "--carry", after, "--report", history], dir);
    expect(changed.code).toBe(0);
    expect(JSON.parse(changed.out).stateDigest).not.toBe(JSON.parse(first.out).stateDigest);
  });
});
