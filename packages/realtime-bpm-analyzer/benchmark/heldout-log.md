# Held-out looks

`run.ts` appends a line here before it reads a held-out label. A look that does not end up in this table did not happen. Results of a look are not used to change the detector's values, though RBA-50's look did motivate the penalty knobs that RBA-51 then tuned on dev. The first run below finished but failed writing its output, so no score from it exists. The second is the one reported. The third, RBA-51's, ran in the batch job and stopped on one undecodable track: its finished runs are the ones reported, see the Results of `readme.md`.

| date | sha | detectors | reason |
|---|---|---|---|
| 2026-10-30T12:07:24.010Z | 816498c5853c | peaks, tempogram | final score of the RBA-50 tuning, after review (sets giantsteps, ballroom, gtzan, guitarset, limit none) |
| 2026-10-30T12:19:38.774Z | 80fbcbce65ac | peaks, tempogram | rerun: the previous run failed writing its output, no score was written or seen (sets giantsteps, ballroom, gtzan, guitarset, limit none) |
| 2026-10-31T15:07:11.550Z | b1ab9d319911 | peaks, tempogram-285, tempogram | final score of the RBA-51 licence-clean defaults, fixed in b1ab9d3 before this look, per the DECISION of 2026-10-31 (sets giantsteps, ballroom, gtzan, guitarset, fsld, fsld-nc, groove, limit none) |
