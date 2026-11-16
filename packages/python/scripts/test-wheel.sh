#!/usr/bin/env bash
# Installs the built wheel in a clean venv and runs the tests against it, so they test the package a user installs,
# not src/ (RBA-257). Every package comes as a wheel: the port must need no compiler.
# Usage: test-wheel.sh <python> <new venv dir> <dist dir> <numpy requirement>
set -euo pipefail
python=$1
venv=$2
dist=$3
numpy=$4
package_dir=$(cd "$(dirname "$0")/.." && pwd)

"$python" -m venv "$venv"
"$venv/bin/pip" install --quiet --disable-pip-version-check --only-binary=:all: "$numpy" pytest==9.2.0 "$dist"/realtime_bpm_analyzer-*-py3-none-any.whl
cd "$package_dir"
"$venv/bin/python" -c 'import sys, numpy; print("Python", sys.version.split()[0], "NumPy", numpy.__version__)'
# src/ isn't on the path from here: the import must resolve to the installed wheel
"$venv/bin/python" -c 'import realtime_bpm_analyzer as p; assert "site-packages" in p.__file__, p.__file__; print(p.__file__)'
"$venv/bin/python" -m pytest
