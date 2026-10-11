# Calculated-column Web checkpoint (2026-10-11)

Status: **Web input and explicit replacement connected and verified in the real product UI**. Bounded native I/O and WPS/Excel checks are recorded separately; importing the saved WPS test copy into the isolated product workbook remains paused for its specific replacement confirmation. The separate Core structural checkpoint is frozen locally while its Git upload confirmation is pending; this document does not alter that payload.

## Implemented paths

- Grid and formula-bar committed manual input opt in to Core calculated-column behavior. Other command creators, range paste and programmatic cell-value entry do not implicitly opt in.
- Native textarea paste is tracked in the shared cell-edit session, across grid/formula-bar changes and rejected commits. It stays target-only when later committed with Enter. Success/cancel resets this origin; `insertFromPaste` input events also identify this path.
- Warning continuation retains the original input intent. A confirmed non-stopping data-validation rule can apply only to its exact original manual input and unchanged rule signature. Stopping rules, another generated member, a changed rule or another target cannot use this confirmation.
- The table toolbar opens an explicit current-column formula dialog. It describes replacement of all data members, including existing literals/formulas/blank exceptions/filtered rows, and the first data-cell anchor. Headers/totals are excluded. Only the explicit replacement button applies the command.
- Rejected/invalid operations retain the dialog and its formula draft. Cancel, stale callbacks, repeated confirmation, document replacement and permission denial cannot apply a prior target. A newer workbook revision requires reopening the operation.
- Calculated-column planning rejection reports a visible edit failure while retaining the editor draft and workbook/history.

## Checks

- Initial input-origin group: 8 files, 40 tests passed.
- Explicit replacement/native paste scenarios: 7 tests passed.
- Added original-cell warning continuation reproduced a failure: 7 passed, 1 failed. The original warning was incorrectly reapplied during generated-member validation. The narrow exact-rule confirmation fixes this without bypassing another member's validation.
- Core warning boundary expansion: 30/30 foundation tests passed, including six new warning/information/stop/changed-rule/wrong-target/generated-warning cases.
- Final related Web group: 12 files, 101 tests passed, one worker. Complete Web and Core typechecks pass. Scoped lint, diff checks, Web UI architecture and its six checker tests pass.
- The final post-GUI-fix related Web run passed 12 files / 142 tests with one worker. It includes the table module, shared cell-edit session, formula-bar commits and workspace validation feedback. These are focused/module checks, not a full suite or CI result. Actual GUI/persistence observations are in calculated-column-gui-20261011.md.

## Producer observation

The restored WPS 12.1.2.29182 native local editor was used with a fresh isolated three-column table and synthetic A/B/C items, quantities 2/3/4, and an empty result column. After native XLSX saving, entering the first `=B2*2` produced 4/6/8. A manual 99 and a cleared member remained exceptions; a new row with quantity 5 inherited 10. The canonical table formula remained B2*2 while worksheet cells retained their actual formulas/literal/blank state. The native adapter and actual product XLSX path have subsequently been verified; see calculated-column-native-20261011.md and calculated-column-gui-20261011.md.

The four producer variants and parsed original XML evidence remain local. No new raw workbooks, raw XML, screenshots, account data or authentication state are included in this source/text checkpoint.

## GUI-discovered error message correction

An invalid explicit formula (`=B2*`) originally retained the draft/data but reported
a generic table-name/range error. The controller now checks a valid parsed formula
before execution and uses a calculated-column-specific failure message for
protection/validation/command rejection. The initial regression check was 7 passed
/ 1 failed because the parser returns null, not undefined, for this input; the
corrected check passed 8/8. In the real UI, the invalid formula then showed its
specific message, retained the draft, and accepted a corrected retry.

A final complete Web typecheck found TS2367 in the new generic target comparison.
The confirmation helper now receives its failure-message context explicitly.
The related dialog group passed 3 files / 60 tests and the final complete Web
typecheck passed. The initial failed typecheck is retained separately.
