/**
 * Tests for scripts/bump-skill-version.ts.
 *
 * Every fixture is generated at test run time inside a fresh temp directory and
 * removed afterwards, following scripts/validate.test.ts. No SKILL.md in this
 * repository is ever read or written by these tests.
 *
 * The default fixture deliberately carries a second `version:` line inside its
 * body, quoting the frontmatter contract the way skills/workflow/skill-writer
 * really does. A bumper that searched the file for `version:` instead of using
 * parseFrontmatter's line map would rewrite that decoy, so several tests assert
 * it survives untouched.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BumpError,
  bumpSkillVersion,
  changelogStub,
  findSkillFile,
  nextVersion,
} from "./bump-skill-version.ts";
import { FOOTER } from "./validate.ts";

const roots: string[] = [];

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "silly-skills-bump-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

type Overrides = {
  version?: string | null;
  /** Quote style around the version value. */
  quote?: '"' | "'" | "";
  /** Drop the whole `metadata:` mapping. */
  metadata?: boolean;
  /** Write a duplicate top-level key so parseFrontmatter reports a problem. */
  duplicateKey?: boolean;
  /** Omit the opening `---`, so there is no frontmatter at all. */
  openingFence?: boolean;
  /** Include the body block that also contains a `version:` line. */
  decoy?: boolean;
  lineEnding?: "\n" | "\r\n";
};

/** Writes skills/<category>/<dirName>/SKILL.md, valid unless overridden. */
function writeSkill(
  root: string,
  category: string,
  dirName: string,
  overrides: Overrides = {},
): string {
  const rel = `skills/${category}/${dirName}/SKILL.md`;
  mkdirSync(join(root, "skills", category, dirName), { recursive: true });

  const version = overrides.version === undefined ? "0.1.0" : overrides.version;
  const quote = overrides.quote === undefined ? '"' : overrides.quote;
  const decoy = overrides.decoy ?? true;

  const lines: string[] = [];
  if (overrides.openingFence !== false) lines.push("---");
  lines.push(`name: ${dirName}`);
  lines.push(
    "description: Explains something useful. Use when the user says 'run the example'.",
  );
  if (overrides.duplicateKey === true) lines.push(`name: ${dirName}`);
  lines.push("license: CC-BY-ND-4.0");
  if (overrides.metadata !== false) {
    lines.push("metadata:");
    if (version !== null) lines.push(`  version: ${quote}${version}${quote}`);
    lines.push(`  category: ${category}`);
  }
  lines.push("---", "", "## Purpose", "", "Do one thing well.", "");

  if (decoy) {
    lines.push(
      "## Output format",
      "",
      "Every skill opens with this frontmatter:",
      "",
      "```yaml",
      "---",
      "name: your-skill",
      "license: CC-BY-ND-4.0",
      "metadata:",
      '  version: "9.9.9"',
      "  category: workflow",
      "---",
      "```",
      "",
    );
  }

  lines.push(FOOTER, "");

  writeFileSync(join(root, rel), lines.join(overrides.lineEnding ?? "\n"), "utf8");
  return rel;
}

/** Runs the real CLI the way a user would. */
function runCli(root: string, args: string[]) {
  const script = join(import.meta.dir, "bump-skill-version.ts");
  const proc = Bun.spawnSync(["bun", script, ...args, root]);
  const decoder = new TextDecoder();
  return {
    exitCode: proc.exitCode,
    stdout: decoder.decode(proc.stdout),
    stderr: decoder.decode(proc.stderr),
  };
}

describe("nextVersion", () => {
  test("patch increments the third number only", () => {
    expect(nextVersion("0.1.0", "patch")).toBe("0.1.1");
    expect(nextVersion("1.2.3", "patch")).toBe("1.2.4");
    expect(nextVersion("2.9.9", "patch")).toBe("2.9.10");
  });

  test("minor increments the second number and resets the patch", () => {
    expect(nextVersion("0.1.0", "minor")).toBe("0.2.0");
    expect(nextVersion("1.2.3", "minor")).toBe("1.3.0");
    expect(nextVersion("2.9.9", "minor")).toBe("2.10.0");
  });

  test("major increments the first number and resets the rest", () => {
    expect(nextVersion("0.1.0", "major")).toBe("1.0.0");
    expect(nextVersion("1.2.3", "major")).toBe("2.0.0");
    expect(nextVersion("2.9.9", "major")).toBe("3.0.0");
  });

  test("a pre-release or build-metadata version is rejected, not guessed at", () => {
    expect(() => nextVersion("1.2.3-rc.1", "patch")).toThrow(BumpError);
    expect(() => nextVersion("1.2.3+build.5", "minor")).toThrow(/plain x\.y\.z/);
    expect(() => nextVersion("not-semver", "major")).toThrow(/plain x\.y\.z/);
  });
});

