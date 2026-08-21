# Repository Health Report

_Refreshed 2026-08-21 for the Phase 2 Facelift kickoff at `ca1a90e`. This
report records the current repository state; no application, quiz-data, or
workflow changes were made as part of this documentation review._

## Current Passing Checks

| Check | Result | Notes |
| --- | --- | --- |
| `npm run validate` | Passed | All 35 static quiz JSON files pass schema + semantic validation. |
| `npm run check:links` | Passed | Catalog-aware since commit `9f3cb3d`; the three historical false positives (`basis2-quiz9`, `bdt-unit10-exam4`, `top-drugs-final-mock*`) are resolved. Unlinked-quiz findings are informational warnings, not failures. |
| `npm run test:tools` | Passed | 139/139 tests, including validator, catalog/link, engine-surface, review-queue, unified Top Drugs Reference, and Fall 2026 generation/runtime contracts. |
| Repository counts | Informational | 1,723 static quiz questions across 35 JSON files; 169 legacy P1 Top Drugs records; 100 Fall 2026 P2 records (ten per week); 56 Endocrine concept-pool entries. |

The Drug Sheet presents the P1 and P2 Top Drugs records in one reference
interface while retaining their separate canonical source files.

## Current Failing Checks

| Check | Result | Current findings |
| --- | --- | --- |
| `npm run health:repo` | Failed (exit 1) | Two known, deferred errors (below). |

1. `practice-e2b-exam2-prep-expanded.json` is an empty placeholder quiz. It is
   schema-valid and covered by a regression test that documents the current
   empty baseline; changing it requires approved quiz-JSON edits.
2. The footer in `index.html` says 1,765 questions while the current static
   total is 1,723. Fixing it is an application-page change requiring explicit
   approval.

P2F-02 — Repository health cleanup to exit 0 — is the sole `READY` task and
the intended owner of both findings. This report does not suppress, redefine,
or fix either health check.

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
- Fall 2026 Lab III Weeks 1–3 are student-facing. Week 1 remains explicitly
  practice-configured; Weeks 2–3 use 6 new + 4 accumulated review. Weeks 4–10
  remain separate course-timed activation work, not repository-health work.

## Commands Run

```text
npm run validate       # passed
npm run check:links    # passed
npm run test:tools     # passed (139/139 tests)
npm run health:repo    # failed: the two known deferred errors above
```
