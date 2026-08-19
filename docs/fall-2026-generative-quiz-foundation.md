# Fall 2026 Lab III Generative Quiz Foundation

## Scope

This foundation is additive. It does not replace a legacy quiz, change a
legacy route, or connect Fall 2026 data to a page. It separates the official
Fall 2026 drug facts from the quiz-policy rules so a later generator can use
both without turning the weekly assignments into fixed question banks.

## Authoritative inputs

- `2026-27_P2_Top Drug List - P2 Top Drug List.pdf`
- `Lab III Top Drug Quiz Guidance.pdf`

The source filenames and SHA-256 values are recorded in the corresponding
JSON files. Source wording is preserved. Apparent source oddities are not
silently corrected. The Access Pharmacy sorting category is deliberately not
stored on drug records because the official column says "Do NOT memorize."

The drug-data file flags four source-review items for the owner: the exact ADR
strings "Rhabomylosis" and "Nocturnal ensuresis"; inconsistent `none` / `None`
box-warning capitalization; and two distinct Quiz 8 rows whose generic name is
Fluticasone. These values and rows remain unchanged from the source.

## Contracts

### Drug knowledge data

`assets/data/fall-2026-p2-top-drugs.json` contains all 100 P2 Fall records,
ten drugs for each of Quiz 1 through Quiz 10. Each record has a stable row ID,
semester, quiz-week assignment, generic name, complete listed brand set, FDA
indication list, drug class, MOA, box warning, top ADR list, and source page.

This file is the canonical Fall 2026 source-data projection. It is separate
from `assets/data/master_pool.json`, which remains the data source for the
existing Top Drugs modes.

### Quiz policy

`assets/data/fall-2026-lab3-quiz-policy.json` describes:

- current-week eligibility for new material;
- prior-week, same-semester eligibility for accumulated review;
- FITB-only Brand / Generic questions with spelling-sensitive and
  capitalization-insensitive matching;
- MCQ-only Class, Indication, MOA, ADR, and BBW questions;
- the 6-new / 4-review / 10-minute policy for Quiz 2 through Quiz 10; and
- the unresolved Quiz 1 composition decision.

The policy is data, not generated questions. It contains no prompts, answer
choices, or weekly fixed question arrays.

## Reuse boundary

The current application can later reuse the existing quiz shell, answer
evaluation, scoring, timer, history, review queue, and stats contracts. A
future Fall 2026 adapter should generate the engine's normalized question
objects (`short` for FITB and `mcq` for the remainder) only after an explicit
Fall 2026 route or catalog selection.

The existing weekly generator should not consume the new data directly. It
is coupled to `master_pool.json`, old Lab I/Lab II selection rules, and a
testable `category` field that is not allowed for the Fall 2026 source. A
small, separately testable selector/generator module is safer than adding
more policy branches inside `quizEngine.js`; its output can still be rendered
and scored by the existing engine.

Proposed later flow:

1. Load the Fall 2026 drug-data and policy contracts.
2. Select the current-week and accumulated-review cohorts from policy.
3. Select permitted knowledge domains and build section-seeded questions.
4. Adapt generated questions to the existing engine question shape.
5. Use a distinct Fall 2026 quiz ID and storage-key namespace so history and
   review records remain compatible without colliding with legacy modes.

## Quiz 1 decision still required

The guidance specifies six new-material items and says Week 1 has no review
questions. It does not say whether the four review slots disappear or are
replaced. The policy therefore records six new items, zero review items, and
an unresolved total rather than inventing a replacement rule.

## Legacy protection

`tools/fall-2026-generative-foundation.test.mjs` pins the current legacy quiz
JSON corpus, `master_pool.json`, and `quizEngine.js` bytes; validates both new
contracts and the complete Quiz 1 cohort; and proves that application pages
and scripts do not reference the Fall 2026 files yet. Existing catalog,
validator, engine-global, review-queue, and Top Drugs pool-version tests remain
the active regression layers around legacy loading and shared infrastructure.
