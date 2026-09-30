#!/bin/sh
# Clears every rate-limit counter for one client from the shared store dump.
# Usage: reset-limits.sh <client> <dump-file>
client=${1:?client}
dump=${2:?dump file}
grep -v "^rl:${client}:" "$dump" > "$dump.new" && mv "$dump.new" "$dump"
