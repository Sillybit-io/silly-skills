# External research

Read this file after the codebase investigation and, when the request came from a ticket, after the vagueness test. Read it again for the late pass, once the todos are written. Skip it only when the run already stopped as `trivial` or as a blocked ticket.

## What to research

Search the public web for this feature, not for generic best practice. The queries come from what the user asked: the official docs, how other people implemented it, what they treat as important, and the pros and cons. Everything here except the contract checks below is the survey. The survey stops at 3 searches and 5 opened pages in each pass. List each search you did not run under `Queries not run`, with the reason. Contract checks have their own limit.

Research ends when every external contract a todo relies on is verified, not when a count runs out. The first pass covers the contracts the investigation surfaced and the plan will rely on. No todo exists yet, so a contract that first appears in a todo waits for the late pass below. A contract is an API signature, a configuration field, a CLI flag, a file format, a lifecycle or ordering guarantee, or a version constraint. For each one:

1. Find the version the project uses, from its lockfile, manifest, installed binary, or pinned image.
2. Open documentation for that version, or a rolling page whose date you record. Open independent pages as one batch of tool calls. Open at most 4 pages for one contract. When those pages do not establish it, read the installed package's source instead, when there is one.
3. Record the source as an `external` citation in the Evidence index, with the quoted text the plan relies on.

General guidance, analogies, and examples for a different version do not verify a contract. When the documentation cannot be reached, record the access failure and any substitute evidence, such as the installed package's source. Keep the contract on the frontier until something establishes it. A page limit ends the lookup; it never verifies the contract.

## Write `## Research`

- Sources. Each is an `http` or `https` URL you opened, with its version.
- How others did it.
- What matters.
- Pros and cons.
- What this plan will follow.
- Queries not run, with the reason, or `none`.

When the public web has nothing useful, write the line `No useful public source found.` and name the queries you ran. That line satisfies the format. It does not waive a contract a todo needs.

A research finding does not replace a code citation. Every IS cell still cites `path:line`. Put a research finding in the GAP cell or in this section.

## After the owner's answers

Research again when an answer introduces a product choice, a technology, a constraint, or a non-goal that `## Research` does not already cover. Confirming a recorded default is not a new point. Append the result under `### After answers` and update the IS/GAP ledger, the risks, and the Evidence index.

Research repeats whenever new evidence demands it. The one stop: the new point creates an irreversible, destructive, costly, or cross-cutting fork that nobody has answered. Write that one question, with its reason and its default, into `## Questions`, and stop at the draft gate.

## Late pass

After the todos are written, list each external contract a todo relies on that has no `external` citation. Verify each one as above. When a finding changes a decision, a critical flow, a coverage row, a risk, or a QA scenario, update that part and the Evidence index before validating. When it reveals a consumer the investigation missed, follow that edge as `coverage.md` describes. The stop rule under "After the owner's answers" applies here too.

## Fix-only

When `plan-review` names a missing section or an unverified contract, research that contract as above. Research the codebase only along the blocker's affected paths.
