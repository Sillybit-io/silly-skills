#!/bin/sh
# silly-skills agent-installer.
#
# Copies a skill's per-tool "agents/" wrapper file into the agent directory a
# tool actually reads, optionally rewriting the model and effort it pins.
# POSIX sh only: no bashisms, so it runs the same under bash, dash, and zsh,
# and works unmodified in this repository's Ubuntu CI (where /bin/sh is dash).
#
# Usage:
#   agent-install.sh --tool claude-code|opencode|cursor (--agent <skill> | --all)
#                     [--global] [--dest <dir>] [--model <id>] [--effort <level>]
#                     [--skills-dir <dir>] [--force] [--help]
#
# Exit code is 0 on success, 1 on any error (unknown tool, unknown skill,
# missing wrapper, or an existing file without --force).

set -eu

usage() {
  cat <<'USAGE'
Usage: agent-install.sh --tool claude-code|opencode|cursor (--agent <skill> | --all)
                         [--global] [--dest <dir>] [--model <id>] [--effort <level>]
                         [--skills-dir <dir>] [--force] [--help]

Copies skills/<category>/<skill>/agents/<tool>.md into the agent directory your
tool reads, optionally rewriting the model and effort it pins.

  --tool <name>       claude-code, opencode, or cursor. Required.
  --agent <skill>     The skill name to install. Required unless --all.
  --all               Install every skill that ships an agents/<tool>.md.
  --global            Install to the user's global agent directory instead of
                      the current project.
  --dest <dir>        Install to this directory instead of the tool default.
                      Overrides --global.
  --model <id>        Rewrite the wrapper's model line to this value.
  --effort <level>    Rewrite the wrapper's effort line (or, for cursor, the
                      [effort=...] suffix) to this value.
  --skills-dir <dir>  Look for skills under this directory instead of the
                      normal search path.
  --force             Overwrite an existing destination file.
  --help              Show this message.
USAGE
}

tool=""
agent=""
install_all=0
global=0
dest=""
model=""
effort=""
skills_dir=""
force=0

while [ $# -gt 0 ]; do
  case "$1" in
    --tool) tool="$2"; shift 2 ;;
    --agent) agent="$2"; shift 2 ;;
    --all) install_all=1; shift ;;
    --global) global=1; shift ;;
    --dest) dest="$2"; shift 2 ;;
    --model) model="$2"; shift 2 ;;
    --effort) effort="$2"; shift 2 ;;
    --skills-dir) skills_dir="$2"; shift 2 ;;
    --force) force=1; shift ;;
    --help) usage; exit 0 ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$tool" ]; then
  echo "error: --tool is required" >&2
  exit 1
fi
case "$tool" in
  claude-code) wrapper_file="claude-code.md" ;;
  opencode) wrapper_file="opencode.md" ;;
  cursor) wrapper_file="cursor.md" ;;
  *)
    echo "error: unknown tool '$tool' (expected claude-code, opencode, or cursor)" >&2
    exit 1
    ;;
esac

if [ -z "$agent" ] && [ "$install_all" -eq 0 ]; then
  echo "error: --agent <skill> or --all is required" >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/agent-install.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT

# Destination directory for the copied wrapper.
resolve_dest() {
  if [ -n "$dest" ]; then
    printf '%s\n' "$dest"
    return
  fi
  if [ "$global" -eq 1 ]; then
    case "$tool" in
      claude-code) printf '%s\n' "$HOME/.claude/agents" ;;
      opencode) printf '%s\n' "$HOME/.config/opencode/agents" ;;
      cursor) printf '%s\n' "$HOME/.cursor/agents" ;;
    esac
    return
  fi
  case "$tool" in
    claude-code) printf '%s\n' ".claude/agents" ;;
    opencode) printf '%s\n' ".opencode/agents" ;;
    cursor) printf '%s\n' ".cursor/agents" ;;
  esac
}

