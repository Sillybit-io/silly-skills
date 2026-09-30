---
title: Add punctuation and a shout flag to the greeter
request: "End greetings with punctuation, and add a --shout flag to the CLI."
source: chat
date: 2026-09-28
status: reviewed
tier: standard
intent: change
branch: feat/greeter-shout
ui: no
review: required
review_round: 1
---

<!-- markdownlint-disable-next-line MD025 -->
# Add punctuation and a shout flag to the greeter

## TL;DR

- Effort: S — two small functions and their tests.
- Risk: low — a local CLI.
- Decisions made: default punctuation is `!`; `--shout` upper-cases the whole greeting.
- Owner decisions pending: none.
- Cut from scope: localization.
- Branch: `feat/greeter-shout` — no branches to sample; type/slug default.

## Scope

### Affected users

People running `python3 cli.py`.

### Ideal state

`python3 cli.py Ana` prints `Hello, Ana!`, and `python3 cli.py --shout Ana` prints `HELLO, ANA!`.

### IS / GAP ledger

| Gap | IS today (evidence) | GAP |
| --- | --- | --- |
| G1 | `greet.py:4-5` — returns `Hello, <name>` with no punctuation | No punctuation |
| G2 | `cli.py:7-9` — prints the greeting for the first argument | No `--shout` flag |

### Risks

| Risk | What breaks | Mitigation | Carried by |
| --- | --- | --- | --- |
| The existing test pins the old text | `test_greet.py:7-12` fails after T1 | T1 updates that assertion | T1 |

### Must have

- MH1: `greet(name)` ends with `!` by default, and `punctuation=""` keeps the old text.
- MH2: `--shout` upper-cases the greeting.

### Must NOT have

- MN1: No argument-parsing dependency; read `argv` directly.

### Coverage

The Evidence index records every reader of `greet`.

### Critical flows

None: no state or external effect.

### Baseline

`python3 -m unittest -q` passes (2 tests).

### Evidence index

```json
{
  "schemaVersion": 1,
  "citations": [
    {
      "id": "C1",
      "kind": "source",
      "path": "greet.py",
      "startLine": 4,
      "endLine": 5,
      "excerpt": "def greet(name):\n    return f\"Hello, {name}\"",
      "sha256": "999688b90e7ab240c113b911e1bfb5e92bf32f5166624c8cebf6ff9e76740b53"
    },
    {
      "id": "C2",
      "kind": "source",
      "path": "cli.py",
      "startLine": 7,
      "endLine": 9,
      "excerpt": "def main(argv):\n    print(greet(argv[0] if argv else \"world\"))\n    return 0",
      "sha256": "84d227e3055f73a7dfbe5c50eac8064e1f24321878d2077e383fc392626446b3"
    },
    {
      "id": "C3",
      "kind": "source",
      "path": "test_greet.py",
      "startLine": 7,
      "endLine": 12,
      "excerpt": "class GreetTest(unittest.TestCase):\n    def test_greets_by_name(self):\n        self.assertEqual(greet(\"Ana\"), \"Hello, Ana\")\n\n    def test_cli_returns_zero(self):\n        self.assertEqual(main([\"Ben\"]), 0)",
      "sha256": "93ac8667db99e71bd2661585fb47f56a505124e4a1a5e720655423c1b26a8530"
    },
    {
      "id": "C4",
      "kind": "self"
    }
  ],
  "coverage": [
    {
      "id": "V1",
      "paths": [
        "greet.py",
        "cli.py",
        "test_greet.py"
      ],
      "searches": [
        "rg -n greet ."
      ],
      "producers": [
        "greet.py"
      ],
      "consumers": [
        "cli.py",
        "test_greet.py"
      ],
      "citationIds": [
        "C1",
        "C2",
        "C3"
      ],
      "state": "inspected"
    },
    {
      "id": "V2",
      "paths": [
        "README.md",
        "notes.txt"
      ],
      "searches": [
        "rg -n greet README.md notes.txt"
      ],
      "producers": [],
      "consumers": [],
      "citationIds": [],
      "state": "excluded",
      "reason": "documentation and owner notes; no code path reads them"
    }
  ],
  "frontier": [],
  "flows": [],
  "noRuntimeFlowReason": "two pure functions and a CLI print; no state, persistence, or external effect",
  "baseline": {
    "revision": "d4b905600a9b4888215974f8b6846636146c67be",
    "dirty": [
      "docs/plans/2026-09-28-greeter-shout.md (untracked: this plan)"
    ],
    "checks": [
      {
        "command": "python3 -m unittest -q",
        "exit": 0,
        "result": "2 tests OK"
      }
    ]
  }
}
```

