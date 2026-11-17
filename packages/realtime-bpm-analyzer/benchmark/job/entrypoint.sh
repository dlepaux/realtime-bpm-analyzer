#!/bin/bash
# Container entrypoint, and the same thing outside one. Args: see benchmark/job/readme.md
set -euo pipefail

exec "$(dirname "$0")/../run.sh" job "$@"