# Writes every directory this script searches for skills/<name>/agents/<tool>.md
# in, one per line, to $work_dir/search-dirs: an explicit --skills-dir wins
# outright; otherwise a clone of this repository (detected by validate.ts
# sitting next to this script), then each tool's project-level skills
# directory, then each tool's global skills directory.
write_search_dirs() {
  out="$work_dir/search-dirs"
  : >"$out"
  if [ -n "$skills_dir" ]; then
    printf '%s\n' "$skills_dir" >>"$out"
    return
  fi
  if [ -f "$script_dir/validate.ts" ] && [ -d "$script_dir/../skills" ]; then
    for d in "$script_dir"/../skills/*; do
      [ -d "$d" ] && printf '%s\n' "$d" >>"$out"
    done
  fi
  printf '%s\n' \
    "./.claude/skills" \
    "./.agents/skills" \
    "./.opencode/skills" \
    "./.cursor/skills" \
    "$HOME/.claude/skills" \
    "$HOME/.agents/skills" \
    "$HOME/.config/opencode/skills" \
    "$HOME/.cursor/skills" \
    >>"$out"
}

# Prints the path to skills/<name>/agents/<tool>.md for the first search
# location that has it, or nothing.
find_wrapper() {
  name="$1"
  while IFS= read -r base; do
    [ -d "$base" ] || continue
    candidate="$base/$name/agents/$wrapper_file"
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done <"$work_dir/search-dirs"
}

# Writes every skill name that ships agents/<tool>.md to $work_dir/all-names,
# one per line, deduplicated so a project install shadows a global one.
write_all_names() {
  out="$work_dir/all-names"
  : >"$out"
  while IFS= read -r base; do
    [ -d "$base" ] || continue
    for skill_dir in "$base"/*; do
      [ -d "$skill_dir" ] || continue
      [ -f "$skill_dir/agents/$wrapper_file" ] || continue
      skill_name=$(basename "$skill_dir")
      grep -qx "$skill_name" "$out" 2>/dev/null || echo "$skill_name" >>"$out"
    done
  done <"$work_dir/search-dirs"
}

# Rewrites the model/effort lines of $1 and writes the result to $2.
write_wrapper() {
  src="$1"
  out="$2"

  if [ -f "$out" ] && [ "$force" -eq 0 ]; then
    echo "error: '$out' already exists (use --force to overwrite)" >&2
    return 1
  fi

  rewritten="$work_dir/rewritten.md"
  cp "$src" "$rewritten"

  if [ "$tool" = "cursor" ]; then
    # Cursor pins effort as a [effort=...] suffix on the model line, so a
    # model and/or effort override is applied together in one awk pass:
    # keep whichever of model/effort was not given, replace whichever was.
    if [ -n "$model" ] || [ -n "$effort" ]; then
      awk -v newmodel="$model" -v neweffort="$effort" '
        /^model: / {
          line = $0
          sub(/^model: /, "", line)
          base = line
          bracket = ""
          idx = index(line, "[")
          if (idx > 0) {
            base = substr(line, 1, idx - 1)
            bracket = substr(line, idx)
          }
          if (newmodel != "") base = newmodel
          if (neweffort != "") bracket = "[effort=" neweffort "]"
          print "model: " base bracket
          next
        }
        { print }
      ' "$rewritten" >"$rewritten.tmp"
      mv "$rewritten.tmp" "$rewritten"
    fi
  else
    if [ -n "$model" ]; then
      sed -i.bak "s#^model: .*#model: ${model}#" "$rewritten"
      rm -f "$rewritten.bak"
    fi
    if [ -n "$effort" ]; then
      effort_key="effort"
      [ "$tool" = "opencode" ] && effort_key="reasoningEffort"
      if grep -q "^${effort_key}: " "$rewritten"; then
        sed -i.bak "s#^${effort_key}: .*#${effort_key}: ${effort}#" "$rewritten"
        rm -f "$rewritten.bak"
      else
        awk -v key="$effort_key" -v val="$effort" '
          /^model: / { print; print key ": " val; next }
          { print }
        ' "$rewritten" >"$rewritten.tmp"
        mv "$rewritten.tmp" "$rewritten"
      fi
    fi
  fi

  mkdir -p "$(dirname "$out")"
  cp "$rewritten" "$out"

  model_line=$(grep '^model: ' "$out" | head -n1 || true)
  echo "wrote $out ($model_line)"
}

install_one() {
  name="$1"
  wrapper=$(find_wrapper "$name")
  if [ -z "$wrapper" ]; then
    echo "error: no agents/$wrapper_file found for skill '$name'" >&2
    return 1
  fi
  out_dest=$(resolve_dest)
  write_wrapper "$wrapper" "$out_dest/$name.md"
}

write_search_dirs

if [ "$install_all" -eq 1 ]; then
  write_all_names
  if [ ! -s "$work_dir/all-names" ]; then
    echo "error: no skills with an agents/$wrapper_file were found" >&2
    exit 1
  fi
  status=0
  while IFS= read -r name; do
    install_one "$name" || status=1
  done <"$work_dir/all-names"
  exit $status
else
  install_one "$agent"
fi
