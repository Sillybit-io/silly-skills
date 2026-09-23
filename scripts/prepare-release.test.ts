/**
 * Tests for scripts/prepare-release.ts.
 *
 * Every fixture is generated at test run time inside a fresh temp directory and
 * removed afterwards, following scripts/validate.test.ts and
 * scripts/bump-skill-version.test.ts. This repository's own CHANGELOG.md is
 * never read or written by these tests.
 *
 * The default fixture mirrors the real CHANGELOG.md exactly: a Keep a Changelog
 * preamble, a populated `## [Unreleased]`, and one already-released section
 * below it.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CHANGELOG_FILE,
  ReleaseError,
  compareVersions,
  formatDate,
  latestReleasedVersion,
  parseVersion,
  prepareRelease,
} from "./prepare-release.ts";

const roots: string[] = [];

function newRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "silly-skills-release-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop() as string, { recursive: true, force: true });
  }
});

const PREAMBLE = [
  "# Changelog",
  "",
  "All notable changes to this project will be documented in this file.",
  "",
  "The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).",
  "",
];

const RELEASED_0_1_0 = [
  "## [0.1.0] - 2026-09-23",
  "",
  "### Added",
  "",
  "- Nine skills.",
  "- Validation and test tooling via `bun run validate`.",
  "",
];

type Overrides = {
  /** Lines between the `## [Unreleased]` heading and the next section. */
  unreleased?: string[];
  /** Already-released sections below `[Unreleased]`. */
  released?: string[];
  /** Write a second `## [Unreleased]` heading. */
  duplicateHeading?: boolean;
  /** Omit the `## [Unreleased]` heading entirely. */
  heading?: boolean;
  lineEnding?: "\n" | "\r\n";
};

/** Writes CHANGELOG.md, shaped like the real one unless overridden. */
function writeChangelog(root: string, overrides: Overrides = {}): string {
  const unreleased = overrides.unreleased ?? [
    "",
    "### Changed",
    "",
    "- `skill-writer` 0.2.0 — every skill now ships an `examples.md`.",
    "",
  ];
  const released = overrides.released ?? RELEASED_0_1_0;

  const lines = [...PREAMBLE];
  if (overrides.heading !== false) lines.push("## [Unreleased]");
  lines.push(...unreleased);
  if (overrides.duplicateHeading === true) lines.push("## [Unreleased]", "");
  lines.push(...released);

  const text = lines.join(overrides.lineEnding ?? "\n");
  writeFileSync(join(root, CHANGELOG_FILE), text, "utf8");
  return text;
}

/** Runs the real CLI the way a user would. */
function runCli(root: string, args: string[]) {
  const script = join(import.meta.dir, "prepare-release.ts");
  const proc = Bun.spawnSync(["bun", script, ...args, root]);
  const decoder = new TextDecoder();
  return {
    exitCode: proc.exitCode,
    stdout: decoder.decode(proc.stdout),
    stderr: decoder.decode(proc.stderr),
  };
}

function read(root: string): string {
  return readFileSync(join(root, CHANGELOG_FILE), "utf8");
}

describe("parseVersion", () => {
  test("splits a plain x.y.z version into numbers", () => {
    expect(parseVersion("0.1.0")).toEqual([0, 1, 0]);
    expect(parseVersion("10.20.30")).toEqual([10, 20, 30]);
  });

  test("anything that is not plain x.y.z is rejected", () => {
    expect(() => parseVersion("1.2")).toThrow(ReleaseError);
    expect(() => parseVersion("v1.2.3")).toThrow(/expected a plain x\.y\.z version/);
    expect(() => parseVersion("1.2.3-rc.1")).toThrow(/expected a plain x\.y\.z version/);
    expect(() => parseVersion("1.2.3+build.5")).toThrow(/expected a plain x\.y\.z/);
    expect(() => parseVersion("banana")).toThrow(/expected a plain x\.y\.z/);
  });
});

describe("compareVersions", () => {
  test("compares number by number, not as text", () => {
    expect(compareVersions([0, 10, 0], [0, 9, 0])).toBeGreaterThan(0);
    expect(compareVersions([0, 9, 0], [0, 10, 0])).toBeLessThan(0);
    expect(compareVersions([1, 0, 0], [0, 99, 99])).toBeGreaterThan(0);
    expect(compareVersions([0, 1, 0], [0, 1, 0])).toBe(0);
  });
});

