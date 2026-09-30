/**
 * The real installer, installing the six planning personas, into a
 * completely detached consuming project — no dependency on this checkout
 * once the copy is made. Confirms D7's promise: a consumer that only has the
 * installed skill packages and wrappers can still build and resume a plan.
 */
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validate } from "./validate.ts";
import { buildCase } from "./fixtures/planning/harness.ts";

setDefaultTimeout(60_000);

const repo = join(import.meta.dir, "..");
const INSTALLER = join(repo, "scripts/agent-install.sh");
const PERSONAS = ["plan-writer", "plan-reviewer", "plan-scout", "plan-builder", "plan-loop", "plan-result-reviewer"] as const;
const TOOLS = ["claude-code", "opencode", "cursor"] as const;
// The installer's --dest form writes one file per persona, named for the
// persona, not the tool: agent-install.sh --tool cursor --dest <dir> writes
// <dir>/<persona>.md, matching what each tool's own default directory
// (.claude/agents/, .opencode/agents/, .cursor/agents/) expects.
const SOURCE_FILE = { "claude-code": "claude-code.md", opencode: "opencode.md", cursor: "cursor.md" } as const;

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "planning-install-"));
  dirs.push(d);
  return d;
}

function sh(cmd: string, args: string[], cwd: string): { code: number; out: string } {
  const p = Bun.spawnSync([cmd, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
}

/** Copies only what a consumer would get: the skill packages a persona needs,
 * and its installed wrapper — nothing else from this checkout. */
function detachedInstall(dest: string, tool: (typeof TOOLS)[number], personas: readonly string[]): void {
  const skillsDir = join(dest, "skills", "planning");
  mkdirSync(skillsDir, { recursive: true });
  const skillOf: Record<string, string> = {
    "plan-writer": "plan-writer",
    "plan-reviewer": "plan-review",
    "plan-scout": "plan-scout",
    "plan-builder": "plan-builder",
    "plan-loop": "plan-loop",
    "plan-result-reviewer": "plan-result-review",
  };
  const needed = new Set<string>();
  for (const p of personas) needed.add(skillOf[p]);
  // D7's explicit dependency graph: builder/loop/result-review need
  // plan-review's validator; loop also needs plan-writer; builder needs
  // plan-result-review.
  if (needed.has("plan-builder")) {
    needed.add("plan-review");
    needed.add("plan-result-review");
  }
  if (needed.has("plan-loop")) {
    needed.add("plan-review");
    needed.add("plan-writer");
  }
  if (needed.has("plan-result-review")) needed.add("plan-review");
  for (const skill of needed) {
    if (!existsSync(join(skillsDir, skill))) cpSync(join(repo, "skills/planning", skill), join(skillsDir, skill), { recursive: true });
  }
  const agentsDir = join(dest, "agents_install");
  mkdirSync(agentsDir, { recursive: true });
  const r = sh("sh", [INSTALLER, "--tool", tool, "--agent", personas.join(","), "--dest", agentsDir], repo);
  expect({ tool, personas, exit: r.code, out: r.out }).toEqual({ tool, personas, exit: 0, out: r.out });
}

describe("planning-install: detached installation, one persona per tool", () => {
  for (const tool of TOOLS) {
    for (const persona of PERSONAS) {
      test(`${persona} installs for ${tool} into a fresh, detached destination`, () => {
        const dest = tempDir();
        detachedInstall(dest, tool, [persona]);
        const installed = join(dest, "agents_install", `${persona}.md`);
        expect(existsSync(installed)).toBe(true);
        const original = readFileSync(join(repo, "agents", persona, SOURCE_FILE[tool]));
        expect(readFileSync(installed).equals(original)).toBe(true);
      });
    }
  }

  test("a second install without --force preserves the existing file", () => {
    const dest = tempDir();
    detachedInstall(dest, "claude-code", ["plan-builder"]);
    const installed = join(dest, "agents_install", "plan-builder.md");
    writeFileSync(installed, "tampered\n");
    const r = sh("sh", [INSTALLER, "--tool", "claude-code", "--agent", "plan-builder", "--dest", join(dest, "agents_install")], repo);
    expect(r.code).not.toBe(0);
    expect(readFileSync(installed, "utf8")).toBe("tampered\n");
  });
});

describe("planning-install: the copied builder helper and the copied validator work together, detached", () => {
  test("captures a fixture and validates its resume record using only the installed copies", () => {
    const dest = tempDir();
    detachedInstall(dest, "claude-code", ["plan-builder"]);
    const { root, plan } = buildCase("dirty-disjoint", join(tempDir(), "project"));
    const installedCapture = join(dest, "skills/planning/plan-builder/scripts/capture-build-state.ts");
    const installedValidator = join(dest, "skills/planning/plan-review/scripts/validate-plan.ts");
    expect(existsSync(installedCapture)).toBe(true);
    expect(existsSync(installedValidator)).toBe(true);

    const v = require(installedValidator);
    const planAbs = join(root, plan);
    const planText = readFileSync(planAbs, "utf8");
    const specDigest = v.canonicalSpecDigest(planText);

    const rev = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
    const cap = sh("bun", [installedCapture, plan, "--root", root, "--output", "silly-skills/plan-builds/detached/baseline", "--run-id", "d", "--base-revision", rev, "--approved-spec", specDigest], root);
    expect({ exit: cap.code, out: cap.out }).toEqual({ exit: 0, out: cap.out });
    const baseline = JSON.parse(cap.out);

    const verified = v.verifySnapshot(v.resolveSnapshot(root, baseline.snapshot, true));
    expect(verified.manifestSha256).toBe(baseline.manifestSha256);
    expect(verified.manifest.kind).toBe("silly-skills.build-state");

    // Build the minimal real receipt chain this plan's own T0 needs, using
    // only the installed validator's exported functions, then confirm the
    // installed validator's own --resume logic accepts it.
    const record = {
      schemaVersion: 1,
      runId: "d",
      runDir: "silly-skills/plan-builds/detached",
      repository: { kind: "git", rootCommits: v.gitRepositoryIdentity(root).rootCommits, branch: "main" },
      baseRevision: rev,
      approval: { specDigest, round: 1, verdict: "OKAY", gateRecordDigest: v.sha256(v.canonicalJson(v.latestGateRecord(v.parsePlan(planText)).record)) },
      baseline: { snapshot: baseline.snapshot, manifestSha256: baseline.manifestSha256, stateDigest: baseline.stateDigest },
      skill: { name: "plan-builder", version: "0.1.0", sha256: v.sha256(readFileSync(join(dest, "skills/planning/plan-builder/SKILL.md"))) },
      receipts: [
        {
          seq: 1,
          todo: "T0",
          event: "start",
          state: "active",
          prev: null,
          before: { snapshot: baseline.snapshot, manifestSha256: baseline.manifestSha256, stateDigest: baseline.stateDigest },
          after: null,
          changedPaths: [],
          checks: [],
          prerequisites: [],
          commit: { none: "no commit at this event" },
          note: "",
        },
      ],
    };
    (record.receipts as Record<string, unknown>[]).push({
      seq: 2,
      todo: "T0",
      event: "pass",
      state: "passed",
      prev: v.sha256(v.canonicalJson(record.receipts[0])),
      before: { snapshot: baseline.snapshot, manifestSha256: baseline.manifestSha256, stateDigest: baseline.stateDigest },
      after: { snapshot: baseline.snapshot, manifestSha256: baseline.manifestSha256, stateDigest: baseline.stateDigest },
      changedPaths: [],
      checks: [{ id: "acceptance", command: "test -f docs/plans/2026-09-28-greeter-shout.md", exit: 0, expectedExit: 0, passed: true, observed: "exit 0" }],
      prerequisites: [],
      commit: { none: "no-copy branch" },
      note: "",
    });
    writeFileSync(planAbs, `${planText.trimEnd()}\n\n## Build\n\nSnapshot paths are relative to the Git directory: resolve one with \`git rev-parse --git-path <snapshot>\`.\n\n### Build record\n\n\`\`\`json\n${JSON.stringify(record, null, 2)}\n\`\`\`\n`);

    const result = v.validatePlan(plan, { root, review: true, resume: true, json: true });
    expect(result.errors).toEqual([]);
    expect(result.resumeEligible).toBe(true);
    expect(result.nextTodo).toBe("T1");
  });

  test("removing the installed validator dependency gives an actionable, unavailable-input error, not a crash", () => {
    const dest = tempDir();
    detachedInstall(dest, "claude-code", ["plan-builder"]);
    rmSync(join(dest, "skills/planning/plan-review"), { recursive: true, force: true });
    const { root, plan } = buildCase("dirty-disjoint", join(tempDir(), "project"));
    const installedCapture = join(dest, "skills/planning/plan-builder/scripts/capture-build-state.ts");
    const r = sh("bun", [installedCapture, plan, "--root", root, "--output", "silly-skills/plan-builds/x/a"], root);
    expect(r.code).toBe(2);
    expect(r.out).toContain("plan-review skill is not installed beside this skill");
  });
});

describe("planning-install: catalogue regression check is meaningful", () => {
  test("validate()'s skillCount equals the number of skill directories actually on disk", () => {
    const result = validate(repo);
    const categories = ["ai-health", "docs", "engineering", "planning", "review", "workflow"];
    let onDisk = 0;
    for (const category of categories) {
      const { readdirSync } = require("node:fs") as typeof import("node:fs");
      const dir = join(repo, "skills", category);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (existsSync(join(dir, name, "SKILL.md"))) onDisk++;
      }
    }
    expect(result.skillCount).toBe(onDisk);
    expect(result.skillCount).toBe(18);
  });
});
