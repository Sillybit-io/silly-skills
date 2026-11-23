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
 *
 * The two `reviewed replies` tests check that the approved replies of
 * plan-review and plan-loop tell the owner to start the build in a new session.
 *
 * The two `plan-writer` tests find the writer's step for a plan under build by
 * its bold label and check that it names what keeps a built todo as built.
 *
 * The two `plan-builder` tests find the coordinator's plan-change step the same
 * way and check that it names the writer, the reviewer, the block and amend
 * receipts, and the checkpoint.
 *
 * Two more `plan-builder` tests find the new-build step by its label and check
 * that it reaches the Branch section before the baseline, and check that each
 * reply block of a branch stop is found once in the skill and not in a copy
 * without it.
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
      const agentBadge =
        personas.length > 0
          ? `![Agents: ${personas.length}](https://img.shields.io/badge/agents-${personas.length}-blue)\n`
          : "";
      writeFileSync(
        join(root, "README.md"),
        `# Catalogue\n\n![Skills: 1](https://img.shields.io/badge/skills-1-blue)\n${agentBadge}`,
      );

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

/** The reply a skill gives when a plan is approved, by the verdict line it starts with. */
const REVIEWED_REPLIES = [
  { skill: "plan-review", verdict: "PLAN-REVIEW: OKAY" },
  { skill: "plan-loop", verdict: "PLAN-LOOP: REVIEWED" },
];

/** The top-level fenced blocks of a markdown text, each with its info string. */
function fencedBlocks(text: string): { info: string; lines: string[] }[] {
  const out: { info: string; lines: string[] }[] = [];
  let open: { fence: string; info: string; lines: string[] } | null = null;
  for (const line of text.split("\n")) {
    const f = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (!open) {
      if (f) open = { fence: f[1], info: f[2].trim(), lines: [] };
    } else if (f && f[1][0] === open.fence[0] && f[1].length >= open.fence.length && f[2].trim() === "") {
      out.push({ info: open.info, lines: open.lines });
      open = null;
    } else {
      open.lines.push(line);
    }
  }
  return out;
}

/** The `markdown` blocks of a text whose first line is the verdict. */
function replyBlocks(text: string, verdict: string): string[] {
  return fencedBlocks(text)
    .filter((b) => b.info === "markdown" && b.lines[0] === verdict)
    .map((b) => b.lines.join("\n"));
}

/** The one `markdown` block of the skill's SKILL.md whose first line is the verdict. */
function replyBlock(skill: string, verdict: string): string {
  const found = locate(skill);
  if (!found) throw new Error(`${skill}: no SKILL.md found`);
  const blocks = replyBlocks(readFileSync(join(found.dir, "SKILL.md"), "utf8"), verdict);
  if (blocks.length !== 1) throw new Error(`${skill}: ${blocks.length} markdown blocks start with ${verdict}, expected 1`);
  return blocks[0];
}

function reviewedReplies(): Map<string, string> {
  return new Map(REVIEWED_REPLIES.map(({ skill, verdict }) => [skill, replyBlock(skill, verdict)]));
}

/** The skills whose reply does not tell the owner to start the build in a new session. */
function missingNewSession(replies: Map<string, string>): string[] {
  return [...replies].filter(([, block]) => !block.includes("new session")).map(([skill]) => skill);
}

/** A copy of the block that ends before its last sentence. */
function withoutLastSentence(block: string): string {
  const text = block.trimEnd();
  const ends = [...text.matchAll(/[.!?]\s+(?=\S)/g)];
  const last = ends.at(-1);
  return last === undefined ? "" : text.slice(0, (last.index ?? 0) + 1);
}

test("reviewed replies: the OKAY reply of plan-review and the REVIEWED reply of plan-loop say to start the build in a new session", () => {
  expect(missingNewSession(reviewedReplies())).toEqual([]);
});

test("reviewed replies: the check reports a copy of each reply without its last sentence as a miss", () => {
  const replies = reviewedReplies();
  const cut = new Map([...replies].map(([skill, block]) => [skill, withoutLastSentence(block)]));
  for (const [skill, copy] of cut) {
    // The copy keeps the verdict line and the reply up to its last sentence.
    const whole = replies.get(skill) ?? "";
    expect({ skill, cut: copy.includes("\n") && whole.startsWith(copy) && copy.length < whole.length }).toEqual({ skill, cut: true });
  }
  expect(missingNewSession(cut)).toEqual(["plan-review", "plan-loop"]);
});

/** A numbered Workflow step that a test finds by its bold label, with the step number and the names it must hold. */
type LabelledStep = { skill: string; number: number; label: string; names: string[] };

/** plan-writer's step for a change to a plan that is being built. */
const UNDER_BUILD_STEP: LabelledStep = {
  skill: "plan-writer",
  number: 23,
  label: "Change under build.",
  names: ["`References`", "`PASSED_TODO_CHANGED`", "`status: planned`"],
};

function skillText(skill: string): string {
  const found = locate(skill);
  if (!found) throw new Error(`${skill}: no SKILL.md found`);
  return readFileSync(join(found.dir, "SKILL.md"), "utf8");
}

/** The numbered steps of the `## Workflow` section. A step runs on over its indented lines. */
function workflowSteps(text: string): { number: number; text: string }[] {
  const steps: { number: number; text: string }[] = [];
  let inWorkflow = false;
  let current: { number: number; text: string } | null = null;
  for (const line of text.split("\n")) {
    if (/^## /.test(line)) {
      inWorkflow = line.slice(3).trim() === "Workflow";
      current = null;
      continue;
    }
    if (!inWorkflow) continue;
    const item = /^(\d+)\. (.*)$/.exec(line);
    if (item) {
      current = { number: Number(item[1]), text: item[2] };
      steps.push(current);
    } else if (current && /^\s+\S/.test(line)) {
      current.text += `\n${line.trim()}`;
    } else if (line.trim() !== "") {
      current = null;
    }
  }
  return steps;
}

