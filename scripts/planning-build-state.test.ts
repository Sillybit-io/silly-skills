/**
 * Tests capture-build-state.ts against real projects and the bundled
 * plan-review validator, per T9's Acceptance: the actual capture helper and
 * the actual validator, tested together, not a reimplementation of either.
 */
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  test("the reviews and build files are declared reports; the plan directory stays out of the result inventory", () => {
    const dir = tempDir();
    const stem = "2026-10-28-x";
    const planDir = `docs/plans/${stem}`;
    const plan = `${planDir}/${stem}.md`;
    const reviews = `${planDir}/${stem}.reviews.md`;
    const build = `${planDir}/${stem}.build.md`;
    mkdirSync(join(dir, planDir), { recursive: true });
    writeFileSync(join(dir, plan), "---\ntitle: x\n---\n\nbody\n");
    writeFileSync(join(dir, `${planDir}/${stem}.evidence-index.md`), "```json\n{}\n```\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    const baseline = join(tempDir(), "baseline");
    const first = run([plan, "--root", dir, "--output", baseline], dir);
    expect(first.code).toBe(0);
    const v = require(VALIDATOR);
    expect(v.verifySnapshot(baseline).manifest.administrative.reports).toEqual([reviews, build]);

    writeFileSync(join(dir, reviews), "# Reviews: x\n\n## Result review\n\n### Result round 1\n\nMATCH\n");
    writeFileSync(join(dir, build), "# Build: x\n\n```json\n{\"receipts\": []}\n```\n");
    const after = join(tempDir(), "after");
    const second = run([plan, "--root", dir, "--output", after, "--carry", baseline], dir);
    expect(second.code).toBe(0);
    expect(JSON.parse(second.out).stateDigest).toBe(JSON.parse(first.out).stateDigest);

    writeFileSync(join(dir, "app.py"), "print('changed')\n");
    const inventory = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--baseline", baseline, "--json"], { stdout: "pipe", stderr: "pipe" });
    expect(inventory.exitCode).toBe(0);
    const report = JSON.parse(inventory.stdout.toString());
    expect(report.planDir).toBe(planDir);
    expect(report.changes.map((c: { path: string }) => c.path)).toEqual(["app.py"]);

    const changed = run([plan, "--root", dir, "--output", join(tempDir(), "changed"), "--carry", after], dir);
    expect(changed.code).toBe(0);
    expect(JSON.parse(changed.out).stateDigest).not.toBe(JSON.parse(first.out).stateDigest);
  });
});
