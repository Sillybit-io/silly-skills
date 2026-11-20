# Coverage

Read this file before exploring the codebase, when resuming a draft, and when a fix-only step reopens investigation. By the owner's decision, discovery has a fixed depth instead of a count: one step from the changed code, plus the changed inventory, plus everything in a strict area. A host timeout or interruption produces a checkpoint, never a planned file.

## Seeds

Start from everything the request touches:

- The requested behavior and the files the request names.
- Entry points that reach that behavior: commands, routes, hooks, jobs, installers, and exported functions.
- Artifacts the change will create, move, or delete.
- Invariants the change alters: inventory membership, counts, identifiers, and generated lists.
- The tests and fixtures that pin the current behavior.

## One step from the seeds

For each seed, find what it depends on (producers) and what depends on it (consumers). Stop there, with three exceptions:

1. **A consumer that needs a change** becomes a new seed. Its own consumers are one step from it.
2. **The changed inventory.** Search for the collection the change adds to, removes from, or renames in, and for the code that enumerates, counts, registers, or asserts it. A new item's name cannot find the existing consumers of the whole collection. This search is never skipped: missed counts and lists are the most common gap in a plan.
3. **A strict area.** When a seed or a consumer touches security, sign-in, or permissions, or production and shared services, follow its edges to the end. When unsure, treat it as strict.

Check these edge kinds, because a plain import search misses most of them:

| Edge | How to find it |
| --- | --- |
| Imports and calls | Search for the symbol, the module path, and re-exports |
| Registrations by string | Search for the module or command name as a string: plugin maps, dynamic imports, route tables, tool manifests |
| Path strings | Search for literal paths the change moves or renames, in code, scripts, configuration, and docs |
| Data formats | Search for the key, file, or wire format the change alters, and for every reader of it |
| Configuration | Files and environment variables that set the behavior |
| Generated and installed files | Build outputs, templates, installers, update and migration paths |
| Inventory invariants | Code that enumerates the affected collection, registrations, derived counts and lists, and assertions or snapshots of them |
| Documentation commands | Commands and flags quoted in READMEs and runbooks |
| Tests | Tests that pin current behavior, including snapshot and fixture files |

Use synonyms and the old and new names. An empty or failed search is not proof of absence: try another name before you exclude.

## Account for each edge you found

Every edge you found ends in one of two states:

- **inspected** — you opened the code at that location and cited the lines you rely on: path and line range, with an empty `sha256` for `stamp-evidence.ts` to fill.
- **excluded** — you read the code that consumes the changed value and give a short reason why its behavior cannot be affected. A filename or a directory is not a reason.

An edge still unread stays `pending`, and `pending` rows block the planned state.

When an inspected consumer needs a change, name that change in its owning todo. A generic instruction to fix failing tests does not supply it.

## Frontier and closure

Keep the frontier: the pending paths and unverified external contracts, each with why it is open and the next action. Coverage is closed when every edge you found is inspected or excluded, every external contract a todo relies on is checked at its target version, and the frontier is empty.

Unknown product choices belong to the owner and become questions. Unread files belong to you. Never turn an unread file into an owner question.

## Checkpoints and resume

The plan file exists from the skeleton step on, and each citation, coverage row, and frontier item was appended as you found it, so the draft is already current. Before the session ends, append the frontier items and the next action. Keep `status: draft`.

On resume, re-read the draft from disk and run the validator. A `CITATION_DRIFT` error names a source that changed: re-read its cited lines, fix the range, empty its `sha256`, and stamp again. Then work the frontier.

## Fix-only follow-up

A blocker about coverage, a flow, or a missed consumer reopens investigation along that blocker's affected paths, with the same depth rules. Edit each entry into its corrected state. Do not redesign unrelated sections.

## Delegating discovery

When a `plan-scout` persona is available and allowed, you may send it one bounded discovery question: the seed, the edge kinds, and the scope. Open each returned location yourself before you cite it. When the scout is unavailable or denied, search yourself.
