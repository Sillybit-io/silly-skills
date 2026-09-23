#!/usr/bin/env bun
/**
 * silly-skills repository validator.
 *
 * Zero runtime dependencies. Runs on Bun and uses only built-ins: Bun's
 * Node-compatible `node:fs` / `node:path` for traversal and reading, plus a
 * hand-rolled frontmatter parser (no YAML or markdown package).
 *
 * Usage:
 *   bun scripts/validate.ts [rootDir]    # rootDir defaults to process.cwd()
 *
 * Every failure prints exactly one line:
 *   ERROR[<CODE>] <file>:<line> <message>
 * Warnings use the same shape with the WARNING prefix and never change the exit
 * code. The run always ends with the summary line:
 *   <N> skills validated, <M> errors
 * Exit code is 0 when there are no errors, 1 otherwise.
 *
 * ── Error codes ──────────────────────────────────────────────────────────────
 *   LAYOUT              A SKILL.md under skills/ is not at exactly
 *                       skills/<category>/<skill-name>/SKILL.md, or its category
 *                       directory is not review | ai-health | docs | workflow.
 *   FRONTMATTER         Frontmatter is missing or malformed: no `---` on line 1,
 *                       no closing `---`, an unparsable line, a duplicate key, a
 *                       missing required key (`name`, `description`, `license`,
 *                       or the `metadata:` mapping), or `license` is not
 *                       CC-BY-ND-4.0.
 *   NAME_MISMATCH       `name` is not 1-64 chars, does not match
 *                       ^[a-z0-9]+(-[a-z0-9]+)*$, or is not exactly the skill
 *                       directory name. One code deliberately covers all three
 *                       `name` failures so callers can grep a single code.
 *   RESERVED_NAME       `name` contains a reserved word — `anthropic` or
 *                       `claude` — as a case-insensitive substring. Reported
 *                       separately from NAME_MISMATCH because the name is
 *                       otherwise well-formed; only the word is disallowed.
 *   DESCRIPTION_LENGTH  `description` is not 1-1024 characters.
 *   VERSION             `metadata.version` is missing or is not valid SemVer.
 *   CATEGORY            `metadata.category` is missing or is not exactly the
 *                       parent category directory name.
 *   FOOTER              The last non-empty line of the file is not exactly the
 *                       required attribution footer. This is a full-string
 *                       comparison, not a substring or prefix check.
 *   MISSING_EXAMPLES    A skill directory has no examples.md beside its
 *                       SKILL.md, that examples.md is blank — zero bytes or
 *                       nothing but whitespace — or it does not carry the three
 *                       required top-level sections `## Prompt`,
 *                       `## Without skill` and `## With skill` in that order.
 *                       Headings inside fenced code blocks do not count. Other
 *                       headings may appear around or between the three. Every
 *                       skill ships worked examples.
 *   FORBIDDEN_CONTENT   A secret-shaped string, a non-example email address, or
 *                       an absolute local filesystem path was found in a
 *                       non-gitignored text file anywhere in the working tree.
 *                       Untracked-but-not-ignored files are scanned too.
 *   BADGE_COUNT         README.md's canonical skill-count badge is missing,
 *                       appears more than once, or reports a number other than
 *                       the discovered skill count.
 *   DUPLICATE_NAME      Two or more skills declare the same frontmatter `name`.
 *
 * ── Warning codes ────────────────────────────────────────────────────────────
 *   BADGE_COUNT         Skipped because the repository has 0 skills or has no
 *                       README.md yet. The hard check activates once skills exist.
 *   INTERNAL_REFERENCE  An internal-host or localhost reference outside a fenced
 *                       code block. Reported, never fatal.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const CATEGORIES = ["review", "ai-health", "docs", "workflow"] as const;

export const FOOTER =
  "© Sillybit — https://github.com/Sillybit-io/silly-skills — CC BY-ND 4.0. Attribution required; do not republish modified versions without written approval.";

export const LICENSE_ID = "CC-BY-ND-4.0";

export const REQUIRED_EXAMPLE_SECTIONS_IN_ORDER = [
  "Prompt",
  "Without skill",
  "With skill",
] as const;

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const RESERVED_NAME_WORDS = ["anthropic", "claude"] as const;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const BADGE_SOURCE = "https://img\\.shields\\.io/badge/skills-(\\d+)-blue";

/**
 * Secret / privacy patterns. Every pattern is written with character classes so
 * that this source file never matches itself — the scanner covers the whole
 * working tree, including scripts/.
 */
