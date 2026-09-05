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
| `npm run test:tools` | Full current suite passes (count grows only with deliberate test additions) |
| `npm run health:repo` | exit 0 with `Errors: 0`; informational small-quiz warnings remain visible |

Current audited repository facts after F26-08: 1,723 static quiz questions
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

- **Phase:** 2B · **Status:** `DONE` (delivered as P2F-09, PR #69, merge
  `3c7bbf153783af2fc0287500f59b7be72ce906b1`, 2026-09-04)
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

### F26-06 — Fall 2026 Lab III shared style calibration

- **Status:** `DONE`
- **Trigger:** course-driven guidance from the student's completed real Lab III
  Quiz 1 experience; this is a shared Weeks 1–10 generator calibration, not a
  Quiz 1 reconstruction.
- **Delivered:** concise Brand/Generic FITB and recognition MCQ; atomic ADR and
  FDA-indication recognition; source-safe NOT-indication sets; concise exact
  class, MOA, and BBW recognition; and an explicit quiz-only CCB family map.
  Every displayed fact and choice remains validated against complete canonical
  records. Week 1 stays explicitly practice-configured; Weeks 2–10 retain
  exactly 6 new + 4 accumulated review; future-week exclusion remains intact.
- **MTC decision:** audited but not emitted. The existing `mcq-multiple`
  pointer/touch renderer double-toggles selections, and fixing it would require
  a separately authorized, isolated `quizEngine.js` change.
- **Protected boundaries:** canonical data, policy, Drug Sheet, P1 quizzes,
  `master_pool.json`, and `quizEngine.js` unchanged.

F26-07 exposed the already-supported weeks without redesigning question
generation. F26-08 changed only the Lab III hub presentation. The shared
generator remains feature-frozen; later refinements require new course evidence
or a reproduced correctness defect, and facelift work does not reopen generator
design.

### Fall weekly activation lane (separate from Phase 2 Facelift)

| Activation | Status | Constraint |
| --- | --- | --- |
| Weeks 1–3 | `DONE` | Student-facing; Week 1 practice-configured; Weeks 2–3 are 6-new / 4-review |
| F26-07 | `DONE` | Weeks 4–10 student-facing as study-ahead Pharm-let practice; Weeks 2–10 remain 6-new / 4-review |

The full Weeks 1–10 series is now student-facing. Weeks 4–10 are explicitly
study-ahead Pharm-let practice rather than claims about exact future professor
quizzes. Week 1 retains its explicit practice configuration, Weeks 2–10 retain
6-new / 4-review, and requested-week ceilings remain enforced. This activation
remains separate from facelift work and preserved the shared generator
contract.

### F26-08 — Fall Lab III Hub QOL Facelift

- **Status:** `DONE`
- **Delivered:** one responsive semester-dashboard grid with a unified week-card
  language for all ten available weeks, concise quiz-structure cues, and an
  obvious week-specific start action on every card. Weeks 4–10 no longer use a
  secondary compact treatment.
- **Student-facing truth:** Week 1 retains its concise practice-configuration
  distinction; Weeks 2–10 retain the 6-new / 4-review representation. One shared
  future-practice note replaces repeated study-ahead disclaimers, and Top Drugs
  Reference remains a visible secondary study resource.
- **Protected boundaries:** existing launch wiring, canonical data, quiz policy,
  generator semantics, weekly composition, future-week ceiling, and
  `quizEngine.js` are unchanged. The Fall generator remains feature-frozen and
  F26-MTC-01 remains deferred.

### F26-09 — Fall Lab III Completion & Continuation Experience

- **Status:** `DONE`
- **Delivered (completion UX):** finishing a normal quiz, Boss Round, or review
  round is now a real completed state. `showResults()` retires the live
  answering surface (question jump map, footer actions, mastery and mobile
  controls), freezes the timer, ignores answering/navigation/timer/restart
  keyboard shortcuts, and reports the attempt as saved. Completion was already a
  save boundary in code — history, high score, review queue, and progress
  cleanup all run in `showResults()` — so the false
  "Your progress will be lost" restart warning was removed for completed
  attempts and kept, unchanged, for unfinished ones. No Back-button ritual is
  required for an attempt to persist.
