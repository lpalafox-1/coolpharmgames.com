# CLAUDE.md

Permanent engineering instructions for Claude sessions working on this repository (Pharmlet / coolpharmgames.com — the UAMS College of Pharmacy Class of 2029 personalized study hub).

## What this repo is

A static, client-side site (no build step, no backend) deployed via GitHub Pages from the `main` branch. Quiz content lives as JSON, rendered by a single large front-end engine.

- `quizzes/` — static quiz JSON files (flat directory), validated against `schema.json`.
- `assets/data/master_pool.json` — legacy P1 Top Drugs canonical source (169 records).
- `assets/data/fall-2026-p2-top-drugs.json` — Fall 2026 P2 canonical source (100 records, ten per week). P1 and P2 are separate sources and must never be merged or substituted for one another.
- `assets/data/` — additional policies and course-specific data sources, including Basis II units.
- `assets/js/quizEngine.js` — the quiz rendering/scoring engine (~7,800 lines, monolithic).
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
- **Preserve legacy URLs and content** unless the approved task explicitly replaces them and includes compatibility validation.
- **Preserve expected untracked workspace files:** `.claude/`, `.codex/`, `AGENTS.md`, and `branch-manifest-2026-07-15.txt`. Never stage, delete, or rewrite them as drive-by cleanup.
- **Commit only after explicit implementation approval.** Propose the change (plan or diff), get the user's approval of the implementation, then commit. A task that pre-authorizes commits ("apply and commit X") counts as approval; inferring approval from silence or from approval of an earlier, different change does not. One logical change per commit, with a clear message. Never amend, force-push, or run destructive git operations without explicit request.

## quizEngine.js Protection Rules

`assets/js/quizEngine.js` (~7,800 lines) is a monolith of interdependent global functions with limited direct behavioral coverage. Past edits have silently deleted load-bearing helpers (`toggleMark`, `toggleTimer`, point-scoring functions — see the "restore X" commits in history). Treat every touch as high-risk:

1. **Never modify it unless the task explicitly names `quizEngine.js`** as the file to change. "Fix the quiz page" is not sufficient; confirm the engine is in scope first.
2. **Isolate engine changes**: one concern per commit, no other files mixed in except the required cache-token bump.
3. **Bump the cache-busting token** in `quiz.html` (`assets/js/quizEngine.js?v=...`) in the same commit as any engine change — stale caches have shipped broken sessions before.
4. **Verify before declaring done**: run `npm run validate`, then load a real quiz over HTTP (`quiz.html?id=...&mode=...`) and exercise the changed behavior plus the fragile basics (answer check, mark, timer, reveal).
5. **No drive-by edits**: no refactoring, renaming, dead-code removal, or formatting churn while in the file for another reason. Structural decomposition happens only as its own explicitly approved project (Phase 3 of the cleanup roadmap).
6. **Unrelated Phase 2 Facelift work never authorizes an engine change.** If a P2F task does not explicitly name `quizEngine.js`, keep it untouched.

## Known repo state (context, not instructions)

- GitHub Pages deploys from `main`; the old `gh-pages` branch was removed. `deploy-pages.yml.disabled` is intentionally inactive — don't re-enable it without asking.
- `tools/check-links.mjs` and `tools/repo-health.mjs` are catalog-aware since `9f3cb3d`. Treat any `npm run check:links` failure as a real regression, not a known false positive.
- CI includes `validate`, `check:links`, and `test:tools`; the P2F-03 baseline is 146/146 tool tests passing.
- `npm run health:repo` exits 0 with zero errors. The static library contains 1,723 questions across 34 quiz files; P2F-02 retired the never-populated E2B placeholder and aligned the homepage count without weakening the health checks.
- `tools/engine-globals.manifest.json` pins the engine global surface and must be updated deliberately in the same approved commit as any intentional engine-surface change.
- The active roadmap is the ordered Phase 2 Facelift lane in `docs/phase-roadmap.md`. After P2F-03, P2F-04 is the sole `READY` task; do not select stale F26-04 work or infer readiness from satisfied dependencies. Keep exactly one task `READY` at a time.
- Fall 2026 Lab III Weeks 1–3 are student-facing. Week 1 is practice-configured and is not an official composition claim; Weeks 2–3 use 6 new + 4 accumulated review. Weeks 4–10 remain separate, course-timed activation work.
- The Lab III generator is feature-frozen except for reproduced defects or course-driven guidance. Facelift work does not reopen generator design or activate future weeks.

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
