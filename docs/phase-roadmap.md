# Pharmlet Phase Roadmap

Authoritative task ledger for all engineering work on this repository. The
autonomous Routine (see `docs/agent-runbook.md`) executes **only the first task
marked `READY`**, one task per run. Humans edit statuses; agents change a
status only where the runbook explicitly permits it.

**Statuses:** `DONE` · `READY` · `BLOCKED` · `IN PROGRESS` · `DEFERRED`

**Standing protections (apply to every task, in addition to CLAUDE.md):**
`assets/js/quizEngine.js`, `quizzes/**`, `assets/data/**`, application pages
(root `*.html`), application JS/CSS, `.github/workflows/**`, and
`package-lock.json` are forbidden unless a task's *allowed files* list names
them AND the task records explicit owner approval. No new dependencies in any
Phase 2B task.

**Documented baseline (must hold before and after every task):**

| Command | Expected |
| --- | --- |
| `npm run validate` | exit 0 |
| `npm run check:links` | exit 0 |
| `npm run test:tools` | all tests pass (33 as of `0ef4f17`; grows over time) |
| `npm run health:repo` | exit 1 with exactly two findings: empty `practice-e2b` placeholder; `index.html` footer count mismatch |

Known untracked items (expected, never commit): `.claude/`, `AGENTS.md`
(pending P2B-07), `branch-manifest-2026-07-15.txt`.

---

## Completed work

### Phase 1 — Repository hygiene (DONE, merged `4d9e68c`, 2026-07-16)

`.gitignore` added; 527 tracked `node_modules` files removed; CI switched to
`npm ci` with lockfile; dead code deleted (`v2-generator/`, `site-check.js`,
`FIXES_APPLIED.md`); dev pages moved into `tools/`; README corrected; ~32
stale branches pruned (restore SHAs in the untracked branch manifest);
`gh-pages` deleted after confirming Pages deploys from `main`.

### Phase 2A — Test infrastructure and tooling truth (DONE, `ea49a4e..a17f2bf`, 2026-07-16/17)

| Deliverable | Commit |
| --- | --- |
| Tooling regression coverage (validator accept-path, catalog invariants) | `ea49a4e` |
| Catalog-aware link tooling — three chronic false positives fixed at root | `9f3cb3d` |
| Engine global-surface manifest (273 functions / 6 window exports pinned) | `5f871d1` |
| Review-queue-store characterization suite + minimal vm harness | `0961c1b` |
| Top Drugs pool-version snapshot (`v169-3d5bfddd`) | `57a4390` |
| Validator failure-path fixtures (reject-path proof) | `0e62908` |
| Repository health report refreshed and tracked | `b74cf4e` |
| Engine architecture map, generation audit, smoke checklist | `a17f2bf` |

Also: `CLAUDE.md` created (`1efd603`). Latent finding characterized, not
fixed: review-queue `wrongCounts` re-fold inflation (see P2B-10).

### Phase 2B — Consolidation (IN PROGRESS)

| Task | Deliverable | Status | Commit |
| --- | --- | --- | --- |
| P2B-01 | CI quality gates: `check:links` + `test:tools` wired into the workflow | DONE | `96fc305` |
| P2B-01b | CLAUDE.md known-repo-state refresh | DONE | `38b5fe5` |
| P2B-02 | Shared validator core (`tools/validator-core.mjs`); repo-health consumes it; byte-identical outputs; +3 tests | DONE | `6bb38d8` |
| P2B-02b | Obsolete one-off tooling purge (6 verified-dead files) | DONE | `0ef4f17` |

---

## Remaining Phase 2B tasks

### P2B-03 — Browser harness consolidation

- **Phase:** 2B · **Status:** `DONE` *(implemented by commit
  `2f7d0cda017519bffc4a15d8c9eca16d698e73c4` on
  `claude/p2b-03-harness-consolidation`; supervisor-approved 2026-07-18)*
- **Objective:** Compare the two browser harnesses (`tools/test-quiz.html`,
  older iframe harness still referenced by README, vs `tools/quiz-test.html`,
  the maintained functionality-test page). Retain the maintained harness,
  delete only the obsolete duplicate, point `README.md` at the retained file,
  and add the missing `<meta charset="utf-8">` to the retained harness (its
  emoji currently render as mojibake without it).
- **Dependencies:** none.
- **Risk:** Low.
- **Allowed files:** `tools/test-quiz.html` (delete), `tools/quiz-test.html`
  (charset meta tag only), `README.md` (harness pointer only),
  `tools/validate.html` (owner-authorized amendment 2026-07-18: retarget its
  harness link from `test-quiz.html` to `quiz-test.html`, nothing else — added
  after a Routine no-op correctly found the link would go stale on deletion).
- **Forbidden files:** everything else, per standing protections.
- **Behavioral change:** none — developer tooling and documentation only; no
  application page or runtime behavior is affected.
