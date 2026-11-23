#!/usr/bin/env bash
# Installs the built wheel in a clean venv and runs the tests against it, so they test the package a user installs,
# not src/. The tools come from a hashed lock, all as wheels: the port must need no compiler.
# Usage: test-wheel.sh <python> <new venv dir> <dist dir> <requirements lock>
set -euo pipefail
python=$1
venv=$2
dist=$3
lock=$4
package_dir=$(cd "$(dirname "$0")/.." && pwd)

"$python" -m venv "$venv"
pip=("$venv/bin/pip" --quiet --disable-pip-version-check)
"${pip[@]}" install --require-hashes --only-binary=:all: -r "$lock"
# The wheel is ours and has no hash to pin; --no-deps keeps the lock's NumPy, and pip check proves it meets the floor
"${pip[@]}" install --no-deps "$dist"/realtime_bpm_analyzer-*-py3-none-any.whl
"$venv/bin/pip" check
cd "$package_dir"
"$venv/bin/python" -c 'import sys, numpy; print("Python", sys.version.split()[0], "NumPy", numpy.__version__)'
# src/ isn't on the path from here: the import must resolve to the installed wheel
"$venv/bin/python" -c 'import realtime_bpm_analyzer as p; assert "site-packages" in p.__file__, p.__file__; print(p.__file__)'
"$venv/bin/python" -m pytest