/** What the text lacks of the step: the step itself, its number, and each name the step does not hold. */
function stepGaps(text: string, step: LabelledStep): string[] {
  const found = workflowSteps(text).find((s) => s.text.startsWith(`**${step.label}**`));
  if (!found) return [`no Workflow step starts with **${step.label}**`];
  const gaps = found.number === step.number ? [] : [`**${step.label}** is step ${found.number}, not ${step.number}`];
  return [...gaps, ...step.names.filter((name) => !found.text.includes(name)).map((name) => `step ${found.number} does not name ${name}`)];
}

/** A copy of the text without the numbered step that starts with the label. */
function withoutStep(text: string, label: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^\d+\. /.test(line) && line.replace(/^\d+\. /, "").startsWith(`**${label}**`));
  if (start < 0) return text;
  let end = start + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) end++;
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n");
}

test("plan-writer: the under-build step keeps done todos, ids, and boxes", () => {
  expect(stepGaps(skillText(UNDER_BUILD_STEP.skill), UNDER_BUILD_STEP)).toEqual([]);
});

test("plan-writer: a copy without the under-build step is reported", () => {
  const text = skillText(UNDER_BUILD_STEP.skill);
  const copy = withoutStep(text, UNDER_BUILD_STEP.label);
  // The copy drops that one step and keeps every other step.
  const numbers = (t: string) => workflowSteps(t).map((s) => s.number);
  expect(numbers(text)).toContain(UNDER_BUILD_STEP.number);
  expect(numbers(copy)).toEqual(numbers(text).filter((n) => n !== UNDER_BUILD_STEP.number));
  expect(stepGaps(copy, UNDER_BUILD_STEP)).toEqual([`no Workflow step starts with **${UNDER_BUILD_STEP.label}**`]);
});

/** plan-builder's step for a plan change that the owner asks for during a build. */
const PLAN_CHANGE_STEP: LabelledStep = {
  skill: "plan-builder",
  number: 10,
  label: "Plan change.",
  names: ["plan-writer", "plan-reviewer", "--event block", "--event amend", "CHECKPOINT"],
};

test("plan-builder: the plan-change step names the writer, the reviewer, the amend receipt, and the checkpoint", () => {
  expect(stepGaps(skillText(PLAN_CHANGE_STEP.skill), PLAN_CHANGE_STEP)).toEqual([]);
});

test("plan-builder: a copy without the plan-change step is reported", () => {
  const text = skillText(PLAN_CHANGE_STEP.skill);
  const copy = withoutStep(text, PLAN_CHANGE_STEP.label);
  // The copy drops that one step, with its indented parts, and keeps every other step.
  const numbers = (t: string) => workflowSteps(t).map((s) => s.number);
  expect(numbers(text)).toContain(PLAN_CHANGE_STEP.number);
  expect(numbers(copy)).toEqual(numbers(text).filter((n) => n !== PLAN_CHANGE_STEP.number));
  expect(stepGaps(copy, PLAN_CHANGE_STEP)).toEqual([`no Workflow step starts with **${PLAN_CHANGE_STEP.label}**`]);
});

/** plan-builder's step for a new build, which checks the branch before the baseline. */
const NEW_BUILD_STEP: LabelledStep = {
  skill: "plan-builder",
  number: 2,
  label: "New build",
  names: ["Branch section", "--todo T0"],
};

/** The verdict lines of plan-builder's two reply blocks for a stop of the branch rule. */
const BRANCH_REPLIES = ["PLAN-BUILD: BLOCKED (branch <branch>)", "PLAN-BUILD: CHECKPOINT (<next todo>; git switch -c <branch> exited <code>)"];

/** A copy of the text without the `markdown` block whose first line is the verdict. */
function withoutReplyBlock(text: string, verdict: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((line, i) => line === "```markdown" && lines[i + 1] === verdict);
  const end = start < 0 ? -1 : lines.indexOf("```", start + 1);
  if (end < 0) return text;
  return [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
}

test("plan-builder: the new-build step checks the branch before the baseline", () => {
  const text = skillText(NEW_BUILD_STEP.skill);
  expect(stepGaps(text, NEW_BUILD_STEP)).toEqual([]);
  const step = workflowSteps(text).find((s) => s.text.startsWith(`**${NEW_BUILD_STEP.label}**`))?.text ?? "";
  const branch = step.indexOf("Branch section");
  // The step reaches the Branch section before the baseline and before it writes the build file.
  expect(step.indexOf("capture-build-state.ts")).toBeGreaterThan(branch);
  expect(step.indexOf("`<stem>.build.md`")).toBeGreaterThan(branch);
});

test("plan-builder: a copy without a branch reply block is reported", () => {
  const text = skillText("plan-builder");
  for (const verdict of BRANCH_REPLIES) {
    const copy = withoutReplyBlock(text, verdict);
    // The copy drops that one block and keeps every other fenced block.
    expect({ verdict, blocks: fencedBlocks(copy).length }).toEqual({ verdict, blocks: fencedBlocks(text).length - 1 });
    expect({ verdict, skill: replyBlocks(text, verdict).length, copy: replyBlocks(copy, verdict).length }).toEqual({ verdict, skill: 1, copy: 0 });
  }
});
