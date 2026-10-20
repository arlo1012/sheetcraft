# Native generated-title regression coverage — 2026-10-20

## Scope and root cause

This is test-only maintenance. The native writer, reader, Core model, Web UI,
markers and automatic-axis behavior are unchanged.

The existing wrong-index and expression tests failed before decoding their altered
workbook: their global replacement searched for `&quot;1&quot;`, but the writer now
emits `&quot;Series 1&quot;`. The unchanged-XML assertion correctly exposed that
no-op. Removing that assertion or weakening chart omission would only hide the
coverage defect.

The repaired tests locate the first series and its title, then alter that title's
formula structurally. Wrong-index still supplies the unsupported ordinal `"9"`;
the expression wraps the actual current title source as `CONCAT("Series 1")`.
Both retain the exact original title cache. The absent-name case removes only the
first series title. Assertions prove the intended mutation occurred, the rest of
the title is unchanged for formula-only cases, and reversing the first-series
replacement reconstructs the original XML exactly.

Each case first decodes the same unmodified package, proves the original chart is
retained and checks there is no feature omission. Mutated packages must lose the
chart and explicitly report `xl/charts/chart1.xml` as omitted. This distinguishes
real fail-closed source validation from a broken initial package, a no-op edit or
an unrelated warning. Existing `generated-series-names.test.ts` controls continue
to prove acceptance of current names and legacy ordinals; no duplicate new tests,
new skips or production fallback were added.

## Guard sensitivity

In a separate disposable source copy, the unknown generated-title-source fallback
was changed from `undefined` to `currentName`, leaving title-cache validation and
the rest of decoding intact. Both repaired wrong-index/expression tests then
failed at the zero-drawings assertion because a chart was improperly retained;
absent-name still passed. The product checkout was not changed by this experiment.
This confirms the repaired regressions detect a permissive title-source guard
rather than merely exercising the ZIP parser or rejecting a mismatched cache.

## Verification

- Original focused reproduction: the two exact no-op assertion failures; the
  absent-name case passed.
- Final focused checks: 52 passed across native column options and generated names.
- Complete native chart aggregate: 804 passed, 2 existing skips, 27 files. The two
  previous native title baseline failures are resolved, not waived.
- XLSX test typecheck, production build, scoped lint and formatting: see the
  accompanying verification summary for recorded final outcomes.
- Independent review found no blocking issues in the test diff or retained guards.

This is not a whole-repository or remote-CI-green claim. The previously documented
Core range-series color-index failure, Web historical failures and Percent versus
Percentage assertion are outside this maintenance scope and were not rerun or
reclassified. No Excel/WPS or browser GUI run is needed or claimed for an unchanged
runtime. Existing build warnings remain visible in the private verification logs.
