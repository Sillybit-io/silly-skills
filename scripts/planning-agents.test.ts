/**
 * Cross-host capability matrix for the six planning personas, per D6. This
 * goes beyond `validate.ts`'s generic AGENT_WRAPPERS shape check: it asserts
 * the actual semantics each host needs — OpenCode mode and effective
 * delegation, Claude Code's question-routing and subagent-restriction text,
 * and Cursor's readonly flag and depth-limit fallback.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PermissionRule, parseFrontmatter } from "./validate.ts";

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
  "plan-loop": "all",
  "plan-result-reviewer": "subagent",
};

const EXPECTED_DELEGATES: Record<Persona, Persona[]> = {
  "plan-writer": ["plan-scout"],
  "plan-reviewer": ["plan-scout"],
  "plan-scout": [],
  "plan-builder": ["plan-result-reviewer"],
  "plan-loop": ["plan-writer", "plan-reviewer"],
  "plan-result-reviewer": ["plan-scout"],
};

function readWrapper(persona: string, file: string): string {
  return readFileSync(join(repo, "agents", persona, file), "utf8");
}

function frontmatterOf(persona: string, file: string) {
  const text = readWrapper(persona, file);
  const fm = parseFrontmatter(text.split(/\r?\n/), { permissionList: file === "opencode.md" });
  expect({ persona, file, problems: fm.problems }).toEqual({ persona, file, problems: [] });
  return fm;
}

/** Last matching rule wins; an exact resource match outranks a "*" fallback
 * regardless of order, matching how every wrapper here is actually written
 * (a "*" deny baseline, then specific-resource exceptions). */
function effect(rules: PermissionRule[], action: string, resource: string): string | null {
  let wildcard: string | null = null;
  let exact: string | null = null;
  for (const r of rules) {
    if (r.action !== action) continue;
    if (r.resource === resource) exact = r.effect;
    else if (r.resource === "*") wildcard = r.effect;
  }
  return exact ?? wildcard;
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

    test(`${persona}/claude-code.md's delegation matches opencode.md's`, () => {
      const body = readWrapper(persona, "claude-code.md");
      const expected = EXPECTED_DELEGATES[persona];
      if (expected.length === 0) {
        expect(body.includes("Agent")).toBe(false);
        return;
      }
      for (const other of expected) expect(body.includes(`\`${other}\``)).toBe(true);
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
});
