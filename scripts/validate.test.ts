/**
 * Tests for scripts/validate.ts.
 *
 * Every fixture is generated at test run time inside a fresh temp directory and
 * removed afterwards. Nothing is committed to the repository.
 *
 * Secret-shaped fixture strings are assembled from fragments on purpose, so this
 * test file never itself trips the FORBIDDEN_CONTENT scanner when the validator
 * walks the real working tree.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FOOTER, validate } from "./validate.ts";

const roots: string[] = [];

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "silly-skills-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

type ExamplesMode =
  | "valid"
  | "missing"
  | "empty"
  | "whitespace"
  | "missing-section"
  | "out-of-order"
  | "fenced-sections";

type Overrides = {
  name?: string | null;
  description?: string | null;
  license?: string | null;
  version?: string | null;
  category?: string | null;
  footer?: "valid" | "missing" | "wrong";
  examples?: ExamplesMode;
};

function sectionsBody(sections: string[]): string {
  return sections
    .flatMap((section) => [`## ${section}`, "", `Worked content for ${section}.`, ""])
    .join("\n");
}

function examplesFileFor(mode: Exclude<ExamplesMode, "missing">): string {
  switch (mode) {
    case "valid":
      return sectionsBody(["Prompt", "Without skill", "With skill"]);
    case "empty":
      return "";
    case "whitespace":
      return "   \n\n\t\n";
    case "missing-section":
      return sectionsBody(["Prompt", "Without skill"]);
    case "out-of-order":
      return sectionsBody(["Prompt", "With skill", "Without skill"]);
    case "fenced-sections":
      return [
        "## Prompt",
        "",
        "The two headings below sit inside a fence, so they do not count.",
        "",
        "```markdown",
        "## Without skill",
        "",
        "## With skill",
        "```",
        "",
      ].join("\n");
  }
}

/**
 * Writes skills/<category>/<dirName>/SKILL.md plus its companion examples.md,
 * both valid unless overridden.
 */
function writeSkill(
  root: string,
  category: string,
  dirName: string,
  overrides: Overrides = {},
): string {
  const rel = `skills/${category}/${dirName}/SKILL.md`;
  mkdirSync(join(root, "skills", category, dirName), { recursive: true });

  const name = overrides.name === undefined ? dirName : overrides.name;
  const description =
    overrides.description === undefined
      ? "Explains something useful. Use when the user says 'run the example'."
      : overrides.description;
  const license = overrides.license === undefined ? "CC-BY-ND-4.0" : overrides.license;
  const version = overrides.version === undefined ? "0.1.0" : overrides.version;
  const categoryValue = overrides.category === undefined ? category : overrides.category;

  const lines: string[] = ["---"];
  if (name !== null) lines.push(`name: ${name}`);
  if (description !== null) lines.push(`description: ${description}`);
  if (license !== null) lines.push(`license: ${license}`);
  if (version !== null || categoryValue !== null) {
    lines.push("metadata:");
    if (version !== null) lines.push(`  version: "${version}"`);
    if (categoryValue !== null) lines.push(`  category: ${categoryValue}`);
  }
  lines.push("---", "", "## Purpose", "", "Do one thing well.", "");

  const footerMode = overrides.footer ?? "valid";
  if (footerMode === "valid") {
    lines.push(FOOTER, "");
  } else if (footerMode === "wrong") {
    lines.push(FOOTER.replace(/\.$/, ""), "");
  }

  writeFileSync(join(root, rel), lines.join("\n"), "utf8");

  const examplesMode = overrides.examples ?? "valid";
  if (examplesMode !== "missing") {
    writeFileSync(
      join(root, "skills", category, dirName, "examples.md"),
      examplesFileFor(examplesMode),
      "utf8",
    );
  }

  return rel;
}

function codes(findings: { code: string }[]): string[] {
  return findings.map((finding) => finding.code);
}

