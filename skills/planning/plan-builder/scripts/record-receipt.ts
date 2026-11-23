#!/usr/bin/env bun
/**
 * record-receipt — records one plan-builder receipt in one call. It reads the
 * plan and the build record, checks the call against them, captures the
 * after-snapshot, appends the receipt to <stem>.build.md, sets the box of a
 * passed todo, and runs the validator's resume check. With `--event amend`
 * it records an approved plan change instead: the new approval, with every
 * Done final gate box set back to Open. `--help` prints the arguments, the
 * printed line, and the exit codes.
 *
 * Every refusal, the receipt order rules of the resume check among them, is
 * checked before the capture, so a refused call writes nothing. The script
 * never runs a command taken from a check, a plan, or an argument: every
 * argument is data. The only processes it starts are git commands with fixed
 * arguments, through the validator and capture-build-state.ts and to resolve
 * --commit. Parsing, digests, the todo digest, the required check ids, the
 * ignored-directory check, the state inventory, the review and resume
 * checks, and the first three refusals of an amend come from the plan-review
 * validator installed beside this skill
 * (`../../plan-review/scripts/validate-plan.ts`). The snapshot comes from the
 * `run` function of capture-build-state.ts.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, openSync, readFileSync, truncateSync, writeSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type * as Validator from "../../plan-review/scripts/validate-plan.ts";
import { run as capture } from "./capture-build-state.ts";

const VALIDATOR = resolve(dirname(import.meta.path), "../../plan-review/scripts/validate-plan.ts");

export const USAGE = `Usage: record-receipt <plan> --todo <T<n>|F<n>> --event <pass|block|fix|recovery>
         [--check <json>]... [--recheck <json>]... [--commit <revision> | --no-commit <reason>]
         [--note <text>] [--log <path>] [--root <project>]
       record-receipt <plan> --event amend --note <text>
         [--commit <revision> | --no-commit <reason>] [--log <path>] [--root <project>]

Records one receipt in the plan's <stem>.build.md: for a todo, for a final
gate with --event fix, or for an approved plan change with --event amend. A
call that the build record does not allow is refused and writes nothing.
Otherwise the script captures the after-snapshot with every earlier snapshot
carried, appends the receipt, sets the todo's box to Done for a pass, and runs
the validator's resume check. A pass receipt holds todoDigest, the digest of
its todo.

  --check <json>     One check you ran: {"id", "command", "exit"}, and
                     optionally "expectedExit" (default 0) and "observed".
                     Repeat it for each check. The script sets "passed" and
                     never runs the command.
  --recheck <json>   One prerequisite recheck: {"targets", "paths", "status",
                     "observed"}, with "holds" or "fails" as the status. Each
                     path is recorded with the SHA-256 of its current bytes.
  --commit <rev>     The commit the receipt names. It must resolve to HEAD.
  --no-commit <why>  The reason the receipt names no commit. Without either
                     flag, the receipt records "no commit".
  --note <text>      The receipt's note. A block, a recovery, or an amend
                     needs one.
  --log <path>       A log file you wrote. Its path is recorded, not opened.
  --root <dir>       Project root. Default: cwd.
  --help             Show this message.

An amend takes no --todo, --check, or --recheck: its receipt names "plan" and
takes its approval from the validator's review mode. It is refused, in this
order, when the reviews file holds a result review round, a pass receipt has
no todoDigest, a todo is active, review mode does not report gateEligible:
true for the plan as it is, the reviewed round is not above the round of the
approval in force, anything outside the plan directory, apart from HEAD,
differs from the last recorded state, or git tracks the plan directory and
--commit does not name HEAD. Otherwise the capture names the new spec digest,
and every Done final gate box is set back to Open.

Prints one line: "RECEIPT: <todo> <event> seq <n>; resumeEligible <true|false>;
next <id|none>", with "plan" as the todo of an amend, followed by
"; errors: <CODE>, ..." when the resume check reports errors. A refused call
prints "RECEIPT: REFUSED <todo> <event>; <reason>".

Exit codes: 0 recorded, and the resume check reports no error; 1 refused, with
nothing written, or recorded, and the resume check reports an error; 2 invalid
arguments or an unreadable input.`;

type V = typeof Validator;
type Ref = { snapshot: string; manifestSha256: string; stateDigest: string };
type Receipt = Record<string, unknown>;
type Check = { id: string; command: string; exit: number; expectedExit: number; passed: boolean; observed?: string };
type Prerequisite = { targets: string[]; sources: { path: string; sha256: string }[]; status: string; observed: string };
type Approval = { specDigest: string; round: number; verdict: string; gateRecordDigest: string };
type Args = {
  plan: string;
  root: string;
  todo: string;
  event: string;
  checks: Record<string, unknown>[];
  rechecks: Record<string, unknown>[];
  commit?: string;
  noCommit?: string;
  note?: string;
  log?: string;
};
type Loaded = {
  root: string;
  planRel: string;
  planAbs: string;
  plan: Validator.ParsedPlan;
  files: Validator.PlanFiles;
  buildAbs: string;
  record: Record<string, unknown>;
  receipts: Receipt[];
};
/** What a call records once no refusal applies; only an amend has an approval. */
type Parts = { checks: Check[]; prerequisites: Prerequisite[]; commit: Record<string, string>; approval?: Approval };