describe("findSkillFile", () => {
  test("finds a skill in any of the four category directories", () => {
    const root = newRoot();
    writeSkill(root, "ai-health", "ai-audit");

    expect(findSkillFile(root, "ai-audit")).toBe("skills/ai-health/ai-audit/SKILL.md");
  });

  test("an unknown skill name throws a BumpError naming the searched categories", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");

    expect(() => findSkillFile(root, "does-not-exist")).toThrow(BumpError);
    expect(() => findSkillFile(root, "does-not-exist")).toThrow(
      /no skill named 'does-not-exist' found/,
    );
  });

  test("the same skill name in two categories throws instead of picking one", () => {
    const root = newRoot();
    writeSkill(root, "review", "shared-name");
    writeSkill(root, "docs", "shared-name");

    expect(() => findSkillFile(root, "shared-name")).toThrow(/matches 2 files/);
  });
});

describe("bumpSkillVersion", () => {
  test("a patch bump rewrites metadata.version and reports both versions", () => {
    const root = newRoot();
    const rel = writeSkill(root, "review", "ai-review");

    const result = bumpSkillVersion(root, "ai-review", "patch");

    expect(result.oldVersion).toBe("0.1.0");
    expect(result.newVersion).toBe("0.1.1");
    expect(result.file).toBe(rel);
    expect(result.line).toBe(6);
    expect(readFileSync(join(root, rel), "utf8")).toContain('  version: "0.1.1"');
  });

  test("a minor bump resets the patch number in the file", () => {
    const root = newRoot();
    const rel = writeSkill(root, "docs", "doc-cleanup", { version: "1.2.3" });

    const result = bumpSkillVersion(root, "doc-cleanup", "minor");

    expect(result.newVersion).toBe("1.3.0");
    expect(readFileSync(join(root, rel), "utf8")).toContain('  version: "1.3.0"');
  });

  test("a major bump resets the minor and patch numbers in the file", () => {
    const root = newRoot();
    const rel = writeSkill(root, "workflow", "skill-writer", { version: "1.2.3" });

    const result = bumpSkillVersion(root, "skill-writer", "major");

    expect(result.newVersion).toBe("2.0.0");
    expect(readFileSync(join(root, rel), "utf8")).toContain('  version: "2.0.0"');
  });

  test("only the metadata.version line changes; every other byte survives", () => {
    const root = newRoot();
    const rel = writeSkill(root, "workflow", "skill-writer");
    const abs = join(root, rel);
    const before = readFileSync(abs);

    const result = bumpSkillVersion(root, "skill-writer", "patch");

    const after = readFileSync(abs);
    const beforeLines = before.toString("utf8").split("\n");
    const afterLines = after.toString("utf8").split("\n");

    expect(afterLines).toHaveLength(beforeLines.length);
    for (let i = 0; i < beforeLines.length; i++) {
      if (i === result.line - 1) continue;
      expect(`${i}:${afterLines[i]}`).toBe(`${i}:${beforeLines[i]}`);
    }

    // Byte-level proof: putting the one changed line back reproduces the
    // original file exactly, line endings and trailing newline included.
    const restored = Buffer.from(
      afterLines
        .map((line, i) => (i === result.line - 1 ? beforeLines[i] : line))
        .join("\n"),
      "utf8",
    );
    expect(restored.equals(before)).toBe(true);
  });

  test("a second `version:` line in the body is left alone", () => {
    const root = newRoot();
    const rel = writeSkill(root, "workflow", "skill-writer");

    bumpSkillVersion(root, "skill-writer", "major");

    const text = readFileSync(join(root, rel), "utf8");
    expect(text).toContain('  version: "1.0.0"');
    expect(text).toContain('  version: "9.9.9"');
    // The decoy is the only other version line, so exactly two remain.
    expect(text.match(/^[ \t]*version:/gm)).toHaveLength(2);
  });

  test("indentation and quote style are preserved", () => {
    const root = newRoot();
    const rel = writeSkill(root, "review", "pr-description", { quote: "" });

    bumpSkillVersion(root, "pr-description", "patch");

    const lines = readFileSync(join(root, rel), "utf8").split("\n");
    expect(lines[5]).toBe("  version: 0.1.1");
  });

  test("a CRLF file round-trips without its line endings being normalised", () => {
    const root = newRoot();
    const rel = writeSkill(root, "review", "review-response", { lineEnding: "\r\n" });
    const abs = join(root, rel);

    bumpSkillVersion(root, "review-response", "patch");

    const after = readFileSync(abs, "utf8");
    expect(after).toContain('  version: "0.1.1"\r\n');
    expect(after.includes("\n\n")).toBe(false);
  });

  test("unparseable frontmatter throws a BumpError instead of crashing", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review", { duplicateKey: true });

    expect(() => bumpSkillVersion(root, "ai-review", "patch")).toThrow(BumpError);
    expect(() => bumpSkillVersion(root, "ai-review", "patch")).toThrow(
      /cannot parse the frontmatter/,
    );
  });

  test("a file with no frontmatter at all throws a BumpError", () => {
    const root = newRoot();
    writeSkill(root, "docs", "doc-cleanup", { openingFence: false });

    expect(() => bumpSkillVersion(root, "doc-cleanup", "patch")).toThrow(
      /cannot parse the frontmatter/,
    );
  });

  test("frontmatter without a metadata mapping throws a BumpError", () => {
    const root = newRoot();
    writeSkill(root, "docs", "doc-cleanup", { metadata: false });

    expect(() => bumpSkillVersion(root, "doc-cleanup", "patch")).toThrow(
      /no 'metadata\.version' key/,
    );
  });

  test("the file is not modified when the bump fails", () => {
    const root = newRoot();
    const rel = writeSkill(root, "review", "ai-review", { version: "1.2.3-rc.1" });
    const abs = join(root, rel);
    const before = readFileSync(abs);

    expect(() => bumpSkillVersion(root, "ai-review", "patch")).toThrow(/plain x\.y\.z/);

    expect(readFileSync(abs).equals(before)).toBe(true);
  });
});