- **Delivered (continuation):** contextual, non-collapsed actions —
  Review Missed, Boss Round, Boss Remix +1, Retry This Set / Retry Same Boss /
  Restart Full Set, New Week X Practice Set, and Return to Lab III Hub. Legacy
  non-Fall quizzes keep exactly their previous action set plus the completed
  state.
- **Delivered (Boss Remix addendum):** Fall 2026 Lab III only. Retry Same Boss
  still replays the identical stored challenge — the resolved payload is kept in
  full, so exactness never depends on replaying a seed through the generator.
  Boss Remix +1 is a different product: a newly assembled, bounded challenge
  aimed at the drugs and knowledge domains this attempt actually missed.
  - **Attempt-local evidence only.** Answered-incorrectly is the weakness
    signal; answered-correctly is positive evidence; blank items left by
    "check all" or an expired timer, seen-but-unanswered items, and never-seen
    items are neutral. Lifetime weakness counters, review-queue history, and
    adaptive memory are never read.
  - **Fresh at question identity, not drug.** A weak drug may return through a
    different safe question form. "Fresh" means an identity the Boss/Remix chain
    has not used, tracked in an additive `metadata.fallLab3.chainQuestionIds`
    record that a Fall Boss Round now also carries. Exact repetition stays with
    Retry Same Boss; carried items are only a bounded fallback when the week's
    fresh material runs out. When no safe fresh question remains, the remix
    fails closed at a decision point: nothing starts, the student is told why,
    and the launcher-built Week X practice set begins only if they choose it —
    never as an automatic substitute for the Boss Remix they asked for.
  - **Deterministic, capped size.** Boss 5 → Remix 6 → Remix 7, then the chain
    is capped: no further "+1" action is advertised, so every displayed
    "Boss Remix +1 (N)" is literally truthful.
  - **Scope inheritance.** The requested week, chain root, and used-question
    history come from the parent attempt, never from the current date or any
    global week value.
  - **No longitudinal writes.** A completed remix saves its own history entry
    and high score, but never feeds the review queue, `wrongCounts`, or adaptive
    memory. P2F-09 has since corrected the review-queue side of those
    semantics; F26-10 still owns adaptive selection. Normal quiz and Boss
    Round behavior outside the remix is unchanged.
- **Delivered (history provenance):** a remix records the distinct history mode
  `bossRemix` through the existing generated-attempt identity machinery, plus one
  additive `attemptLineage` field carrying attempt kind, attempt/parent/root
  attempt ids, remix generation, requested week, resolved question count, and the
  shared P2F-07 curriculum scope (`curriculumId`, professional year, semester,
  lab, seed). No history migration and no competing metadata system; Stats
  display polish for the new mode stays with P2F-08.
- **Architecture note:** the fresh remix material is borrowed from a normal
  Week X practice set built by the existing Fall launcher. The engine stores a
  short-lived remix request, returns through `lab3-fall-2026.html?week=N`, and
  converts the launcher-built payload into the remix attempt. This keeps Fall
  source data, policy, and generator selection exclusively in
  `assets/js/fall-2026-lab3-launcher.js`, which the repository's Fall isolation
  tests require; a direct generator import from `quizEngine.js` was rejected for
  that reason. A consequence worth stating: freshness is bounded by what one
  launcher-built set offers, which is why the fallback and fail-closed rules
  above exist.
- **Protected boundaries:** canonical Fall data, `master_pool.json`, Fall policy,
  the Fall generator, the Fall launcher, normal weekly generation semantics
  (Week 1 practice configuration, Weeks 2–10 6-new / 4-review), calibrated
  question styles, scoring rules, strict FITB matching, lifetime adaptive
  memory, and unrelated legacy quiz behavior are unchanged. The remix never
  emits `mcq-multiple`, stays inside the requested Week X ceiling, and remains
  source-backed. The Fall generator stays feature-frozen and F26-MTC-01 remains
  deferred.