describe("latestReleasedVersion", () => {
  test("picks the highest dated version and ignores [Unreleased]", () => {
    const lines = [
      "## [Unreleased]",
      "## [0.9.0] - 2026-01-01",
      "## [0.10.0] - 2026-02-01",
      "## [0.2.0] - 2025-12-01",
    ];

    expect(latestReleasedVersion(lines)).toBe("0.10.0");
  });

  test("returns null when the file has no released section yet", () => {
    expect(latestReleasedVersion(["# Changelog", "## [Unreleased]", "- A change."])).toBe(
      null,
    );
  });
});

describe("formatDate", () => {
  test("renders the local calendar date zero-padded", () => {
    expect(formatDate(new Date(2026, 8, 24))).toBe("2026-09-24");
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  test("uses the local calendar day, not UTC", () => {
    // 23:30 local on the 24th is already the 25th in UTC for negative offsets
    // and still the 24th for positive ones; the local day is what we print.
    const late = new Date(2026, 8, 24, 23, 30);
    expect(formatDate(late)).toBe("2026-09-24");
  });
});

describe("prepareRelease", () => {
  test("moves the [Unreleased] content into a new dated section", () => {
    const root = newRoot();
    writeChangelog(root);

    const result = prepareRelease(root, "0.2.0", new Date(2026, 8, 24));

    expect(result.version).toBe("0.2.0");
    expect(result.date).toBe("2026-09-24");
    expect(result.heading).toBe("## [0.2.0] - 2026-09-24");
    expect(result.previousVersion).toBe("0.1.0");
    expect(read(root)).toBe(
      [
        ...PREAMBLE,
        "## [Unreleased]",
        "",
        "## [0.2.0] - 2026-09-24",
        "",
        "### Changed",
        "",
        "- `skill-writer` 0.2.0 — every skill now ships an `examples.md`.",
        "",
        ...RELEASED_0_1_0,
      ].join("\n"),
    );
  });

  test("the content is preserved verbatim, internal blank lines included", () => {
    const root = newRoot();
    writeChangelog(root, {
      unreleased: [
        "",
        "### Added",
        "",
        "- One thing.",
        "",
        "### Fixed",
        "",
        "- Another thing.",
        "",
        "  An indented continuation line.",
        "",
      ],
    });

    const result = prepareRelease(root, "0.2.0", new Date(2026, 8, 24));

    expect(result.notes).toBe(
      [
        "### Added",
        "",
        "- One thing.",
        "",
        "### Fixed",
        "",
        "- Another thing.",
        "",
        "  An indented continuation line.",
      ].join("\n"),
    );
    expect(read(root)).toContain(`## [0.2.0] - 2026-09-24\n\n${result.notes}\n\n## [0.1.0]`);
  });

  test("the [Unreleased] heading left behind is genuinely empty", () => {
    const root = newRoot();
    writeChangelog(root);

    prepareRelease(root, "0.2.0", new Date(2026, 8, 24));

    const after = read(root);
    const between = after.slice(
      after.indexOf("## [Unreleased]") + "## [Unreleased]".length,
      after.indexOf("## [0.2.0]"),
    );
    expect(between).toBe("\n\n");
    expect(between.trim()).toBe("");
  });

  test("already-released sections below are untouched byte for byte", () => {
    const root = newRoot();
    writeChangelog(root);
    const before = readFileSync(join(root, CHANGELOG_FILE));
    const marker = "## [0.1.0] - 2026-09-23";

    prepareRelease(root, "0.2.0", new Date(2026, 8, 24));

    const after = readFileSync(join(root, CHANGELOG_FILE));
    const tailBefore = before.subarray(before.indexOf(marker));
    const tailAfter = after.subarray(after.indexOf(marker));
    expect(tailAfter.equals(tailBefore)).toBe(true);
  });

  test("the preamble above [Unreleased] is untouched byte for byte", () => {
    const root = newRoot();
    writeChangelog(root);
    const before = readFileSync(join(root, CHANGELOG_FILE));
    const head = PREAMBLE.join("\n").length;

    prepareRelease(root, "0.2.0", new Date(2026, 8, 24));

    const after = readFileSync(join(root, CHANGELOG_FILE));
    expect(after.subarray(0, head).equals(before.subarray(0, head))).toBe(true);
  });

  test("a first release is allowed when no dated version exists yet", () => {
    const root = newRoot();
    writeChangelog(root, { released: [] });

    const result = prepareRelease(root, "0.1.0", new Date(2026, 8, 24));

    expect(result.previousVersion).toBe(null);
    expect(read(root)).toContain("## [0.1.0] - 2026-09-24");
  });

  test("[Unreleased] as the last section in the file still works", () => {
    const root = newRoot();
    writeChangelog(root, {
      unreleased: ["", "### Added", "", "- A first change.", ""],
      released: [],
    });

    const result = prepareRelease(root, "0.1.0", new Date(2026, 8, 24));

    expect(result.notes).toBe("### Added\n\n- A first change.");
    expect(read(root)).toBe(
      [
        ...PREAMBLE,
        "## [Unreleased]",
        "",
        "## [0.1.0] - 2026-09-24",
        "",
        "### Added",
        "",
        "- A first change.",
        "",
      ].join("\n"),
    );
  });

  test("a CRLF file keeps its line endings", () => {
    const root = newRoot();
    writeChangelog(root, { lineEnding: "\r\n" });

    prepareRelease(root, "0.2.0", new Date(2026, 8, 24));

    const after = read(root);
    expect(after).toContain("## [0.2.0] - 2026-09-24\r\n");
    expect(after).not.toMatch(/[^\r]\n/);
  });

  test("an empty [Unreleased] reports nothing to release", () => {
    const root = newRoot();
    writeChangelog(root, { unreleased: ["", "", ""] });

    expect(() => prepareRelease(root, "0.2.0")).toThrow(ReleaseError);
    expect(() => prepareRelease(root, "0.2.0")).toThrow(/nothing to release/);
  });

  test("an empty [Unreleased] leaves the file untouched", () => {
    const root = newRoot();
    const before = writeChangelog(root, { unreleased: ["", "", ""] });

    expect(() => prepareRelease(root, "0.2.0")).toThrow(/nothing to release/);

    expect(read(root)).toBe(before);
  });

  test("a version that is not greater than the latest one is rejected", () => {
    const root = newRoot();
    const before = writeChangelog(root);

    expect(() => prepareRelease(root, "0.1.0")).toThrow(/is not greater than 0\.1\.0/);
    expect(() => prepareRelease(root, "0.0.9")).toThrow(/is not greater than 0\.1\.0/);
    expect(read(root)).toBe(before);
  });

  test("a version equal to the latest one is rejected, not accepted", () => {
    const root = newRoot();
    writeChangelog(root, { released: ["## [0.10.0] - 2026-02-01", "", "- Old.", ""] });

    expect(() => prepareRelease(root, "0.10.0")).toThrow(/is not greater than 0\.10\.0/);
    // Numeric, not lexicographic: "0.9.0" > "0.10.0" as text, but not as a version.
    expect(() => prepareRelease(root, "0.9.0")).toThrow(/is not greater than 0\.10\.0/);
  });

  test("a version failing the shape check is rejected and the file is untouched", () => {
    const root = newRoot();
    const before = writeChangelog(root);

    expect(() => prepareRelease(root, "v0.2.0")).toThrow(/expected a plain x\.y\.z/);
    expect(() => prepareRelease(root, "0.2")).toThrow(/expected a plain x\.y\.z/);
    expect(() => prepareRelease(root, "0.2.0-rc.1")).toThrow(/expected a plain x\.y\.z/);
    expect(read(root)).toBe(before);
  });

  test("a missing [Unreleased] heading is reported clearly", () => {
    const root = newRoot();
    writeChangelog(root, { heading: false, unreleased: [] });

    expect(() => prepareRelease(root, "0.2.0")).toThrow(/no '## \[Unreleased\]' heading/);
  });

  test("two [Unreleased] headings are reported rather than guessed between", () => {
    const root = newRoot();
    writeChangelog(root, { duplicateHeading: true });

    expect(() => prepareRelease(root, "0.2.0")).toThrow(/2 '## \[Unreleased\]' headings/);
  });

  test("a missing CHANGELOG.md is reported rather than crashing", () => {
    const root = newRoot();

    expect(() => prepareRelease(root, "0.2.0")).toThrow(ReleaseError);
    expect(() => prepareRelease(root, "0.2.0")).toThrow(/cannot read CHANGELOG\.md/);
  });
});

describe("prepare-release CLI", () => {
  test("exits 0 and prints exactly the new section's content on stdout", () => {
    const root = newRoot();
    writeChangelog(root);

    const run = runCli(root, ["0.2.0"]);

    expect(run.exitCode).toBe(0);
    // Exactly the notes plus console.log's newline: nothing else may reach
    // stdout, since this output is piped into `gh release create --notes-file -`.
    expect(run.stdout).toBe(
      [
        "### Changed",
        "",
        "- `skill-writer` 0.2.0 — every skill now ships an `examples.md`.",
        "",
      ].join("\n"),
    );
  });

  test("the summary goes to stderr, keeping stdout pipeable", () => {
    const root = newRoot();
    writeChangelog(root);

    const run = runCli(root, ["0.2.0"]);

    expect(run.stderr).toContain("CHANGELOG.md: moved [Unreleased] into");
    expect(run.stderr).toContain("was 0.1.0");
    expect(run.stdout).not.toContain("moved [Unreleased]");
  });

  test("stdout matches the new dated section's content in the written file", () => {
    const root = newRoot();
    writeChangelog(root);

    const run = runCli(root, ["0.2.0"]);

    const after = read(root);
    const start = after.indexOf("\n", after.indexOf("## [0.2.0]")) + 1;
    const section = after.slice(start, after.indexOf("## [0.1.0]"));
    // The section body is the printed notes, wrapped in the blank lines that
    // separate it from the headings above and below.
    expect(section).toBe(`\n${run.stdout}\n`);
  });

  test("an empty [Unreleased] exits 1 with a clear message and no stack trace", () => {
    const root = newRoot();
    const before = writeChangelog(root, { unreleased: ["", "   ", ""] });

    const run = runCli(root, ["0.2.0"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("error: nothing to release");
    expect(run.stderr).toContain("Usage: bun scripts/prepare-release.ts");
    expect(run.stderr).not.toMatch(/^\s+at /m);
    expect(run.stderr).not.toContain("ReleaseError");
    expect(run.stdout).toBe("");
    expect(read(root)).toBe(before);
  });

  test("a version that is not greater exits 1 and leaves the file untouched", () => {
    const root = newRoot();
    const before = writeChangelog(root);

    const run = runCli(root, ["0.1.0"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("error: version 0.1.0 is not greater than 0.1.0");
    expect(run.stderr).not.toMatch(/^\s+at /m);
    expect(read(root)).toBe(before);
  });

  test("a malformed version exits 1 and leaves the file untouched", () => {
    const root = newRoot();
    const before = writeChangelog(root);

    const run = runCli(root, ["1.2"]);

    expect(run.exitCode).toBe(1);
    expect(run.stderr).toContain("error: invalid version '1.2'");
    expect(run.stderr).not.toMatch(/^\s+at /m);
    expect(read(root)).toBe(before);
  });

  test("a missing version argument exits 1 and prints the usage line", () => {
    const script = join(import.meta.dir, "prepare-release.ts");
    const proc = Bun.spawnSync(["bun", script]);
    const stderr = new TextDecoder().decode(proc.stderr);

    expect(proc.exitCode).toBe(1);
    expect(stderr).toContain("error: expected a version to release");
    expect(stderr).toContain("Usage: bun scripts/prepare-release.ts");
  });

  test("extra arguments exit 1 rather than being ignored", () => {
    const root = newRoot();
    writeChangelog(root);

    const script = join(import.meta.dir, "prepare-release.ts");
    const proc = Bun.spawnSync(["bun", script, "0.2.0", root, "extra"]);
    const stderr = new TextDecoder().decode(proc.stderr);

    expect(proc.exitCode).toBe(1);
    expect(stderr).toContain("error: unexpected extra arguments: extra");
  });
});
