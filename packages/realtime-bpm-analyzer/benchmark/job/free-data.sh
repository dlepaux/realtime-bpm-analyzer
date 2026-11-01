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
  # Four, whatever the job's own RBA_JOB_WORKERS says, which is its core count: a worker peaks near
  # 1 GB on a two-minute excerpt with its decodes on top, and the job's limit is 6 GiB. Eight were
  # OOM-killed within a minute.
  python3 job/trackers.py --list "$root/analysis-list.jsonl" --out "$root/readings.jsonl" --workers "${RBA_TRACKER_WORKERS:-4}" --checkpoint final0
}
samples() {
  stage synth --count 28
  stage derive --count 12
  stage mixes --count 6
}

case "${1:-}" in
  all)
    # Before the trackers, as the generated tracks are also their calibration
    stage synth --count 28
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
