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
Phase 2 Facelift task without explicit owner approval.

**Documented baseline (must hold before and after every task):**

| Command | Expected |
| --- | --- |
| `npm run validate` | exit 0 |
| `npm run check:links` | exit 0 |
| `npm run test:tools` | 146/146 pass after P2F-03 (grows only with deliberate test additions) |
| `npm run health:repo` | exit 0 with `Errors: 0`; informational small-quiz warnings remain visible |

Current audited repository facts after P2F-03: 1,723 static quiz questions
across 34 JSON files; 169 legacy P1 Top Drugs records; and 100 Fall 2026 P2
records, ten per week. P1 and P2 remain separate canonical sources.

Known untracked items (expected, preserve and never commit): `.claude/`,
`.codex/`, `AGENTS.md`, `branch-manifest-2026-07-15.txt`.

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

### Phase 2B — Consolidation (DEFERRED after P2B-05)

| Task | Deliverable | Status | Commit |
| --- | --- | --- | --- |
| P2B-01 | CI quality gates: `check:links` + `test:tools` wired into the workflow | DONE | `96fc305` |
| P2B-01b | CLAUDE.md known-repo-state refresh | DONE | `38b5fe5` |
| P2B-02 | Shared validator core (`tools/validator-core.mjs`); repo-health consumes it; byte-identical outputs; +3 tests | DONE | `6bb38d8` |
| P2B-02b | Obsolete one-off tooling purge (6 verified-dead files) | DONE | `0ef4f17` |

---

## Completed Phase 2B continuation

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

- **Phase:** 2B · **Status:** `DONE` *(implemented by `c2c1421` plus CLI
  portability fix `fb49566` on `codex/p2b-04-engine-manifest-regenerator`;
  merged to main via `0bc774c`, 2026-07-18)*
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

- **Phase:** 2B · **Status:** `DONE` *(merged through PR #40 at
  `d55a57b638b9424299ab2fabb842a73e8792edab`)*
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

## Deferred Phase 2B backlog

### P2B-06 — Cache-token consistency tests

- **Phase:** 2B · **Status:** `DEFERRED` *(product-owner decision,
  2026-08-19: the remaining Phase 2B infrastructure work was deliberately
  deferred so current Fall 2026 Lab III student-facing work could take
  priority)*
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