- **Engine-change protocol:** `assets/js/quizEngine.js` was the named file in
  scope; `quiz.html` carries the required cache-token bump
  (`?v=20260901a`), `tools/engine-globals.manifest.json` was regenerated, and the
  four committed engine sha256 baselines were re-pinned to the approved F26-09
  engine in the same commit. Coverage lives in
  `tools/fall-2026-lab3-completion-continuation.test.mjs`.

### Fall sequencing — next planned work

The bounded generator-fidelity audit ran as Phase 0 of F26-10 rather than as a
separate branch. Two of its four checks passed and two failed; the failures are
deferred to a separate task rather than being fixed inside F26-10 (see F26-11
below). The Fall generator, policy, and canonical data remain feature-frozen.

### F26-10 — Performance-Guided Adaptive Practice

- **Status:** `IN PROGRESS` (owner-authorized 2026-09-04; generator-free path)
- **Objective:** an additive Adaptive Practice mode for Fall Lab III Weeks 1–10
  that builds a fresh 10-question round from the student's own longitudinal
  performance. Normal Week Practice, Boss Round, Boss Remix, scoring, weekly
  eligibility, and the shared generator are unchanged.
- **Phase 0 result (bounded generator-fidelity check):** verified against a
  2,500-question corpus generated through the real launcher.
  - **PASS** — NOT/EXCEPT generation is source-safe. All emitted negatives are
    `notFdaIndicationRecognition`; across 76 distinct items the keyed answer
    genuinely lacks the indication and every distractor genuinely has it, with
    brand and generic choices both resolving to canonical records.
  - **PASS** — no future-week leakage, 0 violations across the corpus.
  - **FAIL, deferred** — direct brand → FDA-indication stems are never
    generated (0 brand stem references in the corpus).
  - **FAIL, deferred** — the cross-drug `What is NOT an ADR for either of the
    Thiazide Diuretics?` form does not exist.
- **Selection trust boundary:** historical `wrongCounts` is deliberately never
  read. Pre-P2F-09 values may carry normalization inflation (see P2F-09-F1 and
  the legacy best-effort note), so answer-frequency magnitude has no influence
  on selection. `missCount`, `reviewMissCount`, `clearStreak`, archived and
  refresh-due state, miss recency, exposure, and recent attempt history are
  used instead; none was affected by that bug.
- **Boundaries:** `assets/js/fall-2026-quiz-generator.js`, `quizEngine.js`, the
  engine manifest, canonical Fall data, and the quiz policy are byte-identical.
  Adaptive writes exactly one additive store,
  `pharmlet.fall-2026-lab3.adaptive-memory`, used only for anti-repetition; it
  never writes history or the Review Queue.

### F26-11 — Bounded official-quiz-fidelity forms (deferred from F26-10)

- **Status:** `DEFERRED` — needs its own owner-approved scope and allowed-files
  contract; **not** authorized by F26-10.
- **Scope:** the two Phase 0 failures above. Both require touching the shared
  Fall generator's question-construction path, which F26-10 was explicitly
  forbidden to do because that path also feeds normal Week Practice, whose
  composition must not change.
  - Direct brand → FDA-indication stems. The machinery exists
    (`createMcqStemReference("brand")`, `selectMcqStemReference`,
    `isBrandOnlyReferenceSafe`) but the composition route the launcher uses
    never produces a stem reference, so brands appear only as choice values.
  - Cross-drug NOT-an-ADR stems. Needs a drug-group stem concept, an
    ADR-domain negative, and a guarantee that the keyed answer is provably
    absent from every canonical drug the stem covers.

### Deferred Fall engine issue

### Deferred Fall engine issue

| Task | Status | Boundary |
| --- | --- | --- |
| F26-MTC-01 — `mcq-multiple` pointer/touch double-toggle correction | `DEFERRED` | Separate, isolated `quizEngine.js` task required before MTC can be considered; not `READY` |

---

## Phase 2 Facelift lane

