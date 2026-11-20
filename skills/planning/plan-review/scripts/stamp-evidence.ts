#!/usr/bin/env bun
/**
 * stamp-evidence — fills the empty `sha256` of every source citation in a
 * plan's evidence index with the SHA-256 of the cited file as it is now.
 *
 * plan-writer cites `path` and a line range and leaves `sha256` empty; one run
 * of this script before validation stamps them all. It never changes a filled
 * hash, any other field, or any file but the evidence index.
 *
 * Usage:
 *   bun stamp-evidence.ts <plan> [--root <project>]
 *
 * <plan> is docs/plans/<stem>/<stem>.md; the evidence index is found beside it.
 * Exit codes: 0 — every source citation has a hash; 1 — a cited file is
 * missing or unsafe, and its citation stays empty; 2 — invalid arguments or an
 * unreadable or malformed evidence index.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { planFiles, safeResolve, sha256 } from "./validate-plan.ts";

export const USAGE = `Usage: stamp-evidence <plan> [--root <project>]

Fills the empty sha256 of every source citation in <stem>.evidence-index.md
with the SHA-256 of the cited file. Filled hashes are never changed.`;

type Outcome = { stamped: string[]; failed: string[]; text: string };

/** Stamps one evidence index text. `read` returns a project file's bytes, or null. */
export function stampEvidence(text: string, read: (path: string) => Buffer | null): Outcome {
  const out: Outcome = { stamped: [], failed: [], text };
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^```json\s*$/.test(lines[i])) continue;
    let j = i + 1;
    while (j < lines.length && !/^```\s*$/.test(lines[j])) j++;
    if (j >= lines.length) throw new Error(`unclosed json block at line ${i + 1}`);
    const raw = lines.slice(i + 1, j).join("\n");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      throw new Error(`json block at line ${i + 1} is not valid JSON: ${(error as Error).message}`);
    }
    let changed = false;
    const citations = value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).citations) ? ((value as Record<string, unknown>).citations as unknown[]) : [];
    for (const c of citations) {
      if (!c || typeof c !== "object") continue;
      const citation = c as Record<string, unknown>;
      if (citation.kind !== "source" || (typeof citation.sha256 === "string" && citation.sha256 !== "")) continue;
      const bytes = typeof citation.path === "string" ? read(citation.path) : null;
      if (bytes === null) {
        out.failed.push(`${String(citation.id)} (${String(citation.path)})`);
        continue;
      }
      citation.sha256 = sha256(bytes);
      out.stamped.push(String(citation.id));
      changed = true;
    }
    if (changed) {
      // Keep the block's layout: one line stays one line.
      const body = raw.includes("\n") ? JSON.stringify(value, null, 2) : JSON.stringify(value);
      lines.splice(i + 1, j - i - 1, ...body.split("\n"));
      j = i + 1 + body.split("\n").length;
    }
    i = j;
  }
  out.text = lines.join("\n");
  return out;
}

export function main(argv: string[], write: (text: string) => void = (t) => console.log(t)): number {
  let plan: string | null = null;
  let root: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      write(USAGE);
      return 0;
    }
    if (arg === "--root") {
      root = argv[++i];
      if (!root) {
        write("error: --root needs a directory");
        return 2;
      }
    } else if (arg.startsWith("-") || plan !== null) {
      write(`error: unexpected argument '${arg}'\n${USAGE}`);
      return 2;
    } else plan = arg;
  }
  if (plan === null) {
    write(`error: a plan path is required\n${USAGE}`);
    return 2;
  }
  const base = resolve(root ?? process.cwd());
  const indexPath = planFiles(resolve(base, plan)).evidenceIndex;
  let text: string;
  try {
    text = readFileSync(indexPath, "utf8");
  } catch {
    write(`error: cannot read ${indexPath}`);
    return 2;
  }
  let outcome: Outcome;
  try {
    outcome = stampEvidence(text, (path) => {
      const safe = safeResolve(base, path);
      if ("error" in safe) return null;
      try {
        return readFileSync(safe.abs);
      } catch {
        return null;
      }
    });
  } catch (error) {
    write(`error: ${(error as Error).message}`);
    return 2;
  }
  if (outcome.stamped.length > 0) writeFileSync(indexPath, outcome.text);
  write(`stamped ${outcome.stamped.length} citation(s)${outcome.stamped.length > 0 ? `: ${outcome.stamped.join(", ")}` : ""}`);
  for (const f of outcome.failed) write(`unreadable: ${f}`);
  return outcome.failed.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