const EVENTS = ["pass", "block", "recovery", "fix", "amend"];
const STATE: Record<string, string> = { pass: "passed", block: "blocked", recovery: "active", fix: "passed", amend: "amended" };
const CHECK_KEYS = ["id", "command", "exit", "expectedExit", "observed"];
const RECHECK_KEYS = ["targets", "paths", "status", "observed"];
/** Flags that take one value and may be given once. */
const VALUE_FLAGS = new Map<string, "todo" | "event" | "commit" | "noCommit" | "note" | "log" | "root">([
  ["--todo", "todo"],
  ["--event", "event"],
  ["--commit", "commit"],
  ["--no-commit", "noCommit"],
  ["--note", "note"],
  ["--log", "log"],
  ["--root", "root"],
]);

const isObject = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === "object" && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";
const isTextList = (x: unknown): x is string[] => Array.isArray(x) && x.length > 0 && x.every(isText);
/** A value from an argument or a file, quoted so that the printed line stays one line. */
const quote = (s: string): string => JSON.stringify(s.length > 80 ? `${s.slice(0, 80)}…` : s);
const oneLine = (s: string): string => {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
};
const plural = (ids: string[], one: string, many: string): string => `${ids.join(", ")} ${ids.length === 1 ? one : many}`;

function refOf(x: unknown): Ref | null {
  if (!isObject(x) || !isText(x.snapshot) || typeof x.manifestSha256 !== "string" || typeof x.stateDigest !== "string") return null;
  return { snapshot: x.snapshot, manifestSha256: x.manifestSha256, stateDigest: x.stateDigest };
}

function parseArgs(argv: string[]): Args | "help" | string {
  const given: Partial<Record<"todo" | "event" | "commit" | "noCommit" | "note" | "log" | "root", string>> = {};
  const checks: Record<string, unknown>[] = [];
  const rechecks: Record<string, unknown>[] = [];
  let plan: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return "help";
    const key = VALUE_FLAGS.get(arg);
    if (key || arg === "--check" || arg === "--recheck") {
      const value = argv[++i];
      if (value === undefined) return `${arg} needs a value`;
      if (key) {
        if (key in given) return `${arg} is given twice`;
        given[key] = value;
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        parsed = undefined;
      }
      if (!isObject(parsed)) return `${arg} needs one JSON object`;
      (arg === "--check" ? checks : rechecks).push(parsed);
    } else if (arg.startsWith("-")) return `unknown argument ${quote(arg)}`;
    else if (plan === undefined) plan = arg;
    else return `unexpected argument ${quote(arg)}`;
  }
  if (plan === undefined) return "a plan path is required";
  if (given.event === undefined || !EVENTS.includes(given.event)) return "--event needs pass, block, recovery, fix, or amend";
  if (given.event === "amend") {
    // An approved plan change names the plan, not a todo, and records no checks.
    if (given.todo !== undefined) return "--event amend takes no --todo; an amend receipt names plan";
    if (checks.length > 0 || rechecks.length > 0) return "--event amend takes no --check or --recheck; an amend receipt records none";
  } else if (given.todo === undefined || !/^[TF]\d+$/.test(given.todo)) return "--todo needs a todo or final gate id such as T3 or F4";
  if (given.commit !== undefined && given.noCommit !== undefined) return "--commit and --no-commit cannot be combined";
  for (const [flag, value] of [["--no-commit", given.noCommit], ["--log", given.log], ["--root", given.root]] as const) {
    if (value !== undefined && !isText(value)) return `${flag} needs a value`;
  }
  return { ...given, plan, root: given.root ?? ".", todo: given.event === "amend" ? "plan" : (given.todo as string), event: given.event, checks, rechecks };
}

