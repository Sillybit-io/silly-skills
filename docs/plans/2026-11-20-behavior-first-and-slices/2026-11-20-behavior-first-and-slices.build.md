# Build: Behavior first and slices for the plan skills

```json
{
  "schemaVersion": 2,
  "runId": "2026-11-20-behavior-first-and-slices-r1",
  "runDir": "silly-skills/plan-builds/2026-11-20-behavior-first-and-slices-r1",
  "repository": { "kind": "git", "rootCommits": ["1d1201b1e96c80ad930c76bc2d703474f8ed6640"], "branch": "feat/plan-skills-behavior-slices" },
  "baseRevision": "e28a96fcd9441f525d4c3434b43834ac37d4c552",
  "approval": { "specDigest": "99d7a568b6bba7595a92e70234adabab71a6773003d7c93b2883e7658b9b58c1", "round": 1, "verdict": "OKAY", "gateRecordDigest": "dc885256b5fcc30f13fd990f303e8fcc8906052404d640d550888ec3728fe3dd" },
  "baseline": { "snapshot": "silly-skills/plan-builds/2026-11-20-behavior-first-and-slices-r1/baseline", "manifestSha256": "a43118f878019fa003cb02eae51617ede1535f2a45b57b250ebc51c52e89cb24", "stateDigest": "d5815f7325437577d11e273092a82b203fdbbaca5f93f9ec3079d9a8d1c87498" },
  "skill": { "name": "plan-builder", "version": "2.0.0", "sha256": "760f740869b9fe6110750ab35d7d078852ac45901f121f5f1c26962db4f3f4c9" },
  "receipts": []
}
```

```json
{"receipts": [{"seq": 1, "todo": "T0", "event": "pass", "state": "passed", "prev": null, "before": {"snapshot": "silly-skills/plan-builds/2026-11-20-behavior-first-and-slices-r1/baseline", "manifestSha256": "a43118f878019fa003cb02eae51617ede1535f2a45b57b250ebc51c52e89cb24", "stateDigest": "d5815f7325437577d11e273092a82b203fdbbaca5f93f9ec3079d9a8d1c87498"}, "after": {"snapshot": "silly-skills/plan-builds/2026-11-20-behavior-first-and-slices-r1/T0", "manifestSha256": "42fef7911cb3fb08a527e4e9226829c724757c92d04cb863c42083f6aa64c967", "stateDigest": "5079163455150eee8ae25cf73ecd1bfa943666c4703522ad491ce52b0cd0cd8f"}, "checks": [{"id": "acceptance", "command": "test -f docs/plans/2026-11-20-behavior-first-and-slices/2026-11-20-behavior-first-and-slices.md", "exit": 0, "expectedExit": 0, "passed": true, "observed": "exit 0"}, {"id": "qa:happy", "command": "git ls-files docs/plans/2026-11-20-behavior-first-and-slices | wc -l", "exit": 0, "expectedExit": 0, "passed": true, "observed": "5 files tracked in commit 2df5d9c"}], "prerequisites": [], "commit": {"sha": "2df5d9c032f5190c7f2ce605110b601fb21b45a6"}, "note": "plan directory already under docs/plans; no copy made"}]}
```
