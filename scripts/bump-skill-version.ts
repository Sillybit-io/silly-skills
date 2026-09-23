#!/usr/bin/env bun
/**
 * silly-skills per-skill version bumper.
 *
 * Zero runtime dependencies. Runs on Bun and uses only built-ins plus this
 * repository's own validator: frontmatter is parsed by `parseFrontmatter()`
 * from ./validate.ts and never re-implemented here, and the list of category
 * directories to search comes from the same module's `CATEGORIES`.
 *
 * Usage:
 *   bun scripts/bump-skill-version.ts <skill-name> <patch|minor|major> [rootDir]
 *
 * `rootDir` defaults to process.cwd(), mirroring scripts/validate.ts's optional
 * root argument. It exists so the test suite can drive the real CLI against a
 * temporary fixture tree.
 *
 * The script rewrites exactly one line: the `version:` line inside `metadata:`
 * of skills/<category>/<skill-name>/SKILL.md. It locates that line through
 * parseFrontmatter's `lineOf["metadata.version"]`, never by searching the file
 * for `version:` — several skills document the frontmatter contract inside
 * their own body, so a text search finds the wrong line. Indentation, quote
 * style, line endings, key order, and every other byte are left untouched.
 *
 * It never touches git: no add, no commit, no tag, no push. It never edits
 * `name` or `metadata.category`. Committing, tagging and releasing are
 * separate manual steps.
 *
 * Exit code is 0 on a successful bump and 1 on any error. Errors print a
 * single `error: <message>` line followed by the usage line — never a stack
 * trace.
 */

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORIES, parseFrontmatter } from "./validate.ts";

export const BUMP_TYPES = ["patch", "minor", "major"] as const;

export type BumpType = (typeof BUMP_TYPES)[number];

/**
 * Plain `x.y.z` only, with capture groups for the arithmetic.
 *
 * validate.ts's SEMVER_RE is deliberately not reused here: it is not exported,
 * and it also accepts pre-release and build metadata (`1.2.3-rc.1+build`). There
 * is no single correct way to increment such a version, so this script rejects
 * one with a clear message instead of guessing. Every version shipped by this
 * repository is plain `x.y.z`.
 */
const PLAIN_SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export const USAGE =
  "Usage: bun scripts/bump-skill-version.ts <skill-name> <patch|minor|major> [rootDir]";

/** An expected, reportable failure. Carries a message meant for the user. */
export class BumpError extends Error {}

export type BumpResult = {
  /** Repository-relative path of the rewritten file. */
  file: string;
  skillName: string;
  bump: BumpType;
  oldVersion: string;
  newVersion: string;
  /** 1-based number of the single line that was rewritten. */
  line: number;
};

export function isBumpType(value: string): value is BumpType {
  return (BUMP_TYPES as readonly string[]).includes(value);
}

/** Computes the next version. Throws BumpError if `current` is not plain x.y.z. */
export function nextVersion(current: string, bump: BumpType): string {
  const parts = PLAIN_SEMVER_RE.exec(current);
  if (parts === null) {
    throw new BumpError(
      `metadata.version '${current}' is not a plain x.y.z version, so it cannot be bumped automatically; edit it by hand`,
    );
  }

  const major = Number(parts[1]);
  const minor = Number(parts[2]);
  const patch = Number(parts[3]);

  switch (bump) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
  }
}

function isFile(abs: string): boolean {
  try {
    return statSync(abs).isFile();
  } catch {
    return false;
  }
}

/**
 * Finds skills/<category>/<skillName>/SKILL.md across the 4 category
 * directories. Throws BumpError on zero matches, and on more than one — which
 * validate.ts's DUPLICATE_NAME check should already prevent, but is handled
 * here rather than silently picking the first.
 */
export function findSkillFile(root: string, skillName: string): string {
  const matches = CATEGORIES.map(
    (category) => `skills/${category}/${skillName}/SKILL.md`,
  ).filter((rel) => isFile(join(root, rel)));

  if (matches.length === 0) {
    throw new BumpError(
      `no skill named '${skillName}' found; looked for skills/<category>/${skillName}/SKILL.md under ${CATEGORIES.join(", ")}`,
    );
  }
  if (matches.length > 1) {
    throw new BumpError(
      `skill name '${skillName}' matches ${matches.length} files (${matches.join(", ")}); resolve the duplicate before bumping`,
    );
  }

  return matches[0];
}

/**
 * Bumps one skill's metadata.version in place and returns what changed.
 *
 * Lines are split on "\n" and rejoined with "\n" so that a CRLF file round-trips
 * byte for byte; only the substring holding the old version is replaced, which
 * preserves the line's indentation, quoting and any trailing whitespace.
 */
export function bumpSkillVersion(
  root: string,
  skillName: string,
  bump: BumpType,
): BumpResult {
  const rel = findSkillFile(root, skillName);
  const abs = join(root, rel);

  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    throw new BumpError(`cannot read ${rel}`);
  }

  const lines = text.split("\n");
  const fm = parseFrontmatter(lines);

  if (!fm.ok) {
    const first = fm.problems[0];
    throw new BumpError(
      `cannot parse the frontmatter of ${rel}: ${first.message} (line ${first.line})`,
    );
  }

  const oldVersion = fm.nested.metadata?.version;
  const line = fm.lineOf["metadata.version"];
  if (oldVersion === undefined || line === undefined) {
    throw new BumpError(`${rel} has no 'metadata.version' key in its frontmatter`);
  }

  const newVersion = nextVersion(oldVersion, bump);

  const raw = lines[line - 1];
  if (!/^\s*version:/.test(raw)) {
    throw new BumpError(
      `expected a 'version:' key at ${rel}:${line} but found '${raw.trim()}'`,
    );
  }

  const at = raw.indexOf(oldVersion);
  if (at === -1) {
    throw new BumpError(`cannot locate version '${oldVersion}' on ${rel}:${line}`);
  }

  lines[line - 1] =
    raw.slice(0, at) + newVersion + raw.slice(at + oldVersion.length);

  writeFileSync(abs, lines.join("\n"), "utf8");

  return { file: rel, skillName, bump, oldVersion, newVersion, line };
}

/** The ready-to-paste CHANGELOG bullet for a completed bump. */
export function changelogStub(result: BumpResult): string {
  return `- \`${result.skillName}\` ${result.newVersion} — <describe the change>.`;
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  try {
    if (args.length < 2) {
      throw new BumpError("expected a skill name and a bump type");
    }
    if (args.length > 3) {
      throw new BumpError(`unexpected extra arguments: ${args.slice(3).join(" ")}`);
    }

    const [skillName, bump, rootArg] = args;
    if (!isBumpType(bump)) {
      throw new BumpError(
        `invalid bump type '${bump}'; expected one of ${BUMP_TYPES.join(", ")}`,
      );
    }

    const result = bumpSkillVersion(rootArg ?? process.cwd(), skillName, bump);

    console.log(
      `${result.file}:${result.line}  ${result.skillName}  ${result.oldVersion} -> ${result.newVersion}  (${result.bump})`,
    );
    console.log("");
    console.log("Paste under [Unreleased] in CHANGELOG.md and fill in the description:");
    console.log("");
    console.log(changelogStub(result));

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    console.error(USAGE);
    process.exit(1);
  }
}
