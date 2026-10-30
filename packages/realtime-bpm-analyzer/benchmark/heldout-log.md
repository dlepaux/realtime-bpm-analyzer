# Held-out looks

`run.ts` appends a line here before it reads a held-out label. A look that does not end up in this table did not happen. Results of a look are not used to change the detector. The first run below finished but failed writing its output, so no score from it exists. The second is the one reported.

| date | sha | detectors | reason |
|---|---|---|---|
| 2026-10-30T12:07:24.010Z | 816498c5853c | peaks, tempogram | final score of the RBA-50 tuning, after review (sets giantsteps, ballroom, gtzan, guitarset, limit none) |
| 2026-10-30T12:19:38.774Z | 80fbcbce65ac | peaks, tempogram | rerun: the previous run failed writing its output, no score was written or seen (sets giantsteps, ballroom, gtzan, guitarset, limit none) |