## Research

No useful public source found. The change is two local functions.

## Questions

### Product

- Default punctuation — answer: `!`.

### Technical

- Argument parsing — answer: read `argv`; no dependency.

## Design

Diagram: omitted — two function edits with no process or interaction.

## Verification strategy

| Gap | Proof | Expected |
| --- | --- | --- |
| G1 | `python3 -c 'from greet import greet; print(greet("Ana"))'` | `Hello, Ana!` |
| G2 | `python3 cli.py --shout Ana` | `HELLO, ANA!` |

## Execution strategy

Finish T0, then each wave in list order, then the final wave. Do not stop between waves or ask for a continue. If a todo's checks fail, fix that todo and run them again until they pass, then continue.

- T0 runs alone before wave 1.
- Wave 1: T1
- Wave 2: T2 — needs T1

## Todos

Every todo starts with `- [ ] Open`. Run its Acceptance and QA scenario, including the failure case unless it is n/a. After both pass, commit when it says `Commit: yes`, then change its box to `- [x] Done`. Only then start the next todo. This rule does not apply to the final verification wave.

When a wave is done, start the next wave, including the final wave, without asking for a continue. If a todo's checks fail, fix that todo and run them again until they pass, then continue.

### T0 — Copy the plan into the project

- [ ] Open
- Do: if this file is outside the project, copy it into `docs/plans/` under the same name and continue there. If it is already there, keep it.
- Must not: create a second copy or change the plan while copying.
- Closes gap: none.
- Depends on: none.
- References: this file.
- Acceptance: `test -f docs/plans/2026-09-28-greeter-shout.md` exits 0.
- QA scenario: happy — the file is already under `docs/plans/` and no copy is made; failure — n/a, the plan ships inside the project.
- Commit: no.

### T1 — End greetings with punctuation

- [ ] Open
- Do: give `greet` a `punctuation="!"` parameter appended to the text (`greet.py:4-5`). Update the assertion in `test_greet.py:7-12` to `Hello, Ana!` and add a test that `punctuation=""` returns `Hello, Ana`.
- Must not: change `cli.py`.
- Closes gap: G1.
- Depends on: T0.
- References: `greet.py:4-5`, `test_greet.py:7-12`.
- Acceptance: `python3 -m unittest -q` exits 0, and `python3 -c 'from greet import greet; assert greet("Ana") == "Hello, Ana!"'` exits 0.
- QA scenario: happy — `python3 cli.py Ana` prints `Hello, Ana!`; failure — `greet("Ana", punctuation="")` returns `Hello, Ana`.
- Commit: yes — `feat: end greetings with punctuation` (only `greet.py` and `test_greet.py`).

### T2 — Add the shout flag

- [ ] Open
- Do: in `main` (`cli.py:7-9`), remove a leading `--shout` from `argv` and upper-case the greeting when it was present. Add a test for `main(["--shout", "Ana"])`.
- Must not: change `greet.py`.
- Closes gap: G2.
- Depends on: T1.
- References: `cli.py:7-9`, `greet.py:4-5`.
- Acceptance: `python3 cli.py --shout Ana` prints `HELLO, ANA!`, and `python3 -m unittest -q` exits 0.
- QA scenario: happy — `--shout` upper-cases; failure — `python3 cli.py Ana` without the flag still prints `Hello, Ana!`.
- Commit: yes — `feat: add a shout flag` (only `cli.py` and `test_greet.py`).

## Final verification wave

Change a gate's box to `- [x] Done` when that gate is finished. The Todos test-before-next rule does not apply to this wave.

### F1 — Plan compliance

- [ ] Open
- Do: confirm MH1, MH2, and MN1.
- Acceptance: each Must Have has passing output; no dependency was added.
- Commit: no.

