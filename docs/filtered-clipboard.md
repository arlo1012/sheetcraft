# Filtered Clipboard

Copy and paste use physical addresses but operate only on visible rows. Row
visibility comes from the whole Sheet filter, independently of viewport size.
The system clipboard receives compact TSV; local copies also retain a snapshot
of raw formulas, styles, and original physical source rows.

| Action                            | Behavior                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------- |
| Copy                              | Skip filtered-out rows; retain visible rows in their original order.                               |
| Paste into one cell               | Expand from that visible cell, skipping hidden destination rows.                                   |
| Paste into a range                | Match or tile against its visible row count and column count.                                      |
| Paste values                      | Write literal computed values, preserving target formatting.                                       |
| Paste formatting / format painter | Preserve target content and formulas; apply only to visible rows.                                  |
| Cut / move                        | Reject when either rectangle contains or immediately borders a hidden row. Clear the filter first. |
| Merged source or target           | Reject without mutation. Unmerge first; merge metadata is not carried on the clipboard.            |

Every copied formula is translated from its own original physical address to
its actual target address. Absolute and mixed references retain Core's normal
copy rules. A filtered paste does not reconcile borders by modifying neighboring
hidden cells; those cells' content and styles remain unchanged.

The target row mapping is captured before the write. Pasting into a filter
column can change which rows are visible afterward, but does not change that
operation's destinations midway through the command.

Each successful paste is one Core command and one undo entry (unless it changes
nothing). Undo and redo restore all affected visible cells together. Rejected
operations do not modify the document, create history, move the selection, or
clear a pending cut. Feedback is localized and appears in the workspace status
bar; a disabled Cut item also describes why it is unavailable.

Clipboard reads are asynchronous. A document revision change during a read
cancels the paste. A pending cut also requires the revision from when it was
captured; reselect and cut again after another document edit. Copied snapshots
remain usable after edits. Sheet/document replacement clears pending clipboard
state. If the browser cannot retain a local clipboard token, cut safely degrades
to text-only copy and local formatting is unavailable.

Native copy/cut also attempts to expose its token through the Async Clipboard
format used by menu actions. If that write is unsupported, the successful native
clipboard entry is retained without a text-only overwrite. A menu or delayed
native paste only combines a later token with captured text when the texts match
(allowing platform line endings); matching text alone never identifies a local
copy or authorizes a cut.

The maximum source or destination matrix is 100,000 visible cells. Whole-row
and whole-column clipboard operations remain unsupported. Format painter also
retains the formatting tools' existing physical-selection size limit.
Cross-Sheet local
formula/style transfer, merged-cell transfer, HTML clipboard import, and
additional paste modes are not implemented.

Document changes use the existing save pipeline. Refresh restores cell
contents, styles, filter criteria, frozen panes, and unrelated merged ranges;
visibility is recalculated. Clipboard state, selection, and undo/redo history
remain session-only. See [Saving And Recovery](workbook-persistence.md).

Tests cover visible-row mapping, formula translation and tiling, hidden cell and
border preservation, cut restrictions, failure acknowledgements, revision races,
atomic history, and save/reload integration. Real-browser regression checks the
native clipboard, compact context menu, IndexedDB save, and refresh behavior.
