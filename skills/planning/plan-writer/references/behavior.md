# Behavior lines

Read this file at step 9, before the IS/GAP ledger. Behavior lines say what changes for the people who use or run the work, so the owner approves the outcome before the plan picks a design.

## Line form

```markdown
- B1 (primary): Given <the state before>, when <a person acts>, then <what that person sees>.
- No alternate case: <why the change has none>
```

`Given` sets the scene, `when` is one action, and `then` is a result the person can see or check. A function, a table, a library, or a file says how the change works. It belongs in a todo.

## Bad and good

Each pair is one line, written twice. The bad line says how, or says nothing a check can observe. The good line says what.

```text
Bad:  - B1 (primary): Given a saved report, when the export handler runs, then it inserts a row into the exports table.
Good: - B1 (primary): Given a saved report, when the owner clicks Export, then a file with one row per record downloads.

Bad:  - B2 (error): Given a report with no records, when the owner clicks Export, then src/export.ts throws an error.
Good: - B2 (error): Given a report with no records, when the owner clicks Export, then the page says there is nothing to export.

Bad:  - B3 (recovery): Given a failed export, when the owner tries again, then the export recovers quickly.
Good: - B3 (recovery): Given an export that stopped halfway, when the owner clicks Export again, then one complete file downloads.
```

The first bad line names a handler and a table, the second a file, and the third a word no check can measure.

## Scenario scan

After the first lines, take the four cases in this order. Each gets a line, or an exclusion that says why the change has none.

- primary: the main path the change delivers.
- alternate: another way to the same result, such as a second entry point, an option, or another kind of user.
- error: a bad input or a failing dependency, and what the person sees then.
- recovery: how the person gets back to a good state after a failure, such as a retry, an undo, or a resumed run.
