/**
 * Cross-host capability matrix for the six planning personas, per D6. This
 * goes beyond `validate.ts`'s generic AGENT_WRAPPERS shape check: it asserts
 * the actual semantics each host needs — OpenCode mode and effective
 * delegation, Claude Code's question-routing and subagent-restriction text,
 * and Cursor's readonly flag and depth-limit fallback. The last describe
 * checks every directory under `agents/`, planning or not, against the Launch
 * table: its OpenCode mode and the exact set of agents it may launch.
 */
import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_WRAPPERS, type PermissionRule, parseFrontmatter } from "./validate.ts";

const repo = join(import.meta.dir, "..");

const PERSONAS = ["plan-writer", "plan-reviewer", "plan-scout", "plan-builder", "plan-loop", "plan-result-reviewer"] as const;
type Persona = (typeof PERSONAS)[number];

// D6's table, restated as test fixtures: the OpenCode mode and the exact set
// of other planning personas each may launch as a subagent.
const EXPECTED_MODE: Record<Persona, string> = {
  "plan-writer": "all",
  "plan-reviewer": "all",
  "plan-scout": "subagent",
  "plan-builder": "all",
  "plan-loop": "primary",
  "plan-result-reviewer": "subagent",
};

const EXPECTED_DELEGATES: Record<Persona, Persona[]> = {
  "plan-writer": ["plan-scout"],
  "plan-reviewer": ["plan-scout"],
  "plan-scout": [],
  "plan-builder": ["plan-builder", "plan-result-reviewer", "plan-writer", "plan-reviewer"],
  "plan-loop": ["plan-writer", "plan-reviewer"],
  "plan-result-reviewer": ["plan-scout"],
};

// The Launch table: for each directory under agents/, its OpenCode mode and
// the exact set of agents it may launch. The six planning rows are the
// fixtures above; tech-writer and ui-engineer launch no agent.
type LaunchRow = { mode: string; launches: readonly string[] };

const LAUNCH_TABLE: ReadonlyMap<string, LaunchRow> = new Map<string, LaunchRow>([
  ...PERSONAS.map((persona): [string, LaunchRow] => [persona, { mode: EXPECTED_MODE[persona], launches: EXPECTED_DELEGATES[persona] }]),
  ["tech-writer", { mode: "subagent", launches: [] }],
  ["ui-engineer", { mode: "subagent", launches: [] }],
]);

function readWrapper(persona: string, file: string): string {
  return readFileSync(join(repo, "agents", persona, file), "utf8");
}

function frontmatterOf(persona: string, file: string) {
  const text = readWrapper(persona, file);
  const fm = parseFrontmatter(text.split(/\r?\n/), { permissionList: file === "opencode.md" });
  expect({ persona, file, problems: fm.problems }).toEqual({ persona, file, problems: [] });
  return fm;
}

/** Evaluates the rules as OpenCode does (https://opencode.ai/docs/permissions/):
 * walk them in order and keep the effect of the last rule whose action equals
 * `action` and whose resource pattern matches `resource`. Order decides, so a
 * "*" rule after an exact one wins. With no matching rule the answer is
 * "allow", OpenCode's base policy. */
function effect(rules: PermissionRule[], action: string, resource: string): string {
  let result = "allow";
  for (const r of rules) {
    if (r.action === action && resourceMatches(r.resource, resource)) result = r.effect;
  }
  return result;
}

/** Matches a whole resource against an OpenCode pattern: "*" is any run of
 * characters, "/" included, "?" is one character, and every other character
 * stands for itself. */