### F2 — Code quality

- [ ] Open
- Do: run `python3 -m unittest -q`. There is no build or lint command.
- Acceptance: exits 0.
- Commit: no.

### F3 — Scenario QA

- [ ] Open
- Do: run every todo's QA scenario.
- Acceptance: each scenario behaves as stated.
- Commit: no.

### F4 — Scope fidelity

- [ ] Open
- Do: compare the diff with T1 and T2.
- Acceptance: only `greet.py`, `cli.py`, and `test_greet.py` changed.
- Commit: no.

`ui: no` — a command-line script.

## Success criteria

| Gap | Closed by | Proof |
| --- | --- | --- |
| G1 | T1 | unittest and the `greet("Ana")` check |
| G2 | T2 | `python3 cli.py --shout Ana` |

## Review

| Round | Date | Verdict | Blockers |
| --- | --- | --- | --- |
| 1 | 2026-09-28 | OKAY | 0 |

### Round 1

**Verdict:** PLAN-REVIEW: OKAY

**Mode:** review. Fixture review written with this fixture: it exists so plan-builder has an approved plan to build. It is not an independent review.

**Scope:** whole plan; 3/3 required obligations verified; 0/0 critical flows verified.

#### Coverage and evidence

| ID / obligation / owning todos | Required? | Evidence kind and location | Observed result | Planned QA | Status |
| --- | --- | --- | --- | --- | --- |
| O1 MH1, T0, T1 | yes | source C1, C3; probe P1 | greet returns an f-string; the only pinned text is in test_greet.py, which T1 updates | Q1: `python3 cli.py Ana`; `greet("Ana", punctuation="")` | verified |
| O2 MH2, MN1, T2 | yes | source C2; probe P1 | main reads argv[0] directly; removing a leading --shout is local to main | Q2: `python3 cli.py --shout Ana`; `python3 cli.py Ana` | verified |
| O3 final gates and checks A–J | yes | plan inspection C4; sources C1–C3 | F2 and F3 name runnable commands, F1 and F4 name what to compare; checks A–J hold for this three-file plan, each with its own observation below | Q3: `python3 -m unittest -q`, then every todo's QA | verified |

#### Gate record