/** Step 1: the plan and the build record, read through the validator. A problem here is exit 2. */
function load(v: V, args: Args): Loaded | { error: string } {
  const root = resolve(args.root);
  const planAbs = resolve(root, args.plan);
  if (!planAbs.startsWith(root + sep)) return { error: `the plan ${quote(args.plan)} is outside the root` };
  const planRel = planAbs.slice(root.length + 1).split(sep).join("/");
  const safe = v.safeResolve(root, planRel);
  if ("error" in safe) return { error: safe.error };
  let planText: string;
  try {
    planText = readFileSync(planAbs, "utf8");
  } catch {
    return { error: `cannot read the plan ${planRel}` };
  }
  const files = v.planFiles(planRel);
  const buildAbs = resolve(root, files.build);
  let buildText: string;
  try {
    buildText = readFileSync(buildAbs, "utf8");
  } catch {
    return { error: `cannot read the build record ${files.build}` };
  }
  const merged = v.buildRecord(buildText);
  if (merged === null || "error" in merged) return { error: `the build record ${files.build} is malformed: ${merged === null ? "no record" : merged.error}` };
  const record = merged.value;
  if (isObject(record) && record.schemaVersion === 1) return { error: v.FORMAT_1_MESSAGE };
  if (!isObject(record) || record.schemaVersion !== v.SCHEMA_VERSION) return { error: `the build record ${files.build} is not format ${v.SCHEMA_VERSION}` };
  if (!isText(record.runDir) || record.runDir.includes("\0") || record.runDir.split(/[\\/]/).includes("..")) return { error: "the build record has no usable runDir" };
  if (!isObject(record.approval) || !isText(record.approval.specDigest)) return { error: "the build record has no approval.specDigest" };
  if (refOf(record.baseline) === null) return { error: "the build record has no baseline snapshot" };
  if (!Array.isArray(record.receipts)) return { error: "the build record has no receipts list" };
  const receipts = record.receipts as unknown[];
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if (!isObject(r) || !isText(r.todo) || !isText(r.event) || refOf(r.before) === null || refOf(r.after) === null) {
      return { error: `receipt ${i + 1} of the build record lacks its todo, its event, or a before or after snapshot` };
    }
  }
  return { root, planRel, planAbs, plan: v.parsePlan(planText), files, buildAbs, record, receipts: receipts as Receipt[] };
}

/**
 * The receipt order rules of the validator's resume check, held here so that
 * an event out of order is refused before anything is written. A todo has
 * passed once it has a pass receipt; a todo is active from its recovery
 * receipt until its pass or block receipt. A fix changes neither.
 */
function orderRefusal(plan: Validator.ParsedPlan, receipts: Receipt[], id: string, event: string): string | null {
  const todoIds = new Set(plan.todos.map((t) => t.id));
  const passed = new Set<string>();
  let active: string | null = null;
  for (const r of receipts) {
    const todo = String(r.todo);
    if (!todoIds.has(todo)) continue;
    if (r.event === "recovery") active = todo;
    if (r.event === "pass") {
      passed.add(todo);
      if (active === todo) active = null;
    }
    if (r.event === "block" && active === todo) active = null;
  }
  if (event === "fix") {
    if (!plan.finals.some((f) => f.id === id)) return `${id} is not a final gate of the plan; a fix names one, such as F4`;
    if (active !== null) return `${active} is active; a fix comes after every todo passed`;
    const open = plan.todos.map((t) => t.id).filter((t) => !passed.has(t));
    if (open.length > 0) return `${plural(open, "has", "have")} no pass receipt; a fix comes after every todo passed`;
    return null;
  }
  const todo = plan.todos.find((t) => t.id === id);
  if (!todo) return `${id} is not a todo of the plan`;
  if (passed.has(id)) return `${id} already has a pass receipt`;
  if (active !== null && active !== id) return `${active} is active until its pass or block receipt`;
  if (active !== id) {
    const waiting = todo.dependsOn.filter((d) => !passed.has(d));
    if (waiting.length > 0) return `${id} depends on ${waiting.join(", ")}, which ${waiting.length === 1 ? "has" : "have"} no pass receipt`;
  }
  return null;
}