function resourceMatches(pattern: string, resource: string): boolean {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${source}$`, "s").test(resource);
}

/** Lists the agent directories under `agentsRoot`, sorted. Like validate.ts,
 * it counts every entry that is a directory as a persona. */
function listAgentDirs(agentsRoot: string): string[] {
  return readdirSync(agentsRoot)
    .filter((name) => statSync(join(agentsRoot, name), { throwIfNoEntry: false })?.isDirectory() === true)
    .sort();
}

/** Checks the OpenCode file of one agent directory under `agentsRoot` against
 * its Launch table row, and returns each difference as a line that names the
 * agent; an empty list means it matches. "mode" compares the mode. "launch"
 * wants a first `subagent` rule that denies "*", allow for each agent in the
 * row, and deny for every other agent directory or row and for "general", a
 * name no row lists. A directory without a row gets one line that says so,
 * for either part. */
function launchTableDifferences(agentsRoot: string, persona: string, part: "mode" | "launch"): string[] {
  const row = LAUNCH_TABLE.get(persona);
  if (row === undefined) return [`${persona}: no Launch table row`];
  const text = readFileSync(join(agentsRoot, persona, "opencode.md"), "utf8");
  const fm = parseFrontmatter(text.split(/\r?\n/), { permissionList: true });
  if (fm.problems.length > 0) return fm.problems.map((p) => `${persona}: opencode.md line ${p.line}: ${p.message}`);
  if (part === "mode") return fm.top.mode === row.mode ? [] : [`${persona}: mode is ${fm.top.mode ?? "unset"}, not ${row.mode}`];
  const differences: string[] = [];
  const first = fm.permissions.find((r) => r.action === "subagent");
  if (first?.resource !== "*" || first.effect !== "deny") {
    differences.push(`${persona}: the first subagent rule is not a deny on "*"`);
  }
  const names = new Set([...row.launches, ...listAgentDirs(agentsRoot), ...LAUNCH_TABLE.keys(), "general"]);
  for (const name of names) {
    const expected = row.launches.includes(name) ? "allow" : "deny";
    const actual = effect(fm.permissions, "subagent", name);
    if (actual !== expected) differences.push(`${persona}: subagent ${name} is ${actual}, not ${expected}`);
  }
  return differences;
}

describe("planning agents: OpenCode mode and delegation", () => {
  for (const persona of PERSONAS) {
    test(`${persona}/opencode.md has mode: ${EXPECTED_MODE[persona]}`, () => {
      const fm = frontmatterOf(persona, "opencode.md");
      expect(fm.top.mode).toBe(EXPECTED_MODE[persona]);
    });

    test(`${persona}/opencode.md model uses provider/model[#variant] syntax, with no separate reasoningEffort`, () => {
      const fm = frontmatterOf(persona, "opencode.md");
      expect(fm.top.model).toMatch(/^[a-z0-9.-]+\/[a-z0-9.-]+(#[a-z0-9]+)?$/);
      expect("reasoningEffort" in fm.top).toBe(false);
    });

    test(`${persona}/opencode.md delegates exactly to ${JSON.stringify(EXPECTED_DELEGATES[persona])}`, () => {
      const fm = frontmatterOf(persona, "opencode.md");
      const denyAll = effect(fm.permissions, "subagent", "*");
      expect({ persona, denyAll }).toEqual({ persona, denyAll: "deny" });
      for (const other of PERSONAS) {
        const allowed = effect(fm.permissions, "subagent", other) === "allow";
        const shouldAllow = EXPECTED_DELEGATES[persona].includes(other);
        expect({ persona, other, allowed }).toEqual({ persona, other, allowed: shouldAllow });
      }
      // No rule grants "subagent" on "*": the repository parser rejects a bare
      // wildcard action anyway, and an ungated allow would defeat every
      // per-persona restriction the loop above just checked.
      const wildcardAllow = fm.permissions.some((r) => r.action === "subagent" && r.resource === "*" && r.effect === "allow");
      expect(wildcardAllow).toBe(false);
    });

    test(`${persona}/opencode.md skill permission allows only its own skill`, () => {
      const fm = frontmatterOf(persona, "opencode.md");
      expect(effect(fm.permissions, "skill", "*")).toBe("deny");
      const ownSkillResource = persona === "plan-result-reviewer" ? "plan-result-review" : persona === "plan-reviewer" ? "plan-review" : persona;
      expect(effect(fm.permissions, "skill", ownSkillResource)).toBe("allow");
    });
  }

  test("plan-scout has no write, shell, or delegation capability", () => {
    const fm = frontmatterOf("plan-scout", "opencode.md");
    expect(effect(fm.permissions, "edit", "*")).toBe("deny");
    expect(effect(fm.permissions, "shell", "*")).toBe("deny");
    expect(effect(fm.permissions, "subagent", "*")).toBe("deny");
    expect(effect(fm.permissions, "question", "*")).toBe("deny");
  });

  test("plan-writer and plan-reviewer restrict native edits to docs/plans/*", () => {
    for (const persona of ["plan-writer", "plan-reviewer"] as const) {
      const fm = frontmatterOf(persona, "opencode.md");
      expect(effect(fm.permissions, "edit", "*")).toBe("deny");
      expect(effect(fm.permissions, "edit", "docs/plans/*")).toBe("allow");
    }
  });

  test("plan-builder allows native edits anywhere (it implements the plan, not just the plan file)", () => {
    const fm = frontmatterOf("plan-builder", "opencode.md");
    expect(effect(fm.permissions, "edit", "*")).toBe("allow");
  });

  test("plan-builder may run record-receipt.ts, and its Claude Code and Cursor personas name it", () => {
    const fm = frontmatterOf("plan-builder", "opencode.md");
    expect(effect(fm.permissions, "shell", "bun */record-receipt.ts *")).toBe("allow");
    for (const file of ["claude-code.md", "cursor.md"]) {
      expect({ file, names: readWrapper("plan-builder", file).includes("`record-receipt.ts`") }).toEqual({ file, names: true });
    }
  });

  test("plan-builder child launches no agent: each file states it", () => {
    // OpenCode's rules are per agent and cannot tell the coordinator from its
    // child, and a host may allow deeper launches, so the prompt holds the
    // rule: as the agent's own, not as a claim about the host.
    for (const file of AGENT_WRAPPERS) {
      const body = readWrapper("plan-builder", file);
      const states = body.includes("A child launches no agent");
      const hostClaim = body.includes("cannot launch children");
      expect({ file, states, hostClaim }).toEqual({ file, states: true, hostClaim: false });
    }
  });

  test("plan-loop never edits natively", () => {
    const fm = frontmatterOf("plan-loop", "opencode.md");
    expect(effect(fm.permissions, "edit", "*")).toBe("deny");
  });

  test("a wrapper with a broad shell:ask rule states it is not a filesystem sandbox", () => {
    for (const persona of PERSONAS) {
      const fm = frontmatterOf(persona, "opencode.md");
      if (effect(fm.permissions, "shell", "*") !== "ask") continue;
      const body = readWrapper(persona, "opencode.md");
      expect({ persona, hasSandboxCaveat: body.includes("not a filesystem sandbox") }).toEqual({ persona, hasSandboxCaveat: true });
    }
  });
});

