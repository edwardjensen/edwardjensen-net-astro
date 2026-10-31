#!/bin/sh
# Runs a command for a content-source mode, with the mode's secrets from 1Password when available.
#
# Usage: with-op-env.sh <mode> <command...>
#
# If .env.<mode>.op exists (git-ignored; it holds 1Password secret references, op://..., never
# values), the command runs under `op run`, which fetches the values at launch, so the read key is
# never written to disk. Without that file the command runs as is, and the mode's
# .env.<mode>.local supplies the key as before. Shell variables win over every .env file, so the
# injected values win over the mode file's blanks. See docs/environment.md.
set -eu

mode="$1"
shift

if [ -f ".env.$mode.op" ]; then
  exec op run --env-file=".env.$mode.op" -- "$@"
fi
exec "$@"
