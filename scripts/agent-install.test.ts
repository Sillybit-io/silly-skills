/**
 * Tests for scripts/agent-install.sh.
 *
 * Runs the real script with `sh` against a fresh temp fixture and a fresh
 * temp destination for every test. Nothing is committed to the repository.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "./validate.ts";

const script = join(import.meta.dir, "agent-install.sh");
const roots: string[] = [];

function newDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-install-test-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

type Tool = "claude-code" | "opencode" | "cursor";

const WRAPPER_BODY: Record<Tool, string> = {
  "claude-code": [
    "---",
    "name: plan-review",
    "description: Reviews a plan.",
    "model: opus",
    "effort: max",
    "skills: [plan-review]",
    "---",
    "",
    "Body.",
    "",
  ].join("\n"),
  opencode: [
    "---",
    "description: Reviews a plan.",
    "mode: subagent",
    "model: openai/gpt-6-astra",
    "reasoningEffort: max",
    "---",
    "",
    "Body.",
    "",
  ].join("\n"),
  cursor: [
    "---",
    "name: plan-review",
    "description: Reviews a plan.",
    "model: gpt-6-astra[effort=max]",
    "readonly: false",
    "---",
    "",
    "Body.",
    "",
  ].join("\n"),
};

/** Writes agentsDir/<persona>/<tool>.md for the given tools. */
function writeWrapper(agentsDir: string, persona: string, tools: Tool[]): void {
  const personaDir = join(agentsDir, persona);
  mkdirSync(personaDir, { recursive: true });
  for (const tool of tools) {
    writeFileSync(join(personaDir, `${tool}.md`), WRAPPER_BODY[tool], "utf8");
  }
}

function run(args: string[]): { code: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(["sh", script, ...args]);
  return {
    code: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr),
  };
}