This is the active product sequence. At most one task is active at a time,
either `READY` or `IN PROGRESS` — and between a merge and the owner's next
authorization there may legitimately be none; satisfying a dependency does not
automatically change a later task's status. READY records priority, not blanket
implementation authority: each task still needs its owner-approved scope and
allowed-files contract before execution. A task stays `IN PROGRESS` until the
owner reviews and merges its branch; implementation alone never promotes it to
`DONE`, and never promotes the next task to `READY`.

| Task | Deliverable | Status | Depends on |
| --- | --- | --- | --- |
| P2F-01 | Phase 2 baseline and historical roadmap synchronization | `DONE` | — |
| P2F-02 | Repository health cleanup to exit 0 | `DONE` | P2F-01 |
| P2F-03 | Homepage/current-semester navigation facelift | `DONE` | P2F-02 |
| P2F-04 | Favorites entry path and library organization | `DONE` | P2F-03 |
| P2F-05 | Top Drugs Reference v2 performance/current-P2 shortcuts | `DONE` | P2F-04 |
| P2F-06 | Question Reports v2 reproducibility workflow | `DONE` | P2F-05 |
| P2F-07 | Additive curriculum metadata contract | `DONE` | P2F-06 |
| P2F-08 | Stats Dashboard v2 | `DONE` | P2F-07 |
| P2F-09 | Review Queue v2 + `wrongCounts` correction | `DONE` | P2F-08 |
| P2F-10 | Mobile/accessibility consistency pass | `BLOCKED` | P2F-09 |

P2F-08 shipped in PR #67 (merge `c7ccf7d`, 2026-09-03), built from `383a1de`,
`9a0d8d3`, and the review-correction commit `a9a25a9`.

P2F-09 shipped in PR #69 (merge `3c7bbf153783af2fc0287500f59b7be72ce906b1`,
2026-09-04) with final implementation head
`8ad6ecdde1ab42aa91e5d654fca512442c42c25b`, built from `2a2a80f`
(stop `wrongCounts` inflation on normalize), `4b568d9` (preserve trustworthy
consumer signals), and the review-correction commit `8ad6ecd` (keep the
ranking helper private). It closed the long-standing Review Queue
`wrongCounts` inflation that P2F-08 deliberately did not touch: normalization
is idempotent, a persisted `wrongCounts` map is authoritative, a legacy answer
alias folds exactly once, correct reviews no longer overwrite an existing
entry's `lastUserAnswer` or increment `wrongCounts`, and no consumer falls back
to an uncorroborated `lastUserAnswer`.
Historical counts were deliberately not repaired — see the accepted follow-up
below.

P2F-09 follow-ups accepted as non-blocking at merge:

- **P2F-09-F1** — a correct review for an absent queue key can initialize
  `lastUserAnswer` with the correct answer. Currently non-user-visible because
  no consumer treats `lastUserAnswer` as wrong-answer evidence: `wrongCounts`
  is unaffected, so the common-wrong signal stays empty and both consumers omit
  the claim. The cause is `buildEmptyEntry` normalizing the review record,
  which seeds `lastUserAnswer` from the answer aliases regardless of whether
  the review was correct. Reachable only when the entry disappears between
  quiz launch and completion. Not a defect to fix blind — any fix must not
  turn into a broader missing-entry redesign.
- **Historical answer frequencies remain legacy best-effort.** Counts already
  stored in a browser may be inflated by the pre-P2F-09 bug and were
  deliberately not migrated, decremented, or inferred, because legitimate
  wrong-answer events cannot be distinguished from phantom folds without
  guessing. Exactness is guaranteed only for events recorded from P2F-09
  forward. `wrongCounts` must not become a hard adaptive-selection signal for
  F26-10 without a separate provenance/trust strategy; `missCount`,
  `reviewMissCount`, and mastery fields were never affected by the bug and may
  be considered independently.

**No Phase 2 Facelift task is currently `READY`.** P2F-10 remains `BLOCKED`:
the P2F-09 merge records that its dependency is satisfied, but it does not by
itself authorize P2F-10 implementation, which still needs its own
owner-approved scope and allowed-files contract. The next planned work is Fall,
not P2F-10 — see the Fall sequencing note above.

