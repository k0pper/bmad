# Deferred Work

Items raised in code reviews that are real but deliberately not addressed in their original story. Track here so they aren't forgotten.

## Deferred from: code review of 3-2-cv-version-management (2026-05-08)

- **Concurrent delete of two siblings sharing the same `s3Key` orphans the blob** — Two `deleteCvVersion` calls for siblings A and B that share `s3Key` can interleave such that each sees `otherCount = 1` and skips `safeDelBlob`. The blob is never reclaimed. AC4 explicitly accepts blob deletion as best-effort and Neon HTTP forbids transactions, so the fix belongs in a future periodic blob-reaper job rather than in the action. [followcv/src/actions/manage-cv.ts:195-203]

- **Delete-vs-Use-as-current race leaves a row pointing at a deleted blob** — Tx1 (delete A, sole holder of `s3Key`) reads `count = 0` and queues `del(s3Key)`. Tx2 (Use-as-current targeting A creates B) interleaves between Tx1's count and `del`. After both, B exists referencing a deleted blob and downloads/preview will 404. Same root cause as above (no transactions under Neon HTTP) and same deferral — addressable by the same blob-reaper that re-validates row→blob references, or by introducing a soft-delete + reaper pattern. [followcv/src/actions/manage-cv.ts:195-203]