describe("validate", () => {
  test("a fully valid single skill passes with 0 errors", () => {
    const root = newRoot();
    writeSkill(root, "review", "pr-description");

    const result = validate(root);

    expect(result.errors).toEqual([]);
    expect(result.skillCount).toBe(1);
    expect(result.skillNames).toEqual(["pr-description"]);
  });

  test("frontmatter name that differs from the directory name fails with NAME_MISMATCH", () => {
    const root = newRoot();
    writeSkill(root, "review", "pr-description", { name: "wrong-name" });

    const result = validate(root);

    expect(codes(result.errors)).toContain("NAME_MISMATCH");
    const finding = result.errors.find((error) => error.code === "NAME_MISMATCH");
    expect(finding?.file).toBe("skills/review/pr-description/SKILL.md");
    expect(finding?.message).toContain("wrong-name");
    expect(finding?.line).toBeGreaterThan(0);
  });

  test("a name containing 'claude' fails with RESERVED_NAME", () => {
    const root = newRoot();
    writeSkill(root, "review", "claude-helper");

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "RESERVED_NAME");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("skills/review/claude-helper/SKILL.md");
    expect(finding?.message).toContain("claude");
    // The name is otherwise well-formed, so only the reserved word can fail it.
    expect(codes(result.errors)).not.toContain("NAME_MISMATCH");
  });

  test("a name containing 'anthropic' fails with RESERVED_NAME", () => {
    const root = newRoot();
    writeSkill(root, "workflow", "anthropic-tools");

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "RESERVED_NAME");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("skills/workflow/anthropic-tools/SKILL.md");
    expect(finding?.message).toContain("anthropic");
    expect(codes(result.errors)).not.toContain("NAME_MISMATCH");
  });

  test("a missing description field fails with FRONTMATTER", () => {
    const root = newRoot();
    writeSkill(root, "docs", "doc-cleanup", { description: null });

    const result = validate(root);

    const finding = result.errors.find(
      (error) => error.code === "FRONTMATTER" && error.message.includes("description"),
    );
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("skills/docs/doc-cleanup/SKILL.md");
  });

  test("a missing footer fails with FOOTER", () => {
    const root = newRoot();
    writeSkill(root, "workflow", "skill-writer", { footer: "missing" });

    const result = validate(root);

    expect(codes(result.errors)).toContain("FOOTER");
  });

  test("a present but wrong footer fails with FOOTER, proving exact string matching", () => {
    const root = newRoot();
    writeSkill(root, "workflow", "skill-writer", { footer: "wrong" });

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "FOOTER");
    expect(finding).toBeDefined();
    // The wrong footer is the correct footer minus its trailing period, so a
    // substring or prefix check would have passed here.
    expect(FOOTER.startsWith(FOOTER.replace(/\.$/, ""))).toBe(true);
  });

  test("a skill with no examples.md at all fails with MISSING_EXAMPLES", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review", { examples: "missing" });

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "MISSING_EXAMPLES");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("skills/review/ai-review/examples.md");
    expect(finding?.line).toBe(1);
  });

  test("a zero-byte examples.md fails with MISSING_EXAMPLES", () => {
    const root = newRoot();
    writeSkill(root, "docs", "doc-cleanup", { examples: "empty" });

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "MISSING_EXAMPLES");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("skills/docs/doc-cleanup/examples.md");
    expect(finding?.message).toContain("blank");
  });

  test("a whitespace-only examples.md fails with MISSING_EXAMPLES", () => {
    const root = newRoot();
    writeSkill(root, "workflow", "skill-writer", { examples: "whitespace" });

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "MISSING_EXAMPLES");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("skills/workflow/skill-writer/examples.md");
    expect(finding?.message).toContain("blank");
  });

  test("a real examples.md with all three sections in order passes with no MISSING_EXAMPLES", () => {
    const root = newRoot();
    writeSkill(root, "ai-health", "ai-audit", { examples: "valid" });

    const result = validate(root);

    expect(codes(result.errors)).not.toContain("MISSING_EXAMPLES");
    expect(result.errors).toEqual([]);
  });

  test("an examples.md missing one of the three required sections fails with MISSING_EXAMPLES", () => {
    const root = newRoot();
    writeSkill(root, "review", "pr-description", { examples: "missing-section" });

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "MISSING_EXAMPLES");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("skills/review/pr-description/examples.md");
    expect(finding?.message).toContain("three required sections");
  });

  test("an examples.md whose three sections are out of order fails with MISSING_EXAMPLES", () => {
    const root = newRoot();
    writeSkill(root, "review", "pr-description", { examples: "out-of-order" });

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "MISSING_EXAMPLES");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("in order");
  });

  test("required sections inside a fenced code block do not satisfy MISSING_EXAMPLES", () => {
    const root = newRoot();
    writeSkill(root, "docs", "doc-cleanup", { examples: "fenced-sections" });

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "MISSING_EXAMPLES");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("three required sections");
  });

  test("other headings around and between the three required sections are allowed", () => {
    const root = newRoot();
    writeSkill(root, "ai-health", "ai-audit");
    writeFileSync(
      join(root, "skills", "ai-health", "ai-audit", "examples.md"),
      sectionsBody([
        "Scenario: a real diff",
        "Prompt",
        "Setup",
        "Without skill",
        "Notes",
        "With skill",
        "Credits",
      ]),
      "utf8",
    );

    const result = validate(root);

    expect(codes(result.errors)).not.toContain("MISSING_EXAMPLES");
  });

  test("a non-SemVer metadata.version fails with VERSION", () => {
    const root = newRoot();
    writeSkill(root, "ai-health", "ai-audit", { version: "not-semver" });

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "VERSION");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("not-semver");
  });

  test("the same name in two categories fails with DUPLICATE_NAME for both skills", () => {
    const root = newRoot();
    writeSkill(root, "review", "shared-name");
    writeSkill(root, "docs", "shared-name", { category: "docs" });

    const result = validate(root);

    const duplicates = result.errors.filter((error) => error.code === "DUPLICATE_NAME");
    expect(duplicates).toHaveLength(2);
    expect(duplicates.map((finding) => finding.file).sort()).toEqual([
      "skills/docs/shared-name/SKILL.md",
      "skills/review/shared-name/SKILL.md",
    ]);
  });

  test("a planted fake GitHub token anywhere in the tree fails with FORBIDDEN_CONTENT", () => {
    const root = newRoot();
    writeSkill(root, "workflow", "secret-and-privacy-sweep");
    const fakeToken = `ghp_${"x".repeat(36)}`;
    mkdirSync(join(root, "notes"), { recursive: true });
    writeFileSync(join(root, "notes", "scratch.md"), `token: ${fakeToken}\n`, "utf8");

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "FORBIDDEN_CONTENT");
    expect(finding).toBeDefined();
    expect(finding?.file).toBe("notes/scratch.md");
    expect(finding?.line).toBe(1);
  });

  test("a SKILL.md at the wrong depth fails with LAYOUT and is not counted", () => {
    const root = newRoot();
    mkdirSync(join(root, "skills", "ai-health"), { recursive: true });
    writeFileSync(
      join(root, "skills", "ai-health", "SKILL.md"),
      ["---", "name: ai-audit", "---", "", FOOTER, ""].join("\n"),
      "utf8",
    );

    const result = validate(root);

    expect(codes(result.errors)).toContain("LAYOUT");
    expect(result.skillCount).toBe(0);
  });

  test("BADGE_COUNT is skipped as a warning while no skills exist", () => {
    const root = newRoot();
    writeFileSync(
      join(root, "README.md"),
      "![skills](https://img.shields.io/badge/skills-0-blue)\n",
      "utf8",
    );

    const result = validate(root);

    expect(result.errors).toEqual([]);
    expect(codes(result.warnings)).toContain("BADGE_COUNT");
  });

  test("a badge whose count matches the discovered skills passes with 0 errors", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");
    writeFileSync(
      join(root, "README.md"),
      "![skills](https://img.shields.io/badge/skills-1-blue)\n",
      "utf8",
    );

    const result = validate(root);

    expect(result.errors).toEqual([]);
    expect(codes(result.warnings)).not.toContain("BADGE_COUNT");
  });

  test("the skill-count badge appearing more than once fails with BADGE_COUNT", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");
    // Both occurrences report the correct count, so only the exactly-once rule
    // can catch this.
    writeFileSync(
      join(root, "README.md"),
      [
        "# silly-skills",
        "",
        "![skills](https://img.shields.io/badge/skills-1-blue)",
        "",
        "Some prose.",
        "",
        "![skills](https://img.shields.io/badge/skills-1-blue)",
        "",
      ].join("\n"),
      "utf8",
    );

    const result = validate(root);

    const badgeErrors = result.errors.filter((error) => error.code === "BADGE_COUNT");
    expect(badgeErrors).toHaveLength(2);
    expect(badgeErrors.map((finding) => finding.line)).toEqual([3, 7]);
    for (const finding of badgeErrors) {
      expect(finding.file).toBe("README.md");
      expect(finding.message).toContain("exactly once");
    }
  });

  test("a badge count that disagrees with the discovered skills fails with BADGE_COUNT", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");
    writeFileSync(
      join(root, "README.md"),
      "![skills](https://img.shields.io/badge/skills-9-blue)\n",
      "utf8",
    );

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "BADGE_COUNT");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("badge reports 9 skills but 1 skills were discovered");
  });

  test("a missing skill-count badge fails with BADGE_COUNT once skills exist", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");
    writeFileSync(join(root, "README.md"), "# silly-skills\n\nNo badge here.\n", "utf8");

    const result = validate(root);

    const finding = result.errors.find((error) => error.code === "BADGE_COUNT");
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("missing the canonical skill-count badge");
  });

  test("gitignored files are not scanned for forbidden content", () => {
    const root = newRoot();
    writeFileSync(join(root, ".gitignore"), "ignored/\n", "utf8");
    mkdirSync(join(root, "ignored"), { recursive: true });
    writeFileSync(
      join(root, "ignored", "secret.md"),
      `token: ghp_${"x".repeat(36)}\n`,
      "utf8",
    );

    const result = validate(root);

    expect(codes(result.errors)).not.toContain("FORBIDDEN_CONTENT");
  });
});

describe("the real repository", () => {
  test("every shipped skill has an examples.md with the three required sections", () => {
    const result = validate(join(import.meta.dir, ".."));

    expect(result.skillCount).toBeGreaterThan(0);
    expect(result.errors.filter((error) => error.code === "MISSING_EXAMPLES")).toEqual([]);
  });
});

describe("validate CLI", () => {
  const script = join(import.meta.dir, "validate.ts");

  test("exits 0 and prints the skill count on a clean tree", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review");

    const proc = Bun.spawnSync(["bun", script, root]);
    const stdout = new TextDecoder().decode(proc.stdout);

    expect(stdout).toContain("1 skills validated, 0 errors");
    expect(proc.exitCode).toBe(0);
  });

  test("exits 1 and prints ERROR[NAME_MISMATCH] on a bad tree", () => {
    const root = newRoot();
    writeSkill(root, "review", "ai-review", { name: "wrong-name" });

    const proc = Bun.spawnSync(["bun", script, root]);
    const stdout = new TextDecoder().decode(proc.stdout);

    expect(stdout).toContain("ERROR[NAME_MISMATCH]");
    expect(proc.exitCode).toBe(1);
  });
});
