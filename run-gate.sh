#!/usr/bin/env bash
# Launch Gate from any directory using a supported Node runtime and the shared supervisor.
set -euo pipefail
GATE_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

choose_node() {
  local candidate
  for candidate in "${GATE_NODE:-}" "$(command -v node || true)" "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
    if [[ -n "$candidate" && -x "$candidate" ]] && "$candidate" -e 'const [major,minor]=process.versions.node.split(".").map(Number);process.exit(major>22 || (major===22 && minor>=12) ? 0 : 1)' >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  printf '%s\n' 'Gate requires Node.js 22.12+; install it or set GATE_NODE to its executable.' >&2
  return 1
}

GATE_RUNTIME="$(choose_node)"
export PATH="$(dirname -- "$GATE_RUNTIME"):$PATH"
exec "$GATE_RUNTIME" "$GATE_ROOT/scripts/run-gate.mjs" "$@"