const FORBIDDEN_PATTERNS: { label: string; source: string }[] = [
  { label: "PEM key marker", source: "[-]{5}BEGIN" },
  { label: "AWS access key id", source: "AKIA[0-9A-Z]{16}" },
  { label: "GitHub token", source: "ghp_[A-Za-z0-9]{36}" },
  { label: "Slack token", source: "xox[bap]-" },
  { label: "API-key-shaped secret", source: "sk-[A-Za-z0-9]{20,}" },
  { label: "absolute local path", source: "\\/Users\\/" },
  { label: "absolute Windows path", source: "C:[\\\\]" },
];

const WARN_PATTERNS: { label: string; source: string }[] = [
  { label: "internal hostname", source: "[.]internal[.]" },
  { label: "localhost reference", source: "localhost[:]" },
];

const EMAIL_SOURCE =
  "[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\\.[A-Za-z]{2,}";

const MAX_SCAN_BYTES = 1024 * 1024;

export type Finding = {
  code: string;
  file: string;
  line: number;
  message: string;
};

export type Result = {
  skillCount: number;
  skillNames: string[];
  errors: Finding[];
  warnings: Finding[];
};

/* ── .gitignore handling ───────────────────────────────────────────────────── */

type IgnoreRule = {
  base: string;
  negate: boolean;
  dirOnly: boolean;
  anchored: boolean;
  re: RegExp;
};

function compileIgnorePattern(base: string, pattern: string): IgnoreRule | null {
  let p = pattern.trim();
  if (p === "" || p.startsWith("#")) return null;

  let negate = false;
  if (p.startsWith("!")) {
    negate = true;
    p = p.slice(1);
  }

  let dirOnly = false;
  if (p.endsWith("/")) {
    dirOnly = true;
    p = p.slice(0, -1);
  }
  if (p === "") return null;

  let anchored = false;
  if (p.startsWith("/")) {
    anchored = true;
    p = p.slice(1);
  } else if (p.includes("/")) {
    anchored = true;
  }

  let src = "";
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === "*") {
      if (p[i + 1] === "*") {
        src += ".*";
        i++;
      } else {
        src += "[^/]*";
      }
    } else if (ch === "?") {
      src += "[^/]";
    } else {
      src += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }

  return { base, negate, dirOnly, anchored, re: new RegExp(`^${src}$`) };
}

function ignoreMatches(rule: IgnoreRule, relPath: string): boolean {
  let target = relPath;
  if (rule.base !== "") {
    if (!target.startsWith(`${rule.base}/`)) return false;
    target = target.slice(rule.base.length + 1);
  }
  if (rule.anchored) return rule.re.test(target);

  const segments = target.split("/");
  for (let i = 0; i < segments.length; i++) {
    if (rule.re.test(segments.slice(i).join("/"))) return true;
  }
  return false;
}

function isIgnored(relPath: string, isDir: boolean, rules: IgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (ignoreMatches(rule, relPath)) ignored = !rule.negate;
  }
  return ignored;
}

/* ── filesystem helpers ────────────────────────────────────────────────────── */

/** All non-ignored files under `root`, repo-relative, posix separators, sorted. */
export function listFiles(root: string): string[] {
  const out: string[] = [];

  const walkDir = (relDir: string, rules: IgnoreRule[]): void => {
    const abs = relDir === "" ? root : join(root, relDir);
    let entries;
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }

    let localRules = rules;
    if (entries.some((e) => e.isFile() && e.name === ".gitignore")) {
      const text = readTextFile(join(abs, ".gitignore"));
      if (text !== null) {
        const added: IgnoreRule[] = [];
        for (const line of text.split(/\r?\n/)) {
          const rule = compileIgnorePattern(relDir, line);
          if (rule) added.push(rule);
        }
        localRules = rules.concat(added);
      }
    }

    for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".git") continue;
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      const isDir = entry.isDirectory();
      if (isIgnored(rel, isDir, localRules)) continue;
      if (isDir) walkDir(rel, localRules);
      else if (entry.isFile()) out.push(rel);
    }
  };

  walkDir("", []);
  return out.sort();
}