/** Step 2: every refusal, in a fixed order. Returns the receipt's checks, prerequisites, and commit when none applies. */
function refusal(v: V, args: Args, loaded: Loaded): Parts | { reason: string } {
  const { plan, root, planRel } = loaded;
  const order = orderRefusal(plan, loaded.receipts, args.todo, args.event);
  if (order !== null) return { reason: order };
  const cap = v.CAPS.recordProse.hard;

  const checks: Check[] = [];
  for (const c of args.checks) {
    const id = typeof c.id === "string" ? c.id : "";
    const other = Object.keys(c).find((k) => !CHECK_KEYS.includes(k));
    if (other !== undefined) return { reason: `check ${quote(id)} has the key ${quote(other)}; a check holds only ${CHECK_KEYS.join(", ")}` };
    if (!isText(id)) return { reason: "a check needs an id" };
    if (!isText(c.command) || !Number.isInteger(c.exit)) return { reason: `check ${quote(id)} lacks a command or a numeric exit` };
    if (c.expectedExit !== undefined && !Number.isInteger(c.expectedExit)) return { reason: `check ${quote(id)} has an expectedExit that is not a whole number` };
    if (c.observed !== undefined && typeof c.observed !== "string") return { reason: `check ${quote(id)} has an observed that is not text` };
    if (typeof c.observed === "string" && c.observed.length > cap) return { reason: `the observed of check ${quote(id)} is ${c.observed.length} characters; the cap is ${cap}` };
    const exit = c.exit as number;
    const expectedExit = (c.expectedExit as number | undefined) ?? 0;
    checks.push({ id, command: c.command, exit, expectedExit, passed: exit === expectedExit, ...(typeof c.observed === "string" ? { observed: c.observed } : {}) });
  }

  if (args.event === "pass" || args.event === "fix") {
    if (checks.length === 0) return { reason: `a ${args.event} needs a check` };
    const failing = checks.find((c) => !c.passed);
    if (failing) return { reason: `check ${quote(failing.id)} failed: exit ${failing.exit}, expected ${failing.expectedExit}` };
  }
  if (args.event === "pass") {
    const todo = plan.todos.find((t) => t.id === args.todo) as Validator.Todo;
    const missing = v.requiredCheckIds(todo, plan).filter((id) => !checks.some((c) => c.id === id && c.passed));
    if (missing.length > 0) return { reason: `${todo.id} has no passing check ${missing.map(quote).join(", ")}; run it and pass it with --check` };
    const ignored = todo.id === "T0" && typeof v.planIgnored === "function" && v.planIgnored(root, planRel);
    if (todo.commit && args.commit === undefined && !ignored) return { reason: `${todo.id} says Commit: yes; name its commit with --commit` };
  }
  if ((args.event === "block" || args.event === "recovery") && !isText(args.note)) return { reason: `a ${args.event} needs --note` };
  if (args.note !== undefined && args.note.length > cap) return { reason: `the note is ${args.note.length} characters; the cap is ${cap}` };

  const prerequisites: Prerequisite[] = [];
  for (const r of args.rechecks) {
    const other = Object.keys(r).find((k) => !RECHECK_KEYS.includes(k));
    if (other !== undefined) return { reason: `a recheck has the key ${quote(other)}; a recheck holds only ${RECHECK_KEYS.join(", ")}` };
    if (!isTextList(r.targets) || !isTextList(r.paths)) return { reason: "a recheck needs targets and paths, each a list of text" };
    if (r.status !== "holds" && r.status !== "fails") return { reason: "a recheck's status is holds or fails" };
    if (!isText(r.observed)) return { reason: "a recheck needs observed" };
    if (r.observed.length > cap) return { reason: `the observed of a recheck is ${r.observed.length} characters; the cap is ${cap}` };
    const sources: Prerequisite["sources"] = [];
    for (const path of r.paths) {
      const safe = v.safeResolve(root, path);
      let bytes: Buffer | null = null;
      if (!("error" in safe)) {
        try {
          bytes = readFileSync(safe.abs);
        } catch {
          bytes = null;
        }
      }
      if (bytes === null) return { reason: `the recheck path ${quote(path)} is not a readable file in the project` };
      sources.push({ path, sha256: v.sha256(bytes) });
    }
    prerequisites.push({ targets: r.targets, sources, status: r.status, observed: r.observed });
  }

  const commit = commitPart(root, args);
  if ("reason" in commit) return commit;
  return { checks, prerequisites, commit: commit.commit };
}

