#!/bin/sh
# Nightly job: asks the memory engine to compact the bank.
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
engine="$root/legacy/bin/memory"
if [ ! -x "$engine" ]; then
  echo "memory-sync: engine not found at $engine" >&2
  exit 3
fi
"$engine" compact