describe("planning agents: Claude Code question routing and subagent restriction", () => {
  for (const persona of PERSONAS) {
    test(`${persona}/claude-code.md never lists a Question tool (Claude Code has none)`, () => {
      const fm = frontmatterOf(persona, "claude-code.md");
      const tools = (fm.top.tools ?? "").split(",").map((t) => t.trim());
      expect(tools).not.toContain("Question");
    });

    test(`${persona}/claude-code.md routes an owner question to the parent, never asks directly`, () => {
      const body = readWrapper(persona, "claude-code.md");
      const routesQuestion = /cannot ask (the owner|the user)/.test(body);
      expect({ persona, routesQuestion }).toEqual({ persona, routesQuestion: true });
    });

    test(`${persona} names every agent in its row`, () => {
      const expected = EXPECTED_DELEGATES[persona];
      // Claude Code and Cursor hold the launch rule in the prompt only, so
      // every file names each agent its OpenCode rules allow.
      for (const file of AGENT_WRAPPERS) {
        const body = readWrapper(persona, file);
        const missing = expected.filter((other) => !body.includes(`\`${other}\``));
        expect({ persona, file, missing }).toEqual({ persona, file, missing: [] });
      }
      const body = readWrapper(persona, "claude-code.md");
      if (expected.length === 0) {
        expect(body.includes("Agent")).toBe(false);
        return;
      }
      // Claude Code enforces no subagent type list inside a subagent: the
      // wrapper's own prose must hold that restriction instead.
      expect(body.includes("does not enforce a subagent type list")).toBe(true);
    });
  }
});