/** The receipt's commit: the full id that --commit names, which must be HEAD, or none with its reason. */
function commitPart(root: string, args: Args): { commit: Record<string, string> } | { reason: string } {
  if (args.commit === undefined) return { commit: { none: args.noCommit ?? "no commit" } };
  const sha = commitOf(root, args.commit);
  if (sha === null) return { reason: `--commit ${quote(args.commit)} does not resolve to a commit` };
  if (sha !== commitOf(root, "HEAD")) return { reason: `--commit ${quote(args.commit)} is ${sha.slice(0, 12)}, which is not HEAD` };
  return { commit: { sha } };
}

/** The baseline, then each receipt's before and after snapshot, as the record names them. */
function recordedRefs(loaded: Loaded): Ref[] {
  return [refOf(loaded.record.baseline) as Ref, ...loaded.receipts.flatMap((r) => [refOf(r.before) as Ref, refOf(r.after) as Ref])];
}

/** The approval in force, as the resume check takes it: the last amend receipt's, or the record's when there is none. */
function approvalInForce(loaded: Loaded): Record<string, unknown> {
  for (let i = loaded.receipts.length - 1; i >= 0; i--) {
    const r = loaded.receipts[i];
    if (r.event === "amend") return isObject(r.approval) ? r.approval : {};
  }
  return isObject(loaded.record.approval) ? loaded.record.approval : {};
}

/**
 * Refusal 6 of an amend: what differs between the last recorded state and the
 * project as it is, outside the plan directory and apart from HEAD. The
 * project is inventoried as the capture inventories it, with the paths and
 * includes of every snapshot the record names, and compared as the resume
 * check compares an amend receipt's snapshots: without the reports the
 * baseline declares.
 */
function changedOutsidePlan(v: V, loaded: Loaded): { changed: string[] } | { reason: string } {
  const { root, files } = loaded;
  const inGit = v.isGitRoot(root);
  const refs = recordedRefs(loaded);
  const manifests = new Map<string, Validator.Manifest>();
  for (const ref of refs) {
    if (manifests.has(ref.snapshot)) continue;
    try {
      manifests.set(ref.snapshot, v.verifySnapshot(v.resolveSnapshot(root, ref.snapshot, inGit)).manifest);
    } catch (error) {
      return { reason: `cannot read the snapshot ${quote(ref.snapshot)}: ${oneLine((error as Error).message)}` };
    }
  }
  const recorded = manifests.get(refs[refs.length - 1].snapshot) as Validator.Manifest;
  const carry = new Set<string>();
  const include = new Set<string>();
  for (const m of manifests.values()) {
    for (const row of m.paths) carry.add(row.path);
    for (const inc of m.includes ?? []) include.add(inc);
  }
  let current: Validator.StateBody;
  try {
    current = v.inventoryState(root, { carry: [...carry], include: [...include] }).body;
  } catch (error) {
    return { reason: `cannot inventory the project: ${oneLine((error as Error).message)}` };
  }
  const declared = (manifests.get(refs[0].snapshot) as Validator.Manifest).administrative?.reports ?? [];
  const headMove = `HEAD ${recorded.headRevision ?? "none"} → ${current.headRevision ?? "none"}`;
  return { changed: v.diffStates(recorded, current, declared).filter((d) => d !== headMove && !d.startsWith(`${files.dir}/`)) };
}

