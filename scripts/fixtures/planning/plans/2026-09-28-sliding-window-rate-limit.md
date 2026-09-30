---
title: Use a sliding window in the rate limiter
request: "Change app/core/rate_limit.py to a sliding-window limit instead of fixed windows. Keep check_rate_limit's signature."
source: chat
date: 2026-09-28
status: draft
tier: standard
intent: change
branch: feat/sliding-window-rate-limit
ui: no
review: required
review_round: 0
---

<!-- markdownlint-disable-next-line MD025 -->
# Use a sliding window in the rate limiter

## TL;DR

- Effort: M — the limiter and whatever depends on its window behavior.
- Risk: medium — the limiter guards the API and the digest job.
- Decisions made: keep `check_rate_limit(subject, now=None)`.
- Owner decisions pending: none.
- Cut from scope: a distributed store.
- Branch: `feat/sliding-window-rate-limit` — no branches to sample; type/slug default.

## Scope

### Affected users

API clients and the digest job, which are limited per subject.

### Ideal state

Each subject gets at most `max_requests` calls in any rolling `window_seconds`, with no burst at window edges, and every caller keeps working.

### IS / GAP ledger

| Gap | IS today (evidence) | GAP |
| --- | --- | --- |
| G1 | `app/core/rate_limit.py:18-27` — counts per fixed window | Bursts at window edges |

### Risks

| Risk | What breaks | Mitigation | Carried by |
| --- | --- | --- | --- |
| Callers depend on fixed windows | Unknown until the frontier closes | Finish the investigation | T1 |

### Must have

- MH1: A rolling window with the same public function.

### Must NOT have

- MN1: No new external service.

### Coverage

Partial. The Evidence index lists what was read and the open frontier.

### Critical flows

Not traced yet.

### Baseline

`python3 -m unittest discover -s tests -t .` passes (7 tests).

### Evidence index

```json
{
  "schemaVersion": 1,
  "citations": [
    {
      "id": "C1",
      "kind": "source",
      "path": "app/core/rate_limit.py",
      "startLine": 18,
      "endLine": 27,
      "excerpt": "def check_rate_limit(subject, now=None):\n    \"\"\"Counts one request for `subject` and raises RateLimited over the limit.\"\"\"\n    limits = load_limits()\n    now = time.time() if now is None else now\n    window = int(now // limits[\"window_seconds\"])\n    key = limit_key(subject, window)\n    count = store.incr(key, ttl=limits[\"window_seconds\"])\n    if count > limits[\"max_requests\"]:\n        raise RateLimited(key, limits[\"window_seconds\"] - (now % limits[\"window_seconds\"]))\n    return limits[\"max_requests\"] - count",
      "sha256": "afd99de5842a67080b5ab6c772ed4897c27cd7059d655ed013d41c1c76f00f95"
    },
    {
      "id": "C2",
      "kind": "source",
      "path": "app/api/middleware/throttle.py",
      "startLine": 1,
      "endLine": 16,
      "excerpt": "\"\"\"Rejects API calls over the caller's rate limit.\"\"\"\nfrom app.api.errors import too_many_requests\nfrom app.core.rate_limit import RateLimited, check_rate_limit\n\n\ndef throttle(handler):\n    def wrapped(request):\n        try:\n            remaining = check_rate_limit(request[\"client\"])\n        except RateLimited as error:\n            return too_many_requests(error)\n        response = handler(request)\n        response.setdefault(\"headers\", {})[\"X-RateLimit-Remaining\"] = str(remaining)\n        return response\n\n    return wrapped",
      "sha256": "109f92e01f7148b6fe794f05cbc1628728b1cd032f15449cf1d5bd7aecce8c5b"
    },
    {
      "id": "C3",
      "kind": "source",
      "path": "tests/test_rate_limit.py",
      "startLine": 1,
      "endLine": 20,
      "excerpt": "import unittest\n\nfrom app.core.rate_limit import RateLimited, check_rate_limit\n\n\nclass RateLimitTest(unittest.TestCase):\n    def test_counts_down_within_one_window(self):\n        self.assertEqual(check_rate_limit(\"t1\", now=120.0), 99)\n        self.assertEqual(check_rate_limit(\"t1\", now=150.0), 98)\n\n    def test_raises_over_the_limit(self):\n        for _ in range(100):\n            check_rate_limit(\"t2\", now=600.0)\n        with self.assertRaises(RateLimited):\n            check_rate_limit(\"t2\", now=601.0)\n\n    def test_new_window_resets(self):\n        for _ in range(100):\n            check_rate_limit(\"t3\", now=1200.0)\n        self.assertEqual(check_rate_limit(\"t3\", now=1260.0), 99)",
      "sha256": "a4a3cd961a35cd16032ace9230f0e1ee7e1ea83de7501abafdb0136287f7aa69"
    }
  ],
  "coverage": [
    {
      "id": "V1",
      "paths": [
        "app/core/rate_limit.py"
      ],
      "searches": [
        "read the entry point"
      ],
      "producers": [
        "app/core/rate_limit.py"
      ],
      "consumers": [
        "app/api/middleware/throttle.py"
      ],
      "citationIds": [
        "C1"
      ],
      "state": "inspected"
    },
    {
      "id": "V2",
      "paths": [
        "app/api/middleware/throttle.py",
        "tests/test_rate_limit.py"
      ],
      "searches": [
        "rg -n check_rate_limit app tests"
      ],
      "producers": [
        "app/core/rate_limit.py"
      ],
      "consumers": [],
      "citationIds": [
        "C2",
        "C3"
      ],
      "state": "inspected"
    },
    {
      "id": "V3",
      "paths": [],
      "searches": [
        "rg -n throttle app"
      ],
      "producers": [
        "app/api/middleware/throttle.py"
      ],
      "consumers": [],
      "citationIds": [],
      "state": "pending"
    }
  ],
  "frontier": [
    {
      "item": "routes and servers that use the throttle middleware",
      "reason": "the session ended before the search ran",
      "nextAction": "rg -n 'throttle' app"
    },
    {
      "item": "other importers of RateLimited",
      "reason": "not searched yet",
      "nextAction": "rg -n 'RateLimited' app tests"
    }
  ],
  "flows": [],
  "noRuntimeFlowReason": "draft: flows are traced after the frontier closes",
  "baseline": {
    "revision": "",
    "nonGit": true,
    "dirty": [],
    "checks": [
      {
        "command": "python3 -m unittest discover -s tests -t .",
        "exit": 0,
        "result": "7 tests OK"
      }
    ]
  }
}
```

## Research

- Sources: [Redis rate limiting patterns](https://redis.io/glossary/rate-limiting/).
- How others did it: a sorted set of timestamps per subject, trimmed to the window, or two weighted fixed-window counters.
- What matters: accuracy at window edges against memory per subject.
- Pros and cons: timestamp logs are exact and cost memory; weighted counters are cheap and approximate.
- What this plan will follow: pending the consumer investigation.
- Queries not run: none.

## Questions

### Product

- Is an approximate window acceptable? — default: yes, within 10 percent, because the limiter protects capacity, not billing.

### Technical

- Store layout — default: keep the in-process store.

## Design

## Verification strategy

## Execution strategy

## Todos

## Final verification wave

## Success criteria

## Review
