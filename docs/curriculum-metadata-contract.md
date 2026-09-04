# Curriculum Metadata Contract

Pharm-let exposes one additive runtime metadata contract for curriculum-aware
features. It normalizes existing repository context; it does not merge or
rewrite curriculum records.

## Contract shape

`window.PharmletCurriculumMetadata` returns plain objects with two deliberately
separate scopes:

```js
{
  schemaVersion: 1,
  quiz: {
    professionalYear,
    academicYear,
    semester,
    course,
    lab,
    quizId,
    sourceQuizId,
    quizWeek,
    curriculumId,
    curriculumSource,
    origin,
    generatorId,
    seed
  },
  question: {
    questionId,
    knowledgeDomain,
    sourceMaterial,
    sourceDrugId,
    sourceDrugIds,
    sourceDrugQuizWeek,
    questionVariant,
    brandGenericDirection
  }
}
```

Every field is optional. Unknown, vague, or invalid values are omitted rather
than inferred. `origin` is limited to `static` or `generated`, and
`sourceMaterial` is limited to `new` or `review`.

## Reliable adapters

- Known P1 static context comes from `assets/js/quiz-catalog.js`. The catalog
  identifies the documented P1 Fall 2025 and P1 Spring 2026 groupings without
  bulk-editing static quiz questions. A cataloged `quiz-json` source is
  `static`; legacy virtual and concept routes are `generated`.
- Fall 2026 Lab III context is selected only by its existing payload kind or
  deterministic generator ID. The adapter supplies P2, academic year
  `2026-27`, `Fall 2026`, Lab III, curriculum ID
  `p2-fall-2026-lab3`, and source ID `fall-2026-p2-top-drugs` while reusing the
  existing week, seed, domain, new/review, source-record, and variant fields.
- `quizId` retains the launched quiz or generated container. `sourceQuizId`
  retains the stable underlying quiz identity when one already exists. An
  explicit per-question `sourceQuizId` takes precedence; generated containers
  use their existing `generatedFrom` value as a fallback. Fall preserves the
  `custom-quiz` container and generated origin.
- For a non-Fall `custom-quiz` or `review-quiz` question, curriculum context
  comes from that question's existing `sourceQuizId`. The container remains
  generated. A mixed container without a reliable per-question source keeps
  only its container identity and generated origin.
- Static questions without reliable domain, material, week, or source-record
  metadata leave those fields absent.

No normalization rule parses clinical facts, question prose, drug names, or UI
categories to fabricate curriculum context.

## Identity and non-collapse rule

A source record is identified by the pair:

```text
curriculumId + sourceDrugId
```

The shared `getSourceRecordIdentities()` helper returns that pair for the
primary and any additional source-record IDs. A generic name is never the
curriculum identity. This preserves both:

- the same generic taught in different professional years; and
- distinct official records with the same generic inside one curriculum, such
  as the two Fall 2026 Fluticasone rows.

## Persistence boundary

The contract itself is runtime metadata. Question Reports v2 consumes it and
persists the reliable curriculum fields additively alongside its existing
reproduction fields; its existing schema version and legacy loading behavior
remain unchanged.

P2F-07 does not migrate or rewrite `pharmlet.history`,
`pharmlet.review-queue`, or `pharmlet.favorites`. P2F-08 and P2F-09 have since
shipped and both held that line: each reads this contract and older partial
records without migrating either store. Favorites remains a quiz-ID string
array.

Canonical P1/P2 data, Fall policy, generator output, scoring, and quiz answers
are outside this adapter and remain unchanged.