/** Reads a file as UTF-8 text. Returns null for missing, oversized, or binary files. */
function readTextFile(abs: string): string | null {
  try {
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size > MAX_SCAN_BYTES) return null;
    const buf = readFileSync(abs);
    if (buf.subarray(0, 8192).includes(0)) return null;
    return buf.toString("utf8");
  } catch {
    return null;
  }
}

/* ── frontmatter ───────────────────────────────────────────────────────────── */

type Frontmatter = {
  ok: boolean;
  top: Record<string, string>;
  nested: Record<string, Record<string, string>>;
  lineOf: Record<string, number>;
  problems: { line: number; message: string }[];
};

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Parses the fixed frontmatter shape used by this repository: `---`, a block of
 * `key: value` pairs plus one level of nested mapping (`metadata:` with indented
 * sub-keys), then a closing `---`.
 */
export function parseFrontmatter(lines: string[]): Frontmatter {
  const top: Record<string, string> = {};
  const nested: Record<string, Record<string, string>> = {};
  const lineOf: Record<string, number> = {};
  const problems: { line: number; message: string }[] = [];

  if (lines.length === 0 || lines[0].trimEnd() !== "---") {
    problems.push({ line: 1, message: "file must start with '---' on line 1" });
    return { ok: false, top, nested, lineOf, problems };
  }

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trimEnd() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) {
    problems.push({
      line: Math.max(lines.length, 1),
      message: "frontmatter has no closing '---'",
    });
    return { ok: false, top, nested, lineOf, problems };
  }

  let currentMap: string | null = null;
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = raw.length - raw.trimStart().length;
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(trimmed);
    if (!match) {
      problems.push({ line: i + 1, message: `cannot parse frontmatter line: ${trimmed}` });
      continue;
    }

    const key = match[1];
    const value = match[2].trim();

    if (indent === 0) {
      currentMap = null;
      if (key in top || key in nested) {
        problems.push({ line: i + 1, message: `duplicate frontmatter key '${key}'` });
        continue;
      }
      if (value === "") {
        nested[key] = {};
        lineOf[key] = i + 1;
        currentMap = key;
      } else {
        top[key] = unquote(value);
        lineOf[key] = i + 1;
      }
    } else {
      if (currentMap === null) {
        problems.push({
          line: i + 1,
          message: `indented key '${key}' has no parent mapping`,
        });
        continue;
      }
      if (key in nested[currentMap]) {
        problems.push({
          line: i + 1,
          message: `duplicate frontmatter key '${currentMap}.${key}'`,
        });
        continue;
      }
      nested[currentMap][key] = unquote(value);
      lineOf[`${currentMap}.${key}`] = i + 1;
    }
  }

  return { ok: problems.length === 0, top, nested, lineOf, problems };
}

/* ── content scanning ──────────────────────────────────────────────────────── */

function emailIsAllowed(address: string): boolean {
  const domain = address.slice(address.lastIndexOf("@") + 1).toLowerCase();
  if (domain === "example.com" || domain.endsWith(".example.com")) return true;
  if (domain.startsWith("noreply.") || domain.includes(".noreply.")) return true;
  return false;
}

