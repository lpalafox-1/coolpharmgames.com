# Quiz Generation Audit

_Recorded 2026-07-16. Audit only — no behavior was changed. Priorities feed
the Phase 3/4 roadmap; every item below that touches `assets/js/` is gated
behind explicit approval and the regression suite._

## Question generators (inventory)

| Generator | Route | Data source |
| --- | --- | --- |
| Weekly/lab Top Drugs | `?week=N&lab=1\|2`, `?weeks=a-b`, `?tag=…` | `assets/data/master_pool.json` (169 drugs) |
| Top Drugs final blueprint | `?id=log-lab-final-2` | master pool; 110 questions, 13 question families, weighted blueprint |
| Concept quizzes | `?id=bdt-unit10-*` | `assets/data/bdt_unit10_*.json` concept pools |
| Mode-driven exam | `?id=ceutics2-final&mode=…` | `quizzes/ceutics2_final_master_pool_v2.json` modeConfigs |
| Boss round / weak-area retake | generated → `pharmlet.custom-quiz` | clones of answered/missed questions |
| Adaptive playlist | generated metadata | signals-driven, delegates to final-exam builders |
| Static quizzes | `?id=<catalog id>` | `quizzes/*.json` via quiz-catalog |

## Adaptive learning

Signals (`pharmlet.topDrugs.signals`) hold seen/missed counter maps for
drugs, classes, categories, and brands, recorded only at quiz completion.
Weakness scoring (`getWeaknessScore`: miss-count and miss-rate driven,
exposure-dampened) feeds final-exam drug selection, family assignment,
distractor choice, and playlist focus. Recent-run avoidance time-decays the
last 10 final runs over 14 days to penalize repeats.

## Distractor generation

Same-class → same-category → random candidate ladders, filtered by
`isAmbiguousTherapeuticFieldMatch` (prevents two defensible answers) and
ranked by therapeutic-similarity token overlap. Brand-class/category paths
weight candidates by signals.

## Master-pool layouts (five incompatible shapes)

1. Flat drug array — `master_pool.json`
2. `pools:{easy,hard}` rendered questions — `bdt2_quiz9_masterpool.json`
3. Naked concept array — `bdt_unit10_quiz8_master_pool.json`
4. `{questions:[…]}` concept object — the two `exam4` drafts
5. `{settings.modeConfigs, questions[97]}` mode-driven exam — `ceutics2_final_master_pool_v2.json`

Three field-naming conventions coexist (`prompt`/`question`,
`solution`/`explanation`, `answer` string-or-array / `answerText` /
`acceptableAnswers`). `schema.json` is looser than served reality; the
engine's tolerant parser is the de-facto contract.

## Improvement opportunities, priority-ranked

1. **P1 — Fix `shuffled()`** (line ~7212): biased comparator shuffle feeding
   all 42 randomization sites. Replace with Fisher–Yates + injectable RNG.
   Small, isolated, testable; also the natural first Phase 3 extraction.
2. **P2 — Layout adapter:** one `normalizeQuizDocument()` at the pipeline
   boundary translating all five pool layouts into a canonical shape.
3. **P3 — Deduplicate the four class/category builder pairs** (~100–130
   near-identical lines each; ~400–500 lines removable behavior-preserving).
4. **P4 — Distractor-quality metrics** (leakage/ambiguity measurement only).
5. **P5 — Make adaptive in-place mutation explicit** (document or
   return-new in `scoreCurrent`).
6. **P6 — schema.json sync** with actual field conventions (last: it moves a
   CI-enforced contract).

Also recorded: latent review-queue `wrongCounts` inflation
(`review-queue-store.js` `normalizeEntry` re-folds `lastUserAnswer` every
normalize pass) — display-only, characterized by tests, fix needs approval.

## Safe implementation sequence

All P-items are engine or contract edits: each requires (in order) the
regression suite green, explicit approval naming the file, one isolated
commit with a `quiz.html` cache-token bump, and the browser smoke checklist
(`docs/smoke-checklist.md`) executed before declaring done. Order:
P1 → P2 → P3 → P4/P5 → P6.
