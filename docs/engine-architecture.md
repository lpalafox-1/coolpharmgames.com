# quizEngine.js Architecture Map

_Recorded 2026-07-16 against the 7,680-line engine at commit `5f871d1`.
Line numbers drift with any engine change; treat ranges as anchors, not
absolutes. The global surface itself is pinned exactly by
`tools/engine-globals.manifest.json` (273 functions, 6 window exports)._

`assets/js/quizEngine.js` is a single top-level script loaded by `quiz.html`
(no modules, no IIFE), bootstrapped via `DOMContentLoaded → main()`. All
subsystems share one mutable `state` object plus module-scoped constants.

## Subsystems and line ranges

| Lines | Subsystem |
| --- | --- |
| 1–23 | URL/route param parsing (`id`, `mode`, `week`, `weeks`, `tag`, `lab`, `exam`, `resume`); storage-key constants |
| 25–75 | The shared mutable `state` object (questions, cursor, scores, sets, timer, mode flags, persistence bookkeeping) |
| 77–375 | UI micro-helpers: zoom, shortcuts modal, seen/answered counters, streak meter, mark controls, adaptive banner, footer actions, theme |
| 377–453 | Concept-quiz and final-exam configuration constants (blueprints, weights, focus areas) |
| 455–662 | Brand/generic normalization and answer aliases (`normalizeDrugKey`, brand variants, alias lookup) |
| 663–802 | Attempt-mode configuration (true exam / boss / restricted UI gating) |
| 803–935 | Storage helpers, question reports, Top Drugs signals persistence |
| 937–1162 | Final-run history and performance breakdown; quicksheet deep links |
| 1163–1350 | Boss round and weak-area retake generators |
| 1351–1815 | Therapeutic-similarity and distractor-plausibility engine |
| 1816–2191 | Brand→class / brand→category question builders |
| 2192–2482 | Weakness/adaptive scoring and final-exam drug selection |
| 2483–2572 | Hint and reveal |
| 2573–2943 | Quiz-progress persistence and restore (session resume) |
| 2944–3189 | History save, grading, restart, review-missed; `window.*` exports (~3184) |
| 3190–3866 | Data pipeline: `smartFetch`, quiz loading, pool flattening, configured-mode questions |
| 3868–3937 | Weak-area/adaptive playlist generator |
| 3939–5070 | Concept-quiz subsystem (master pools, prompt specs, concept distractors) |
| 5071–5358 | Weekly/lab quiz generator (`createQuestion`, ~288 lines) |
| 5359–6417 | Final-exam blueprint subsystem; signals recording |
| 6419–6597 | Rendering (`render`, `renderNavMap`) |
| 6599–6696 | Event wiring and keyboard shortcuts |
| 6698–6757 | Timer |
| 6759–7073 | Answer evaluation and scoring (`evaluateAnswerForQuestion`) |
| 7075–7211 | Results screen |
| 7212 | `shuffled` — biased `sort(() => 0.5 - Math.random())`, 42 call sites |
| 7214–7678 | Router/bootstrap (`main`, ~369 lines; `finishSetup`) |

## Hub functions (most cross-referenced)

`normalizeDrugKey` (~139 refs), `normalizeQuizValue` (~53), `shuffled` (42
call sites), signals counters (`incrementCounter`/`getCounterValue`),
`isAmbiguousTherapeuticFieldMatch` (distractor-quality gate), `render`,
`getWeaknessScore`, `loadTopDrugsSignals`, `getCorrectAnswerValue`,
`buildFinalPerformanceBreakdown`.

## Key couplings a decomposition must respect

- **URL params as free variables:** generators read `weekParam`, `labParam`,
  `quizId`, `modeParam` as module globals rather than parameters.
- **In-place mutation during scoring:** `scoreCurrent` mutates
  `state.adaptiveSession` and swaps entries of `state.questions` for adaptive
  difficulty — object identity matters across any future module boundary.
- **Evaluation feeds adaptivity at quiz end:** `showResults` calls
  `recordTopDrugsSignalsFromQuestions` and `saveFinalRunSnapshot`.
- **Inline-onclick globals:** `window.reviewMissed`, `launchWeakAreaRetake`,
  `launchBossRound`, `reportCurrentQuestion`, `restartQuiz` must stay on
  `window` (this is the exact historical silent-deletion failure mode; the
  global-surface manifest test guards it).
- **Version-badge projection:** `TopDrugsData.computePoolVersion` hashes a
  fixed field projection; refactors must keep it byte-identical (pinned by
  `tools/top-drugs-pool-version.snapshot.json`).

## External dependencies

- `window.PharmletQuizCatalog` (quiz-catalog.js) — route/source resolution.
- `window.TopDrugsData` (top-drugs-data.js) — pool version badge.
- `window.PharmletReviewQueueStore` (review-queue-store.js) — pure transform
  library, no I/O; the proven model for future extracted modules.
- localStorage contract under `pharmlet.*` (history, review-queue,
  quiz-progress.*, topDrugs.signals, finalLab2.recentRuns, high-score keys,
  last-quiz) — the cross-page compatibility surface; `stats.js`, `home.js`,
  `review-queue.js`, and `final-trends.js` are read-side consumers.

## Planned decomposition (Phase 3, not started)

Strangler-fig extraction into IIFE modules under `assets/js/engine/`
(`random` → `normalize` → `storage` → `data-pipeline` → generators →
`eval` → `ui`), one module per commit with cache-token bumps on both files,
each independently revertible. Gated on the regression suite plus a vm
engine loader for storage round-trip tests. See `docs/engine-audit.md` for
the prioritized improvement list.
