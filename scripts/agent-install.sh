#!/bin/sh
# silly-skills agent-installer.
#
# Copies agents/<persona>/<tool>.md into the flat directory a tool actually
# reads, optionally rewriting the model and effort it pins. From a clone it
# reads the local agents/ directory. Otherwise, or when --source is set, it
# downloads that file from GitHub. --all installs every persona in the folder.
# POSIX sh only: no bashisms, so it runs the same under bash, dash, and zsh.
#
# Usage:
#   agent-install.sh --tool claude-code|opencode|cursor (--agent <persona> | --all)
#                     [--global] [--dest <dir>] [--model <id>] [--effort <level>]
#                     [--agents-dir <dir>] [--source <github-url>] [--dry-run]
#                     [--force] [--help]
#
# Exit code is 0 on success, 1 on any error (unknown tool, unknown persona,
# missing wrapper, a rejected --source host, or an existing file without --force).

set -eu

usage() {
  cat <<'USAGE'
Usage: agent-install.sh --tool claude-code|opencode|cursor (--agent <persona> | --all)
                         [--global] [--dest <dir>] [--model <id>] [--effort <level>]
                         [--agents-dir <dir>] [--source <github-url>] [--dry-run]
                         [--force] [--help]

Copies agents/<persona>/<tool>.md into the agent directory your tool reads.
--agent accepts one persona or a comma-separated list. --all installs every
persona directory that contains that tool's file.

  --tool <name>       claude-code, opencode, or cursor. Required.
  --agent <persona>   Persona folder name, or several separated by commas.
                      Required unless --all.
  --all               Install every persona in agents/ that has this tool's file.
  --global            Install to the user's global agent directory instead of
                      the current project.
  --dest <dir>        Install to this directory instead of the tool default.
                      Overrides --global.
  --model <id>        Rewrite the wrapper's model line to this value. For
                      opencode, a trailing #<variant> sets the variant.
  --effort <level>    Rewrite the wrapper's effort: the claude-code effort
                      line, the cursor [effort=...] suffix, or the opencode
                      #<variant>. On opencode a legacy reasoningEffort line
                      becomes the variant and is removed.
  --agents-dir <dir>  Read personas from this directory instead of agents/
                      beside a clone. Local only; ignores --source.
  --source <url>      Download from this GitHub URL even inside a clone.
                      https://github.com/<owner>/<repo>[/tree/<ref>]
                      or https://raw.githubusercontent.com/<owner>/<repo>/<ref>
  --dry-run           Print the local path or raw URL. Do not download or write.
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
agents_dir=""
source=""
dry_run=0
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
    --agents-dir) agents_dir="$2"; shift 2 ;;
    --source) source="$2"; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
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

if [ -n "$agent" ] && [ "$install_all" -eq 1 ]; then
  echo "error: pass --agent or --all, not both" >&2
  exit 1
fi
if [ -z "$agent" ] && [ "$install_all" -eq 0 ]; then
  echo "error: --agent <persona> or --all is required" >&2
  exit 1
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

work_dir=$(mktemp -d "${TMPDIR:-/tmp}/agent-install.XXXXXX")
trap 'rm -rf "$work_dir"' EXIT

remote=0
owner="Sillybit-io"
repo="silly-skills"
ref="main"
agents_root=""