- **Validation:** the four baseline commands; plus a repo-wide search
  confirming no tracked reference to the deleted filename remains.
- **Browser smoke:** serve `python3 -m http.server 8000`, load
  `tools/quiz-test.html`, confirm it fetches quiz JSON, renders success
  output, and shows no mojibake or console errors.
- **Expected commit message:** `chore: consolidate browser test harness and fix README pointer`
- **Completion criteria:** exactly one harness remains; README references it;
  charset present; baseline holds; no stale references.
- **Rollback:** `git revert` of the single commit.

### P2B-04 — Engine-manifest regeneration tool

- **Phase:** 2B · **Status:** `IN PROGRESS` *(implemented on
  `codex/p2b-04-engine-manifest-regenerator`; awaiting owner/supervisor review)*
- **Objective:** Add `tools/generate-engine-manifest.mjs` so
  `tools/engine-globals.manifest.json` can be regenerated deliberately after
  an approved engine change, sharing the exact extraction logic used by
  `tools/engine-globals-regression.test.mjs` (extract once, import in both).
- **Dependencies:** P2B-03.
- **Risk:** Low.
- **Allowed files:** `tools/generate-engine-manifest.mjs` (new),
  `tools/engine-globals-regression.test.mjs` (import shared extraction),
  `package.json` (optional npm script only).
- **Forbidden:** the manifest itself must not change as part of this task;
  `quizEngine.js` read-only.
- **Behavioral change:** none.
- **Validation:** baseline four; regenerator output must be byte-identical to
  the committed manifest at the current engine.
- **Browser smoke:** not required (no page affected).
- **Expected commit message:** `tools: add engine manifest regenerator`
- **Completion criteria:** running the tool reproduces the committed manifest
  exactly; the test and tool share one extraction implementation.
- **Rollback:** revert the commit.

### P2B-05 — Cataloged assets/data validation warnings

- **Phase:** 2B · **Status:** `BLOCKED` (by P2B-04)
- **Objective:** Give warning-level validator visibility to live quiz sources
  the catalog points at outside `quizzes/` (today: `basis2-quiz9` →
  `assets/data/bdt2_quiz9_masterpool.json`). Warnings only — exit codes for
  the current repository must not change, and no protected data may be
  modified to satisfy the schema.
- **Dependencies:** P2B-04.
- **Risk:** Low-medium (touches the CI-run validator; mitigated by the
  failure-path suite and byte-diff of current outputs).
- **Allowed files:** `tools/validator-core.mjs`, `tools/validate-quizzes.mjs`,
  `tools/*.test.mjs`.
- **Forbidden:** `assets/data/**` (read-only), `schema.json`.
- **Behavioral change:** none (tooling output gains a warnings section).
- **Validation:** baseline four; before/after diff proving `validate` output
  for `quizzes/` files is unchanged and exit stays 0.
- **Browser smoke:** not required.
- **Expected commit message:** `tools: warn on cataloged data sources outside quizzes/`
- **Completion criteria:** warnings visible, exit codes unchanged, tests
  cover the new path.
- **Rollback:** revert the commit.

### P2B-06 — Cache-token consistency tests

- **Phase:** 2B · **Status:** `BLOCKED` (by P2B-05)
- **Objective:** A test that scans all application HTML for shared-script
  `?v=` cache tokens (`quiz-catalog.js`, `review-queue-store.js`,
  `top-drugs-data.js`, `quizEngine.js`) and fails when the same script is
  referenced with different tokens across pages — making token drift
  impossible to ship unnoticed.
- **Dependencies:** P2B-05.
- **Risk:** Low (test-only; HTML is read, never written).
- **Allowed files:** one new `tools/*.test.mjs`.
- **Forbidden:** all HTML (read-only).
- **Behavioral change:** none.
- **Validation:** baseline four (suite count grows).
- **Browser smoke:** not required.
- **Expected commit message:** `test: enforce cache-token consistency across pages`
- **Completion criteria:** test passes against current pages; deliberately
  mismatched fixture proves it fails.
- **Rollback:** revert the commit.

### P2B-07 — Agent instruction ownership

- **Phase:** 2B · **Status:** `BLOCKED` (by P2B-06; also requires an owner
  decision recorded in the PR)
- **Objective:** Decide whether `CLAUDE.md` is the sole canonical agent
  instruction file or whether the currently-untracked `AGENTS.md` (a
  Codex-flavored copy of an older CLAUDE.md revision) becomes a maintained,
  tracked companion. **Do not commit the existing untracked `AGENTS.md`
  without a full content review** — it predates the Phase 2A state refresh
  and contains stale claims.
- **Dependencies:** P2B-06; owner decision.
- **Risk:** Low (docs only) but governance-significant.
- **Allowed files:** `AGENTS.md`, `CLAUDE.md` (cross-reference note only),
  `docs/agent-runbook.md` (roles note only).
