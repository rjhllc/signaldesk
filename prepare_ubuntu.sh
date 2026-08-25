#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

require_command python3
require_command bun

printf 'Installing the locked desktop build dependencies...\n'
bun install --frozen-lockfile

# Bun can defer Electron's platform binary download even when the package is present.
if [[ ! -x node_modules/electron/dist/electron ]]; then
  printf 'Downloading the Electron runtime for this Ubuntu VM...\n'
  bun node_modules/electron/install.js
fi

printf 'Running backend contracts...\n'
python3 -m unittest -v test_backend.py
printf 'Running desktop credential contracts...\n'
bun test desktop/configuration.test.cjs

printf '\nSignalDesk development environment is ready in %s\n' "$ROOT"
printf 'Run the desktop app: bun run start\n'
printf 'Build the Windows release: bun run build:windows\n'