# Sets owner, repo, and ref from a GitHub URL. Rejects every other host.
parse_source() {
  url="$1"
  url=${url%/}
  case "$url" in
    https://github.com/*) rest=${url#https://github.com/} ;;
    https://raw.githubusercontent.com/*) rest=${url#https://raw.githubusercontent.com/} ;;
    *)
      echo "error: --source must be a github.com or raw.githubusercontent.com URL" >&2
      return 1
      ;;
  esac
  owner=${rest%%/*}
  rest=${rest#*/}
  repo=${rest%%/*}
  rest=${rest#*/}
  repo=${repo%.git}
  # owner/repo.git has no slash left, so rest is still "repo.git".
  if [ "$rest" = "${repo}.git" ]; then
    rest=$repo
  fi
  case "$url" in
    https://github.com/*)
      if [ -z "$rest" ] || [ "$rest" = "$repo" ]; then
        ref="main"
      else
        case "$rest" in
          tree/*) ref=${rest#tree/} ;;
          *)
            echo "error: --source path must be /tree/<ref> or the repository root" >&2
            return 1
            ;;
        esac
      fi
      # owner/repo with nothing after repo leaves rest equal to repo when the
      # URL is exactly two segments. The branch above treats that as main.
      if [ "$rest" = "$repo" ]; then
        ref="main"
      fi
      ;;
    https://raw.githubusercontent.com/*)
      if [ -z "$rest" ] || [ "$rest" = "$repo" ]; then
        echo "error: a raw --source must include a ref after the repository" >&2
        return 1
      fi
      ref=$rest
      ;;
  esac
  if [ -z "$owner" ] || [ -z "$repo" ] || [ -z "$ref" ]; then
    echo "error: could not read owner, repo, and ref from --source" >&2
    return 1
  fi
}

# Choose local agents/ or a GitHub source. --agents-dir wins. --source forces
# the network even inside a clone. A piped script has no agents/ beside it.
resolve_origin() {
  if [ -n "$agents_dir" ]; then
    remote=0
    agents_root=$agents_dir
    return
  fi
  if [ -n "$source" ]; then
    parse_source "$source" || return 1
    remote=1
    return
  fi
  if [ -f "$script_dir/validate.ts" ] && [ -d "$script_dir/../agents" ]; then
    remote=0
    agents_root=$(CDPATH= cd -- "$script_dir/../agents" && pwd)
    return
  fi
  remote=1
}

raw_url() {
  persona="$1"
  printf 'https://raw.githubusercontent.com/%s/%s/%s/agents/%s/%s\n' \
    "$owner" "$repo" "$ref" "$persona" "$wrapper_file"
}

api_url() {
  encoded=$(printf '%s' "$ref" | sed 's|/|%2F|g')
  printf 'https://api.github.com/repos/%s/%s/contents/agents?ref=%s\n' \
    "$owner" "$repo" "$encoded"
}

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

# Sets `key: value` in the frontmatter of stdin: replaces an existing line, or
# inserts one after the `after` key, or before the closing `---`. Values come
# through the environment, so `#`, `&`, and backslashes stay literal.
set_key() {
  KEY="$1" VAL="$2" AFTER="$3" awk '
    BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"]; a = ENVIRON["AFTER"] }
    { lines[NR] = $0 }
    END {
      end = 0
      if (lines[1] == "---") for (i = 2; i <= NR; i++) if (lines[i] == "---") { end = i; break }
      found = 0; anchor = 0
      for (i = 2; i < end; i++) {
        if (index(lines[i], k ":") == 1) found = i
        if (a != "" && index(lines[i], a ":") == 1) anchor = i
      }
      for (i = 1; i <= NR; i++) {
        if (i == found) { print k ": " v; continue }
        if (!found && i == end && !anchor) print k ": " v
        print lines[i]
        if (!found && i == anchor) print k ": " v
      }
    }'
}

# OpenCode V2 carries effort as a model variant: `provider/model#variant`.
# Explicit --effort wins, then a variant in --model, then the wrapper's own
# variant, then a legacy `reasoningEffort` line, which is removed.
normalize_opencode() {
  NEWMODEL="$model" NEWEFFORT="$effort" awk '
    function unquote(v) {
      if (v ~ /^".*"$/ || v ~ /^\047.*\047$/) return substr(v, 2, length(v) - 2)
      return v
    }
    BEGIN { nm = ENVIRON["NEWMODEL"]; ne = ENVIRON["NEWEFFORT"] }
    { lines[NR] = $0 }
    END {
      end = 0
      if (lines[1] == "---") for (i = 2; i <= NR; i++) if (lines[i] == "---") { end = i; break }
      base = ""; variant = ""; legacy = ""; nv = ""; mline = 0
      for (i = 2; i < end; i++) {
        v = lines[i]
        if (v ~ /^model:/) {
          sub(/^model:[ \t]*/, "", v); v = unquote(v); mline = i
          p = index(v, "#")
          if (p > 0) { base = substr(v, 1, p - 1); variant = substr(v, p + 1) } else base = v
        } else if (v ~ /^reasoningEffort:/) {
          sub(/^reasoningEffort:[ \t]*/, "", v); legacy = unquote(v)
        }
      }
      if (nm != "") {
        p = index(nm, "#")
        if (p > 0) { base = substr(nm, 1, p - 1); nv = substr(nm, p + 1) } else base = nm
      }
      if (base == "") { print "error: the wrapper has no model line; pass --model" > "/dev/stderr"; exit 3 }
      final = ne
      if (final == "") final = nv
      if (final == "") final = variant
      if (final == "") final = legacy
      out = "model: " base
      if (final != "") out = out "#" final
      for (i = 1; i <= NR; i++) {
        if (i > 1 && i < end && lines[i] ~ /^reasoningEffort:/) continue
        if (i == mline) { print out; continue }
        if (i == end && mline == 0) print out
        print lines[i]
      }
    }'
}

