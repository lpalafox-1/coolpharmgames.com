# Fall 2026 Lab III question-form update — October 27, 2026

Luis is sole product and merge authority. This owner-requested change follows
Luis's report of professor feedback (faculty verbal evidence, not a revision
to the written curriculum or official JSON policy).

Suppress reverse identification of a drug by absence of boxed warning, and
reverse identification by an entire top ADR list. The actual shipped paths
were `materializeIdentifyDrugValueForm` with a `none` BBW predicate, and
`getInverseStructuredChoicePool` / `materializeInverseStructuredQuestion` for
`topAdverseReactions`, including the low-distractor fallback. Calibration
formerly rewrote the latter to “Which drug has this full top ADR list?”.

The ADR inverse pool now reports no capacity before candidate selection or
materialization. Source-safe atomic ADR recognition remains a fallback.
No-BBW reverse recognition reports no capacity and materializes no question;
positive BBW recognition and forward drug-to-BBW remain available. Full
forward drug-to-top-ADR lists, atomic ADR recognition, and class-coherent
Pairwise Shared ADR remain allowed. Existing NOT-indication / closed-group
NOT-ADR rules and rates are unchanged; no NOT-BBW form is added.

The canonical Fall drug JSON and written quiz policy are unchanged. Existing
saved attempts and Review Queue identities are preserved. This change governs
new generation, including fresh Standard Weekly, Week Focus, Adaptive, Boss
Remix material and future Final pools. Old saved payloads are not migrated.
Generator, both importing parents, hub, engine dynamic launcher import and
engine HTML token advance together to `20261027a`.

Correct drug–indication and drug–class pair recognition are verbally approved
future candidates. They are not implemented by this change or added to the
100-question prototype.
