#!/bin/bash
# RBA-59's data run, one stage or all of them. Every stage resumes, so a new run id continues a killed
# run. The job's template holds the writer lock around this.
# Usage: free-data.sh <all|synth|catalogue|fetch|analyse|consolidate|samples|report>
set -euo pipefail

cd "$(dirname "$0")/.."
root="${RBA_TEMPO_ROOT:-/data/rba-tempo}/free-data"
stage() { node dist/free-data.mjs "$@" --root "$root"; }
analyse() {
  stage list
  # Six: a worker peaks near 1 GB on a two-minute excerpt, and the job's limit is 6 GiB
  python3 job/trackers.py --list "$root/analysis-list.jsonl" --out "$root/readings.jsonl" --workers "${RBA_JOB_WORKERS:-6}" --checkpoint final0
}
samples() {
  stage synth --count 12
  stage derive --count 12
  stage mixes --count 6
}

case "${1:-}" in
  all)
    stage synth --count 12
    stage catalogue
    stage fetch
    analyse
    stage consolidate
    samples
    stage report
    ;;
  analyse) analyse ;;
  samples) samples ;;
  synth | catalogue | fetch | consolidate | report) stage "$1" ;;
  *)
    echo "unknown stage: ${1:-none}" >&2
    exit 2
    ;;
esac
