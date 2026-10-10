# Excel web acceptance checkpoint,2026-10-10

Stage1 remains open. This folder preserves actual cloud-browser Excel evidence, not an XML/cache-only pass.

## Current canonical-v3 diagnostic

- Source: local commit9d5763e9bfe7f427ab432598e7d8ea2fe0679c39; original SHA256df68599f64b2412aba08415d7e47406b547ba0f257bae7f7887a199a1d3c37df.
- Isolated synthetic copy uploaded to signed-in Microsoft Excel web. Current file opened in edit view without a repair warning.
- Initial D2/D3/D4/D6 observed24/12/21/57.
- TableReferences!B2 edited2→5. Actual results became60/12/21/93. Ribbon Calculate Workbook explicitly invoked; D2 readout60 and formula=[@qty]*[@price].
- Excel online autosave observed. Workbook tab was fully closed and the same named OneDrive copy was reopened through Recent in a fresh tab. Edited input,60/12/21/93 and the formula persisted.
- Cloud save/reopen passed. A Download Copy attempt timed out in the browser driver and reset its kernel; no completed download path or saved-byte hash is claimed.
- Table header row renders black with unreadable text, including after reopen. Export header dxf specifies white-on-black. Cause/regression classification is not established. No style edit masked it.

## Historical workbook

A previously uploaded v3 geometry/formulas workbook was inspected only to establish login/edit state. Excel displayed a repair-in-reading-view warning and disabled editing. It was not treated as current output, and its repair action was not accepted.

## Native-v2 actual application checkpoint

The frozen v2 six-group matrix contains12 originals,285 paired machine assertions and16 sheets per adapter. All12 original/copy byte hashes were verified and isolated testing copies prepared. All six native groups now have actual key application observations; all six baseline matrix groups remain pending. Native original data/pivots opens read-only after table removal and cache repair, validation originally accepts forbidden11, floating image disappears visually after ordinary save/reopen, and iterative calculation shows#VALUE!. Geometry formula edit/save/reopen passes; styles, CF, protection/date/print have key observations with documented detail limits. Neither this checkpoint nor machine evidence closes the comprehensive real-application gate.

See observations.json for exact expected/actual values, artifact hashes and blockers, paired-application-observations.json for original matrix outcomes and evidence/ for safe worksheet-only screenshots. Original12 fixture/copy hashes were reverified unchanged in v2-originals-final-hash-verification.json.

## Real production fixes checked in Excel

opening-fix-observations.json preserves the causal controls separately from actual production exports.

- Pivot control and nonnumeric-integer-only factor both repair; adding text semi-mixed flag opens editable. Actual ordinary-fixed source40→60 refreshes60/60/120 and survives fullclose/fresh-tab reopen. Duplicate fixed opens and refreshes sum/avg/count120/30/4; its independent reopen is pending, while the comprehensive fixed workbook below covers both pivots durably.
- Worksheet filter partially overlapping table removes table; sameEast criteria owned by table opens without repair and clears to reveal West.
- Actual full original11-command corrected data-pivots production export SHA256d6aec64d6c168741b5490ee85659dfd60dbbfa01dd3efc97c26094bb9698877e opens without repair. Source C2 40→60 recalculates E2=300/E7=500; ordinary and duplicate pivots refresh correctly; table filter clears/restores; all persist fullclose/fresh-tab reopen with safe hashed file identity.
- Actual validation-alerts-fixed export SHA256387af7be1e8752efc64f9fe60445c4a3d459c1724dd59154319d3bf3cd6642bc rejects11, accepts10, and persists10 plus rule rejection after fullclose/fresh-tab reopen.

No repair action was accepted. No Excel-saved XLSX byte hash is claimed. The floating-image and iterative-value differences remain unresolved. Stage1 remains open; current acceptance scope is Excel and WPS only per latest user instruction.
