/**
 * Tests capture-build-state.ts against real projects and the bundled
 * plan-review validator, per T9's Acceptance: the actual capture helper and
 * the actual validator, tested together, not a reimplementation of either.
 */
import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

setDefaultTimeout(60_000);

const repo = join(import.meta.dir, "..");
const CAPTURE = join(repo, "skills/planning/plan-builder/scripts/capture-build-state.ts");
const VALIDATOR = join(repo, "skills/planning/plan-review/scripts/validate-plan.ts");
const INVENTORY = join(repo, "skills/planning/plan-result-review/scripts/inventory-changes.ts");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop() as string, { recursive: true, force: true });
});
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "build-state-"));
  dirs.push(d);
  return d;
}

function run(args: string[], cwd: string): { code: number; out: string } {
  const p = Bun.spawnSync(["bun", CAPTURE, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
}

describe("capture-build-state", () => {
  test("--help prints usage and exits 0", () => {
    const r = run(["--help"], repo);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Usage: capture-build-state");
  });

  test("rejects a relative --output in a non-git project (D4: a durable location outside the project)", () => {
    const dir = tempDir();
    const plan = "docs/plans/x.md";
    require("node:fs").mkdirSync(join(dir, "docs/plans"), { recursive: true });
    writeFileSync(join(dir, plan), "---\ntitle: x\n---\n\nbody\n");
    const r = run([plan, "--root", dir, "--output", "relative/output"], dir);
    expect(r.code).toBe(2);
    expect(r.out).toContain("must be an absolute path");
  });

  test("captures a non-git project to an absolute destination and the validator reads it", () => {
    const dir = tempDir();
    const plan = "docs/plans/x.md";
    require("node:fs").mkdirSync(join(dir, "docs/plans"), { recursive: true });
    writeFileSync(join(dir, plan), "---\ntitle: x\n---\n\nbody\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    const dest = join(tempDir(), "snap");
    const r = run([plan, "--root", dir, "--output", dest], dir);
    expect(r.code).toBe(0);
    const v = require(VALIDATOR);
    const verified = v.verifySnapshot(dest);
    expect(verified.manifest.repository).toEqual({ kind: "none" });
    expect(verified.manifest.headRevision).toBe(null);
    const row = verified.manifest.paths.find((p: { path: string }) => p.path === "app.py");
    expect(row.head).toEqual({ state: "unavailable" });
    expect(row.index).toEqual({ state: "unavailable" });
    expect(row.worktree.state).toBe("file");
  });

  test("the reviews and build files are declared reports; the plan directory stays out of the result inventory", () => {
    const dir = tempDir();
    const stem = "2026-10-28-x";
    const planDir = `docs/plans/${stem}`;
    const plan = `${planDir}/${stem}.md`;
    const reviews = `${planDir}/${stem}.reviews.md`;
    const build = `${planDir}/${stem}.build.md`;
    mkdirSync(join(dir, planDir), { recursive: true });
    writeFileSync(join(dir, plan), "---\ntitle: x\n---\n\nbody\n");
    writeFileSync(join(dir, `${planDir}/${stem}.evidence-index.md`), "```json\n{}\n```\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    const baseline = join(tempDir(), "baseline");
    const first = run([plan, "--root", dir, "--output", baseline], dir);
    expect(first.code).toBe(0);
    const v = require(VALIDATOR);
    expect(v.verifySnapshot(baseline).manifest.administrative.reports).toEqual([reviews, build]);

    writeFileSync(join(dir, reviews), "# Reviews: x\n\n## Result review\n\n### Result round 1\n\nMATCH\n");
    writeFileSync(join(dir, build), "# Build: x\n\n```json\n{\"receipts\": []}\n```\n");
    const after = join(tempDir(), "after");
    const second = run([plan, "--root", dir, "--output", after, "--carry", baseline], dir);
    expect(second.code).toBe(0);
    expect(JSON.parse(second.out).stateDigest).toBe(JSON.parse(first.out).stateDigest);

    writeFileSync(join(dir, "app.py"), "print('changed')\n");
    const inventory = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--baseline", baseline, "--json"], { stdout: "pipe", stderr: "pipe" });
    expect(inventory.exitCode).toBe(0);
    const report = JSON.parse(inventory.stdout.toString());
    expect(report.planDir).toBe(planDir);
    expect(report.changes.map((c: { path: string }) => c.path)).toEqual(["app.py"]);

    const changed = run([plan, "--root", dir, "--output", join(tempDir(), "changed"), "--carry", after], dir);
    expect(changed.code).toBe(0);
    expect(JSON.parse(changed.out).stateDigest).not.toBe(JSON.parse(first.out).stateDigest);
  });

  test("--brief attributes each changed path to the todo whose receipt changed it, and flags the rest", () => {
    const dir = tempDir();
    const stem = "2026-11-20-x";
    const planDir = `docs/plans/${stem}`;
    const plan = `${planDir}/${stem}.md`;
    mkdirSync(join(dir, planDir), { recursive: true });
    writeFileSync(
      join(dir, plan),
      "---\ntitle: Brief fixture\n---\n\n# Brief fixture\n\n## Scope\n\n### Must have\n\n- MH1: A greeting.\n\n## Todos\n\n### T1 — Add the greeting\n\n- [x] Done\n- Do: greet.\n- Strict: security\n- Commit: no\n",
    );
    writeFileSync(join(dir, `${planDir}/${stem}.evidence-index.md`), "```json\n{}\n```\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    const baseline = join(tempDir(), "baseline");
    const first = JSON.parse(run([plan, "--root", dir, "--output", baseline], dir).out);
    writeFileSync(join(dir, "app.py"), "print('hello')\n");
    const after = join(tempDir(), "after");
    const second = JSON.parse(run([plan, "--root", dir, "--output", after, "--carry", baseline], dir).out);
    const ref = (snapshot: string, s: { manifestSha256: string; stateDigest: string }) => ({ snapshot, manifestSha256: s.manifestSha256, stateDigest: s.stateDigest });
    const receipt = {
      seq: 1, todo: "T1", event: "pass", state: "passed", prev: null,
      before: ref(baseline, first), after: ref(after, second),
      checks: [{ id: "acceptance", command: "python app.py", exit: 0, expectedExit: 0, passed: true, observed: "hello" }],
      prerequisites: [], commit: { none: "Commit: no" }, note: "",
    };
    writeFileSync(join(dir, `${planDir}/${stem}.build.md`), `# Build: x\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: 2, baseline: ref(baseline, first), receipts: [receipt] })}\n\`\`\`\n`);
    writeFileSync(join(dir, "stray.py"), "print('stray')\n");
    const p = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--baseline", baseline, "--brief", "--json"], { stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(0);
    const brief = JSON.parse(p.stdout.toString());
    expect(brief.requirements).toEqual(["- MH1: A greeting."]);
    expect(brief.todos).toEqual([
      { id: "T1", title: "Add the greeting", box: "Done", strict: ["security"], events: ["pass"], checks: [{ id: "acceptance", exit: 0, passed: true }], commit: null },
    ]);
    const byPath = Object.fromEntries(brief.changes.map((c: { path: string; todos: string[] }) => [c.path, c.todos]));
    expect(byPath).toEqual({ "app.py": ["T1"], "stray.py": [] });
    // A plan with no Behavior section and no slices gets neither part, and a plan directory git does not ignore gets no plan-directory key or line.
    expect(brief).not.toHaveProperty("behavior");
    expect(brief).not.toHaveProperty("slices");
    expect(brief).not.toHaveProperty("planIgnored");
    const text = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--baseline", baseline, "--brief"], { stdout: "pipe" }).stdout.toString();
    expect(text).toMatch(/^- stray\.py \([a-z+]+\): unattributed$/m);
    expect(text).not.toContain("+1:");
    expect(text).not.toMatch(/^## (Behavior|Slices)$/m);
    expect(text).not.toContain("Plan directory");
  });

  test("--brief lists each Behavior line with the todos that serve it, and each slice with its branch and todos", () => {
    const dir = tempDir();
    const stem = "2026-11-20-y";
    const planDir = `docs/plans/${stem}`;
    const plan = `${planDir}/${stem}.md`;
    mkdirSync(join(dir, planDir), { recursive: true });
    writeFileSync(
      join(dir, plan),
      [
        "---\ntitle: Slice fixture\n---\n\n# Slice fixture\n\n## TL;DR\n\n- Effort: S\n\n## Behavior\n",
        "- B1 (primary): Given an open shop, when a visitor opens the page, then it greets them.",
        "- B2 (error): Given a closed shop, when a visitor opens the page, then it says the shop is closed.",
        "- No alternate case: the page opens one way.",
        "- No recovery case: opening the page changes nothing.",
        "\n## Scope\n\n### Must have\n\n- MH1: A greeting.\n\n## Execution strategy\n",
        "- T0 runs alone before wave 1.",
        "- Slice S1 — foundation. Independent test: `bun test` exits 0. Branch: `feat/shop-foundation`",
        "- Wave 1: T1",
        "- Slice S2 — greeting. Independent test: a visitor sees the greeting.",
        "- Wave 2: T2 — needs T1",
        "- Wave 3: T3 — needs T2",
        "\n## Todos\n",
        "### T1 — Add the page\n\n- [x] Done\n- Do: page.\n- Closes gap: G1\n- Serves: none\n- Strict: no\n- Commit: no\n",
        "### T2 — Greet the visitor\n\n- [ ] Open\n- Do: greet.\n- Closes gap: G1\n- Serves: B1\n- Strict: no\n- Commit: no\n",
        "### T3 — Say when the shop is closed\n\n- [ ] Open\n- Do: closed.\n- Closes gap: G1\n- Serves: B1, B2\n- Strict: no\n- Commit: no\n",
      ].join("\n"),
    );
    writeFileSync(join(dir, `${planDir}/${stem}.evidence-index.md`), "```json\n{}\n```\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    const baseline = join(tempDir(), "baseline");
    expect(run([plan, "--root", dir, "--output", baseline], dir).code).toBe(0);
    const p = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--baseline", baseline, "--brief", "--json"], { stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(0);
    const brief = JSON.parse(p.stdout.toString());
    expect(brief.behavior).toEqual([
      { id: "B1", text: "Given an open shop, when a visitor opens the page, then it greets them.", todos: ["T2", "T3"] },
      { id: "B2", text: "Given a closed shop, when a visitor opens the page, then it says the shop is closed.", todos: ["T3"] },
    ]);
    expect(brief.slices).toEqual([
      { id: "S1", name: "foundation", branch: "feat/shop-foundation", todos: ["T1"] },
      { id: "S2", name: "greeting", branch: null, todos: ["T2", "T3"] },
    ]);
    expect(Object.keys(brief)).toEqual(["plan", "baseline", "headRevision", "ownerWorkCertifiable", "requirements", "behavior", "todos", "slices", "fixes", "changes", "unnamedCommits"]);
    const text = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--baseline", baseline, "--brief"], { stdout: "pipe" }).stdout.toString();
    expect(text).toContain(
      "## Behavior\n\n- B1 served by T2, T3: Given an open shop, when a visitor opens the page, then it greets them.\n- B2 served by T3: Given a closed shop, when a visitor opens the page, then it says the shop is closed.\n\n## Todos\n",
    );
    expect(text).toContain("## Slices\n\n- S1 — foundation; branch: feat/shop-foundation; todos: T1\n- S2 — greeting; todos: T2, T3\n");
  });

  test("a baseline captured after git switch -c names the new branch", () => {
    const dir = tempDir();
    const stem = "2026-11-23-branch";
    const planDir = `docs/plans/${stem}`;
    const plan = `${planDir}/${stem}.md`;
    const env = { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.com", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.com", GIT_CONFIG_NOSYSTEM: "1" };
    const git = (...args: string[]): string => {
      const p = Bun.spawnSync(["git", "-c", "commit.gpgSign=false", ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
      expect(p.exitCode).toBe(0);
      return p.stdout.toString().trim();
    };
    git("init", "-q");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    git("add", "app.py");
    git("commit", "-q", "-m", "init");
    const commit = git("rev-parse", "HEAD");
    mkdirSync(join(dir, planDir), { recursive: true });
    writeFileSync(join(dir, plan), "---\ntitle: Branch fixture\n---\n\nbody\n");
    // git init picks the first branch; the test reads it and holds no name for it.
    expect(git("branch", "--show-current")).not.toBe("feat/fixture-branch");
    git("switch", "-c", "feat/fixture-branch");
    const baseline = join(tempDir(), "baseline");
    expect(run([plan, "--root", dir, "--output", baseline], dir).code).toBe(0);
    const manifest = require(VALIDATOR).verifySnapshot(baseline).manifest;
    expect(manifest.repository.branch).toBe("feat/fixture-branch");
    expect(manifest.headRevision).toBe(commit);
  });
});

describe("ignored plan directory", () => {
  test("--brief has planIgnored: true and the plan-directory line in a git repository that ignores the plan directory, and neither without the rule", () => {
    const dir = tempDir();
    const stem = "2026-11-21-z";
    const planDir = `docs/plans/${stem}`;
    const plan = `${planDir}/${stem}.md`;
    const env = { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.com", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.com", GIT_CONFIG_NOSYSTEM: "1" };
    const git = (...args: string[]) => expect(Bun.spawnSync(["git", "-c", "commit.gpgSign=false", ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" }).exitCode).toBe(0);
    git("init", "-q");
    writeFileSync(join(dir, ".gitignore"), "/docs/plans/\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    git("add", ".gitignore", "app.py");
    git("commit", "-q", "-m", "init");
    mkdirSync(join(dir, planDir), { recursive: true });
    writeFileSync(
      join(dir, plan),
      "---\ntitle: Ignored fixture\n---\n\n# Ignored fixture\n\n## Scope\n\n### Must have\n\n- MH1: A greeting.\n\n## Todos\n\n### T1 — Add the greeting\n\n- [ ] Open\n- Do: greet.\n- Strict: no\n- Commit: yes — `feat(app): greet`\n",
    );
    writeFileSync(join(dir, `${planDir}/${stem}.evidence-index.md`), "```json\n{}\n```\n");
    const baseline = join(tempDir(), "baseline");
    expect(run([plan, "--root", dir, "--output", baseline], dir).code).toBe(0);
    const inventory = (...flags: string[]): string => {
      const p = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--baseline", baseline, ...flags], { stdout: "pipe", stderr: "pipe" });
      expect(p.exitCode).toBe(0);
      return p.stdout.toString();
    };
    const line = "Plan directory: ignored by git; no commit holds it.";

    const brief = JSON.parse(inventory("--brief", "--json"));
    expect(brief.planIgnored).toBe(true);
    expect(Object.keys(brief).slice(0, 5)).toEqual(["plan", "baseline", "headRevision", "ownerWorkCertifiable", "planIgnored"]);
    const text = inventory("--brief");
    expect(text).toContain(`Owner work certifiable: true.\n${line}\n\n## Requirements\n`);
    expect(text.split(line).length).toBe(2);
    expect(JSON.parse(inventory("--json")).planIgnored).toBe(true);

    // The same fixture without the ignore rule: no key and no line.
    writeFileSync(join(dir, ".gitignore"), "");
    expect(JSON.parse(inventory("--brief", "--json"))).not.toHaveProperty("planIgnored");
    expect(inventory("--brief")).not.toContain("Plan directory");
    expect(JSON.parse(inventory("--json"))).not.toHaveProperty("planIgnored");
  });
});

describe("commits no receipt names", () => {
  const EVIDENCE = "```json\n{}\n```\n";
  const STATE: Record<string, string> = { pass: "passed", recovery: "active", amend: "amended" };
  const ACCEPTANCE = { id: "acceptance", command: "python app.py", exit: 0, expectedExit: 0, passed: true, observed: "hello" };
  const KEYS = ["plan", "baseline", "headRevision", "ownerWorkCertifiable", "requirements", "todos", "fixes", "changes", "unnamedCommits"];
  const HEADING = "## Commits no receipt names";
  const todoCommits = (brief: { todos: { id: string; events: string[]; commit: { sha: string } | null }[] }) => brief.todos.map((t) => [t.id, t.events, t.commit?.sha ?? null]);

  /**
   * A git project whose first commit, the base revision, holds app.py and a
   * tracked plan with one `Commit: yes` todo, with a baseline captured there.
   * `record` appends a receipt chained as the receipt command chains it, with
   * a snapshot of the state after it. `brief` writes the build file and runs
   * --brief from the build record's baseline.
   */
  function fixture(stem: string) {
    const dir = tempDir();
    const planDir = `docs/plans/${stem}`;
    const plan = `${planDir}/${stem}.md`;
    const env = { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.com", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.com", GIT_CONFIG_NOSYSTEM: "1" };
    const git = (...args: string[]): string => {
      const p = Bun.spawnSync(["git", "-c", "commit.gpgSign=false", ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
      expect(p.exitCode).toBe(0);
      return p.stdout.toString().trim();
    };
    const commit = (subject: string, ...paths: string[]): string => {
      git("add", "--", ...paths);
      git("commit", "-q", "-m", subject);
      return git("rev-parse", "HEAD");
    };
    git("init", "-q");
    mkdirSync(join(dir, planDir), { recursive: true });
    writeFileSync(
      join(dir, plan),
      "---\ntitle: Commit fixture\n---\n\n# Commit fixture\n\n## Scope\n\n### Must have\n\n- MH1: A greeting.\n\n## Todos\n\n### T1 — Add the greeting\n\n- [ ] Open\n- Do: greet.\n- Strict: no\n- Commit: yes — `feat(app): greet`\n",
    );
    writeFileSync(join(dir, `${planDir}/${stem}.evidence-index.md`), EVIDENCE);
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    const base = commit("init", "app.py", planDir);
    const v = require(VALIDATOR);
    let last: string | null = null;
    const snapshot = () => {
      const output = join(tempDir(), "snapshot");
      const r = run([plan, "--root", dir, "--output", output, "--base-revision", base, ...(last ? ["--carry", last] : [])], dir);
      expect(r.code).toBe(0);
      last = output;
      const s = JSON.parse(r.out);
      return { snapshot: output, manifestSha256: s.manifestSha256, stateDigest: s.stateDigest };
    };
    const baseline = snapshot();
    const receipts: Record<string, unknown>[] = [];
    const record = (todo: string, event: string, sha: string, extra: Record<string, unknown>) => {
      const prior = receipts[receipts.length - 1];
      const before = prior ? prior.after : baseline;
      receipts.push({ seq: receipts.length + 1, todo, event, state: STATE[event], prev: prior ? v.sha256(v.canonicalJson(prior)) : null, before, after: snapshot(), checks: [], prerequisites: [], commit: { sha }, note: "", ...extra });
    };
    const brief = (...flags: string[]): string => {
      writeFileSync(join(dir, `${planDir}/${stem}.build.md`), `# Build: ${stem}\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: 2, baseline, receipts })}\n\`\`\`\n`);
      const p = Bun.spawnSync(["bun", INVENTORY, plan, "--root", dir, "--brief", ...flags], { stdout: "pipe", stderr: "pipe" });
      expect(p.exitCode).toBe(0);
      return p.stdout.toString();
    };
    const planText = () => readFileSync(join(dir, plan), "utf8");
    const todoDigest = (id: string): string => v.todoDigest(v.parsePlan(planText(), EVIDENCE).todos.find((t: { id: string }) => t.id === id));
    const specDigest = (): string => v.canonicalSpecDigest(planText(), EVIDENCE);
    return { dir, plan, planDir, v, commit, record, brief, todoDigest, specDigest };
  }

  test("--brief names the commit of an amend receipt and still lists a commit no receipt names", () => {
    const f = fixture("2026-11-23-greet");
    writeFileSync(join(f.dir, "app.py"), "print('hello')\n");
    const greet = f.commit("feat(app): greet", "app.py");
    f.record("T1", "pass", greet, { checks: [ACCEPTANCE], todoDigest: f.todoDigest("T1") });
    // The plan change adds T2. Its plan-only commit is HEAD, which the amend receipt names.
    appendFileSync(join(f.dir, f.plan), "\n### T2 — Say goodbye\n\n- [ ] Open\n- Do: say goodbye.\n- Strict: no\n- Commit: no\n");
    const amend = f.commit("docs(plans): amend greet plan", f.planDir);
    // The brief reads only the event and the commit of an amend receipt; the approval stands in for round 2's.
    f.record("plan", "amend", amend, { note: "T2 says goodbye", approval: { specDigest: f.specDigest(), round: 2, verdict: "OKAY", gateRecordDigest: f.v.sha256("the gate record of round 2") } });
    writeFileSync(join(f.dir, "stray.py"), "print('stray')\n");
    const stray = f.commit("chore(app): add a stray script", "stray.py");

    const brief = JSON.parse(f.brief("--json"));
    expect(brief.unnamedCommits).toEqual([{ sha: stray, subject: "chore(app): add a stray script" }]);
    expect(todoCommits(brief)).toEqual([
      ["T1", ["pass"], greet],
      ["T2", [], null],
    ]);
    // No new key or section, and the amend receipt is the owner of no changed path.
    expect(Object.keys(brief)).toEqual(KEYS);
    expect(Object.fromEntries(brief.changes.map((c: { path: string; todos: string[] }) => [c.path, c.todos]))).toEqual({ "app.py": ["T1"], "stray.py": [] });
    const text = f.brief();
    expect(text.match(/^## .+$/gm)).toEqual(["## Requirements", "## Todos", "## Changed paths", HEADING]);
    expect(text.slice(text.indexOf(HEADING))).toBe(`${HEADING}\n\n- ${stray.slice(0, 12)} chore(app): add a stray script\n`);
    expect(text).not.toContain("amend greet plan");
  });

  test("--brief of a build with no amend receipt still lists a commit that only a recovery receipt names", () => {
    const f = fixture("2026-11-23-hello");
    // A commit the record did not explain: the recovery receipt names it and leaves it alone.
    writeFileSync(join(f.dir, "stray.py"), "print('stray')\n");
    const stray = f.commit("chore(app): add a stray script", "stray.py");
    f.record("T1", "recovery", stray, { note: "a commit after the baseline adds stray.py; left alone" });
    writeFileSync(join(f.dir, "app.py"), "print('hello')\n");
    const greet = f.commit("feat(app): greet", "app.py");
    f.record("T1", "pass", greet, { checks: [ACCEPTANCE], todoDigest: f.todoDigest("T1") });

    const brief = JSON.parse(f.brief("--json"));
    expect(brief.unnamedCommits).toEqual([{ sha: stray, subject: "chore(app): add a stray script" }]);
    expect(todoCommits(brief)).toEqual([["T1", ["recovery", "pass"], greet]]);
    expect(Object.keys(brief)).toEqual(KEYS);
    const text = f.brief();
    expect(text.slice(text.indexOf(HEADING))).toBe(`${HEADING}\n\n- ${stray.slice(0, 12)} chore(app): add a stray script\n`);
  });
});
