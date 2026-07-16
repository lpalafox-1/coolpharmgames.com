# CLAUDE.md

Permanent engineering instructions for Claude sessions working on this repository (Pharmlet / coolpharmgames.com — the UAMS College of Pharmacy Class of 2029 personalized study hub).

## What this repo is

A static, client-side site (no build step, no backend) deployed via GitHub Pages from the `main` branch. Quiz content lives as JSON, rendered by a single large front-end engine.

- `quizzes/` — static quiz JSON files (flat directory), validated against `schema.json`.
- `assets/data/` — master pool JSON used to generate quizzes (Top Drugs, Basis II units).
- `assets/js/quizEngine.js` — the quiz rendering/scoring engine (~7,680 lines, monolithic).
- `assets/js/`, `assets/css/` — remaining front-end JS/CSS.
- `tools/` — local test harness and validation scripts (`validate-quizzes.mjs`, `check-links.mjs`, `repo-health.mjs`, etc.).
- `scripts/validate-quizzes.mjs` — thin CI shim that delegates to `tools/validate-quizzes.mjs`.
- `.github/workflows/` — CI (quiz validation) and a disabled Pages deploy workflow.

## Hard rules

- **Do not modify application code** (anything under `assets/js/`, `assets/css/`, or the root `*.html` pages) unless a task explicitly asks for an app-code change. This protection covers the app only: **tooling (`tools/`, `scripts/`) and documentation (`README.md`, this file) may be changed once the specific change has been proposed and approved in the session.**
- **Do not modify quiz JSON files** under `quizzes/` or `assets/data/`.
- **`assets/js/quizEngine.js` is under special protection** — see "quizEngine.js Protection Rules" below.
- **Do not modify GitHub workflows** under `.github/workflows/` unless the specific workflow change has been explicitly approved (approved CI/tooling changes are allowed, e.g. the Phase 1 `npm ci` fix).
- **Do not commit temporary artifacts.** Scratch files, one-off audit output, and manifests belong outside version control (or in `.gitignore`'d paths), not in commits.
- **Commit only after explicit implementation approval.** Propose the change (plan or diff), get the user's approval of the implementation, then commit. A task that pre-authorizes commits ("apply and commit X") counts as approval; inferring approval from silence or from approval of an earlier, different change does not. One logical change per commit, with a clear message. Never amend, force-push, or run destructive git operations without explicit request.

## quizEngine.js Protection Rules

`assets/js/quizEngine.js` (~7,680 lines) is a monolith of interdependent global functions with no test coverage. Past edits have silently deleted load-bearing helpers (`toggleMark`, `toggleTimer`, point-scoring functions — see the "restore X" commits in history). Treat every touch as high-risk:

1. **Never modify it unless the task explicitly names `quizEngine.js`** as the file to change. "Fix the quiz page" is not sufficient; confirm the engine is in scope first.
2. **Isolate engine changes**: one concern per commit, no other files mixed in except the required cache-token bump.
3. **Bump the cache-busting token** in `quiz.html` (`assets/js/quizEngine.js?v=...`) in the same commit as any engine change — stale caches have shipped broken sessions before.
4. **Verify before declaring done**: run `npm run validate`, then load a real quiz over HTTP (`quiz.html?id=...&mode=...`) and exercise the changed behavior plus the fragile basics (answer check, mark, timer, reveal).
5. **No drive-by edits**: no refactoring, renaming, dead-code removal, or formatting churn while in the file for another reason. Structural decomposition happens only as its own explicitly approved project (Phase 3 of the cleanup roadmap).

## Known repo state (context, not instructions)

- GitHub Pages deploys from `main`; the old `gh-pages` branch was removed. `deploy-pages.yml.disabled` is intentionally inactive — don't re-enable it without asking.
- `tools/check-links.mjs` has three known pre-existing false positives (`basis2-quiz9`, `bdt-unit10-exam4`, `top-drugs-final-mock`) because it only scans `quizzes/` instead of using `quiz-catalog.js` as the source of truth. Treat these as known-stale, not regressions, unless asked to fix the checker itself.
- A cleanup roadmap exists in prior sessions (Phase 1 complete; Phase 2 covers validator/CI consolidation and the check-links fix; Phase 3 covers decomposing `quizEngine.js` and fixing a biased `shuffled()` implementation). Ask before assuming this roadmap should be resumed — it changes over time.

## Working conventions

- No build step: this is plain HTML/CSS/JS served statically. Test changes with `python3 -m http.server 8000` and a browser, not a bundler/dev server.
- Validate quiz data with `npm run validate` before considering quiz-adjacent work done (when quiz JSON changes are explicitly in scope).
- Keep changes scoped to what was asked — this is a small personal-use site, not a platform; avoid introducing frameworks, build tooling, or abstractions it doesn't already have.

## Session Reporting

After completing any approved task, end with a structured report containing:

- **Files changed** — every file touched and the nature of each change.
- **Commits created** — SHA and message for each commit, when commits were in scope.
- **Validation results** — output of the relevant checks (`npm run validate`, `npm run check:links`, CI status, live-site verification where applicable), stated plainly including failures.
- **Unexpected issues** — anything found outside the approved scope, clearly marked as pre-existing or caused by the change. Surface out-of-scope issues; do not silently fix them.

Report outcomes faithfully: skipped steps are reported as skipped, failures with their output. Remote-facing or destructive actions (pushes, branch deletions) are reported with the exact commands executed.