describe("agent-install.sh", () => {
  test("installs the claude-code wrapper unchanged when no overrides are given", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["claude-code"]);

    const result = run([
      "--tool",
      "claude-code",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
    ]);

    expect(result.code).toBe(0);
    const written = readFileSync(join(dest, "plan-review.md"), "utf8");
    expect(written).toContain("model: opus");
    expect(written).toContain("name: plan-review");
  });

  test("installs the opencode wrapper unchanged when no overrides are given", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["opencode"]);

    const result = run([
      "--tool",
      "opencode",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
    ]);

    expect(result.code).toBe(0);
    const written = readFileSync(join(dest, "plan-review.md"), "utf8");
    expect(written).toContain("model: openai/gpt-6-astra");
    expect(written).toContain("reasoningEffort: max");
  });

  test("installs the cursor wrapper unchanged when no overrides are given", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["cursor"]);

    const result = run([
      "--tool",
      "cursor",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
    ]);

    expect(result.code).toBe(0);
    const written = readFileSync(join(dest, "plan-review.md"), "utf8");
    expect(written).toContain("model: gpt-6-astra[effort=max]");
  });

  test("--all writes one file per skill that ships the tool's wrapper, and skips skills that don't", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["opencode"]);
    writeWrapper(skillsDir, "tech-writing", ["opencode"]);
    writeWrapper(skillsDir, "ui-engineering", ["claude-code"]); // no opencode wrapper

    const result = run(["--tool", "opencode", "--all", "--agents-dir", skillsDir, "--dest", dest]);

    expect(result.code).toBe(0);
    expect(readFileSync(join(dest, "plan-review.md"), "utf8")).toContain("model: openai/gpt-6-astra");
    expect(readFileSync(join(dest, "tech-writing.md"), "utf8")).toContain("model: openai/gpt-6-astra");
    expect(() => readFileSync(join(dest, "ui-engineering.md"), "utf8")).toThrow();
  });

  test("--model rewrites the model line for claude-code", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["claude-code"]);

    const result = run([
      "--tool",
      "claude-code",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
      "--model",
      "sonnet",
    ]);

    expect(result.code).toBe(0);
    const written = readFileSync(join(dest, "plan-review.md"), "utf8");
    expect(written).toContain("model: sonnet");
    expect(written).not.toContain("model: opus");
  });

  test("--effort rewrites the effort line for claude-code", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["claude-code"]);

    const result = run([
      "--tool",
      "claude-code",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
      "--effort",
      "high",
    ]);

    expect(result.code).toBe(0);
    expect(readFileSync(join(dest, "plan-review.md"), "utf8")).toContain("effort: high");
  });

  test("--effort on a legacy opencode wrapper becomes the model variant", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["opencode"]);

    const result = run([
      "--tool",
      "opencode",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
      "--effort",
      "low",
    ]);

    expect(result.code).toBe(0);
    const written = readFileSync(join(dest, "plan-review.md"), "utf8");
    expect(written).toContain("model: openai/gpt-6-astra#low");
    expect(written).not.toContain("reasoningEffort");
  });

  test("--model and --effort together rewrite the cursor bracket suffix", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["cursor"]);

    const result = run([
      "--tool",
      "cursor",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
      "--model",
      "claude-opus-5-5",
      "--effort",
      "high",
    ]);

    expect(result.code).toBe(0);
    expect(readFileSync(join(dest, "plan-review.md"), "utf8")).toContain(
      "model: claude-opus-5-5[effort=high]",
    );
  });

  test("--effort alone preserves the cursor model and replaces only the bracket", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["cursor"]);

    const result = run([
      "--tool",
      "cursor",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
      "--effort",
      "high",
    ]);

    expect(result.code).toBe(0);
    expect(readFileSync(join(dest, "plan-review.md"), "utf8")).toContain(
      "model: gpt-6-astra[effort=high]",
    );
  });

  test("a second run without --force exits 1 and does not overwrite", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["opencode"]);
    const args = [
      "--tool",
      "opencode",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
    ];

    expect(run(args).code).toBe(0);
    const second = run(args);

    expect(second.code).toBe(1);
    expect(second.stderr).toContain("already exists");
  });

  test("a second run with --force overwrites", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["opencode"]);
    const base = [
      "--tool",
      "opencode",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
    ];

    expect(run(base).code).toBe(0);
    const second = run([...base, "--model", "openai/gpt-6-sol-fast", "--force"]);

    expect(second.code).toBe(0);
    expect(readFileSync(join(dest, "plan-review.md"), "utf8")).toContain(
      "model: openai/gpt-6-sol-fast",
    );
  });

  test("an unknown tool exits 1", () => {
    const skillsDir = newDir();
    const dest = newDir();

    const result = run([
      "--tool",
      "bogus",
      "--agent",
      "plan-review",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown tool");
  });

  test("an unknown agent exits 1", () => {
    const skillsDir = newDir();
    const dest = newDir();
    writeWrapper(skillsDir, "plan-review", ["opencode"]);

    const result = run([
      "--tool",
      "opencode",
      "--agent",
      "does-not-exist",
      "--agents-dir",
      skillsDir,
      "--dest",
      dest,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no opencode.md found for persona");
  });

  test("--tool with neither --agent nor --all exits 1", () => {
    const result = run(["--tool", "opencode"]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("--agent");
  });

  test("run from the repo root without --agents-dir finds a real persona", () => {
    const dest = newDir();
    const result = run(["--tool", "opencode", "--agent", "plan-reviewer", "--dest", dest]);

    expect(result.code).toBe(0);
    expect(readFileSync(join(dest, "plan-reviewer.md"), "utf8")).toContain("model:");
  });

  test("--dry-run --source prints the raw GitHub URL and does not write", () => {
    const dest = newDir();
    const result = run([
      "--tool",
      "opencode",
      "--agent",
      "plan-writer",
      "--source",
      "https://github.com/Sillybit-io/silly-skills/tree/main",
      "--dest",
      dest,
      "--dry-run",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "https://raw.githubusercontent.com/Sillybit-io/silly-skills/main/agents/plan-writer/opencode.md",
    );
    expect(() => readFileSync(join(dest, "plan-writer.md"), "utf8")).toThrow();
  });

  test("--all --dry-run --source prints the GitHub contents API URL and does not write", () => {
    const dest = newDir();
    const result = run([
      "--tool",
      "opencode",
      "--all",
      "--source",
      "https://github.com/Sillybit-io/silly-skills/tree/feat/branch",
      "--dest",
      dest,
      "--dry-run",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(
      "https://api.github.com/repos/Sillybit-io/silly-skills/contents/agents?ref=feat%2Fbranch",
    );
    expect(() => readFileSync(join(dest, "plan-writer.md"), "utf8")).toThrow();
  });

  test("a repository URL ending in .git is the repository root at main", () => {
    const result = run([
      "--tool",
      "opencode",
      "--agent",
      "plan-writer",
      "--source",
      "https://github.com/Sillybit-io/silly-skills.git",
      "--dry-run",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "https://raw.githubusercontent.com/Sillybit-io/silly-skills/main/agents/plan-writer/opencode.md",
    );
  });

  test("a non-GitHub --source is rejected", () => {
    const result = run([
      "--tool",
      "opencode",
      "--agent",
      "plan-writer",
      "--source",
      "https://example.com/owner/repo",
      "--dry-run",
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("github.com");
  });
});

describe("agent-install.sh model variants and overrides", () => {
  const V2 = [
    "---",
    "description: Reviews a plan.",
    "mode: all",
    "model: openai/gpt-6-astra#high",
    "permissions:",
    "  - action: read",
    "    resource: \"*\"",
    "    effect: allow",
    "---",
    "",
    "Body. model: in prose stays. reasoningEffort: in prose stays.",
    "",
  ].join("\n");
  const LEGACY = WRAPPER_BODY.opencode;
  const NO_EFFORT = V2.replace("model: openai/gpt-6-astra#high", "model: anthropic/claude-haiku-4-5");

  function install(body: string, extra: string[], tool: Tool = "opencode") {
    const agentsDir = newDir();
    const dest = newDir();
    mkdirSync(join(agentsDir, "p"), { recursive: true });
    writeFileSync(join(agentsDir, "p", `${tool}.md`), body, "utf8");
    const result = run(["--tool", tool, "--agent", "p", "--agents-dir", agentsDir, "--dest", dest, ...extra]);
    const path = join(dest, "p.md");
    let text = "";
    try {
      text = readFileSync(path, "utf8");
    } catch {
      // not written
    }
    return { result, text, dest, agentsDir, path };
  }

  function parsed(text: string) {
    const fm = parseFrontmatter(text.split("\n"), { permissionList: true });
    expect(fm.problems).toEqual([]);
    return fm;
  }

  function withoutModelLines(text: string): string {
    return text
      .split("\n")
      .filter((l) => !/^(model|reasoningEffort): /.test(l))
      .join("\n");
  }

  const cases: [string, string, string[], string][] = [
    ["model-only keeps the wrapper's variant", V2, ["--model", "anthropic/claude-sonnet-5"], "anthropic/claude-sonnet-5#high"],
    ["effort-only replaces the variant", V2, ["--effort", "low"], "openai/gpt-6-astra#low"],
    ["a variant inside --model replaces the wrapper's variant", V2, ["--model", "openai/gpt-6-sol#max"], "openai/gpt-6-sol#max"],
    ["explicit --effort beats a variant inside --model", V2, ["--model", "openai/gpt-6-sol#max", "--effort", "medium"], "openai/gpt-6-sol#medium"],
    ["a legacy reasoningEffort line becomes the variant", LEGACY, ["--model", "openai/gpt-6-sol"], "openai/gpt-6-sol#max"],
    ["--effort on a legacy wrapper beats its reasoningEffort", LEGACY, ["--effort", "low"], "openai/gpt-6-astra#low"],
    ["a wrapper with no effort hint gets no variant", NO_EFFORT, ["--model", "anthropic/claude-haiku-4-5"], "anthropic/claude-haiku-4-5"],
  ];

  for (const [name, body, args, expected] of cases) {
    test(`opencode: ${name}`, () => {
      const { result, text } = install(body, args);
      expect(result.code).toBe(0);
      expect(result.stderr).toBe("");
      const fm = parsed(text);
      expect(fm.top.model).toBe(expected);
      expect("reasoningEffort" in fm.top).toBe(false);
      expect(text.match(/^model: /gm)?.length).toBe(1);
      expect(withoutModelLines(text)).toBe(withoutModelLines(body));
      expect(fm.permissions.length).toBe(body.includes("permissions:") ? 1 : 0);
    });
  }

  test("opencode: --effort on a wrapper without a model line fails and writes nothing", () => {
    const { result, text } = install(V2.replace("model: openai/gpt-6-astra#high\n", ""), ["--effort", "low"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("no model line");
    expect(text).toBe("");
  });

  test("no override copies every tool's wrapper byte for byte", () => {
    for (const [tool, body] of [["opencode", V2], ["opencode", LEGACY], ["claude-code", WRAPPER_BODY["claude-code"]], ["cursor", WRAPPER_BODY.cursor]] as [Tool, string][]) {
      const { result, text } = install(body, [], tool);
      expect(result.code).toBe(0);
      expect(text).toBe(body);
    }
  });

  test("claude-code: model and effort values with #, &, and backslashes are written literally", () => {
    const { result, text } = install(WRAPPER_BODY["claude-code"], ["--model", "opus#x&y\\z", "--effort", "a&b"], "claude-code");
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(parsed(text).top.model).toBe("opus#x&y\\z");
    expect(parsed(text).top.effort).toBe("a&b");
    expect(text).toContain("Body.");
  });

  test("claude-code: --effort is inserted after the model line when the wrapper has none", () => {
    const body = WRAPPER_BODY["claude-code"].replace("effort: max\n", "");
    const { result, text } = install(body, ["--effort", "high"], "claude-code");
    expect(result.code).toBe(0);
    expect(text).toContain("model: opus\neffort: high\n");
  });

  test("cursor: a model: line in the body is not rewritten", () => {
    const body = `${WRAPPER_BODY.cursor}model: not frontmatter\n`;
    const { result, text } = install(body, ["--model", "claude-sonnet-5"], "cursor");
    expect(result.code).toBe(0);
    expect(text).toContain("model: claude-sonnet-5[effort=max]");
    expect(text).toContain("model: not frontmatter");
  });

  test("a rerun without --force refuses and leaves the installed bytes unchanged", () => {
    const first = install(V2, ["--effort", "low"]);
    const before = readFileSync(first.path);
    const again = run(["--tool", "opencode", "--agent", "p", "--agents-dir", first.agentsDir, "--dest", first.dest, "--effort", "max"]);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain("already exists");
    expect(readFileSync(first.path)).toEqual(before);
  });
});
