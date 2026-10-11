# Calculated-column native I/O checkpoint (2026-10-11)

## Verified scope

- Explicit table-column metadata is the template, anchored at the first data row.
  Actual worksheet members remain the source of values, formulas and exceptions.
- No template inference from uniform worksheet formulas. Import never fills an
  empty member or replaces a literal. Export never changes the live workbook.
- Reader validates namespace identity, a single formula child, scalar array flags,
  text/CDATA/entities, valid source and table/column binding. It removes one outer
  equals envelope only; string literal/internal whitespace remain intact.
- Writer uses the same structured-reference qualification and future-function
  encoding as worksheet formulas. Calculated formula precedes a custom total
  formula. Header-off/offset anchors, total rows and all-exception columns are
  covered by regression.
- Supported template proof is deliberately local: scalar literals, own-sheet A1
  references, unary/binary scalar or stable one-cell expressions; own-table
  single-column this-row; direct own-sheet/own-table data ranges in reviewed
  scalar aggregates; scalar IF branches and a small reviewed function subset.
  Limits: 8192 source characters, 512 AST nodes and 64 levels.
- Unproved array/name/spill/cross-table sources, invalid/duplicate formula
  metadata and unknown semantic attributes emit located feature-omitted warnings
  and omit the template. Actual worksheet formula/value/error/blank members
  remain untouched. This is bounded compatibility, not native support for every
  Core formula. Direct this-row arguments to ordinary scalar functions remain
  limited because Core passes them as ranges; ABS([@Qty]) is not admitted here.
- Supported table exports no longer trigger an unconditional table-part omission
  warning. Unsupported table/column properties remain specifically reported.
  Formula-cache-discarded diagnostics are retained separately.

## Actual WPS evidence in this round

Version 12.1.2.29182.AK.preread.sw, local Sheets, cloud synchronization disabled.
Only isolated synthetic workbooks were used.

1. Native WPS blank Result column: manual C2=B2*2 produced C2:C4=4/6/8.
2. Native edits made C3=99 and C4 blank. New row D/5 inherited C5=10; old
   exceptions remained. Native metadata was B2*2 and worksheet members preserved
   the two exceptions. Four producer stages were read through public decodeXlsx:
   blank had no template; subsequent stages had =B2*2 with exact actual members.
3. Official product exporter generated its own exception workbook with 4/99/blank
   and the explicit B2*2 template. WPS opened it without a repair prompt.
4. In WPS, changing Qty B2 to 7 updated C2 to 14. Appending D/5 inherited C5=10
   while C3=99 and C4 blank remained. Saved, closed and reopened the workbook:
   14/99/blank/10 remained visible.
5. Public product decode of the WPS-saved file restored =B2*2, table A1:C5,
   actual C2=B2*2, C3=99, C4 blank, C5=B5*2. No template omission warning.

These WPS observations and local producer/XML analysis are complemented by
fresh Sheetcraft and Excel GUI acceptance in calculated-column-gui-20261011.md. New producer/product XLSX, original XML, JSON analysis
and screenshots remain local and are excluded from Git payloads.
The repository generation script recreates the product fixture with public Core
commands and the public XLSX adapter, using synthetic data only.

## Checks and retained failures

- First native test run: 1 passed / 29 failed. Missing implementation was expected;
  the initial test harness also used the wrong command name, passed undefined to
  a defaulted fixture, and accidentally left a numeric constant in a total row.
  These harness mistakes were corrected explicitly, without changing the numeric
  totals export restriction.
- First implementation run: 29 passed / 1 failed. The assertion incorrectly
  expected no diagnostics, although the existing formula-cache-discarded warning
  was still correctly produced. Narrowed assertion to absence of template loss.
- Initial native calculated-column file: 39 passed. Namespace/order guards raised
  this to 42; the unknown namespaced array flag initially reproduced 39 passed /
  1 failed and was then fixed. A final independent review reproduced three
  failures (42 passed / 3 failed): foreign layout attributes could be mistaken
  for canonical-anchor attributes, and direct/IF-branch SPILL errors could be
  kept as growth-blocking templates. Prefix-preserving ancestry attribute
  validation and conservative SPILL-template exclusion fix these. The first
  review-fix run was 45 passed / 3 failed due to an incorrect AST error-field
  access and the test using the pre-export table ID; both were corrected, and
  the next focused run passed 48/48. An additional regression preserves an
  actual worksheet SPILL error while omitting the unproved template. A separate
  unknown attribute named xmlnsUnknown reproduced 49 passed / 1 failed; exact
  XML namespace-declaration matching fixes this final whitelist boundary.
- Initial related serial run: 10 files / 203 passed. The final review/namespace
  expansion passed 10 files / 214 (50 in the new native file), including totals, structured reference
  export, table filters, table styles, Normal font defaults and ZIP preflight.
- Full XLSX TypeScript check passed; Core, sheet-engine and XLSX builds passed.
- Scoped native source/tests/generator lint passed. Unstaged source diff-check
  passed. Frozen stage-2 verbatim test logs retain their original whitespace and
  therefore cached diff-check reports log whitespace; the frozen payload was not
  rewritten to conceal it.
- Full repository suite and CI were not rerun at this checkpoint. Actual
  Sheetcraft/Excel GUI observations are documented separately. The prior architecture baseline still has 125 unchanged failures.

## Local publication state

The stage-2 23-file structural checkpoint was published after specific approval
and verified at 1b624740566470fcf4798d87387e06ea71753ed6, with its original
315c1e643ae075b5341fa61f9a173b65240d37b8 tree unchanged. The cumulative
Web/native code checkpoint is verified at
f47042699ec6201f32b9582a82a8a54221f18fdf, with its frozen
886903c769d064f145bfb1f99a9b6c664665e041 tree unchanged. Actual
WPS-saved-copy import into the backed-up product UI now passes, including
exceptions, growth, save/reload and later growth. No raw artifacts are published.

## Additional bounded namespace/shape limits

- Foreign prefixed semantic attributes on table/column ancestry make the template
  identity/anchor unproved and therefore omit it with a located warning. Actual
  worksheet members remain untouched; this does not add general namespace support
  to all older table properties.
- A main-namespace prefixed autoFilter cannot be represented by the existing
  unprefixed filter reader. The import now reports a specific filterNamespace
  warning instead of claiming that filter preservation was verified.
- Native templates containing SPILL errors (including an unselected IF branch)
  are omitted on read/write. Ordinary scalar errors remain supported, and actual
  worksheet error exceptions remain unchanged.