/**
 * Step 2 of an amend: its note, then its seven refusals in a fixed order.
 * The validator's `amendRefusal` decides the first three. Returns the
 * receipt's commit and the new approval, taken from the validator's review
 * mode on the plan as it is, when none applies. Nothing here writes.
 */
function amendRefusals(v: V, args: Args, loaded: Loaded): Parts | { reason: string } {
  const { root, planRel, plan, files } = loaded;
  const cap = v.CAPS.recordProse.hard;
  if (!isText(args.note)) return { reason: "an amend needs --note, the change in one line" };
  if (args.note.length > cap) return { reason: `the note is ${args.note.length} characters; the cap is ${cap}` };
  // 1 to 3: a result review round, a pass receipt without todoDigest, an active todo.
  let reviews: string | null = null;
  try {
    reviews = readFileSync(resolve(root, files.reviews), "utf8");
  } catch {
    reviews = null;
  }
  const early = v.amendRefusal(loaded.receipts, reviews);
  if (early !== null) return { reason: early };
  // 4: an OKAY round on the plan as it is, with every check of review mode, a changed built todo among them.
  const review = v.validatePlan(planRel, { root, review: true });
  if (!review.gateEligible || review.planDigest === null || review.gateRecordDigest === null || review.recordedVerdict === null) {
    const first = review.errors[0];
    const why = first ? `${first.code}: ${first.message}${review.errors.length > 1 ? `, and ${review.errors.length - 1} more` : ""}` : `the latest round's verdict is ${review.recordedVerdict ?? "missing"}`;
    return { reason: `review mode does not report gateEligible: true for the plan as it is (${oneLine(why)}); a plan change needs an OKAY round on the changed plan` };
  }
  // Review mode holds the round to the latest round, the gate record's round, and the plan's review_round.
  const approval: Approval = { specDigest: review.planDigest, round: Number(plan.frontmatter.review_round), verdict: review.recordedVerdict, gateRecordDigest: review.gateRecordDigest };
  // 5: a round above the approval in force.
  const inForce = approvalInForce(loaded);
  if (typeof inForce.round !== "number" || approval.round <= inForce.round) {
    return { reason: `the reviewed round ${approval.round} is not above round ${String(inForce.round)} of the approval in force; review the change in a new round` };
  }
  // 6: since the last receipt, nothing changed outside the plan directory but HEAD.
  const outside = changedOutsidePlan(v, loaded);
  if ("reason" in outside) return outside;
  if (outside.changed.length > 0) {
    const listed = `${outside.changed.slice(0, 5).join(", ")}${outside.changed.length > 5 ? ", …" : ""}`;
    return { reason: `a plan change may change only the plan directory and HEAD, but ${listed} changed since the last receipt` };
  }
  // 7: where git tracks the plan directory, the plan-only commit, which is HEAD.
  if (args.commit === undefined && v.isGitRoot(root) && !v.planIgnored(root, planRel)) {
    return { reason: "git tracks the plan directory, so an amend names its plan-only commit with --commit HEAD" };
  }
  const commit = commitPart(root, args);
  if ("reason" in commit) return commit;
  return { checks: [], prerequisites: [], commit: commit.commit, approval };
}

