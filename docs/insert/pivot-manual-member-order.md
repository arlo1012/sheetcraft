# Explicit PivotTable member order prerequisite

This checkpoint adds the Core representation needed to preserve a producer's
explicit axis order during bounded native PivotChart import. The native drawing
importer is still under development; this checkpoint does not admit drawings or
claim that native chart import is complete.

## Contract

`PivotFieldSort` accepts `order: "manual"` with a required, cloned `members` list
of at most 10,000 finite primitive values. Manual order cannot use a measure.
Duplicate members are rejected using the same typed identity as PivotTable
grouping: number `1` and text `"1"` differ, while null and empty text are the same
blank member. Sparse lists, undefined values and nonfinite numbers are invalid.
Ascending and descending rules cannot carry a member list.

Known members use the listed order independently at each row or column hierarchy
level. Members absent from the list append in source encounter order within their
parent group. Listed members absent from current data do not create phantom rows.
Explicit refresh preserves the rule and appends newly observed members. Cached
Show Details uses the same order as the displayed cached report; refresh, undo
and redo retain their existing cache/history semantics.

No manual sorting editor is introduced. The existing field settings tolerate the
imported rule; explicitly choosing an existing sort option replaces it, and
choosing measure sorting uses an ascending or descending rule.

## Snapshot migration

- The reader continues to accept workbook envelopes V1 through V43 with their
  existing feature gates. The ordinary writer still emits V43.
- A workbook containing a manual member rule emits V44. V44 has the V43 shape
  plus the new sort variant, rather than a whole-document structural migration.
- V1–V43 envelopes containing `order: "manual"` or a `members` property are
  rejected with a version-44 requirement. The feature is not silently interpreted
  under an old version.
- V44 readers retain and clone manual members. Standalone sheet deserialization
  infers the needed feature version and supports the same validation.
- Earlier application versions cannot be assumed to read V44 documents. Removing
  all manual rules allows the current writer to emit V43 again.

## Verified checks, 2026-10-10 UTC

- Core focused ordering/details/serialization: 9 files, 106 tests passed.
- Core complete package suite: 177 files, 2,621 tests passed.
- Core typecheck and build passed; full Web typecheck passed.
- Independent read-only source-level review found no remaining blocker after the
  sparse-array validation fix. It checked multi-level axes, per-parent unknown
  members, every cross-cell detail mapping, cache/refresh/history and snapshots.

The bounded XLSX leaf-layout reader and chart-only package collector are separate
unfinished work. Native missing or invalid item/order data must not be presented
as supported import based on this Core representation alone.
