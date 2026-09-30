#!/bin/sh
# Session hook: forwards the request to the memory engine.
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
engine="$here/legacy/bin/memory"
if [ -x "$engine" ]; then
  exec "$engine" "$@"
fi
# A missing engine is silent: the host receives an empty result.
printf '{}\n'
