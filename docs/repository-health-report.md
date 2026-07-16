# Repository Health Report

_Refreshed 2026-07-16 after the Phase 2A tooling fixes. This report records the
current repository state; no application, quiz-data, or workflow changes were
made as part of this review._

## Current Passing Checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm run validate` | Passed | All 35 static quiz JSON files pass schema + semantic validation. |
| `npm run check:links` | Passed | Catalog-aware since commit `9f3cb3d`; the three historical false positives (`basis2-quiz9`, `bdt-unit10-exam4`, `top-drugs-final-mock*`) are resolved. Unlinked-quiz findings are informational warnings, not failures. |
| `npm run test:tools` | Passed | 30 regression tests: validator accept + reject paths, catalog invariants, link parsing, quizEngine global-surface manifest, review-queue-store behavior, Top Drugs pool-version snapshot. |
| Repository counts | Informational | 1,723 static quiz questions across 35 files; 169 Top Drugs master-pool entries; 56 Endocrine concept-pool entries. |

## Current Failing Checks

| Check | Result | Current findings |
| --- | --- | --- |
| `npm run health:repo` | Failed (exit 1) | Two known, deferred errors (below). |

1. `practice-e2b-exam2-prep-expanded.json` is an empty placeholder quiz. It is
   schema-valid and covered by a regression test that documents the emptiness
   as intentional; changing it would require approved quiz-JSON edits.
2. The footer in `index.html` says 1,765 questions while the current static
   total is 1,723. Fixing it is an application-page change requiring explicit
   approval.

Warnings (informational): `supplemental-exam1-2024.json` has eight questions;
`test-sample-3.json` has three (a dev-harness fixture). 23 quiz ids are not
statically linked from `index.html`; menus are partly rendered dynamically, so
these are reported as information, not errors.

## Known Issues Under Observation

- **Latent review-queue quirk (app code, not fixed):**
  `normalizeEntry` in `assets/js/review-queue-store.js` re-folds
  `lastUserAnswer` into `wrongCounts` on every normalize pass, so
  "common wrong answer" display counts inflate slightly on each save/load
  cycle. Characterized by `tools/review-queue-store-regression.test.mjs`;
  a fix requires approved app-code changes.
- `CLAUDE.md`'s "Known repo state" section still describes the check-links
  false positives as pre-existing; that note is stale since `9f3cb3d` and
  needs an approved documentation update.

## Commands Run

```text
npm run validate       # passed
npm run check:links    # passed
npm run test:tools     # passed (30 tests)
npm run health:repo    # failed: the two known deferred errors above
```
