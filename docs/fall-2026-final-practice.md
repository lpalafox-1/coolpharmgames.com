# Fall 2026 Lab III Final Practice prototype

Owner-requested October 27, 2026. Luis alone controls product decisions and
merges. This prototype depends on the separate faculty-form policy change
(d1ca04ec28725565afcae545162a78f6b2f5ba19, PR #91). It is not a professor-authored
final blueprint or a deployment claim.

## Source and faculty boundary

Questions come only from the existing Fall generator and canonical
`assets/data/fall-2026-p2-top-drugs.json`, with the existing written quiz policy.
No P1 pool, outside clinical facts, new drug records, policy edits, MTC, or new
pair-recognition question forms are used. The six written domains remain
Brand/Generic, Drug Class, FDA Indication, MOA, Top ADRs and BBW.

Luis's faculty-verbal evidence rejects reverse no-BBW identification and
whole-ADR-list-to-drug identification. Those forms are blocked by PR #91 and
checked again by this composer. Forward full top ADR lists, positive drug-to-
BBW, source-safe single ADR recognition and existing exact/source-approved
class-coherent Pairwise Shared ADR remain available. Verbal approval of
correct drug–class and drug–indication pairs is future scope, not shipped here.
The merged #90 prompt display adapter remains presentation-only; canonical
prompts, plain answers, matching contracts and Queue identities are preserved.

## Composition and reproducibility

- Exactly 100 items, exactly ten attributed to each primary source week 1–10.
  Every week includes all six domains. The four extra weekly slots go to the
  globally least-represented domains with demonstrated concept capacity, at
  most two slots per domain/week. No redistribution or padding fallback exists.
- Both choices sample the identical seeded pool: twelve Week Focus draws per
  week. Balanced does not read history, Queue, memory or time options. Adaptive
  reuses the existing signal/weakness/scoring helpers inside the exact same
  week/domain envelope; it never calls the weekly 6+4 Adaptive composer.
- Unique IDs, normalized prompts, content fingerprints, drug/domain concepts
  and unordered pair concepts. Pair members also reserve their ADR concepts.
  Each tested source record appears at most twice, counting both pair members.
- At most five Pairwise Shared ADRs and three existing NOT/EXCEPT questions;
  neither has a quota. No NOT-BBW form. Weeks are interleaved; no adjacent
  tested-drug reuse; no three consecutive domain/variant repetitions.
- The existing complete-set Brand/Generic direction, answer and choice leakage
  guard runs on all 100 together, with a bounded 256-direction search. Weekly
  callers keep the original unbounded guard and byte-identical seeded output
  relative to PR #91. Composition has bounded retries and fails closed.
- Provenance retains seed, composer version, source/workbook and policy hashes,
  eligible weeks, envelope, sampled pool size, bounded-search attempt, all
  question/choice/tested-fact source metadata and ordered fingerprints.
  Adaptive additionally freezes signal time/basis. Recomposition requires the
  same source/version/seed and, for Adaptive, the same evidence/time inputs.
  Resume/retry use the full stored payload, not a fresh recomposition.

Current-source fixtures produce 17 questions in each of the first five domains
and 15 BBW questions. These are product balancing results, not faculty-set
percentages. Removal of the rejected forms does not prevent ten per week.

## Player, history and storage

The hub defaults to Balanced and offers optional Adaptive. The 100-minute
practice timer is pausable. Optional True Exam Mode keeps drafts editable and
defers grading/feedback to submission; hints/reveal are unavailable there.
Final-only mobile navigation scrolls inside a compact panel. The initial timer
is painted before it can be paused.

Kinds: `fall-2026-lab3-final-balanced` / `fall-2026-lab3-final-adaptive`.
History modes: `final-balanced` / `final-adaptive`, with `-exam` when applicable.
Stats reads these distinct identities. Completed Finals may contribute to the
existing Fall Adaptive history signal; no fabricated weekly memory rounds are
written. Existing history and Queue data are never migrated.

Completion offers Review Missed, matching New Final, Retry Same Final, and hub.
Review retains parent Final mode and does not overwrite its score/history.
A perfect Final review reaches results instead of the legacy review replay.
Retry restores the original full payload even if another tab replaced the
custom-quiz key. Week/domain summaries count actual outcomes by primary week.
Scores remain 0–100 for full attempts; review scores describe only the subset.

A source/capacity/quota failure before launch preserves the previous payload
and does not navigate. Progress-save failure is surfaced in the player. In
Chrome acceptance, stored payloads were 233,443–244,825 characters and progress
snapshots 457,197–479,490 characters, including the exact retry payload.
Storage limits remain browser-dependent; quota failure is tested explicitly.

## Validation on the completed prototype

All four repository gates pass, including 450/450 tools tests. One hundred
seeded Finals (50 Balanced / 50 Adaptive) pass independent size, week/domain,
identity, cap, ordering, source and whole-set Brand/Generic leakage assertions.
Adversarial weakness evidence changes selection while preserving the envelope.
Balanced rejects even attempts to read poison evidence/time getters.

System Chrome 1280×900 and touch-mobile 390×844 complete both modes: hub launch,
100 items, marks, pausing, saved progress/resume, 98/100 with intentional misses,
Final history, two-item Review Missed without a new full score, exact 100-item
retry, no page errors and no horizontal overflow. Both True Exam modes submit
100 visited questions and launch a fresh Final with the same mode/exam identity.
Separate evidence verifies an entered answer stays ungraded before submission.

Canonical Fall source, written policy, P1 source and Queue store remain unchanged.
The generator/Adaptive/Final/launcher/hub/engine cache chain and Stats importer
all use `20261027b`. Live production activation awaits Luis's merge decision.