describe("planning agents: Cursor readonly and depth-limit fallback", () => {
  const EXPECTED_READONLY: Record<Persona, boolean> = {
    "plan-writer": false,
    "plan-reviewer": false,
    "plan-scout": true,
    "plan-builder": false,
    "plan-loop": true,
    "plan-result-reviewer": false,
  };

  for (const persona of PERSONAS) {
    test(`${persona}/cursor.md readonly is ${EXPECTED_READONLY[persona]}`, () => {
      const fm = frontmatterOf(persona, "cursor.md");
      expect(fm.top.readonly).toBe(String(EXPECTED_READONLY[persona]));
    });

    test(`${persona}/cursor.md states the depth-limit fallback whenever it delegates`, () => {
      const body = readWrapper(persona, "cursor.md");
      const delegates = EXPECTED_DELEGATES[persona].length > 0;
      expect({ persona, delegates, hasFallback: body.includes("third level") }).toEqual({ persona, delegates, hasFallback: delegates });
    });
  }
});

describe("planning agents: mutation detection", () => {
  function withMutated<T>(persona: string, file: string, mutate: (text: string) => string, run: (dir: string) => T): T {
    const dir = mkdtempSync(join(tmpdir(), "planning-agents-mut-"));
    try {
      writeFileSync(join(dir, file), mutate(readWrapper(persona, file)));
      return run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  test("a primary-only OpenCode writer fixture is detected", () => {
    withMutated("plan-writer", "opencode.md", (t) => t.replace("mode: all", "mode: primary"), (dir) => {
      const fm = parseFrontmatter(readFileSync(join(dir, "opencode.md"), "utf8").split(/\r?\n/), { permissionList: true });
      expect(fm.top.mode).not.toBe("all");
    });
  });

  test("a shell-denied reviewer fixture (no ask, no read-only allowlist) is detected as over-restricted", () => {
    withMutated("plan-reviewer", "opencode.md", (t) => t.replace(/- action: shell\n\s*resource: "\*"\n\s*effect: ask/, '- action: shell\n    resource: "*"\n    effect: deny'), (dir) => {
      const fm = parseFrontmatter(readFileSync(join(dir, "opencode.md"), "utf8").split(/\r?\n/), { permissionList: true });
      expect(effect(fm.permissions, "shell", "*")).toBe("deny");
      // A reviewer that can never even ask to run a probe cannot satisfy D3's
      // "run the real integration path in a disposable fixture" requirement.
      expect(effect(fm.permissions, "shell", "*")).not.toBe("ask");
    });
  });

  test("a claude-code wrapper missing the question-routing sentence is detected", () => {
    withMutated("plan-writer", "claude-code.md", (t) => t.replace(/You cannot ask the owner a question here[^.]*\.\s*/, ""), (dir) => {
      const body = readFileSync(join(dir, "claude-code.md"), "utf8");
      expect(/cannot ask (the owner|the user)/.test(body)).toBe(false);
    });
  });

  test("a cursor wrapper missing the depth-limit fallback is detected", () => {
    withMutated("plan-loop", "cursor.md", (t) => t.replace(/ A subagent launched by another subagent cannot launch a third level[^.]*\./, ""), (dir) => {
      const body = readFileSync(join(dir, "cursor.md"), "utf8");
      expect(body.includes("third level")).toBe(false);
    });
  });

  test("rule order: a deny on * after the allows denies the launch", () => {
    const denyAll = '  - action: subagent\n    resource: "*"\n    effect: deny\n';
    const lastAllow = '  - action: subagent\n    resource: "plan-reviewer"\n    effect: allow\n';
    withMutated("plan-loop", "opencode.md", (t) => t.replace(denyAll, "").replace(lastAllow, lastAllow + denyAll), (dir) => {
      const fm = parseFrontmatter(readFileSync(join(dir, "opencode.md"), "utf8").split(/\r?\n/), { permissionList: true });
      expect(fm.problems).toEqual([]);
      // The copy really moved the deny: it is now the last subagent rule.
      const order = fm.permissions.filter((r) => r.action === "subagent").map((r) => `${r.resource} ${r.effect}`);
      expect(order).toEqual(["plan-writer allow", "plan-reviewer allow", "* deny"]);
      // OpenCode takes the last matching rule, so the later "*" deny wins.
      expect(effect(fm.permissions, "subagent", "plan-writer")).toBe("deny");
    });
  });

  test("a plan-builder file without the plan-writer rule is detected", () => {
    const writerRule = '  - action: subagent\n    resource: "plan-writer"\n    effect: allow\n';
    withMutated("plan-builder", "opencode.md", (t) => t.replace(writerRule, ""), (dir) => {
      const fm = parseFrontmatter(readFileSync(join(dir, "opencode.md"), "utf8").split(/\r?\n/), { permissionList: true });
      expect(fm.problems).toEqual([]);
      // The copy really lost that one rule.
      const order = fm.permissions.filter((r) => r.action === "subagent").map((r) => `${r.resource} ${r.effect}`);
      expect(order).toEqual(["* deny", "plan-builder allow", "plan-result-reviewer allow", "plan-reviewer allow"]);
      // The "*" deny now decides the writer, so the launch set misses an agent
      // of plan-builder's row, which the delegation test reports.
      expect(effect(fm.permissions, "subagent", "plan-writer")).toBe("deny");
      const launches = PERSONAS.filter((other) => effect(fm.permissions, "subagent", other) === "allow");
      const missing = EXPECTED_DELEGATES["plan-builder"].filter((other) => !launches.includes(other));
      expect(missing).toEqual(["plan-writer"]);
    });
  });
});

describe("every persona: mode and launch set", () => {
  const agentsRoot = join(repo, "agents");

  // One pair of tests per directory, not per row, so a new persona without a
  // row fails both by name instead of going unchecked.
  for (const persona of listAgentDirs(agentsRoot)) {
    test(`${persona}/opencode.md mode matches the Launch table`, () => {
      expect(launchTableDifferences(agentsRoot, persona, "mode")).toEqual([]);
    });

    test(`${persona}/opencode.md launch set matches the Launch table`, () => {
      expect(launchTableDifferences(agentsRoot, persona, "launch")).toEqual([]);
    });
  }

  test("a persona directory with no table row is reported", () => {
    const root = mkdtempSync(join(tmpdir(), "planning-agents-root-"));
    try {
      for (const persona of listAgentDirs(agentsRoot)) {
        cpSync(join(agentsRoot, persona), join(root, persona), { recursive: true });
      }
      // A complete persona under a new name: valid files, but no row.
      cpSync(join(agentsRoot, "plan-scout"), join(root, "new-persona"), { recursive: true });
      const listed = listAgentDirs(root);
      expect(listed).toEqual([...listAgentDirs(agentsRoot), "new-persona"].sort());
      // Each listed directory gets a mode test and a launch test. Only the new
      // one's report a missing row, and they name it.
      const noRow = listed
        .flatMap((persona) => [...launchTableDifferences(root, persona, "mode"), ...launchTableDifferences(root, persona, "launch")])
        .filter((line) => line.endsWith(": no Launch table row"));
      expect(noRow).toEqual(["new-persona: no Launch table row", "new-persona: no Launch table row"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