function scanForbiddenContent(
  root: string,
  files: string[],
  errors: Finding[],
  warnings: Finding[],
): void {
  const emailRe = new RegExp(EMAIL_SOURCE, "g");

  for (const rel of files) {
    const text = readTextFile(join(root, rel));
    if (text === null) continue;

    const lines = text.split(/\r?\n/);
    let inFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNo = i + 1;

      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }

      for (const pattern of FORBIDDEN_PATTERNS) {
        const re = new RegExp(pattern.source);
        const hit = re.exec(line);
        if (hit) {
          errors.push({
            code: "FORBIDDEN_CONTENT",
            file: rel,
            line: lineNo,
            message: `${pattern.label} detected (matched '${hit[0]}')`,
          });
        }
      }

      for (const hit of line.matchAll(emailRe)) {
        if (emailIsAllowed(hit[0])) continue;
        errors.push({
          code: "FORBIDDEN_CONTENT",
          file: rel,
          line: lineNo,
          message: `email address '${hit[0]}' is not an example.com or noreply address`,
        });
      }

      if (inFence) continue;
      for (const pattern of WARN_PATTERNS) {
        const re = new RegExp(pattern.source);
        const hit = re.exec(line);
        if (hit) {
          warnings.push({
            code: "INTERNAL_REFERENCE",
            file: rel,
            line: lineNo,
            message: `${pattern.label} outside a fenced code block (matched '${hit[0]}')`,
          });
        }
      }
    }
  }
}

function checkBadgeCount(
  root: string,
  skillCount: number,
  errors: Finding[],
  warnings: Finding[],
): void {
  const readme = readTextFile(join(root, "README.md"));

  if (readme === null) {
    warnings.push({
      code: "BADGE_COUNT",
      file: "README.md",
      line: 0,
      message: "skipped: no README.md found at the repository root",
    });
    return;
  }

  if (skillCount === 0) {
    warnings.push({
      code: "BADGE_COUNT",
      file: "README.md",
      line: 0,
      message:
        "skipped: 0 skills discovered, so the README skill-count badge is not asserted yet",
    });
    return;
  }

  const lines = readme.split(/\r?\n/);
  const hits: { line: number; count: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    for (const hit of lines[i].matchAll(new RegExp(BADGE_SOURCE, "g"))) {
      hits.push({ line: i + 1, count: Number(hit[1]) });
    }
  }

  if (hits.length === 0) {
    errors.push({
      code: "BADGE_COUNT",
      file: "README.md",
      line: 1,
      message: `missing the canonical skill-count badge https://img.shields.io/badge/skills-${skillCount}-blue`,
    });
    return;
  }
  if (hits.length > 1) {
    for (const hit of hits) {
      errors.push({
        code: "BADGE_COUNT",
        file: "README.md",
        line: hit.line,
        message: `the skill-count badge must appear exactly once, found ${hits.length} occurrences`,
      });
    }
    return;
  }
  if (hits[0].count !== skillCount) {
    errors.push({
      code: "BADGE_COUNT",
      file: "README.md",
      line: hits[0].line,
      message: `badge reports ${hits[0].count} skills but ${skillCount} skills were discovered`,
    });
  }
}

/* ── skill validation ──────────────────────────────────────────────────────── */

function topLevelHeadingsOutsideFences(text: string): string[] {
  const headings: string[] = [];
  let openFenceChar = "";
  let openFenceLength = 0;

  for (const line of text.split(/\r?\n/)) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      const char = fence[1][0];
      const length = fence[1].length;
      if (openFenceLength === 0) {
        openFenceChar = char;
        openFenceLength = length;
      } else if (char === openFenceChar && length >= openFenceLength) {
        // CommonMark: only a same-character run at least as long as the opener
        // closes a fence, so a ```` block may quote ``` lines without ending.
        openFenceLength = 0;
      }
      continue;
    }
    if (openFenceLength > 0) continue;

    const heading = /^##[ \t]+(.+?)[ \t]*$/.exec(line);
    if (heading) headings.push(heading[1]);
  }

  return headings;
}

function hasRequiredExampleSections(text: string): boolean {
  let matched = 0;
  for (const heading of topLevelHeadingsOutsideFences(text)) {
    if (heading === REQUIRED_EXAMPLE_SECTIONS_IN_ORDER[matched]) matched++;
    if (matched === REQUIRED_EXAMPLE_SECTIONS_IN_ORDER.length) return true;
  }
  return false;
}

