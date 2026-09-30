#!/bin/sh
# Moves the memory engine from legacy/ to new-home/.
set -eu
ROOT=${ROOT:?set ROOT to the installation root}
BACKUP="$ROOT/.upgrade-backup"

# Test hook: FIXTURE_FAIL=<step> makes that step fail.
step_ok() {
  [ "${FIXTURE_FAIL:-}" != "$1" ]
}

backup_legacy() {
  rm -rf "$BACKUP"
  mkdir -p "$BACKUP"
  cp -R "$ROOT/legacy" "$BACKUP/legacy"
}

install_new() {
  mkdir -p "$ROOT/new-home/bin" "$ROOT/new-home/bank"
  cp "$ROOT/legacy/bin/memory" "$ROOT/new-home/bin/memory"
  for file in "$ROOT"/legacy/bank/*; do
    { step_ok bank-copy && cat "$file" > "$ROOT/new-home/bank/$(basename "$file")"; } || exit 17
  done
  sed 's#/legacy/bin/memory#/new-home/bin/memory#' "$ROOT/hook.sh" > "$ROOT/hook.sh.new"
  mv "$ROOT/hook.sh.new" "$ROOT/hook.sh"
  chmod +x "$ROOT/hook.sh"
  sed 's#/legacy/bin/memory#/new-home/bin/memory#' "$ROOT/helpers.sh" > "$ROOT/helpers.sh.new"
  mv "$ROOT/helpers.sh.new" "$ROOT/helpers.sh"
  printf '{\n  "name": "memory",\n  "command": "new-home/bin/memory",\n  "enabled": true\n}\n' > "$ROOT/tool.json"
  rm -rf "$ROOT/legacy"
}

activate() {
  step_ok activate || return 1
  "$ROOT/new-home/bin/memory" ping > /dev/null
}

rollback() {
  rm -rf "$ROOT/new-home"
  rm -rf "$ROOT/legacy"
  cp -R "$BACKUP/legacy" "$ROOT/legacy"
}

upgrade() {
  backup_legacy
  install_new
  if ! activate; then
    rollback
    return 1
  fi
}

case "${1:-}" in
  upgrade) upgrade ;;
  rollback) rollback ;;
  *)
    echo "usage: upgrade.sh upgrade|rollback" >&2
    exit 2
    ;;
esac
