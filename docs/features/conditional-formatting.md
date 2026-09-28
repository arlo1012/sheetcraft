# Conditional formatting

The Home ribbon groups conditional formatting into highlight-cell rules,
top/bottom rules, data bars, color scales, and icon sets. Highlight-cell rules
include cell-value comparisons, text predicates, relative dates, blank/nonblank
cells, duplicate/unique values, and formulas. Top/bottom rules support item counts,
percentages, and above/below-average comparisons.
The rule manager edits rules for the current selection or the whole sheet,
including multiple A1 areas, priority, and Stop If True. Styles support number
formats, font family/size/color/emphasis/underline/script, solid/pattern/gradient
fills, and individual cell borders. Rules and manual cell styles remain separate.

## Document and display contract

Core owns `Sheet.conditionalFormats`. Array order is descending priority. A rule
has a stable ID, one or more ranges, an explicit formula anchor, a typed condition,
a differential style, and an optional stop flag. Matching rules combine properties;
the first matching definition of each property wins. Fill properties are resolved
as a group so a lower-priority gradient cannot replace a higher-priority solid fill.
Explicit clears remain distinct from omitted attributes. A stop flag prevents lower
priority rules from contributing even if the stopping rule has no visual style.
Conditional formatting overrides the existing duplicate-tool highlight and manual
formatting without modifying either persisted style.

Formula references are translated from the stored anchor for each target cell and
calculated by the workbook evaluator. Errors do not match. Dynamic styles are
cached for a document revision; scrolling reuses the snapshot. Duplicate counts
use sparse cell values and spill projections, avoiding a rectangular full-sheet
scan. Ranking and visual thresholds use numeric values from the entire rule scope,
deduplicating overlapping areas and excluding blanks, text, and errors. Whole-column
rules can therefore remain sparse. Visual thresholds support minimum, maximum,
number, percent of the value range, and percentile. Formula thresholds are not
supported.

Commands provide atomic edits and undo/redo. Clearing a selection subtracts only
that rectangle from rule scopes, retaining outside areas and the original anchor.
Version 12 JSON snapshots preserve rules and accept previous snapshot versions.
Internal copy/all-format paste carries rules, rebases relative formulas, and
replaces destination rule coverage. Values-only paste retains destination rules.
Filtered pastes apply rules only to destination rows receiving copied cells.

## Structural edits

Row/column insertion, deletion, and supported moves update ranges and formula
references. Sheet rename/delete also updates qualified references and undo restores
them. Operations whose geometry cannot preserve rule semantics are rejected before
mutation: partial cell shifts touching conditional-format scopes or references,
axis moves splitting a rule range, and ambiguous cross-sheet relative rules across
multiple edited-axis coordinates. Bounded cell moves may split formula rules;
operations requiring excessive expansion are rejected.

## XLSX

Supported comparisons, text, blank, duplicate/unique, expression, ranking, average,
date, data-bar, color-scale, and base icon-set rules map to OOXML
conditionalFormatting/cfRule and differential styles. Priority and Stop If
True survive round trips. Formula export rebases to the first emitted range so
partial clears do not shift reference meaning. Unsupported rule types and style
fields produce compatibility diagnostics; malformed individual rules are omitted
with a diagnostic rather than silently replacing them or failing all valid rules.
All 20 icon sets are preserved, including Five Boxes, Three Stars, and Three
Triangles through the OOXML x14 extension. Normal and reversed icon order,
thresholds, and icon-only display survive import/export. Base and extension rules
share the same priority order, so an extension rule does not disappear and expose
a lower-priority icon set after export.
Extended solid and negative-color data bars remain outside the supported subset.
See [XLSX IO](../xlsx-io.md) for details.

The existing sort-by-color feature still uses manual cell colors. Existing
duplicate-tool document rules keep their separate product semantics and are not
converted into conditional-format rules.

## Reference behavior

Interaction follows [Excel conditional-formatting guidance](https://support.microsoft.com/en-us/excel/use-conditional-formatting-to-highlight-information-in-excel) and [WPS conditional-formatting help](https://www.wps.cn/learning/room/d/239531). Gallery presets apply immediately; More rules opens the editor. The editor groups six rule categories and exposes minimum/midpoint/maximum controls for visual rules. Visual rules do not offer Stop If True. Icon sets display descending cutoffs with an otherwise-lowest category.

The gallery contains 12 data-bar presets, 12 color-scale presets, and 20 icon sets grouped into directions, shapes, indicators, and ratings, following the [WPS tutorial](https://www.wps.cn/learning/course/detail/id/556?sid=137).

Date-relative rules evaluate against the current local date when the sheet display snapshot is rebuilt (including edits/recalculation/opening); idle workbooks do not schedule a midnight refresh.

Highlight-cell and top/bottom menu shortcuts open dedicated compact dialogs: the
comparison, rank direction, percentage mode, and above/below-average direction
remain fixed to the selected command. Rank defaults to 10. Six format presets
match the reference dropdown, and Custom format reuses the Number, Font, Border,
and Fill tabs of the cell-format dialog. Cancelling custom formatting preserves
the shortcut draft. One confirmation saves the rule; More rules and the manager
retain the complete editor. Inner range borders and alignment are excluded from
the differential-style dialog.
