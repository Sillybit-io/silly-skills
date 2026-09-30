# Rollback fixture

A made-up "memory-engine" installation and the upgrade script that moves it from `legacy/` to `new-home/`, invented for this repository's tests. It is not a real project or a real product; there is no real memory engine. The planning evaluations review plans against this code, and `scripts/planning-fixtures.test.ts` runs its real functions to prove each seeded defect exists.

## Layout

| Path | Contents |
| --- | --- |
| `seed/` | The installation: `legacy/bin/memory` (engine), `legacy/bank/` (owner data), `hook.sh`, `helpers.sh`, and `tool.json` (registration with the unrelated owner values `enabled: false` and `label`) |
| `seed-cron/` | One more consumer of the engine path, `cron/memory-sync.sh`, used only by the five-blocker case |
| `original/upgrade.sh` | The upgrade under review |
| `corrected/upgrade.sh` | A reference implementation that shows the corrected plan is executable |

Run either script against a copy, never against this directory:

```sh
cp -R scripts/fixtures/rollback/seed /tmp/memory
cp scripts/fixtures/rollback/original/upgrade.sh /tmp/memory/
ROOT=/tmp/memory sh /tmp/memory/upgrade.sh upgrade
```

`FIXTURE_FAIL=bank-copy` fails the bank copy inside installation (exit 17). `FIXTURE_FAIL=activate` fails activation after every pointer and registration write (exit 1).

## Seeded defects in `original/upgrade.sh`

| Seed | Defect | Observable result |
| --- | --- | --- |
| S1 | `rollback` restores `legacy/` only | After rollback, `hook.sh` prints `{}` and `helpers.sh` and `tool.json` still name `new-home/` |
| S2 | `install_new` replaces `tool.json` | `enabled` becomes `true` and `label` disappears, and rollback keeps it that way |
| S3 | The failure handler runs only after `install_new` | A bank-copy failure exits 17 with a partial `new-home/` and no rollback |

The five-blocker case adds two plan-level seeds: `cron/memory-sync.sh` is a consumer the plan never lists (S4), and one acceptance command ends in `|| true`, so it cannot fail (S5). `../planning/ground-truth/rollback.json` is the scoring key. Never copy it into an evaluation directory.

`corrected/upgrade.sh` backs up every rewritten file before the first write, edits only the `command` line of `tool.json`, and rolls back from an EXIT trap, so every failure path leaves the original bytes.