/** The full id of the commit a revision names, or null. The revision is one argument to git, never an option. */
function commitOf(root: string, revision: string): string | null {
  if (revision === "" || revision.startsWith("-") || revision.includes("\0")) return null;
  const p = spawnSync("git", ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`], {
    cwd: root,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_CONFIG_NOSYSTEM: "1" },
  });
  return p.status === 0 ? p.stdout.toString().trim() : null;
}

/**
 * Step 3: the after-snapshot, from the capture helper's own `run`, with every
 * snapshot the record names carried. `approvedSpec` is the spec digest of the
 * approval in force, or of the new approval for an amend.
 */
function captureAfter(v: V, loaded: Loaded, seq: number, id: string, approvedSpec: string): { after: Ref } | { reason: string } {
  const { root, planRel, files, record } = loaded;
  const inGit = v.isGitRoot(root);
  const baseline = refOf(record.baseline) as Ref;
  let declared: unknown;
  try {
    declared = JSON.parse(readFileSync(join(v.resolveSnapshot(root, baseline.snapshot, inGit), "manifest.json"), "utf8"))?.administrative?.reports;
  } catch (error) {
    return { reason: `cannot read the baseline snapshot's manifest: ${oneLine((error as Error).message)}` };
  }
  const reports = [...new Set((Array.isArray(declared) ? declared : []).filter((r): r is string => isText(r) && r !== files.reviews && r !== files.build))];
  const carries = [...new Set(recordedRefs(loaded).map((ref) => ref.snapshot))];
  const runDir = (record.runDir as string).replace(/[\\/]+$/, "");
  let output = `${runDir}/${seq}-${id}`;
  for (let n = 2; existsSync(v.resolveSnapshot(root, output, inGit)); n++) output = `${runDir}/${seq}-${id}-${n}`;
  const argv = [planRel, "--root", root, "--output", output];
  for (const c of carries) argv.push("--carry", c);
  for (const r of reports) argv.push("--report", r);
  argv.push("--run-id", typeof record.runId === "string" ? record.runId : "", "--approved-spec", approvedSpec);
  if (isText(record.baseRevision)) argv.push("--base-revision", record.baseRevision);
  const printed: string[] = [];
  let code: number;
  try {
    code = capture(argv, (t) => printed.push(t));
  } catch (error) {
    printed.push((error as Error).message);
    code = 1;
  }
  if (code !== 0) return { reason: `the capture failed: ${oneLine(printed.join(" "))}` };
  const out = JSON.parse(printed[printed.length - 1]);
  return { after: { snapshot: out.snapshot, manifestSha256: out.manifestSha256, stateDigest: out.stateDigest } };
}

/** Step 5: one blank line and one fenced json block with the receipt on one line; the file ends with one newline. */
function appendReceipt(path: string, receipt: Receipt): void {
  const bytes = readFileSync(path);
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end--;
  if (end < bytes.length) truncateSync(path, end);
  appendFileSync(path, `\n\n\`\`\`json\n${JSON.stringify({ receipts: [receipt] })}\n\`\`\`\n`);
}

/** Where each line starts, counted as the validator counts lines: CRLF, CR, and LF each end one. */
function lineStarts(bytes: Buffer): number[] {
  const starts = [0];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d) {
      if (bytes[i + 1] === 0x0a) i++;
      starts.push(i + 1);
    } else if (bytes[i] === 0x0a) starts.push(i + 1);
  }
  return starts;
}

/** Step 6: the first line under the todo's heading, `- [ ] Open`, becomes `- [x] Done`, in place and byte for byte. */
function setBox(path: string, plan: Validator.ParsedPlan, id: string): void {
  const todo = plan.todos.find((t) => t.id === id);
  if (!todo) return;
  const bytes = readFileSync(path);
  const starts = lineStarts(bytes);
  for (let i = todo.line; i < plan.lines.length; i++) {
    const line = plan.lines[i];
    if (line.fenced || line.fenceMarker || line.text.trim() === "") continue;
    if (line.text.trimEnd() !== "- [ ] Open" || bytes.toString("utf8", starts[i], starts[i] + 10) !== "- [ ] Open") return;
    const fd = openSync(path, "r+");
    try {
      writeSync(fd, "- [x] Done", starts[i]);
    } finally {
      closeSync(fd);
    }
    return;
  }
}

/**
 * Step 6 of an amend: the box of every final gate, `### F<n> —` and
 * `### Automated UI QA`, that reads `- [x] Done` becomes `- [ ] Open`, in
 * place and byte for byte, because the final wave checks the changed plan.
 */
function reopenGates(path: string, plan: Validator.ParsedPlan): void {
  const wave = plan.sections.find((s) => s.title === "Final verification wave");
  if (!wave) return;
  const bytes = readFileSync(path);
  const starts = lineStarts(bytes);
  const boxes: number[] = [];
  let gate = false;
  for (let i = wave.start; i < wave.end; i++) {
    const line = plan.lines[i];
    if (line.fenced || line.fenceMarker || line.text.trim() === "") continue;
    if (line.text.startsWith("### ")) {
      const title = line.text.slice(4).trim();
      gate = /^F\d+ — /.test(title) || title === "Automated UI QA";
      continue;
    }
    // Only a gate's first line holds its box.
    if (gate && line.text.trimEnd() === "- [x] Done" && bytes.toString("utf8", starts[i], starts[i] + 10) === "- [x] Done") boxes.push(starts[i]);
    gate = false;
  }
  if (boxes.length === 0) return;
  const fd = openSync(path, "r+");
  try {
    for (const at of boxes) writeSync(fd, "- [ ] Open", at);
  } finally {
    closeSync(fd);
  }
}

