# Fall 2026 Lab III question-form audit — November 1, 2026

Luis is sole product and merge authority. This owner-requested change follows
Luis's report of professor feedback (faculty verbal evidence, not a revision
to the written curriculum or official JSON policy).

## Evidence

Written accountability guidance as transcribed by Luis: 100 Fall medications,
ten per week; Brand/Generic FITB, class, primarily main FDA indication, MOA,
Top 3/serious ADRs, boxed warning. The owner-supplied ten-quiz classification
reports 89 MCQ/11 FITB, every Brand/Generic item FITB, and all six domains in
each weekly quiz. Weekly counts 27 ADR/20 FDA/20 class/11 MOA/11 Brand/Generic/
11 BBW calibrate forms, not Final weights. The private faculty question bank
and keys are not copied into this repository.

Luis-reported **verbal** faculty guidance is distinct from written evidence:
no drug identification from no-BBW or complete ADR lists (October 27); the
Final balances question types, with 100 questions/100 minutes and exactly ten
per source week (current directive). These are owner reports, not independently
authenticated faculty documents. Canonical ordering does not prove which
indication is main, and source omission never proves clinical impossibility.

## Form decisions and reachable paths

All rows govern newly generated Standard, Adaptive, Week Focus and fresh Boss
Remix pools (#91), and dependent Balanced/Adaptive Final pools (#92).

| Exact variant/template | Previous prompt example | Evidence | Decision and affected pathways |
| --- | --- | --- | --- |
| Brand/Generic `genericToBrand`, `brandToGeneric` | What is the brand name for X? | Written/observed FITB | KEEP raw strict FITB, canonical alternatives and full-set leakage guard |
| `brandToGenericRecognition` | What is the generic for X? (MCQ) | Written/observed FITB | REMOVE MCQ calibration materializer; preserve retrieval practice |
| FDA `structuredValueChoices` / `DOMAIN_SPECS.prompt` | Which complete FDA indication list is recorded for X? | Main/individual indication responsibility | REVISE to `singleFdaIndicationRecognition`, before raw materialization and every fallback |
| FDA `identifyDrugByStructuredValue` | Which drug has this full FDA indication list? | Same boundary | REMOVE inverse capacity/materialization and calibration fallback |
| ADR `structuredValueChoices` / `DOMAIN_SPECS.prompt` | Which full top ADR list is recorded for X? | Top 3/serious ADR responsibility | REVISE to `singleAdverseReactionRecognition`; no whole-list padding |
| ADR `identifyDrugByStructuredValue` | Which drug has this full top ADR list? | Faculty verbal rejection | REMOVE inverse capacity, raw and low-distractor fallback |
| `singleFdaIndicationRecognition` | Which FDA indication is recorded in the Fall source for X? | Written/observed positive FDA | KEEP one exact fact; exclude distractors overlapping any valid source indication |
| `brandToFdaIndicationRecognition` | Which is an FDA indication for X? | Observed forward FDA | KEEP safe brand stem, atomic fact and all-indication ambiguity guard |
| `atomicFdaIndicationRecognition` | Which drug is indicated for X? | Observed positive inverse FDA | REVISE to explicit recorded-source scope; positive predicates only |
| `notFdaIndicationRecognition` | Which is NOT indicated for X? | Shape observed, specific clinical negatives unproven | HOLD; negative materializer/capacity removed |
| `singleAdverseReactionRecognition` | Which Top ADR is recorded in the Fall source for X? | Written/observed positive ADR | KEEP atomic forward fallback with all-valid-fact exclusion |
| `atomicAdverseReactionRecognition` | Which drug has an ADR of X? | Observed positive inverse ADR | KEEP recorded-source scope and synonym rejection |
| `classCommonAdrRecognition` | Which is a common ADR of class X? | Approved source-supported common form | KEEP exact class/family intersection; reject distractors overlapping the entire member union |
| `familyNotAdrRecognition` | Which is NOT an ADR of class X? | Shape observed but omission is not a clinical negative | HOLD; remove negative materializer, retain positive class-common path |
| `pairwiseSharedAdrRecognition` | Which ADR is listed for both X and Y? | Specifically approved class-coherent pair form | KEEP existing coherence, exact shared facts, pair/protected-name guards; no new pairwise domains |
| class `structuredValueChoices`, `identifyDrugByStructuredValue` | What class does the Fall source list for X? | Written/observed class | KEEP forward and inverse class-only cardinality fallbacks/qualifications |
| `classDrugRecognition`, `classFamilyRecognition` | Which drug has class X? / is a CCB? | Observed and approved family map | KEEP positive capacity/calibration; no new family inference |
| forward MOA, `moaDrugRecognition` | What is the MOA of X? / Which drug has this MOA? | Written/observed MOA | KEEP; reject punctuation-equivalent, contained or highly overlapping MOA choices |
| forward positive BBW, `boxWarningDrugRecognition` | Which warning is listed for X? | Written/observed positive BBW | KEEP positive facts; exclude ambiguous warning alternatives |
| forward `none` / inverse no-BBW | Which drug has no boxed warning listed? | Verbal rejection / absence is not positive fact | REMOVE inverse, HOLD forward absence testing; candidate and forged/raw materialization reject |
| new positive multi-ADR clues | Identify drug from three stated ADRs | Observed when uniquely supported | HOLD new implementation; whole-list inverse cannot masquerade as this approved shape |
| pairwise MOA/BBW/class/FDA or new correctness pairs | No implemented approved template | No specific authorization | HOLD; no new materializer for capacity |

## Shared enforcement

`ATOMIC_ONLY_DOMAINS` enforces list prohibition in raw candidate capacity and
`materializeMcqQuestion`, before composers/rendering. Atomic fallbacks try
only positive source-backed questions and otherwise report unavailable. A
forged/stale candidate cannot force the old list path. No prohibited padding.
Brand/Generic stays strict FITB. All six domains remain eligible across the
semester; no drug fact is deleted from the reference.

Forward facts use the same eligible cohort. Distractors conflicting with any
valid source fact, including synonyms/overlapping angina (Tenormin), Farxiga
or Topamax indications, are rejected. MOA similarity only excludes negatives;
it never establishes positive pharmacology. Generic/source identities remain
unchanged; revised question text naturally has its own fingerprint.

The canonical Fall drug JSON and written quiz policy are unchanged. Existing
saved attempts and Review Queue identities are preserved. This change governs
new generation, including fresh Standard Weekly, Week Focus, Adaptive, Boss
Remix material and future Final pools. Old saved payloads are not migrated.
Generator, both importing parents, hub, engine dynamic launcher import and
engine HTML token advance together to `20261101a`; #92 advances its dependent
chain after reconciliation. Brand ® remains render-only and never graded.

## Remaining evidence

Rare NOT/EXCEPT shapes may return with an explicit defensible negative fact;
the current lists cannot supply one. Main-indication weighting needs evidence
of primary status rather than inferred array order. New positive multi-ADR
clues need exact source facts and choice uniqueness. These holds do not revise
the written policy. Weekly frequencies never become Final weighting.
