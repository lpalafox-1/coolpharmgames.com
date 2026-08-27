# Repository Health Report

_Refreshed 2026-08-26 after F26-06 on a branch from `0d9f02a`. This report
records the verified green repository-health baseline._

## Current Passing Checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm run validate` | Passed | All 34 static quiz JSON files pass schema + semantic validation. |
| `npm run check:links` | Passed | Catalog-aware since commit `9f3cb3d`; the three historical false positives (`basis2-quiz9`, `bdt-unit10-exam4`, `top-drugs-final-mock*`) are resolved. Unlinked-quiz findings are informational warnings, not failures. |
| `npm run test:tools` | Passed | 163/163 tests, including validator, catalog/link, homepage hierarchy/routes, Favorites storage/controls, engine-surface, review-queue, progressive unified Top Drugs Reference, and the 100-seed-per-week Fall 2026 style/provenance/runtime audits. |
| `npm run health:repo` | Passed (exit 0) | `Errors: 0`; homepage count matches the source-derived static total. |
| Repository counts | Informational | 1,723 static quiz questions across 34 JSON files; 169 legacy P1 Top Drugs records; 100 Fall 2026 P2 records (ten per week); 56 Endocrine concept-pool entries. |

The Drug Sheet presents the P1 and P2 Top Drugs records in one reference
interface while retaining their separate canonical source files. It searches
all 269 normalized records, renders 12 cards initially, reveals 24 more per
request, and provides current P2 Fall/Lab III and Week 1–3 shortcuts.

## P2F-02 Resolved Findings

1. `practice-e2b-exam2-prep-expanded.json` had contained zero questions since
   its September 2025 creation. It had no direct HTML link or usable quiz
   content, but a later shared-catalog entry exposed it in Custom Quiz. P2F-02
   removed the catalog entry and deleted the empty artifact; no question
   content was fabricated or altered.
2. The homepage count was a manually maintained literal with inconsistent
   scope. P2F-02 changed it from 1,765 to the validated 1,723 static questions
   and clarified that generated sets are additional. The unchanged health tool
   continues deriving the corpus total and fails on future drift.

P2F-05 preserved the green health baseline while adding bounded progressive
Drug Sheet rendering, complete-library search, current-P2 shortcuts, and URL
history restoration without changing either canonical Top Drugs source.
P2F-06 — Question Reports v2 reproducibility workflow — is now the sole
`READY` task. P2F-05 did not begin that work.

Warnings (informational): `supplemental-exam1-2024.json` has eight questions;
`test-sample-3.json` has three (a dev-harness fixture). 22 quiz ids are not
statically linked from `index.html`; menus are partly rendered dynamically, so
these are reported as information, not errors.

## Known Issues Under Observation

- **Latent review-queue quirk (app code, not fixed):**
  `normalizeEntry` in `assets/js/review-queue-store.js` re-folds
  `lastUserAnswer` into `wrongCounts` on every normalize pass, so
  "common wrong answer" display counts inflate slightly on each save/load
  cycle. Characterized by `tools/review-queue-store-regression.test.mjs`;
  a fix requires approved app-code changes.
- Fall 2026 Lab III Weeks 1–3 are student-facing. Week 1 remains explicitly
  practice-configured; Weeks 2–3 use 6 new + 4 accumulated review. F26-06
  calibrated the shared generator through Week 10 without changing canonical
  data or repository-health semantics. Weeks 4–10 remain the separate F26-07
  student-activation task, not repository-health work.

## Commands Run

```text
npm run validate       # passed
npm run check:links    # passed
npm run test:tools     # passed (163/163 tests)
npm run health:repo    # passed: exit 0, Errors: 0
```