# Rewrites the model/effort lines of $1 and writes the result to $2. With no
# override the wrapper is copied byte for byte.
write_wrapper() {
  src="$1"
  out="$2"

  if [ -f "$out" ] && [ "$force" -eq 0 ]; then
    echo "error: '$out' already exists (use --force to overwrite)" >&2
    return 1
  fi

  rewritten="$work_dir/rewritten.md"
  cp "$src" "$rewritten"

  if [ -n "$model" ] || [ -n "$effort" ]; then
    case "$tool" in
      cursor)
        NEWMODEL="$model" NEWEFFORT="$effort" awk '
          BEGIN { newmodel = ENVIRON["NEWMODEL"]; neweffort = ENVIRON["NEWEFFORT"]; fm = 0 }
          NR == 1 && $0 == "---" { fm = 1; print; next }
          fm == 1 && $0 == "---" { fm = 2; print; next }
          fm == 1 && /^model: / {
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
        ' "$rewritten" >"$rewritten.tmp" || return 1
        ;;
      opencode)
        normalize_opencode <"$rewritten" >"$rewritten.tmp" || return 1
        ;;
      claude-code)
        cp "$rewritten" "$rewritten.tmp"
        if [ -n "$model" ]; then
          set_key model "$model" "" <"$rewritten.tmp" >"$rewritten.step" || return 1
          mv "$rewritten.step" "$rewritten.tmp"
        fi
        if [ -n "$effort" ]; then
          set_key effort "$effort" model <"$rewritten.tmp" >"$rewritten.step" || return 1
          mv "$rewritten.step" "$rewritten.tmp"
        fi
        ;;
    esac
    mv "$rewritten.tmp" "$rewritten"
  fi

  mkdir -p "$(dirname "$out")"
  cp "$rewritten" "$out"

  model_line=$(grep '^model: ' "$out" | head -n1 || true)
  echo "wrote $out ($model_line)"
}

# Prints one persona name per line into $work_dir/names.
write_names() {
  out="$work_dir/names"
  : >"$out"
  if [ "$install_all" -eq 1 ]; then
    if [ "$remote" -eq 1 ]; then
      if [ "$dry_run" -eq 1 ]; then
        api_url
        return 0
      fi
      listing="$work_dir/listing.json"
      if ! curl -fsSL -H "Accept: application/vnd.github+json" "$(api_url)" -o "$listing"; then
        echo "error: could not list agents/ (pass --agent <persona>)" >&2
        return 1
      fi
      # GitHub lists "name" before "type" on each object. Print name only for directories.
      awk '
        /"name"/ {
          line = $0
          sub(/.*"name"[[:space:]]*:[[:space:]]*"/, "", line)
          sub(/".*/, "", line)
          name = line
        }
        /"type"[[:space:]]*:[[:space:]]*"dir"/ {
          if (name != "") print name
          name = ""
        }
      ' "$listing" >"$out"
      if [ ! -s "$out" ]; then
        echo "error: no persona directories in agents/ (pass --agent <persona>)" >&2
        return 1
      fi
      return 0
    fi
    found=0
    for dir in "$agents_root"/*; do
      [ -d "$dir" ] || continue
      [ -f "$dir/$wrapper_file" ] || continue
      basename "$dir" >>"$out"
      found=1
    done
    if [ "$found" -eq 0 ]; then
      echo "error: no persona directory contains $wrapper_file" >&2
      return 1
    fi
    return 0
  fi
  printf '%s\n' "$agent" | tr ',' '\n' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | sed '/^$/d' >"$out"
  if [ ! -s "$out" ]; then
    echo "error: --agent did not name a persona" >&2
    return 1
  fi
}

install_one() {
  name="$1"
  case "$name" in
    *[!a-z0-9-]*|"")
      echo "error: persona name '$name' must be lowercase words separated by hyphens" >&2
      return 1
      ;;
  esac

  if [ "$remote" -eq 1 ]; then
    url=$(raw_url "$name")
    if [ "$dry_run" -eq 1 ]; then
      printf '%s\n' "$url"
      return 0
    fi
    downloaded="$work_dir/downloaded.md"
    if ! curl -fsSL "$url" -o "$downloaded"; then
      echo "error: could not download $url" >&2
      return 1
    fi
    src=$downloaded
  else
    src="$agents_root/$name/$wrapper_file"
    if [ ! -f "$src" ]; then
      echo "error: no $wrapper_file found for persona '$name'" >&2
      return 1
    fi
    if [ "$dry_run" -eq 1 ]; then
      printf '%s\n' "$src"
      return 0
    fi
  fi

  out_dest=$(resolve_dest)
  write_wrapper "$src" "$out_dest/$name.md"
}

resolve_origin

# --all --dry-run on a remote source prints the listing URL and stops.
if [ "$install_all" -eq 1 ] && [ "$remote" -eq 1 ] && [ "$dry_run" -eq 1 ]; then
  api_url
  exit 0
fi

write_names

status=0
while IFS= read -r name; do
  install_one "$name" || status=1
done <"$work_dir/names"
exit $status
