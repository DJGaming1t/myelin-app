# Global Progress evidence — M04o

Approved scope: user-reviewed Argos recommendations, based on GitHub head `8ea8d28d8475aae0c7e27b1d3aac4fcc335081a0` (2026-10-17 IST). This is a read-only aggregate correction, not a history migration or a new scheduler.

## Query rules

- Every Progress history query excludes nonfinite, invalid, negative and future `at` timestamps relative to its supplied `now`. Snapshot, daily history, topic trends, timing and confidence use the same clock. Timing/confidence add an optional `now = Date.now()` argument; existing one-argument calls remain supported.
- Confidence and timing keep their existing all-history sample scope; no new 30-day cutoff is imposed.
- Current/previous weeks and the 30-day Progress window retain local calendar arithmetic and their original inclusive starts/exclusive day ends. The clock filter includes events exactly at `now`, excludes even `now + 1ms`, and does not shorten completed historical days. DST days are not forced to 24 hours.
- Progress study time is recorded study **plus review** minutes. Breaks are excluded. Today capacity intentionally includes breaks and standalone task capacity; its implementation is unchanged.
- History must refer to an existing topic. If a `cardId` is present, that question must belong uniquely to that topic. Reused IDs in different topics are independently attributable using both IDs. Unresolvable duplicate IDs within one topic are excluded defensively.
- Topic-level and legacy reviews without `cardId` remain valid for study time, review counts and topic trends. Confidence still requires a recorded `reviewAttemptId`. No missing question ID is invented for retention.
- Finished standalone Focus outcomes contribute minutes only when their start/end are valid, already recorded and ordered. Topic-linked Focus still uses its study-history representation.

## Focus duplication and timing

A standalone outcome is represented by existing history only when all of these match:

- History ID is `session_${outcome.id}` and its kind is `study`.
- History `at` and `endedAt` equal the outcome's `endedAt`.
- `startedAt`, recorded minutes, planned minutes and launch mode also match.
- The history record passes the timestamp/identity query rules.

The verified history representation is counted once for time and timing calibration. A colliding ID, a review, invalid history or contradictory/missing metadata cannot hide legitimate standalone work. Ambiguous legacy/imported representations without enough matching metadata remain separate; this deliberately avoids assuming two unrelated records are duplicates. No FocusProvider, task completion or persistence behavior changes.

Timing calibration requires positive recorded minutes and positive planned minutes. Zero-minute records remain in history and Focus starts/completions. Positive short or fractional durations stay eligible. The existing timer rounds to whole minutes, so some sub-30-second sessions record zero; those cannot provide a meaningful nonzero timing ratio and are excluded only from this comparison. The UI explains this exclusion.

Removing zero-minute timing samples reduces the calibration sample size and planned-minute total; ratios/medians/direction can change, or the result can become insufficient data. For example, three normal 25/25-minute blocks and three zero/25-minute finishes previously had median ratio 50%; the three positive samples now have median 100%. This is a timing-estimate correction, not deletion of completed sessions.

Outcome start/completion statistics keep their existing rolling start-cohort window and retain zero-minute completions. A completion dated after `now` is not yet counted as finished; its already-recorded start remains counted.

## Retention: preserved semantics

Delayed retention continues to use saved `elapsedDays >= 1`, meaning a recorded gap of at least **24 hours**, not simply crossing local midnight. The window remains the previous `30 * 24 hours` through `now`, inclusive; it is distinct from Progress's 30 local calendar dates.

The order stays:

1. Validate topic/question attribution and time.
2. Select reviews in the rolling window with a question ID, the recorded 24-hour gap and no hint.
3. Sort eligible reviews chronologically; preserve saved array order for equal timestamps.
4. Keep the first **eligible** review per topic ID/question ID/local calendar date.
5. Practising or Good counts as recalled.

This does not make retention first-attempt-only. Hinted or insufficiently delayed earlier records do not block a later qualifying record. Ordinary immediate retries have `elapsedDays = 0` and remain excluded. The UI now states the first-eligible rule and the 24-hour threshold explicitly. Neural Map keeps its separate unhinted-Good-per-day milestone algorithm, including eventual successful retries.

## Deferred product decision: first attempt versus first eligible

Argos proposed deduplicating all daily attempts before testing hints/delay. **Not implemented.** It requires separate approval/versioning because it can change historical samples and rates even when every record is valid.

| Recorded sequence for the same topic/question/local day | Current first-eligible calculation | Proposed stricter calculation |
| --- | --- | --- |
| Hinted delayed attempt, then an unhinted attempt also recorded with a 24h+ gap | Later eligible attempt supplies one sample | No sample: the first attempt was hinted |
| Insufficiently delayed attempt, then a later eligible attempt | Later eligible attempt supplies one sample | No sample: the first attempt was insufficiently delayed |
| Unhinted delayed Again, then immediate Good (`elapsedDays = 0`) | One unsuccessful sample | Same |
| Unhinted delayed Good, then another eligible attempt | First eligible Good supplies one successful sample | Same |

The first two sequences can occur in imported records; a 25-hour DST day can also contain attempts 24 hours apart. Excluding their later samples would reduce sample counts. The historical success rate could rise or fall depending on the grades removed; it is not safe to label the change a neutral refactor.

## Expected effects and limitations

- Future or invalid records and mismatched/orphaned pairs no longer inflate minutes, counts, confidence, timing or topic trends. These displayed totals may decrease.
- Verified Focus duplication no longer doubles minutes/timing samples. Ambiguous matches are not silently removed.
- Retention samples with wrong identity are excluded. Composite identity can restore separate samples previously collapsed when two topics shared a question ID; samples and rates may therefore increase or decrease.
- Valid legacy/topic-level sessions, short positive work, eligible retention ordering, calendar windows, saved history and Neural Map milestones are preserved.
- These queries trust validated saved grades, minutes and elapsed-gap metadata; they are not an independent assessment of learning or a repair of corrupted imports.
- Physical Android accessibility and real signed-in account transitions still require device QA. M04m/M04n guards, schema, native dependencies and scheduling are unchanged.