- **Behavioral change:** none.
- **Validation:** baseline four.
- **Browser smoke:** not required.
- **Expected commit message:** decision-dependent, e.g.
  `docs: establish canonical agent instruction ownership`
- **Completion criteria:** exactly one authoritative instruction source, with
  any companion file explicitly subordinated and current.
- **Rollback:** revert the commit.

### P2B-08 — Disabled workflow removal

- **Phase:** 2B · **Status:** `BLOCKED` (requires explicit workflow-specific
  owner approval; never autonomous)
- **Objective:** Verify `deploy-pages.yml.disabled` is inert and redundant
  (Pages deploys from `main` automatically) and delete it.
- **Risk:** Low technically; gated because it lives under
  `.github/workflows/`.
- **Allowed files:** `.github/workflows/deploy-pages.yml.disabled` (delete
  only). **Validation:** baseline four; confirm the active workflow is
  untouched. **Commit:** `chore: remove inert disabled deploy workflow`
- **Rollback:** revert.

### P2B-09 — Homepage count correction

- **Phase:** 2B · **Status:** `BLOCKED` (pending explicit owner approval;
  **never eligible for autonomous execution**)
- **Objective:** Correct the `index.html` footer question count (currently
  1,765 vs actual 1,723) — either the literal number or a maintainable
  mechanism — resolving one of the two standing `health:repo` findings.
- **Behavioral change:** YES — application page. Requires the browser smoke
  checklist (`docs/smoke-checklist.md`).
- **Allowed files:** `index.html` (footer count only). **Commit:**
  `fix: reconcile homepage question count with actual total`
- **Completion criteria:** `health:repo` drops to exactly one known finding;
  baseline expectations in this file and the runbook are updated in the same
  commit. **Rollback:** revert.

### P2B-10 — Review-queue wrongCounts correction

- **Phase:** 2B · **Status:** `BLOCKED` (pending explicit owner approval;
  **never eligible for autonomous execution**)
- **Objective:** Fix the latent inflation in
  `assets/js/review-queue-store.js` (`normalizeEntry` re-folds
  `lastUserAnswer` into `wrongCounts` on every normalize pass) and update the
  characterization tests that deliberately pin today's behavior, in the same
  commit.
- **Behavioral change:** YES — application storage behavior (display-weight
  counts). Requires cache-token bump on pages loading the store, smoke
  checklist, and test updates.
- **Allowed files:** `assets/js/review-queue-store.js`,
  `tools/review-queue-store-regression.test.mjs`, HTML cache tokens for the
  store. **Commit:** `fix: stop wrongCounts inflation on review-queue normalize`
- **Rollback:** revert.

---

## Phase 3 — Engine modernization (all tasks: no autonomous eligibility)

**No Phase 3 application or engine task is automatically eligible for a
Routine.** Each requires explicit owner approval at execution time, even when
marked READY in the future. Reference: `docs/engine-architecture.md`,
`docs/engine-audit.md`.

| ID | Objective | Status | Depends on |
| --- | --- | --- | --- |
| P3-01 | VM engine loader: load `quizEngine.js` in a sandbox (stubbed `window`/`document`/`localStorage`/route params) for unit testing | BLOCKED (Phase 2B completion) | — |
| P3-02 | Storage round-trip tests: progress snapshots, malformed-snapshot rejection, quota-failure handling, multi-tab last-writer hazards | BLOCKED | P3-01 |
| P3-03 | Answer-evaluation behavior tests (`evaluateAnswerForQuestion`: tolerance, aliases, combination matching) | BLOCKED | P3-01 |
| P3-04 | Adaptive + final-exam selection tests (weakness scoring, family assignment, recent-run avoidance) | BLOCKED | P3-01 |
| P3-05 | Fisher–Yates `shuffled()` with injectable RNG; requires deterministic fixed-seed tests plus statistical invariants | BLOCKED | P3-01 |
| P3-06 | Shared `pharmlet.*` storage-key grammar module (engine, stats, home read one source) | DEFERRED | P3-02 |
| P3-07 | `normalizeQuizDocument()` internal adapter unifying the five pool layouts | DEFERRED | P3-03, P3-04 |
| P3-08 | Duplicated class/category builder consolidation (~400–500 lines) | DEFERRED | P3-03, P3-04 |
| P3-09 | DOM, timer, and event tests — prerequisite for any interface refactoring, which remains last | DEFERRED | P3-01..P3-08 |

Dependency rules: P3-01 precedes P3-02 through P3-05. P3-02 precedes P3-06.
P3-03 and P3-04 precede any substantial engine restructuring (P3-07, P3-08).
DOM/interface work (P3-09 and beyond) remains last. Every engine-touching
commit bumps the `quiz.html` cache token and updates
`tools/engine-globals.manifest.json` in the same commit when the global
surface changes.