function validateSkill(
  root: string,
  rel: string,
  category: string,
  dirName: string,
  errors: Finding[],
): string | null {
  // examples.md: checked before the SKILL.md body so that a skill whose
  // SKILL.md is unreadable still reports its missing companion file.
  const examplesRel = `skills/${category}/${dirName}/examples.md`;
  const examples = readTextFile(join(root, examplesRel));
  if (examples === null) {
    errors.push({
      code: "MISSING_EXAMPLES",
      file: examplesRel,
      line: 1,
      message: "examples.md is missing, unreadable, or not UTF-8 text",
    });
  } else if (examples.trim() === "") {
    errors.push({
      code: "MISSING_EXAMPLES",
      file: examplesRel,
      line: 1,
      message: "examples.md is blank, so the skill ships no worked examples",
    });
  } else if (!hasRequiredExampleSections(examples)) {
    errors.push({
      code: "MISSING_EXAMPLES",
      file: examplesRel,
      line: 1,
      message: `examples.md does not contain the three required sections (${REQUIRED_EXAMPLE_SECTIONS_IN_ORDER.join(", ")}) in order`,
    });
  }

  const text = readTextFile(join(root, rel));
  if (text === null) {
    errors.push({
      code: "FRONTMATTER",
      file: rel,
      line: 1,
      message: "file is unreadable, empty, or not UTF-8 text",
    });
    return null;
  }

  const lines = text.split(/\r?\n/);
  const fm = parseFrontmatter(lines);
  for (const problem of fm.problems) {
    errors.push({
      code: "FRONTMATTER",
      file: rel,
      line: problem.line,
      message: problem.message,
    });
  }

  // name
  let name: string | null = null;
  if (!("name" in fm.top)) {
    if (fm.problems.length === 0) {
      errors.push({
        code: "FRONTMATTER",
        file: rel,
        line: 1,
        message: "missing required frontmatter key 'name'",
      });
    }
  } else {
    name = fm.top.name;
    const line = fm.lineOf.name ?? 1;
    if (name.length < 1 || name.length > 64) {
      errors.push({
        code: "NAME_MISMATCH",
        file: rel,
        line,
        message: `name must be 1-64 characters, got ${name.length}`,
      });
    } else if (!NAME_RE.test(name)) {
      errors.push({
        code: "NAME_MISMATCH",
        file: rel,
        line,
        message: `name '${name}' must match ^[a-z0-9]+(-[a-z0-9]+)*$`,
      });
    }
    if (name !== dirName) {
      errors.push({
        code: "NAME_MISMATCH",
        file: rel,
        line,
        message: `name '${name}' does not match its directory name '${dirName}'`,
      });
    }
    const lowerName = name.toLowerCase();
    for (const word of RESERVED_NAME_WORDS) {
      if (!lowerName.includes(word)) continue;
      errors.push({
        code: "RESERVED_NAME",
        file: rel,
        line,
        message: `name '${name}' contains the reserved word '${word}'`,
      });
    }
  }

  // description
  if (!("description" in fm.top)) {
    if (fm.problems.length === 0) {
      errors.push({
        code: "FRONTMATTER",
        file: rel,
        line: 1,
        message: "missing required frontmatter key 'description'",
      });
    }
  } else {
    const description = fm.top.description;
    if (description.length < 1 || description.length > 1024) {
      errors.push({
        code: "DESCRIPTION_LENGTH",
        file: rel,
        line: fm.lineOf.description ?? 1,
        message: `description must be 1-1024 characters, got ${description.length}`,
      });
    }
  }

  // license
  if (!("license" in fm.top)) {
    if (fm.problems.length === 0) {
      errors.push({
        code: "FRONTMATTER",
        file: rel,
        line: 1,
        message: `missing required frontmatter key 'license' (expected ${LICENSE_ID})`,
      });
    }
  } else if (fm.top.license !== LICENSE_ID) {
    errors.push({
      code: "FRONTMATTER",
      file: rel,
      line: fm.lineOf.license ?? 1,
      message: `license must be exactly ${LICENSE_ID}, got '${fm.top.license}'`,
    });
  }

  // metadata.version / metadata.category
  if (!("metadata" in fm.nested)) {
    if (fm.problems.length === 0) {
      errors.push({
        code: "FRONTMATTER",
        file: rel,
        line: 1,
        message: "missing required frontmatter mapping 'metadata'",
      });
    }
  } else {
    const metadata = fm.nested.metadata;
    const metadataLine = fm.lineOf.metadata ?? 1;

    if (!("version" in metadata)) {
      errors.push({
        code: "VERSION",
        file: rel,
        line: metadataLine,
        message: "missing required key 'metadata.version'",
      });
    } else if (!SEMVER_RE.test(metadata.version)) {
      errors.push({
        code: "VERSION",
        file: rel,
        line: fm.lineOf["metadata.version"] ?? metadataLine,
        message: `metadata.version '${metadata.version}' is not a valid SemVer string`,
      });
    }

    if (!("category" in metadata)) {
      errors.push({
        code: "CATEGORY",
        file: rel,
        line: metadataLine,
        message: `missing required key 'metadata.category' (expected '${category}')`,
      });
    } else if (metadata.category !== category) {
      errors.push({
        code: "CATEGORY",
        file: rel,
        line: fm.lineOf["metadata.category"] ?? metadataLine,
        message: `metadata.category '${metadata.category}' does not match its category directory '${category}'`,
      });
    }
  }

  // footer: exact full-string match on the last non-empty line
  let lastIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== "") {
      lastIndex = i;
      break;
    }
  }
  if (lastIndex === -1) {
    errors.push({
      code: "FOOTER",
      file: rel,
      line: 1,
      message: "file has no content, so the attribution footer is missing",
    });
  } else if (lines[lastIndex].trimEnd() !== FOOTER) {
    errors.push({
      code: "FOOTER",
      file: rel,
      line: lastIndex + 1,
      message: `last non-empty line must be exactly the attribution footer, got '${lines[lastIndex].trimEnd()}'`,
    });
  }

  return name;
}

