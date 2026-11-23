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

describe("branch at a new build", () => {
  const RECEIPTS = join(repo, "skills/planning/plan-builder/references/receipts.md");
  const BRANCH = "feat/fixture";
  const STEM = "2026-11-23-fixture";
  const PLAN_DIR = `docs/plans/${STEM}`;
  const PLAN = `${PLAN_DIR}/${STEM}.md`;
  const COLUMNS = ["Case", "Holds when", "Git write", "Reply", "Reason", "Command"];

  /** One command as it ran in a fixture: its exit and what git printed. */
  type Run = { command: string; exit: number; stdout: string; stderr: string };
  /** One row of the Cases table, its placeholders filled. */
  type Row = { id: string; holds: string; write: string; reply: string; reason: string; command: string };
  /** What a condition may read: the request, the reads as the walk ran them, and the write. */
  type Walk = { request: string; first: Run[]; read: (n: number) => Run; write?: Run; again?: Run[] };
  type Fixture = ReturnType<typeof fixture>;

  /**
   * The Branch section of the reference: the header of its Cases table, the
   * lines of its one `text` block, and the table's rows, with `<branch>` and
   * `<plan directory>` filled. A cell that is one code span loses its backticks.
   */
  function branchRule(): { header: string[]; commands: string[]; rows: Row[] } {
    const text = readFileSync(RECEIPTS, "utf8");
    const start = text.indexOf("\n## Branch\n");
    if (start === -1) throw new Error("the reference has no Branch section");
    const end = text.indexOf("\n## ", start + 1);
    const section = text.slice(start + 1, end === -1 ? undefined : end);
    const fill = (s: string) => s.replaceAll("<branch>", BRANCH).replaceAll("<plan directory>", PLAN_DIR);
    const blocks = [...section.matchAll(/^```text\n([\s\S]*?)^```$/gm)];
    if (blocks.length !== 1) throw new Error(`the Branch section has ${blocks.length} text blocks, not one`);
    const commands = blocks[0][1].trimEnd().split("\n").map(fill);
    const cells = (line: string) => line.trim().slice(1, -1).split("|").map((c) => c.trim().replace(/^`([^`]*)`$/, "$1"));
    const table = section.split("\n").filter((l) => l.startsWith("|"));
    if (table.length < 2) throw new Error("the Branch section has no Cases table");
    const header = cells(table[0]);
    const at = COLUMNS.map((name) => {
      const i = header.indexOf(name);
      if (i === -1) throw new Error(`the Cases table has no ${name} column`);
      return i;
    });
    const rows = table.slice(2).map((line) => {
      const [id, holds, write, reply, reason, command] = at.map((i) => fill(cells(line)[i]));
      return { id, holds, write, reply, reason, command };
    });
    return { header, commands, rows };
  }

  // The test holds only the conditions, one per case id, as each Holds when cell says.
  const said = (reads: Run[]) => JSON.stringify([reads[0].stdout, reads[1].exit, reads[2].stdout, reads[3].stdout]);
  const failed = (w: Walk) => w.write !== undefined && w.write.exit !== 0 && w.again !== undefined;
  const CONDITIONS: Record<string, (w: Walk) => boolean> = {
    off: (w) => w.request.includes("on the current branch"),
    current: (w) => w.read(1).stdout.trim() === BRANCH,
    exists: (w) => w.read(2).exit === 0,
    "not clean": (w) => w.read(3).stdout.trim() !== "",
    created: (w) => w.write?.exit === 0,
    refused: (w) => failed(w) && said(w.again as Run[]) === said(w.first),
    changed: (w) => failed(w) && said(w.again as Run[]) !== said(w.first),
  };

  /**
   * Walks the Cases table on a fixture. The commands, the case order, the git
   * write, and the cells come from the Branch section. The reads run in order,
   * as the conditions need them, and a row with no git write whose condition
   * holds ends the walk. At the first row with a git write, the walk runs the
   * fourth and the fifth command once, runs the reads again after a result
   * that is not exit 0, and takes the first remaining row whose condition holds.
   * It returns the case, its cells, and every command it ran with what git printed.
   */
  function walk(f: Fixture, request = "build this plan") {
    const { commands, rows } = branchRule();
    const unknown = rows.find((r) => !(r.id in CONDITIONS));
    if (unknown) throw new Error(`no condition for the case ${unknown.id}`);
    const unfilled = commands.find((c) => /<[^>]*>/.test(c));
    if (unfilled) throw new Error(`a placeholder is left in ${unfilled}`);
    const ran: Run[] = [];
    const exec = (command: string): Run => {
      const r = f.sh(command);
      ran.push(r);
      return r;
    };
    const w: Walk = {
      request,
      first: [],
      read: (n) => {
        while (w.first.length < n) w.first.push(exec(commands[w.first.length]));
        return w.first[n - 1];
      },
    };
    const end = ({ id, reply, reason, command }: Row) => ({ id, reply, reason, command, ran, reads: w.first, write: w.write, again: w.again });
    for (const [i, row] of rows.entries()) {
      if (row.write === "none") {
        if (CONDITIONS[row.id](w)) return end(row);
        continue;
      }
      if (row.write !== commands[4]) throw new Error(`the git write of ${row.id} is not the fifth command`);
      w.read(4);
      w.write = exec(commands[4]);
      if (w.write.exit !== 0) w.again = commands.slice(0, 4).map(exec);
      const found = rows.slice(i).find((r) => CONDITIONS[r.id](w));
      if (!found) throw new Error("no case holds after the git write");
      return end(found);
    }
    throw new Error("no case holds");
  }

  /**
   * A git repository with one commit, which holds app.py and an ignore rule for
   * log files, an untracked plan directory with a spec, and an ignored log file.
   * Its core.hooksPath is a directory outside the working tree, so a hook set
   * elsewhere cannot change a result. git init picks the start branch.
   */
  function fixture() {
    const dir = tempDir();
    const hooks = tempDir();
    const env = { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "fixture@example.com", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "fixture@example.com", GIT_CONFIG_NOSYSTEM: "1" };
    const sh = (command: string): Run => {
      const p = Bun.spawnSync(["sh", "-c", command], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
      return { command, exit: p.exitCode, stdout: p.stdout.toString(), stderr: p.stderr.toString() };
    };
    const git = (...args: string[]): string => {
      const p = Bun.spawnSync(["git", "-c", "commit.gpgSign=false", ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
      expect(p.exitCode).toBe(0);
      return p.stdout.toString();
    };
    git("init", "-q");
    git("config", "core.hooksPath", hooks);
    writeFileSync(join(dir, ".gitignore"), "*.log\n");
    writeFileSync(join(dir, "app.py"), "print('hi')\n");
    git("add", ".gitignore", "app.py");
    git("commit", "-q", "-m", "init");
    mkdirSync(join(dir, PLAN_DIR), { recursive: true });
    writeFileSync(join(dir, PLAN), "---\ntitle: Branch rule fixture\n---\n\nbody\n");
    writeFileSync(join(dir, "app.log"), "a log line\n");
    return { dir, hooks, sh, git };
  }

  /** The app file modified, a second file staged, and a third file untracked, in a new directory. */
  function notClean(f: Fixture): void {
    writeFileSync(join(f.dir, "app.py"), "print('changed')\n");
    writeFileSync(join(f.dir, "lib.py"), "VALUE = 1\n");
    f.git("add", "lib.py");
    mkdirSync(join(f.dir, "notes"));
    writeFileSync(join(f.dir, "notes/todo.txt"), "later\n");
  }

  /** What "state as before" compares: every ref, and what the first, third, and fourth commands print. */
  function state(f: Fixture) {
    const { commands } = branchRule();
    return { refs: f.git("for-each-ref"), branch: f.sh(commands[0]).stdout, status: f.sh(commands[2]).stdout, head: f.sh(commands[3]).stdout };
  }

  /** Captures a baseline with the real capture script and returns the branch its manifest names. */
  function capture(f: Fixture): string | null {
    const baseline = join(tempDir(), "baseline");
    expect(run([PLAN, "--root", f.dir, "--output", baseline], f.dir).code).toBe(0);
    return require(VALIDATOR).verifySnapshot(baseline).manifest.repository.branch;
  }

  const commandsRan = (w: { ran: Run[] }) => w.ran.map((r) => r.command);

  test("branch rule: the section lists five commands and seven cases in order", () => {
    const { header, commands, rows } = branchRule();
    expect(header).toEqual(COLUMNS);
    expect(commands).toHaveLength(5);
    // The one write: no start point and no force flag.
    expect(commands[4]).toBe(`git switch -c ${BRANCH}`);
    expect(commands.slice(0, 4)).not.toContain(commands[4]);
    expect(rows.map((r) => r.id)).toEqual(["off", "current", "exists", "not clean", "created", "refused", "changed"]);
    expect(rows.map((r) => r.write)).toEqual(["none", "none", "none", "none", commands[4], commands[4], commands[4]]);
    expect(rows.map((r) => r.reply)).toEqual(["none", "none", "BLOCKED", "BLOCKED", "none", "BLOCKED", "CHECKPOINT"]);
  });

  test("branch rule: builds after creating a missing branch on a clean tree", () => {
    const { commands } = branchRule();
    const f = fixture();
    const before = state(f);
    expect(before.branch.trim()).not.toBe(BRANCH);
    const w = walk(f);
    expect(w.id).toBe("created");
    expect(w.reply).toBe("none");
    // The four reads in order, then the fifth command once.
    expect(commandsRan(w)).toEqual(commands);
    expect(w.write?.exit).toBe(0);
    const after = state(f);
    expect(after.branch).toBe(`${BRANCH}\n`);
    expect(after.head).toBe(before.head);
    expect(capture(f)).toBe(BRANCH);
  });

  test("branch rule: builds on the wanted branch with a modified file", () => {
    const { commands } = branchRule();
    const f = fixture();
    f.git("switch", "-c", BRANCH);
    writeFileSync(join(f.dir, "app.py"), "print('changed')\n");
    const before = state(f);
    const w = walk(f);
    expect(w.id).toBe("current");
    expect(w.reply).toBe("none");
    expect(commandsRan(w)).toEqual([commands[0]]);
    expect(state(f)).toEqual(before);
    expect(capture(f)).toBe(BRANCH);
  });

  test("branch rule: builds where it is on the current branch", () => {
    const f = fixture();
    writeFileSync(join(f.dir, "app.py"), "print('changed')\n");
    const before = state(f);
    const start = before.branch.trim();
    expect(start).not.toBe("");
    expect(start).not.toBe(BRANCH);
    const w = walk(f, "build this plan on the current branch");
    expect(w.id).toBe("off");
    expect(w.reply).toBe("none");
    expect(w.ran).toEqual([]);
    expect(state(f)).toEqual(before);
    expect(capture(f)).toBe(start);
  });

  test("branch rule: stops and writes nothing when a path is not clean", () => {
    const { commands } = branchRule();
    const f = fixture();
    notClean(f);
    const before = state(f);
    const w = walk(f);
    expect(w.id).toBe("not clean");
    expect(w.reply).toBe("BLOCKED");
    expect(commandsRan(w)).toEqual(commands.slice(0, 3));
    expect(w.write).toBeUndefined();
    const paths = w.reads[2].stdout.trimEnd().split("\n").map((line) => line.slice(3));
    // Each untracked file has its own line, not only its new directory.
    expect(paths).toEqual(["app.py", "lib.py", "notes/todo.txt"]);
    expect(paths.filter((p) => p.startsWith("docs/") || p.endsWith(".log"))).toEqual([]);
    expect(state(f)).toEqual(before);
  });

  test("branch rule: stops and never switches when the branch exists", () => {
    const { commands } = branchRule();
    const f = fixture();
    f.git("branch", BRANCH);
    const before = state(f);
    expect(before.branch.trim()).not.toBe(BRANCH);
    const w = walk(f);
    expect(w.id).toBe("exists");
    expect(w.reply).toBe("BLOCKED");
    expect(commandsRan(w)).toEqual(commands.slice(0, 2));
    expect(commandsRan(w).filter((c) => c.startsWith("git switch"))).toEqual([]);
    expect(state(f)).toEqual(before);
  });

  test("branch rule: builds after the owner runs the command a stop names", () => {
    const { commands } = branchRule();
    // A path is not clean: the owner's create takes the changes along.
    const a = fixture();
    notClean(a);
    const lines = state(a).status;
    const first = walk(a);
    expect(first.id).toBe("not clean");
    expect(a.sh(first.command).exit).toBe(0);
    const second = walk(a);
    expect(second.id).toBe("current");
    expect(commandsRan(second)).toEqual([commands[0]]);
    expect(second.write).toBeUndefined();
    expect(lines.trimEnd().split("\n")).toHaveLength(3);
    expect(a.sh(commands[2]).stdout).toBe(lines);
    expect(capture(a)).toBe(BRANCH);

    // The branch exists: the owner switches to it.
    const b = fixture();
    b.git("branch", BRANCH);
    const stop = walk(b);
    expect(stop.id).toBe("exists");
    expect(b.sh(stop.command).exit).toBe(0);
    const again = walk(b);
    expect(again.id).toBe("current");
    expect(commandsRan(again)).toEqual([commands[0]]);
    expect(again.write).toBeUndefined();
    expect(capture(b)).toBe(BRANCH);
  });

  test("branch rule: stops with BLOCKED when git refuses the create", () => {
    const { commands } = branchRule();
    const f = fixture();
    f.git("branch", "feat");
    const before = state(f);
    const w = walk(f);
    expect(w.id).toBe("refused");
    expect(w.reply).toBe("BLOCKED");
    // The reads, the fifth command once, and the reads again.
    expect(commandsRan(w)).toEqual([...commands, ...commands.slice(0, 4)]);
    const writes = w.ran.filter((r) => r.command === commands[4]);
    expect(writes).toHaveLength(1);
    expect(writes[0].exit).not.toBe(0);
    expect(state(f)).toEqual(before);
  });

  test("branch rule: stops with CHECKPOINT when a hook fails after the create", () => {
    const { commands } = branchRule();
    const f = fixture();
    writeFileSync(join(f.hooks, "post-checkout"), "#!/bin/sh\necho hook failed\nexit 1\n", { mode: 0o755 });
    const before = state(f);
    const w = walk(f);
    expect(w.id).toBe("changed");
    expect(w.reply).toBe("CHECKPOINT");
    expect(commandsRan(w)).toEqual([...commands, ...commands.slice(0, 4)]);
    const writes = w.ran.filter((r) => r.command === commands[4]);
    expect(writes).toHaveLength(1);
    expect(writes[0].exit).toBe(1);
    // Git created the branch and checked it out at the commit from before.
    expect(f.sh(commands[0]).stdout).toBe(`${BRANCH}\n`);
    expect(f.sh(commands[1]).exit).toBe(0);
    expect(f.sh(commands[3]).stdout).toBe(before.head);
    const again = walk(f);
    expect(again.id).toBe("current");
    expect(commandsRan(again)).toEqual([commands[0]]);
    expect(again.write).toBeUndefined();
  });

  const SKILL = join(repo, "skills/planning/plan-builder/SKILL.md");
  /** The verdict line of the skill's reply block for each Reply cell of the Cases table. */
  const VERDICTS: Record<string, string> = {
    BLOCKED: "PLAN-BUILD: BLOCKED (branch <branch>)",
    CHECKPOINT: "PLAN-BUILD: CHECKPOINT (<next todo>; git switch -c <branch> exited <code>)",
  };
  const PLACEHOLDER = /<[^<>\n]*>/;

  /** The one `markdown` block of the skill's Output format whose first line is the verdict. */
  function replyBlock(verdict: string): string {
    const text = readFileSync(SKILL, "utf8");
    const start = text.indexOf("\n## Output format\n");
    if (start === -1) throw new Error("the skill has no Output format section");
    const end = text.indexOf("\n## ", start + 1);
    const section = text.slice(start + 1, end === -1 ? undefined : end);
    const blocks = [...section.matchAll(/^```markdown\n([\s\S]*?)^```$/gm)].map((m) => m[1].trimEnd()).filter((b) => b.split("\n")[0] === verdict);
    if (blocks.length !== 1) throw new Error(`${blocks.length} markdown blocks of the Output format start with ${verdict}, not one`);
    return blocks[0];
  }

  /** How a reply names what the first command printed: the branch in backticks, or a detached HEAD. */
  const checkedOut = (read: Run) => (read.stdout.trim() === "" ? "a detached HEAD" : `\`${read.stdout.trim()}\``);
  /** The last line git printed. */
  const lastLine = (r: Run) =>
    `${r.stdout}\n${r.stderr}`
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .at(-1) ?? "";

  /**
   * The reply of a walk, composed as the coordinator composes it: the one
   * `markdown` block of the skill's Output format that starts with the verdict
   * line of the case's Reply cell, filled from the walk. The Reason cell goes in
   * first, so its own placeholders are filled with the rest. After a create
   * that fails, the second run of the reads gives the state now.
   */
  function reply(w: ReturnType<typeof walk>): string {
    const verdict = VERDICTS[w.reply];
    if (verdict === undefined) throw new Error(`the case ${w.id} has no reply block`);
    const now = w.again ?? w.reads;
    const paths = (now[2]?.stdout ?? "")
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => line.slice(3));
    const listed = paths.slice(0, 5).join(", ");
    const values: [string, string][] = [
      ["<reason>", w.reason],
      ["<command>", w.command],
      ["<: `<paths>`>", paths.length > 0 ? `: \`${listed}\`` : ""],
      ["<paths>", listed],
      ["<n>", String(paths.length)],
      ["<message>", w.write ? lastLine(w.write) : ""],
      ["<next todo>", "T0"],
      ["<code>", String(w.write?.exit)],
      ["<checked out before>", checkedOut(w.reads[0])],
      ["<start commit>", w.reads[3]?.stdout.trim() ?? ""],
      ["<checked out>", checkedOut(now[0])],
      ["<commit>", now[3]?.stdout.trim() ?? ""],
      ["<exists | does not exist>", now[1]?.exit === 0 ? "exists" : "does not exist"],
      ["<branch>", BRANCH],
      ["<plan path>", PLAN],
    ];
    return values.reduce((text, [key, value]) => text.replaceAll(key, () => value), replyBlock(verdict));
  }

  test("branch reply: BLOCKED names the branch, each path, and the command when a path is not clean", () => {
    const f = fixture();
    notClean(f);
    const start = f.git("branch", "--show-current").trim();
    expect(start).not.toBe("");
    const w = walk(f);
    expect(w.id).toBe("not clean");
    const text = reply(w);
    expect(text).not.toMatch(PLACEHOLDER);
    expect(text.split("\n")[0]).toBe(`PLAN-BUILD: BLOCKED (branch ${BRANCH})`);
    expect(text).toContain(`\`${start}\``);
    expect(text).toMatch(/\b3`? paths\b/);
    for (const path of ["app.py", "lib.py", "notes/todo.txt"]) expect(text).toContain(path);
    expect(text).toContain(`git switch -c ${BRANCH}`);
    expect(text).toContain("on the current branch");
    expect(text).toEndWith("Nothing was changed.");
  });

  test("branch reply: BLOCKED names git switch when the branch exists", () => {
    const f = fixture();
    f.git("branch", BRANCH);
    const w = walk(f);
    expect(w.id).toBe("exists");
    const text = reply(w);
    expect(text).not.toMatch(PLACEHOLDER);
    expect(text.split("\n")[0]).toBe(`PLAN-BUILD: BLOCKED (branch ${BRANCH})`);
    expect(text).toContain("It already exists.");
    expect(text).toContain(`git switch ${BRANCH}`);
    expect(text).not.toContain("git switch -c");
    expect(text).toEndWith("Nothing was changed.");
  });

  test("branch reply: BLOCKED carries git's message when git refuses the create", () => {
    const f = fixture();
    f.git("branch", "feat");
    const w = walk(f);
    expect(w.id).toBe("refused");
    // The last line git printed, read here without the helper the reply uses.
    const printed = `${w.write?.stdout ?? ""}${w.write?.stderr ?? ""}`.trimEnd().split("\n").at(-1)?.trim() ?? "";
    expect(printed).not.toBe("");
    const text = reply(w);
    expect(text).not.toMatch(PLACEHOLDER);
    expect(text.split("\n")[0]).toBe(`PLAN-BUILD: BLOCKED (branch ${BRANCH})`);
    expect(text).toContain(printed);
    expect(text).toEndWith("Nothing was changed.");
  });

  test("branch reply: CHECKPOINT says the branch was created when a hook fails", () => {
    const f = fixture();
    writeFileSync(join(f.hooks, "post-checkout"), "#!/bin/sh\necho hook failed\nexit 1\n", { mode: 0o755 });
    const start = f.git("branch", "--show-current").trim();
    expect(start).not.toBe("");
    const w = walk(f);
    expect(w.id).toBe("changed");
    const text = reply(w);
    expect(text).not.toMatch(PLACEHOLDER);
    expect(text.split("\n")[0]).toBe(`PLAN-BUILD: CHECKPOINT (T0; git switch -c ${BRANCH} exited 1)`);
    expect(text).toContain("hook failed");
    expect(text).toContain(`\`${start}\``);
    expect(text).toContain(`\`${BRANCH}\` exists`);
    expect(text).not.toContain("does not exist");
    expect(text).not.toContain("Nothing was changed");
  });
});
