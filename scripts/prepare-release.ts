#!/usr/bin/env bun
/**
 * silly-skills release preparer.
 *
 * Zero runtime dependencies. Runs on Bun and uses only built-ins.
 *
 * Usage:
 *   bun scripts/prepare-release.ts <X.Y.Z> [rootDir]
 *
 * `rootDir` defaults to process.cwd(), mirroring scripts/validate.ts and
 * scripts/bump-skill-version.ts. It exists so the test suite can drive the real
 * CLI against a temporary fixture CHANGELOG.md.
 *
 * The script moves everything under `## [Unreleased]` into a new
 * `## [X.Y.Z] - YYYY-MM-DD` section directly below it, leaving `[Unreleased]`
 * empty and ready for the next change. Sections for versions already released
 * are copied through untouched.
 *
 * The moved content is printed to stdout and nothing else is, so the output
 * pipes straight into `gh release create vX.Y.Z --notes-file -`. The one-line
 * summary goes to stderr, where it stays out of that pipe.
 *
 * It never touches git: no add, no commit, no tag, no push. Tagging, pushing
 * and publishing the GitHub Release are separate manual steps.
 *
 * Exit code is 0 on success and 1 on any error. Errors print a single
 * `error: <message>` line followed by the usage line — never a stack trace. The
 * file is only written once every check has passed, so a failed run always
 * leaves CHANGELOG.md byte-identical.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The file this script rewrites, relative to `rootDir`. */
export const CHANGELOG_FILE = "CHANGELOG.md";

/**
 * Plain `x.y.z` only, with capture groups for the tuple comparison.
 *
 * validate.ts's SEMVER_RE is deliberately not reused here: it is not exported,
 * and it also accepts pre-release and build metadata (`1.2.3-rc.1+build`).
 * Ordering those correctly needs the full SemVer precedence rules, which is
 * exactly the complexity this repository decided not to take a dependency for.
 * Every version this repository releases is plain `x.y.z`, so the script
 * rejects anything else with a clear message instead of guessing.
 */
const PLAIN_SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** The heading whose content gets moved. Trailing `\r` is tolerated. */
const UNRELEASED_HEADING_RE = /^## \[Unreleased\]\s*$/;

/** Any top-level changelog section heading, which is where a section ends. */
const SECTION_HEADING_RE = /^## \[/;

/** A section heading for an already-released version. */
const DATED_HEADING_RE = /^## \[(\d+)\.(\d+)\.(\d+)\]/;

export const USAGE = "Usage: bun scripts/prepare-release.ts <X.Y.Z> [rootDir]";

/** An expected, reportable failure. Carries a message meant for the user. */
export class ReleaseError extends Error {}

export type ReleaseResult = {
  /** Repository-relative path of the rewritten file. */
  file: string;
  version: string;
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  /** The new section heading, e.g. `## [0.2.0] - 2026-09-24`. */
  heading: string;
  /** The moved content: what sat under `[Unreleased]`, outer blanks removed. */
  notes: string;
  /** The highest version already in the file, or null on a first release. */
  previousVersion: string | null;
};

/** Parses `x.y.z` into a tuple. Throws ReleaseError on any other shape. */
export function parseVersion(value: string): [number, number, number] {
  const parts = PLAIN_SEMVER_RE.exec(value);
  if (parts === null) {
    throw new ReleaseError(
      `invalid version '${value}'; expected a plain x.y.z version such as 0.2.0`,
    );
  }
  return [Number(parts[1]), Number(parts[2]), Number(parts[3])];
}