describe("changelogStub", () => {
  test("renders a ready-to-paste bullet naming the skill and its new version", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");

    const stub = changelogStub(bumpSkillVersion(root, "ai-review", "minor"));

    expect(stub).toBe("- `ai-review` 0.2.0 — <describe the change>.");
  });
});

describe("bump-skill-version CLI", () => {
  test("exits 0 and prints the old version, new version, and CHANGELOG stub", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");

    const run = runCli(root, ["ai-review", "patch"]);

    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("skills/review/ai-review/SKILL.md:6");
    expect(run.stdout).toContain("0.1.0 -> 0.1.1");
    expect(run.stdout).toContain("- `ai-review` 0.1.1 — <describe the change>.");
  });

  test("an unknown skill name exits 1 with a clear message and no stack trace", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");

    const run = runCli(root, ["does-not-exist", "patch"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("error: no skill named 'does-not-exist' found");
    expect(run.stderr).toContain("Usage: bun scripts/bump-skill-version.ts");
    expect(run.stderr).not.toMatch(/^\s+at /m);
    expect(run.stderr).not.toContain("BumpError");
  });

  test("an invalid bump type exits 1 with a clear message and no stack trace", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");

    const run = runCli(root, ["ai-review", "sideways"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain(
      "error: invalid bump type 'sideways'; expected one of patch, minor, major",
    );
    expect(run.stderr).not.toMatch(/^\s+at /m);
  });

  test("an invalid bump type leaves the file untouched", () => {
    const root = newRoot();
    const rel = writeSkill(root, "review", "ai-review");
    const before = readFileSync(join(root, rel));

    runCli(root, ["ai-review", "sideways"]);

    expect(readFileSync(join(root, rel)).equals(before)).toBe(true);
  });

  test("unparseable frontmatter exits 1 cleanly rather than crashing", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review", { duplicateKey: true });

    const run = runCli(root, ["ai-review", "patch"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("error: cannot parse the frontmatter");
    expect(run.stderr).toMatch(/duplicate frontmatter key 'name'/);
    expect(run.stderr).not.toMatch(/^\s+at /m);
  });

  test("a missing bump type exits 1 and prints the usage line", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");

    const script = join(import.meta.dir, "bump-skill-version.ts");
    const proc = Bun.spawnSync(["bun", script, "ai-review"]);
    const stderr = new TextDecoder().decode(proc.stderr);

    expect(proc.exitCode).toBe(1);
    expect(stderr).toContain("error: expected a skill name and a bump type");
    expect(stderr).toContain("Usage: bun scripts/bump-skill-version.ts");
  });
});
