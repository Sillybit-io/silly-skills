# Shell helpers sourced by the owner's profile. MEMORY_ROOT names the installation.
memory_bin() {
  printf '%s\n' "$MEMORY_ROOT/legacy/bin/memory"
}

memory() {
  "$(memory_bin)" "$@"
}