/** Negative if a < b, zero if equal, positive if a > b. Compares number by number. */
export function compareVersions(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/**
 * The highest version already released in the file, or null if there are none.
 *
 * Comparison is numeric, not lexicographic, so 0.10.0 correctly outranks 0.9.0.
 * `[Unreleased]` cannot match DATED_HEADING_RE, so it needs no special case.
 */
export function latestReleasedVersion(lines: string[]): string | null {
  let best: [number, number, number] | null = null;
  let bestText: string | null = null;

  for (const line of lines) {
    const parts = DATED_HEADING_RE.exec(line);
    if (parts === null) continue;

    const tuple: [number, number, number] = [
      Number(parts[1]),
      Number(parts[2]),
      Number(parts[3]),
    ];
    if (best === null || compareVersions(tuple, best) > 0) {
      best = tuple;
      bestText = `${tuple[0]}.${tuple[1]}.${tuple[2]}`;
    }
  }

  return bestText;
}

/** Local calendar date as `YYYY-MM-DD`, matching the existing `[0.1.0]` heading. */
export function formatDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

function stripCr(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

/**
 * Moves the `[Unreleased]` content into a new dated section and writes the file.
 *
 * Lines are split on "\n" so a CRLF file keeps its "\r" characters as trailing
 * bytes; the headings and blank lines this function inserts get the same ending
 * as the rest of the file. Sections other than `[Unreleased]` are copied through
 * as-is and never re-serialised, so already-released entries survive byte for
 * byte.
 */
export function prepareRelease(
  root: string,
  version: string,
  now: Date = new Date(),
): ReleaseResult {
  const tuple = parseVersion(version);
  const abs = join(root, CHANGELOG_FILE);

  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    throw new ReleaseError(`cannot read ${CHANGELOG_FILE} in ${root}`);
  }

  const lines = text.split("\n");
  const eol = lines.some((line) => line.endsWith("\r")) ? "\r" : "";

  const headingIndexes = lines
    .map((line, index) => (UNRELEASED_HEADING_RE.test(line) ? index : -1))
    .filter((index) => index !== -1);

  if (headingIndexes.length === 0) {
    throw new ReleaseError(
      `${CHANGELOG_FILE} has no '## [Unreleased]' heading, so there is nothing to move`,
    );
  }
  if (headingIndexes.length > 1) {
    throw new ReleaseError(
      `${CHANGELOG_FILE} has ${headingIndexes.length} '## [Unreleased]' headings (lines ${headingIndexes
        .map((index) => index + 1)
        .join(", ")}); resolve the duplicate before releasing`,
    );
  }

  const headingIndex = headingIndexes[0];

  let end = headingIndex + 1;
  while (end < lines.length && !SECTION_HEADING_RE.test(lines[end])) end++;

  const captured = lines.slice(headingIndex + 1, end);

  let first = 0;
  while (first < captured.length && isBlank(captured[first])) first++;
  let last = captured.length;
  while (last > first && isBlank(captured[last - 1])) last--;
  const content = captured.slice(first, last);

  if (content.length === 0) {
    throw new ReleaseError(
      `nothing to release: the [Unreleased] section of ${CHANGELOG_FILE} is empty; add your changes under it first`,
    );
  }

  const previousVersion = latestReleasedVersion(lines);
  if (
    previousVersion !== null &&
    compareVersions(tuple, parseVersion(previousVersion)) <= 0
  ) {
    throw new ReleaseError(
      `version ${version} is not greater than ${previousVersion}, which ${CHANGELOG_FILE} already records; pick a higher version`,
    );
  }

  const date = formatDate(now);
  const heading = `## [${version}] - ${date}`;

  const rewritten = [
    ...lines.slice(0, headingIndex + 1),
    eol,
    heading + eol,
    eol,
    ...content,
    eol,
    ...lines.slice(end),
  ];

  writeFileSync(abs, rewritten.join("\n"), "utf8");

  return {
    file: CHANGELOG_FILE,
    version,
    date,
    heading,
    notes: content.map(stripCr).join("\n"),
    previousVersion,
  };
}

if (import.meta.main) {
  const args = process.argv.slice(2);

  try {
    if (args.length < 1) {
      throw new ReleaseError("expected a version to release");
    }
    if (args.length > 2) {
      throw new ReleaseError(`unexpected extra arguments: ${args.slice(2).join(" ")}`);
    }

    const [version, rootArg] = args;
    const result = prepareRelease(rootArg ?? process.cwd(), version);

    // stdout carries the release notes and nothing else, so the whole run can be
    // piped into `gh release create --notes-file -`. The summary goes to stderr.
    console.log(result.notes);

    const moved = result.previousVersion === null ? "first release" : `was ${result.previousVersion}`;
    console.error(
      `${result.file}: moved [Unreleased] into '${result.heading}' (${moved})`,
    );

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    console.error(USAGE);
    process.exit(1);
  }
}