export function main(argv: string[], write: (text: string) => void = (t) => console.log(t)): number {
  const args = parseArgs(argv);
  if (args === "help") {
    write(USAGE);
    return 0;
  }
  if (typeof args === "string") {
    write(`error: ${args}\n${USAGE}`);
    return 2;
  }
  if (!existsSync(VALIDATOR)) {
    write(`error: the plan-review skill is not installed beside this skill (expected ${VALIDATOR})`);
    return 2;
  }
  // biome-ignore lint: dynamic require resolves the bundled validator at its installed path
  const v: V = require(VALIDATOR);
  if (typeof v.todoDigest !== "function" || typeof v.amendRefusal !== "function") {
    write(`error: the plan-review skill beside this skill is older than 2.3.0 (${VALIDATOR}); update the planning skills together`);
    return 2;
  }
  const loaded = load(v, args);
  if ("error" in loaded) {
    write(`error: ${loaded.error}`);
    return 2;
  }
  const refuse = (reason: string): number => {
    write(`RECEIPT: REFUSED ${args.todo} ${args.event}; ${reason}`);
    return 1;
  };

  const parts = args.event === "amend" ? amendRefusals(v, args, loaded) : refusal(v, args, loaded);
  if ("reason" in parts) return refuse(parts.reason);
  const seq = loaded.receipts.length + 1;
  const snap = captureAfter(v, loaded, seq, args.todo, parts.approval?.specDigest ?? String(approvalInForce(loaded).specDigest ?? ""));
  if ("reason" in snap) return refuse(snap.reason);

  // Step 4: the contract's keys only; `todoDigest` only on a pass, `approval` only on an amend, `log` only when given.
  const last = loaded.receipts[loaded.receipts.length - 1];
  const receipt: Receipt = {
    seq,
    todo: args.todo,
    event: args.event,
    state: STATE[args.event],
    prev: last ? v.sha256(v.canonicalJson(last)) : null,
    before: last ? refOf(last.after) : refOf(loaded.record.baseline),
    after: snap.after,
    checks: parts.checks,
    prerequisites: parts.prerequisites,
    commit: parts.commit,
    note: args.note ?? "",
  };
  if (args.event === "pass") receipt.todoDigest = v.todoDigest(loaded.plan.todos.find((t) => t.id === args.todo) as Validator.Todo);
  if (parts.approval) receipt.approval = parts.approval;
  if (args.log !== undefined) receipt.log = args.log;
  try {
    appendReceipt(loaded.buildAbs, receipt);
  } catch (error) {
    write(`error: cannot append the receipt to ${loaded.files.build}: ${oneLine((error as Error).message)}`);
    return 1;
  }
  const head = `RECEIPT: ${args.todo} ${args.event} seq ${seq}`;
  try {
    if (args.event === "pass") setBox(loaded.planAbs, loaded.plan, args.todo);
    if (args.event === "amend") reopenGates(loaded.planAbs, loaded.plan);
  } catch (error) {
    write(`${head}; recorded, but the ${args.event === "amend" ? "final gate boxes were not set to Open" : "box was not set"}: ${oneLine((error as Error).message)}`);
    return 1;
  }

  // Step 7: the validator's resume check, in this process.
  let result: Validator.ValidationResult;
  try {
    result = v.validatePlan(loaded.planRel, { root: loaded.root, review: true, resume: true });
  } catch (error) {
    write(`${head}; recorded, but the resume check failed: ${oneLine((error as Error).message)}`);
    return 1;
  }
  const codes = [...new Set(result.errors.map((e) => e.code))];
  write(`${head}; resumeEligible ${result.resumeEligible}; next ${result.nextTodo ?? "none"}${codes.length > 0 ? `; errors: ${codes.join(", ")}` : ""}`);
  return codes.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
