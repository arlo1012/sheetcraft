# Editable cell pictures and ownership transfer

Pictures embedded in cells can now retain their local reference frame, source
position/crop, arbitrary rotation, flips, shape adjustments, appearance,
annotations, alternative title/description, aspect lock, printing and lock flags.
The cell contains a source-bearing picture, rather than a baked screenshot. The
worksheet and preview use the shared source painter and its bounded cache. The
visible rotated/effect bounds fit inside the cell or merged cell with padding.
Embedding does not automatically change row heights or column widths.

## Conversion and history

- Standalone pictures may be embedded using the ribbon or context menu. An explicit
  legacy aspect-ratio lock is preserved using a source-bearing frame.
- A real owned picture leaf may also be embedded; this is a Sheetcraft enhancement.
  Hidden pictures must be shown before embedding; conversion cannot silently
  reveal a hidden root or descendant. A group container cannot be embedded as if
  it were one pixel source. The
  remaining ownership tree follows the existing singleton-collapse contract.
- The destination is the actual picture origin's merged-cell anchor. Existing
  literal, formula or image content requires explicit replacement confirmation.
  Cancel leaves the original picture, cell and history unchanged.
- The confirmation belongs to one workbook/sheet/generation, selection, full
  source forest, owner path, axis sizes/visibility, merge state and destination content. Old callbacks and changed
  owners do not retarget a new picture. Failure leaves the confirmation visible.
- Conversion to a cell or back to a floating picture is one reversible Core
  transaction. Undo restores the exact cell content and full forest; Redo does
  not recompute an inverse conversion or consult an image decoder.
- Back-conversion restores the stored local geometry. It uses a move-only anchor
  for ordinary manual dimensions, and a move-and-size anchor for fractional or
  enlarged dimensions derived from group or worksheet changes. Geometry is never
  clamped to the manual-size controls. Local reference dimensions must be positive
  and no larger than one billion pixels; painting has independent raster budgets.
- Existing table metadata is preserved. Embedding changes only the destination
  cell, without expanding a table or propagating a calculated column. Enabled
  input validation that cannot accept an image rejects the whole conversion. The
  workspace duplicate-entry rejection gate also evaluates the prospective image.

## Protection and clipboard

Embedding requires permission to edit the actual outer source root and every
cell in the merged destination. Back-conversion requires the merged source cell
to be writable. Its preserved locked flag immediately applies to the new floating
object; transferring existing content does not grant a general new-object
creation exemption.

Picture copying is read-only. A Cut lease requires source permission. Moving
existing unlocked roots on a protected sheet remains possible, while copying
new root identities still requires object-creation permission. A rejected paste
retains the source, history and reusable Cut lease; source removal and successful
paste stay atomic. Owned leaf/subgroup Cut retains exact local ownership and
releases the source only with an accepted atomic full-forest paste. The
cell clipboard, fill, sorting and internal history clone complete cell content.

Asynchronous image lookup captures the complete cell image, merged range and
owner. Same-asset changes to geometry, metadata or annotations invalidate the
old request. Success requires an explicit true command acknowledgement, and
feedback is checked against the owner again after the callback.

## Persistence and external-format boundary

Internal snapshots containing local cell frames use version 53. Earlier versions
reject the new fields; documents without them keep their previous required
version. Normalization, cloning and equality preserve complete local geometry and
reject malformed records, accessors, cyclic data and excessive data trees.

Native XLSX and portable JSON packaging of framed cell pictures remain explicitly
blocked before asset/resource preparation. No native reader/writer format
capability is added by this phase. Legacy cell and floating picture output remains
unchanged. Internal storage/snapshots remain available.

## Verification scope

Focused Core regressions cover normalization, backward-compatible snapshots,
exact transfer Undo/Redo, group contraction, confirmation content/address leases,
protected source/destination combinations, validation and style-restore admission.
Web regressions cover actual source painting, cache reuse, stale generations,
confirmation cancellation/old callbacks, async content and owner races, explicit
command outcomes, protected clipboard moves and creation refusal. External gates
have focused fail-before-resource tests. Visual details remain for user acceptance.
