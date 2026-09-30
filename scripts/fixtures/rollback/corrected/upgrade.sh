#!/bin/sh
# Moves the memory engine from legacy/ to new-home/. Backs up every file it
# rewrites before the first write, edits only the registration's command, and
# rolls back on any failure, including one inside installation or a signal.
set -eu
ROOT=${ROOT:?set ROOT to the installation root}
BACKUP="$ROOT/.upgrade-backup"
REWRITTEN="hook.sh helpers.sh tool.json"

# Test hooks: FIXTURE_FAIL=<step> makes that step fail. FIXTURE_SIGNAL=<step>
# sends this process SIGTERM right after that named point, deterministically,
# instead of a caller racing a real signal against an arbitrary delay.
step_ok() {
  [ "${FIXTURE_FAIL:-}" != "$1" ]
}

signal_point() {
  [ "${FIXTURE_SIGNAL:-}" = "$1" ] && kill -TERM $$
  :
}

backup_state() {
  # Refuse to disturb an existing backup unless this installation is still in
  # its pre-upgrade state, so a second upgrade (or one after a botched prior
  # run) can never destroy the only good backup.
  if [ ! -x "$ROOT/legacy/bin/memory" ] || [ -e "$ROOT/new-home" ]; then
    echo "upgrade.sh: legacy/bin/memory is missing or new-home/ already exists; refusing to upgrade again" >&2
    return 1
  fi
  tmp="$BACKUP.tmp"
  rm -rf "$tmp"
  mkdir -p "$tmp"
  cp -R "$ROOT/legacy" "$tmp/legacy"
  for file in $REWRITTEN; do
    cp -p "$ROOT/$file" "$tmp/$file"
  done
  rm -rf "$BACKUP"
  mv "$tmp" "$BACKUP"
}

install_new() {
  mkdir -p "$ROOT/new-home/bin" "$ROOT/new-home/bank"
  cp "$ROOT/legacy/bin/memory" "$ROOT/new-home/bin/memory"
  for file in "$ROOT"/legacy/bank/*; do
    { step_ok bank-copy && cat "$file" > "$ROOT/new-home/bank/$(basename "$file")"; } || return 17
  done
  signal_point after-bank-copy
  sed 's#/legacy/bin/memory#/new-home/bin/memory#' "$ROOT/hook.sh" > "$ROOT/hook.sh.new"
  mv "$ROOT/hook.sh.new" "$ROOT/hook.sh"
  chmod +x "$ROOT/hook.sh"
  sed 's#/legacy/bin/memory#/new-home/bin/memory#' "$ROOT/helpers.sh" > "$ROOT/helpers.sh.new"
  mv "$ROOT/helpers.sh.new" "$ROOT/helpers.sh"
  sed 's#"command": "legacy/bin/memory"#"command": "new-home/bin/memory"#' "$ROOT/tool.json" > "$ROOT/tool.json.new"
  mv "$ROOT/tool.json.new" "$ROOT/tool.json"
  rm -rf "$ROOT/legacy"
}

activate() {
  step_ok activate || return 1
  "$ROOT/new-home/bin/memory" ping > /dev/null
}

rollback() {
  # Refuse when there is nothing to roll back to, rather than deleting a
  # working installation and leaving neither copy behind.
  if [ ! -d "$BACKUP/legacy" ]; then
    echo "upgrade.sh: no backup to roll back to; nothing changed" >&2
    return 1
  fi
  rm -rf "$ROOT/new-home"
  rm -rf "$ROOT/legacy"
  cp -R "$BACKUP/legacy" "$ROOT/legacy"
  for file in $REWRITTEN; do
    if [ -f "$BACKUP/$file" ]; then
      cp -p "$BACKUP/$file" "$ROOT/$file"
    fi
  done
}

on_exit() {
  status=$?
  if [ "$status" -ne 0 ]; then
    rollback || true
    echo "upgrade failed with status $status; rolled back" >&2
  fi
  exit "$status"
}

upgrade() {
  backup_state
  # A signal-specific handler with a fixed exit status, not just EXIT: some
  # shells do not reflect a caught signal's number in $? before an EXIT trap
  # runs, so relying on EXIT alone can miss a rollback on SIGINT/SIGTERM/SIGHUP.
  trap 'rollback || true; exit 130' INT
  trap 'rollback || true; exit 143' TERM
  trap 'rollback || true; exit 129' HUP
  trap on_exit EXIT
  install_new
  activate
  trap - EXIT INT TERM HUP
}

case "${1:-}" in
  upgrade) upgrade ;;
  rollback) rollback ;;
  *)
    echo "usage: upgrade.sh upgrade|rollback" >&2
    exit 2
    ;;
esac
