# Browser Smoke Checklist

Run before declaring any engine-adjacent change done (CLAUDE.md
quizEngine.js Protection Rule 4). Serve locally — never file:// —

```bash
python3 -m http.server 8000
```

then exercise, in order:

## Core loop (`quiz.html?id=chapter1-review&mode=easy`)

1. Quiz loads; title, question count, and prompt render.
2. Select an option → **Check Answer** scores it and shows the explanation.
3. **Next/Prev** navigate; nav map dots reflect answered/seen state.
4. **M** (mark) toggles the flag on the current question; marked count updates.
5. **T** pauses/resumes the timer; readout stops/continues.
6. **Hint** and **Reveal Answer** work and mark the question appropriately.
7. Keyboard: A/S/D/F select options, ←/→ navigate, Enter checks, `?` opens
   the shortcuts modal, Esc closes it.

## Session persistence

8. Answer a few questions, reload the page → the resume prompt restores
   index, score, streak, and timer.
9. Finish the quiz → results screen renders; a history entry appears
   (visible on `stats.html`); high-score badge updates on `index.html`.

## Exam-mode gating (`quiz.html?id=ceutics2-final`)

10. True Exam banner shows; Hint/Reveal buttons are hidden; **H** and **X**
    keys do nothing; shortcuts modal shows the restricted note.

## Review queue

11. Miss a question deliberately, finish → the item appears on
    `review-queue.html`; launching a review quiz round-trips correctly.

## Generated modes

12. `quiz.html?id=log-lab-final-2` generates 110 questions with the 90-min
    timer and adaptive banner (needs prior signals for focus text).
13. After a completed run with misses: Boss Round / weak-area retake launch
    from the results screen.

## Cross-cutting

14. Theme toggle persists across pages; A-/A+ font controls work.
15. Browser console shows no errors on any exercised page.

If any step regresses, stop and diagnose before committing — and remember
the cache-token bump in `quiz.html` must ship in the same commit as any
engine change.