```json
{
  "schemaVersion": 1,
  "round": 1,
  "planDigest": "49833a24301b3f9f69672b21f100ea60d4b7512eb5fddfc52e5386f1b7a43587",
  "repository": {
    "revision": "d4b905600a9b4888215974f8b6846636146c67be",
    "dirty": [
      "docs/plans/2026-09-28-greeter-shout.md"
    ]
  },
  "sources": [
    {
      "path": "greet.py",
      "sha256": "999688b90e7ab240c113b911e1bfb5e92bf32f5166624c8cebf6ff9e76740b53"
    },
    {
      "path": "cli.py",
      "sha256": "84d227e3055f73a7dfbe5c50eac8064e1f24321878d2077e383fc392626446b3"
    },
    {
      "path": "test_greet.py",
      "sha256": "93ac8667db99e71bd2661585fb47f56a505124e4a1a5e720655423c1b26a8530"
    }
  ],
  "evidence": [
    {
      "id": "P1",
      "kind": "probe",
      "command": "python3 -m unittest -q",
      "inputs": "fixture project as delivered",
      "exit": 0,
      "result": "OK",
      "omissions": "none"
    },
    {
      "id": "Q1",
      "kind": "planned-qa",
      "command": "python3 cli.py Ana; python3 -c 'from greet import greet; print(greet(\"Ana\", punctuation=\"\"))'"
    },
    {
      "id": "Q2",
      "kind": "planned-qa",
      "command": "python3 cli.py --shout Ana; python3 cli.py Ana"
    },
    {
      "id": "Q3",
      "kind": "planned-qa",
      "command": "python3 -m unittest -q, then every todo's QA scenario"
    }
  ],
  "obligations": [
    {
      "id": "O1",
      "targets": [
        "MH1",
        "T0.start",
        "T0.acceptance",
        "T0.qa",
        "T1.start",
        "T1.acceptance",
        "T1.qa",
        "dep:T1:T0"
      ],
      "evidenceIds": [
        "C1",
        "C3",
        "P1"
      ],
      "observed": "greet returns an f-string; the only pinned text is in test_greet.py, which T1 updates",
      "plannedQa": "Q1",
      "status": "verified"
    },
    {
      "id": "O2",
      "targets": [
        "MH2",
        "MN1",
        "T2.start",
        "T2.acceptance",
        "T2.qa",
        "dep:T2:T1"
      ],
      "evidenceIds": [
        "C2",
        "P1"
      ],
      "observed": "main reads argv[0] directly; removing a leading --shout is local to main",
      "plannedQa": "Q2",
      "status": "verified"
    },
    {
      "id": "O3",
      "targets": [
        "F1.acceptance",
        "F2.acceptance",
        "F3.acceptance",
        "F4.acceptance",
        "check:A",
        "check:B",
        "check:C",
        "check:D",
        "check:E",
        "check:F",
        "check:G",
        "check:H",
        "check:I",
        "check:J"
      ],
      "evidenceIds": [
        "C4",
        "C1",
        "C2",
        "C3"
      ],
      "observed": "F2 and F3 name runnable commands, F1 and F4 name what to compare; checks A–J hold for this three-file plan, each with its own observation below",
      "plannedQa": "Q3",
      "status": "verified"
    }
  ],
  "flows": [],
  "checks": {
    "A": {
      "status": "verified",
      "evidenceIds": [
        "C1",
        "C2",
        "C3"
      ],
      "observed": "greet (greet.py:4-5) returns f\"Hello, {name}\"; its readers are main (cli.py:7-9), which prints greet(argv[0]), and test_greet.py:7-12, which pins 'Hello, Ana'. `rg -n greet .` finds no other reader."
    },
    "B": {
      "status": "verified",
      "evidenceIds": [
        "C4",
        "C1",
        "C3",
        "P1"
      ],
      "observed": "T0 needs only this file. T1 needs greet.py and test_greet.py, both present, and unittest from the standard library. T2 needs T1's greet and cli.py. Each Acceptance runs with python3 alone at its position; the baseline suite passes (P1)."
    },
    "C": {
      "status": "verified",
      "evidenceIds": [
        "C4"
      ],
      "observed": "No critical flow: no state, persistence, or external effect. T1 must not change cli.py and T2 must not change greet.py; neither Do needs that file. F4's three files equal the union of T1's and T2's commit files."
    },
    "D": {
      "status": "verified",
      "evidenceIds": [
        "C4",
        "C2"
      ],
      "observed": "T1's and T2's QA scenarios each name a command, the input Ana, and the exact expected output, and T2's runs the real entry point cli.py, not a stub. T0's QA is observable with its Acceptance command `test -f` and a listing of docs/plans; it has no failure case because the plan ships inside the project."
    },
    "E": {
      "status": "verified",
      "evidenceIds": [
        "C4",
        "C2"
      ],
      "observed": "`ui: no` holds: cli.py is a command-line script, and the project has no templates, views, or UI manifest."
    },
    "F": {
      "status": "verified",
      "evidenceIds": [
        "C4"
      ],
      "observed": "Research records that no public source applies to two local function edits; nothing in the plan depends on an external contract."
    },
    "G": {
      "status": "verified",
      "evidenceIds": [
        "C4"
      ],
      "observed": "Questions lists the product question (default punctuation) before the technical one (argument parsing); both are answered."
    },
    "H": {
      "status": "verified",
      "evidenceIds": [
        "C4"
      ],
      "observed": "Design omits the diagram with a reason: two function edits with no process or interaction."
    },
    "I": {
      "status": "verified",
      "evidenceIds": [
        "C4"
      ],
      "observed": "The final wave has four gates, F1 to F4: plan compliance, code quality, scenario QA, and scope fidelity, each with an Acceptance."
    },
    "J": {
      "status": "verified",
      "evidenceIds": [
        "C4"
      ],
      "observed": "T0 exists and runs alone before wave 1; T0 to T2 and F1 to F4 each start with an Open box."
    }
  },
  "blockers": [],
  "verdict": "OKAY"
}
```
