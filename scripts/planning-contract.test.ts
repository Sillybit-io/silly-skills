/**
 * Per-package authoring check for the planning skills and create-agent.
 *
 *   PLANNING_SKILLS=plan-writer,plan-review bun test scripts/planning-contract.test.ts --test-name-pattern 'package structure'
 *
 * Each selected skill is copied with its persona into a disposable catalogue
 * whose README badge matches that catalogue, and the real validator runs
 * there. A package can pass before the repository's shared README badge and
 * skill-count test are updated, without hiding a real catalogue failure: the
 * full `bun run validate` still checks those.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CATEGORIES, FOOTER, validate } from "./validate.ts";

const repo = join(import.meta.dir, "..");
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

function locate(name: string): { category: string; dir: string } | null {
  for (const category of CATEGORIES) {
    const dir = join(repo, "skills", category, name);
    if (existsSync(join(dir, "SKILL.md"))) return { category, dir };
  }
  return null;
}

function defaultSelection(): string[] {
  const planning = readdirSync(join(repo, "skills/planning")).filter((n) => existsSync(join(repo, "skills/planning", n, "SKILL.md")));
  return [...planning.sort(), "create-agent"];
}

const selected = (process.env.PLANNING_SKILLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const skills = selected.length > 0 ? selected : defaultSelection();

function personasFor(skill: string): string[] {
  const agents = join(repo, "agents");
  return readdirSync(agents).filter((p) => {
    const sidecar = join(agents, p, "skill");
    return existsSync(sidecar) && readFileSync(sidecar, "utf8").trim() === skill;
  });
}

function sections(body: string): string[] {
  const out: string[] = [];
  let fence = "";
  for (const line of body.split("\n")) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line);
    if (f) {
      if (!fence) fence = f[1];
      else if (f[1][0] === fence[0] && f[1].length >= fence.length) fence = "";
      continue;
    }
    if (!fence && /^## /.test(line)) out.push(line.slice(3).trim());
  }
  return out;
}

describe("planning packages", () => {
  for (const skill of skills) {
    test(`${skill}: package structure passes the real validator in a disposable catalogue`, () => {
      const found = locate(skill);
      expect({ skill, found: found !== null }).toEqual({ skill, found: true });
      if (!found) return;
      const root = mkdtempSync(join(tmpdir(), "planning-contract-"));
      dirs.push(root);
      mkdirSync(join(root, "skills", found.category), { recursive: true });
      cpSync(found.dir, join(root, "skills", found.category, skill), { recursive: true });
      const personas = personasFor(skill);
      for (const persona of personas) cpSync(join(repo, "agents", persona), join(root, "agents", persona), { recursive: true });
      writeFileSync(join(root, "README.md"), "# Catalogue\n\n![Skills: 1](https://img.shields.io/badge/skills-1-blue)\n");

      const result = validate(root);
      expect(result.errors).toEqual([]);
      expect(result.skillCount).toBe(1);

      const text = readFileSync(join(found.dir, "SKILL.md"), "utf8");
      const end = text.indexOf("\n---", 3);
      const frontmatter = text.slice(0, end);
      const body = text.slice(end + 4);
      const description = /^description: (.*)$/m.exec(frontmatter)?.[1] ?? "";
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThan(700);
      expect(body.split("\n").length).toBeLessThan(500);
      expect(sections(body)).toEqual(["Purpose", "When to use / when NOT to use", "Workflow", "Output format", "Guardrails", "QA checklist"]);
      expect(text.trimEnd().split("\n").at(-1)).toBe(FOOTER);
      const examples = sections(readFileSync(join(found.dir, "examples.md"), "utf8"));
      expect(examples.slice(0, 3)).toEqual(["Prompt", "Without skill", "With skill"]);
      if (/suggested-model:/.test(frontmatter)) expect(personas.length).toBe(1);
      for (const link of body.matchAll(/\]\((references\/[^)]+)\)/g)) {
        expect({ link: link[1], exists: existsSync(join(found.dir, link[1])) }).toEqual({ link: link[1], exists: true });
      }
    });
  }
});
