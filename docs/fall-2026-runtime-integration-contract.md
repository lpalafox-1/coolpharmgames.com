# Fall 2026 Runtime Integration Contract

## Status and scope

This document characterizes the current runtime and recommends the smallest
safe future scoring boundary for Fall 2026 Brand/Generic FITB questions. It
does not activate the Fall generator, change a route, or change runtime
behavior. `assets/js/quizEngine.js` remains unchanged.

The official Fall policy requires Brand/Generic FITB answers to be:

- spelling-sensitive; and
- capitalization-insensitive.

All other Fall domains remain MCQ and do not need a new answer-matching path.

## Evidence and characterization method

`tools/fall-2026-runtime-contract.test.mjs` loads the complete, shipped
`quizEngine.js` source into the existing Node VM browser-global harness. The
test suppresses `DOMContentLoaded` so the page router does not run, then calls
the engine's real `evaluateAnswerForQuestion` function and its real helper
functions. The evaluator is neither copied nor reimplemented in the test.

The test also exercises the real loaded-question normalizer and question
clone helpers, inspects the persisted review-queue projections, verifies the
generator's current metadata and multiple-brand output, proves that no HTML
page activates the Fall generator, and pins the engine SHA-256.

This is stronger than source-pattern-only characterization for scoring. It is
not a browser UI test and does not exercise DOM event wiring.

## Current legacy scoring behavior

`evaluateAnswerForQuestion(q, val)` currently applies these rules:

1. A blank value or `Revealed` is incorrect.
2. Matching generally lowercases, trims leading/trailing whitespace, and
   collapses repeated internal whitespace.
3. A second loose form removes every space, hyphen, slash, period, comma, and
   semicolon. The loose form is generated for `answer` and every
   `_acceptedAnswers` entry.
4. Comma- and semicolon-delimited answer strings are also split, and any
   individual part is accepted.
5. Curated drug-answer aliases are accepted. Some aliases intentionally cover
   alternate spellings.
6. If the prompt contains the case-sensitive text `Brand`, `drugRef.brand`
   variants and curated extra brand answers may be accepted. A trailing brand
   qualifier can also be removed, such as accepting `Lopressor` for
   `Lopressor (tartrate)`.
7. A correct answer containing a hyphen, slash, or the word `and` receives an
   additional order-insensitive all-parts comparison.
8. `_acceptedAnswers` participates fully in the same loose normalization,
   alias expansion, delimiter splitting, and qualifier handling.
9. `mcq-multiple`, numeric-tolerance, and concept-answer paths have additional
   specialized behavior. They are outside the Fall Brand/Generic FITB gap.

The VM characterization proves examples including:

| Official/current answer | Legacy input accepted today | Reason |
| --- | --- | --- |
| `Vasotec` | `VASOTEC`, ` vasotec ` | case folding and trim |
| `Cartia XT` | `Cartia     XT` | internal whitespace collapse |
| `Dilt-XR` | `DiltXR`, `Dilt.XR` | loose punctuation deletion |
| `Sacubitril/Valsartan` | `Sacubitril Valsartan`, `Valsartan-Sacubitril` | loose and combination matching |
| `Flovent, Arnuity` | `Arnuity` | comma splitting |
| `Flonase; Xhance` | `Xhance` | semicolon splitting |
| `Hormone Replacement` | `Horomone Replacement` | curated alias expansion |
| `Lopressor (tartrate)` | `Lopressor` | Brand-prompt qualifier removal |

The scorer is tolerant, not arbitrary fuzzy matching: an unrelated inserted
letter such as `Vasotecc` is still rejected unless covered by a specific
alias or another rule.

## Compatibility gap

The Fall requirement permits capitalization differences but does not permit
punctuation deletion, internal-spacing changes, alias substitution,
separator equivalence, delimiter splitting, qualifier removal, or curated
extra brands. Applying the legacy path to marked Fall FITB questions would
therefore weaken the official spelling-sensitive rule.

The generator already emits the necessary source-backed answer set:

- `answer`: the primary official answer;
- `_acceptedAnswers`: additional official answers, when present; and
- `metadata.answerMatching`: `{ spellingSensitive: true,
  capitalizationSensitive: false }` for Brand/Generic FITB questions.

No legacy quiz question or `master_pool.json` record currently carries this
`answerMatching` marker. It can therefore be an explicit opt-in without
changing the default behavior.

## Recommended integration boundary

Choose **A: a tiny question-level scoring-mode branch inside the existing
evaluator**, delegating to one small strict comparison helper.

The future owner-approved engine change should detect only a `short` question
whose `metadata.answerMatching` exactly requests spelling-sensitive and
capitalization-insensitive matching. It should return the strict result before
the legacy loose normalizer, alias expansion, delimiter splitting, numeric
tolerance, or combination matching runs. Every unmarked question must proceed
through the current evaluator byte-for-byte behavior.