P2F-08 is read-side only. It adds a Stats-local normalization and provenance
layer over `pharmlet.history` and introduces zero new writes: history, Review
Queue, favorites, top-drug signals, recent-run memory, and Boss Remix request
state are never written, and a Stats visit leaves raw history byte-identical.
Attempts are classified from the F26-09 `attemptLineage` contract first, the
stored `mode` second, and the catalog heuristic last; when a recognized lineage
kind disagrees with the stored mode, lineage classifies the attempt, both raw
values are preserved, and the conflict is recorded rather than repaired. Boss
Remix now reads as its own attempt category instead of disappearing into
generic Generated Sets. Curriculum context comes only from lineage or the
P2F-07 adapter/catalog: pre-lineage `generated-*` identities are never parsed
for a week number, and unproven context stays unclassified and is disclosed by
count. Recorded-attempt filters scope history-derived regions only; Most Missed
(lifetime Review Queue weakness) and Question Reports are separate stores and
say so on the page. Differently sized attempts — a 10-question practice set and
a 6-question Boss Remix — are associated through the recorded chain identity
but never merged into one averaged score. The 200-record retention cap,
backup version 2 and its replace-style import, Clear All Stats, and Reset
Adaptive Quiz Memory keep their existing semantics.

P2F-07 added the runtime-only curriculum metadata contract documented in
`docs/curriculum-metadata-contract.md`. Catalog-backed P1 context and the
existing Fall generator metadata normalize into separate quiz-level and
question-level scopes. Unknown fields remain absent, and source records are
identified by curriculum ID plus source record ID rather than generic name.
Question Reports consumes the contract additively; Review Queue, Favorites,
canonical sources, generator output, and scoring remain unmigrated and
unchanged. The Fall generator remains feature-frozen, and F26-MTC-01 remains
deferred.

### P2F-08 follow-ups accepted as non-blocking at merge

These were identified in final review, judged not to block PR #67, and are
recorded here so they are not rediscovered from scratch. None of them causes
Stats to assert something the underlying stores do not support, which is why
each was accepted. They are candidates for a later Stats pass, not authority to
change Stats now.

| Item | Observed behavior | Boundary |
| --- | --- | --- |
| P2F-08-F1 — additive-reading disclosure | When one excluded record is both unclassified and missing the dimension being filtered on, it is counted in both sentences, so the notes can read as a larger total than the number of records behind them. The distinct count is computed correctly (`excludedDisclosedCount`) but is not rendered; the adjacent "Showing N of M" line remains authoritative. | Presentation only; no count shown is false |
| P2F-08-F2 — unclassified note without a curriculum filter | Filtering by lab alone can still emit the "N recorded attempts are unclassified" note. Both clauses are true, but it offers a reason the reader did not ask about while the missing-dimension note already explains the exclusion. | Suppress unless a curriculum filter is active |
| P2F-08-F3 — inverted custom date range | Choosing an end date before the start date yields zero results with no explanation — the only empty state on the page that does not explain itself. "Showing 0 of N" stays accurate. | Needs a range-order notice, not a filter-logic change |

Two further cosmetic notes from the same review: a mixed-size display family
takes its label from an arbitrary member (the adjacent "Mixed sizes" line
corrects it in place), and an unmatched scope option is appended after sorting.
Neither is reachable in a way that misstates data.

P2F-05 kept the separate 169-record P1 and
100-record P2 canonical sources behind the existing normalization adapter,
added prominent P2 Fall/Lab III and Week 1–3 reference shortcuts, and reduced
the initial Drug Sheet render from all 269 full cards to 12 with accessible
24-record progressive loading. Search and filters still evaluate the complete
library, direct query links remain compatible, and duplicate generics retain
their source-record identities. Weeks 1–10 Lab III practice are now
student-facing and presented as one cohesive semester system, while Drug Sheet
reference filtering remains separate from quiz activation. All legacy
functional URLs/content, the guarded
1,723-question count, and the course-calibrated, feature-frozen Fall generator
remain protected throughout this lane.

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