/* ── entry point ───────────────────────────────────────────────────────────── */

export function validate(root: string): Result {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const files = listFiles(root);

  const skillFiles = files.filter(
    (file) => file.startsWith("skills/") && file.endsWith("/SKILL.md"),
  );

  const byName = new Map<string, { file: string; line: number }[]>();
  const skillNames: string[] = [];
  let skillCount = 0;

  for (const rel of skillFiles) {
    const parts = rel.split("/");
    if (parts.length !== 4 || !(CATEGORIES as readonly string[]).includes(parts[1])) {
      errors.push({
        code: "LAYOUT",
        file: rel,
        line: 1,
        message: `SKILL.md must be at skills/<category>/<skill-name>/SKILL.md with category one of ${CATEGORIES.join(" | ")}`,
      });
      continue;
    }

    skillCount++;
    const before = errors.length;
    const name = validateSkill(root, rel, parts[1], parts[2], errors);
    if (name !== null) {
      skillNames.push(name);
      const nameLine =
        errors.slice(before).find((e) => e.code === "NAME_MISMATCH")?.line ?? 2;
      const list = byName.get(name) ?? [];
      list.push({ file: rel, line: nameLine });
      byName.set(name, list);
    }
  }

  for (const [name, occurrences] of byName) {
    if (occurrences.length < 2) continue;
    for (const occurrence of occurrences) {
      errors.push({
        code: "DUPLICATE_NAME",
        file: occurrence.file,
        line: occurrence.line,
        message: `skill name '${name}' is declared ${occurrences.length} times: ${occurrences
          .map((o) => o.file)
          .join(", ")}`,
      });
    }
  }

  scanForbiddenContent(root, files, errors, warnings);
  checkBadgeCount(root, skillCount, errors, warnings);

  const order = (a: Finding, b: Finding): number =>
    a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code);
  errors.sort(order);
  warnings.sort(order);

  return { skillCount, skillNames: skillNames.sort(), errors, warnings };
}

function format(prefix: string, finding: Finding): string {
  return `${prefix}[${finding.code}] ${finding.file}:${finding.line} ${finding.message}`;
}

if (import.meta.main) {
  const root = process.argv[2] ?? process.cwd();
  const result = validate(root);

  for (const warning of result.warnings) console.log(format("WARNING", warning));
  for (const error of result.errors) console.log(format("ERROR", error));

  console.log(`${result.skillCount} skills validated, ${result.errors.length} errors`);
  if (result.warnings.length > 0) {
    console.log(`${result.warnings.length} warnings (warnings do not fail the run)`);
  }

  process.exit(result.errors.length > 0 ? 1 : 0);
}