This is preferable to an adapter because an adapter cannot safely undo loose
matching after the evaluator accepts an answer. It is preferable to a second
quiz engine because only one small dispatch and comparator are needed. The
existing two-boolean generator metadata is sufficient; a new mode field is
not required if the future implementation validates the exact pair and the
question type.

## Strict comparison algorithm

For an explicitly marked Fall strict-FITB question:

```text
if question.type is not "short":
    do not select strict FITB mode

if answerMatching is not exactly
   spellingSensitive=true and capitalizationSensitive=false:
    use the unchanged legacy evaluator

if user input is not a scalar string or is empty after trimming:
    return false

expected values = [question.answer] + question._acceptedAnswers
keep only non-empty scalar strings

strictKey(value):
    Unicode-normalize to NFC
    trim leading and trailing whitespace
    lowercase with the fixed en-US locale
    do not collapse internal whitespace
    do not delete or replace punctuation
    do not split on commas, semicolons, slashes, hyphens, or "and"
    do not expand aliases, brand qualifiers, drugRef brands, or curated extras

return expected values contain one value whose strictKey equals the user's
strictKey
```

NFC is recommended instead of compatibility normalization so canonically
equivalent Unicode text compares consistently without broadly folding
compatibility characters. Marked questions with malformed answer data should
fail closed rather than falling through to loose legacy scoring.

## Multiple official brand names

`answer` and each `_acceptedAnswers` entry are independent complete official
answers. For example, a Semaglutide generic-to-brand question currently emits
`Ozempic` plus `Rybelsus` and `Wegovy`; the duplicate-generic Fluticasone path
can emit all four official brands across `answer` and `_acceptedAnswers`.

The strict comparator should compare the user's entire input against each
entry. It must not concatenate, split, infer, or add a brand. This accepts all
official listed brands while rejecting unofficial punctuation and spelling
variants.

## Metadata lifecycle

The marker reaches the live evaluator through the normal loading path:

- `normalizeLoadedQuizQuestion` starts with `{ ...item }`, so `metadata` and
  `_acceptedAnswers` survive normalization.
- pool selection, shuffling, and state initialization use object spreads and
  preserve both fields.
- in-session missed-question review uses object spreads and preserves them.
- boss/weak-area generated clones serialize the whole question and preserve
  them.
- progress snapshots serialize the complete `state.questions`; restore copies
  each complete question, so resume preserves them.
- restart clears progress and reloads. A future deterministic Fall route must
  recreate the marked generated questions from its week/seed contract.

There is one blocking lifecycle gap for cross-page review: the current
`saveMissedQuestionsToReviewQueue` projection omits both `metadata` and
`_acceptedAnswers`; `review-queue-store.js` normalization drops unknown fields;
and `review-queue.js` does not restore either field when building
`review-quiz`. A marked Fall question would therefore become an unmarked,
single-answer legacy question in the persisted review queue.

Before runtime activation, a future approved implementation must either:

1. preserve the narrow answer-matching marker and `_acceptedAnswers` through
   all three persisted review-queue stages; or
2. explicitly keep marked Fall questions out of the persisted review queue
   until that preservation exists.

The first option is recommended because it retains review functionality. New
optional fields must not change legacy queue keys, legacy entries, mastery
counts, or legacy quiz reconstruction.

## Risks and safeguards

- A global tightening would break accepted legacy answer forms. Strict mode
  must be opt-in and return early only for the exact marker.
- Falling back to legacy scoring on malformed marked questions would silently
  weaken policy. Marked malformed questions should fail closed and surface a
  diagnostic during development.
- Losing `_acceptedAnswers` rejects valid official alternative brands.
- Losing the marker weakens scoring. Both fields must be treated as one
  lifecycle contract.
- The later `quizEngine.js` edit requires explicit owner approval, an isolated
  commit, the `quiz.html` cache-token bump, the engine-global regression suite,
  and browser smoke coverage under repository rules.

## Explicit non-goals

- No Fall route, catalog entry, page, or UI activation.
- No change to Week 1's unresolved total-question behavior.
- No change to MCQ scoring.
- No change to legacy aliases, punctuation tolerance, combination matching,
  review scoring, stats, or storage keys.
- No source JSON, policy JSON, or generator change in F26-03.
- No broad evaluator refactor or duplicate quiz engine.

## Recommended next implementation task

Create a separately owner-approved, non-activation task to implement and test
the opt-in strict branch plus end-to-end preservation of the marker and
`_acceptedAnswers` through the persisted review queue. Keep all legacy
questions on the existing path, bump required cache tokens, and run the full
engine/browser regression checklist. Route or UI activation should remain a
later task after that contract is proven.
