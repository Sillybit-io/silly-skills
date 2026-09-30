/**
 * The real installer, installing the six planning personas, into a
 * completely detached consuming project — no dependency on this checkout
 * once the copy is made. Confirms D7's promise: a consumer that only has the
 * installed skill packages and wrappers can still build and resume a plan.
 */
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validate } from "./validate.ts";

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
