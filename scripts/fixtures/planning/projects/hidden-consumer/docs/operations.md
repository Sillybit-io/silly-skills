# Operations

## Rate limits

Each client gets `max_requests` calls per fixed window of `window_seconds`, set in `config/limits.json`. Set `RATE_LIMIT_WINDOW` to override the window length in seconds.

Counters are stored under `rl:<client>:<window>`. To clear one client's counters from a store dump, run `ops/reset-limits.sh <client> <dump-file>`.

The health route is never rate limited.
