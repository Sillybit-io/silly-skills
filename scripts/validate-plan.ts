#!/usr/bin/env bun
/**
 * Repository entry point for the plan validator. The implementation ships
 * inside the plan-review skill so an installed copy works without this
 * repository: skills/planning/plan-review/scripts/validate-plan.ts.
 *
 * Usage: bun run validate-plan <plan> [--review [--resume]] [--root <project>] [--json]
 */

export * from "../skills/planning/plan-review/scripts/validate-plan.ts";
import { main } from "../skills/planning/plan-review/scripts/validate-plan.ts";

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
