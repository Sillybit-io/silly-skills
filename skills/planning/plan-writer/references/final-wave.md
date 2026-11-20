# Final verification wave

Read this file when you add the final verification wave. It comes after every implementation todo. plan-writer writes these todos. It does not run them.

## The four gates

Title them `F1`, `F2`, `F3`, and `F4`, in that order. Each gate starts with `- [ ] Open` and has a one-line `Do` in the standard form Output format shows. `plan-builder` holds the full rules for running them, so the plan does not repeat them. The test-before-next rule does not apply to these gates.

- **F1 Plan compliance.** Every Must Have is present and every Must NOT Have is absent.
- **F2 Code quality.** The project's test, lint, and build commands, compared with the baseline, and a slop pass.
- **F3 Scenario QA.** Every todo's QA scenario. F3 names no browser tool and no screenshot path; those belong to the UI QA todo.
- **F4 Scope fidelity.** An independent result review against the build baseline.

Add an `Acceptance:` line to a gate only when this plan needs something checked that the standard gate does not cover, such as a migration dry run in F2.

Extra feature-specific checks are allowed. Title them `F5` onward and place them after `F4` and before the UI QA todo. Four gates is the minimum, not the maximum.

## UI QA

Set `ui: yes` when the project has a web framework in its manifest, an `index.html`, a templates or views directory, or a mobile app target, and also when this plan itself adds a web or mobile surface. Otherwise `ui: no`.

When `ui: yes`, the last todo in the plan is the automated UI QA task. It names the tool, the route or screen, the viewport widths, the steps, the expected result at each step, and the screenshot path `reports/ui-qa/<slug>/`. It is not one of F1–F4, and it is not folded into F3. The test-before-next rule does not apply to it.

When `ui: no`, do not add that todo. Say why in one line under the wave.
