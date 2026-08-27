# Pharmlet Autonomous Agent Runbook

Operating manual for unattended (Routine) agent runs against this repository.
Interactive owner-supervised sessions follow `CLAUDE.md` directly; this
runbook adds the constraints that apply when **no human is available to
approve anything mid-run**.

## Roles

| Role | Authority |
| --- | --- |
| **Repository owner** | Product owner. Sole merge authority. Only source of approval for protected files, application behavior, dependencies, and workflow changes. |
| **ChatGPT** | Supervising reviewer and roadmap arbiter: reviews PRs, issues written supervisory instructions, decides roadmap ordering disputes. Cannot merge. |
| **Claude** | Senior implementation engineer. Implements exactly one eligible roadmap task per run under this runbook. Cannot merge or push to `main`. |
| **Future Gemini reviewer** | Read-only junior reviewer unless separately authorized in writing. |

## Documented baseline

A run is only permitted to proceed when all of the following hold:

1. `git status`: tracked tree clean; untracked limited to `.claude/`,
   `.codex/`, `AGENTS.md`, and `branch-manifest-2026-07-15.txt`. Preserve these
   workspace items; never stage, delete, or rewrite them.
2. Local default branch equals `origin/main` (no divergence either way).
3. `npm run validate` → exit 0.
4. `npm run check:links` → exit 0.
5. `npm run test:tools` → all tests pass, zero failures (163/163 after F26-06;
   the count grows only through deliberate test additions).
6. `npm run health:repo` → exit 0 with `Errors: 0`. The two small-quiz warnings
   remain informational; any health error or nonzero exit is baseline drift.

## Phase 2 Facelift boundaries

- `docs/phase-roadmap.md` is authoritative. Exactly one task may be `READY`;
  after P2F-05 that task is P2F-06. Never infer readiness merely because a
  dependency is complete, and never select the stale F26-04 entry (it is DONE).
- Preserve separate canonical sources: legacy P1
  `assets/data/master_pool.json` and Fall P2
  `assets/data/fall-2026-p2-top-drugs.json`. Do not merge or substitute them.
- Fall Lab III Weeks 1–3 are student-facing; Week 1 is practice-configured and
  Weeks 2–3 use 6 new + 4 review. The shared generator is validated through
  Week 10, but Weeks 4–10 remain the separate F26-07 bounded activation task
  and are not unlocked by facelift work.
- The Fall generator is feature-frozen after F26-06. F26-07 may expose
  already-supported weeks but does not authorize generator redesign. Preserve
  legacy URLs/content, and do not touch `quizEngine.js` during unrelated Phase
  2 or activation work.
- These boundaries narrow the existing Routine authority; they do not grant
  new autonomous behavior or protected-file access.

## Autonomous execution loop

1. Read `CLAUDE.md`, `docs/phase-roadmap.md`, this runbook, and the relevant
   architecture/audit docs for the candidate task.
2. Fetch the current default branch (`git fetch origin` + fast-forward local
   `main`; if fast-forward is impossible, no-op).
3. Inspect open pull requests and existing `claude/` branches (local and
   remote).
4. Run the documented baseline (above).
5. Confirm exactly one task is marked `READY`, then select that task. Do not
   infer or create another READY status from dependency state.
6. Confirm the task is eligible for autonomous execution (no behavioral
   change, no protected files beyond its allowed list, no dependency
   additions, fits one logical commit, and is not marked never-autonomous).
7. Create one branch: `claude/<task-id>-<short-slug>` (e.g.
   `claude/p2f-03-homepage-facelift`).
8. Implement only that task, within its allowed-files list.
9. Run every validation command the task contract names.
10. Create exactly one logical commit using the task's expected message.
11. Update the task's roadmap status only as this runbook prescribes: set
    `IN PROGRESS` in the same commit as the implementation; `DONE` is set
    only by a human (or a human-approved follow-up) after merge.
12. Push **only** the `claude/` task branch. Never `main`.
13. Open a draft pull request when a supported PR mechanism is available
    (see next section).
14. Stop. Do not wait for feedback, poll indefinitely, or begin another task.

## Mandatory no-op conditions

Produce a concise no-op report and stop when any of these holds:

- `docs/phase-roadmap.md` or this runbook is missing or unreadable
- local/default-branch divergence that a fast-forward cannot reconcile
- the count of tasks marked `READY` is not exactly one
- an open roadmap PR or any existing `claude/` branch is present
- baseline drift (any deviation from the Documented baseline section)
- the task would require touching files outside its allowed list
  (protected-file expansion)
- the task would change application behavior
- the task requires a new dependency
- a deletion's safety is ambiguous
- tests would need to be weakened to pass
- a snapshot/fixture would need to be deleted merely to make CI pass
- the task cannot be completed as one logical commit
- completing the task would require pushing to `main`
- completing the task would require merge authorization

## PR creation capability and fallback

This environment has historically lacked the `gh` CLI. Exact required
behavior:

1. Prefer an available authenticated GitHub API or other supported
   PR-creation mechanism when one exists.
2. **Do not** install `gh` or add credentials/tokens automatically.
3. When no PR-creation mechanism exists:
   - the Routine may push exactly **one** `claude/` task branch;
   - it must output the exact branch name and the GitHub compare URL needed
     to open the PR manually:
     `https://github.com/lpalafox-1/coolpharmgames.com/compare/main...<branch>?expand=1`
   - it must mark the task `IN PROGRESS`, not `DONE`;
   - subsequent runs must **no-op while that branch exists**.
4. Never create repeated fallback branches for the same task.
5. Never merge or enable auto-merge, regardless of mechanism.

## Task-contract template

```
### <TASK-ID> — <title>
- Phase: <phase> · Status: <status>
- Objective: <one paragraph>
- Dependencies: <task IDs or none>
- Risk: <low|medium|high + one line>
- Allowed files: <explicit list>
- Forbidden files: <explicit list or "standing protections">
- Behavioral change: <none | YES + description>
- Validation: <commands + expected exits>
- Browser smoke: <not required | required + steps>
- Expected commit message: `<message>`
- Completion criteria: <observable facts>
- Rollback: <approach, normally `git revert <sha>`>
```

## Draft-PR report template

```
# <TASK-ID>: <roadmap title>  [autonomous Pharmlet roadmap work]

Objective: <restated>
Files changed: <list with per-file nature>
Behavioral impact: <exact; "none" only when literally none>
Architecture: <what moved/why, references to docs/>
Validation: <each command + exit code>
Test count: <before> -> <after>
Known risks: <list>
Protected files: confirmed untouched (<spot-check evidence>)
Rollback: <exact command(s)>
Unresolved questions: <list or none>
Recommended supervisor verdict: APPROVE | REQUEST CHANGES | BLOCKED
```

Title or label every PR as autonomous Pharmlet roadmap work.

## Future MCP and Multi-Agent Orchestration

- **MCP** is deferred until a controlled external-tool boundary is actually
  needed; no MCP server is to be added during the Phase 2 Facelift lane.
- **LangGraph** (or any orchestration framework) is deferred until multiple
  agents, multiple repositories, retry semantics, and persistent approval
  checkpoints justify a separate system.
- No orchestration application, external infrastructure, broad network
  access, or new connectors may be introduced during the Phase 2 Facelift
  lane. This section
  exists so future proposals start from a recorded default of "not yet."