- **Phase:** 2B · **Status:** `DEFERRED` (also requires an owner
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

- **Phase:** 2B · **Status:** `DEFERRED` (requires explicit workflow-specific
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

- **Phase:** 2B · **Status:** `DEFERRED` (superseded and resolved by P2F-02;
  **never eligible as a separate autonomous task**)
- **Historical objective:** Correct the `index.html` footer question count
  (then 1,765 vs actual 1,723) — either the literal number or a maintainable
  mechanism — resolving one of the two standing `health:repo` findings.
- **Behavioral change:** YES — application page. Requires the browser smoke
  checklist (`docs/smoke-checklist.md`).
- **Allowed files:** `index.html` (footer count only). **Commit:**
  `fix: reconcile homepage question count with actual total`
- **Resolution:** P2F-02 aligned the literal with the source-derived static
  total and retained the health check as the drift guard. **Rollback:** revert
  the P2F-02 commit.

### P2B-10 — Review-queue wrongCounts correction

- **Phase:** 2B · **Status:** `DEFERRED` (moved to P2F-09; pending explicit
  owner approval and **never eligible as a separate autonomous task**)
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

## Current product work — Fall 2026 P2 Lab III Generative Quiz

### F26-01 — Official Fall 2026 data + policy foundation

- **Status:** `DONE`
- **PR:** #41
- **Merge:** `3f49c2f65d2d77635ffee0090f5ec8fbf5715e4c`
- **Deliverables:**
  - canonical 100-drug Fall dataset
  - Lab III quiz policy
  - architecture documentation
  - regression protection
  - legacy quizzes unchanged
  - `quizEngine.js` unchanged

### F26-02 — Deterministic quiz selector/generator module

- **Status:** `DONE`
- **PR:** #43
- **Merge:** `3889247cc5ca22c607fe877515ed7ee814b935b7`
- **Deliverables:**
  - deterministic Fall 2026 generator
  - generator policy for Weeks 2–10 6-new + 4-review composition; only Weeks
    2–3 are currently student-facing
  - seeded/injectable deterministic RNG
  - source-backed MCQ distractors
  - Brand/Generic FITB generation
  - future-week leakage protection
  - duplicate-generic ambiguity protection
  - official Week 1 composition remains unresolved; the later live Week 1
    practice configuration is not an official composition claim
  - no runtime activation at this milestone
  - `quizEngine.js` unchanged

### F26-03 — Runtime integration contract + strict FITB scoring design

- **Status:** `DONE`
- **PR:** #45
- **Merge:** `c1c745b599850d4137c71806742e4e7c6ed1b5bc`
- **Deliverables:**
  - real evaluator characterization
  - strict capitalization-insensitive/spelling-sensitive contract
  - multiple-official-answer handling
  - opt-in question-level scoring recommendation
  - persisted review-queue lifecycle gap
  - no runtime activation at this milestone
  - `quizEngine.js` unchanged

### F26-04 — Opt-in strict FITB scorer + review-queue contract preservation

- **Status:** `DONE`
- **PR / merge:** #47 / `d23cee7`
- **Delivered:** opt-in strict Brand/Generic FITB matching; official
  `_acceptedAnswers`; fail-closed malformed-marker handling; and strict contract
  persistence through review-queue storage and reconstruction. Unmarked legacy
  questions remain on the legacy evaluator path.

### F26-05 — Student-facing Weeks 1–3 launch + homepage entry paths

- **Status:** `DONE`
- **PR / merge:** #48 / `ef96f7d`
- **Delivered:** Fall Lab III launch page and homepage entry paths for Weeks
  1–3. Week 1 is explicitly practice-configured and does not claim an official
  professor-set composition. Weeks 2 and 3 use exactly 6 new + 4 accumulated
  review questions, with future-week exclusion preserved.

### Fall 2026 post-launch quality progression (DONE through PR #54)

| PR | Merge | Delivered |
| --- | --- | --- |
| #49 | `598b995` | Practice-set drug/domain diversity and source-backed class-option quality |
| #50 | `2dd5412` | Quiz-level Brand/Generic answer-leakage protection |
| #51 | `9e1c9a0` | Unified Drug Sheet reference over separate canonical P1 and P2 sources |
| #52 | `75f04e1` | Generic-only or safe brand-only non-FITB stems; no combined Generic (Brand) form |
| #53 | `1eafa7b` | Structurally matched distractors with safe fallback and restored Week 1 coverage |
| #54 | `ca1a90e` | Conservative, source-derived Drug Class quiz normalization |

The Lab III generator is now **feature-frozen**. Changes require either a
reproduced defect or course-driven guidance; feature ideas and facelift work
do not reopen generator design.

### Fall weekly activation lane (separate from Phase 2 Facelift)

| Activation | Status | Constraint |
| --- | --- | --- |
| Weeks 1–3 | `DONE` | Student-facing; Week 1 practice-configured; Weeks 2–3 are 6-new / 4-review |
| F26-W04 | `BLOCKED` | Future course-timed activation; requires current course timing/guidance |
| F26-W05 | `BLOCKED` | Future course-timed activation; requires current course timing/guidance |
| F26-W06 | `BLOCKED` | Future course-timed activation; requires current course timing/guidance |
| F26-W07 | `BLOCKED` | Future course-timed activation; requires current course timing/guidance |
| F26-W08 | `BLOCKED` | Future course-timed activation; requires current course timing/guidance |
| F26-W09 | `BLOCKED` | Future course-timed activation; requires current course timing/guidance |
| F26-W10 | `BLOCKED` | Future course-timed activation; requires current course timing/guidance |

Do not infer activation readiness from the existence of canonical Weeks 4–10
data. Activation remains separate from facelift work and is unlocked only by
actual course timing or explicit guidance.

---

## Phase 2 Facelift lane

This is the active product sequence. Exactly one task is `READY`; satisfying a
dependency does not automatically change a later task's status. READY records
priority, not blanket implementation authority: each task still needs its
owner-approved scope and allowed-files contract before execution.

| Task | Deliverable | Status | Depends on |
| --- | --- | --- | --- |
| P2F-01 | Phase 2 baseline and historical roadmap synchronization | `DONE` | — |
| P2F-02 | Repository health cleanup to exit 0 | `DONE` | P2F-01 |
| P2F-03 | Homepage/current-semester navigation facelift | `DONE` | P2F-02 |
| P2F-04 | Favorites entry path and library organization | `READY` | P2F-03 |
| P2F-05 | Top Drugs Reference v2 performance/current-P2 shortcuts | `BLOCKED` | P2F-04 |
| P2F-06 | Question Reports v2 reproducibility workflow | `BLOCKED` | P2F-05 |
| P2F-07 | Additive curriculum metadata contract | `BLOCKED` | P2F-06 |
| P2F-08 | Stats Dashboard v2 | `BLOCKED` | P2F-07 |
| P2F-09 | Review Queue v2 + `wrongCounts` correction | `BLOCKED` | P2F-08 |
| P2F-10 | Mobile/accessibility consistency pass | `BLOCKED` | P2F-09 |

P2F-04 is the sole `READY` task. P2F-03 consolidated duplicate Fall surfaces
into one current-semester hierarchy with first-class Lab III and Top Drugs
Reference actions, grouped primary study tools separately from diagnostics,
organized P1 coursework chronologically, and condensed planned content. All
legacy functional URLs/content, the guarded 1,723-question count, separate
P1/P2 canonical sources, and the feature-frozen Fall generator remain
protected throughout this lane.

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
