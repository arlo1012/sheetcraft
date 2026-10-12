# Source-owned picture annotations

The existing pen, arrow, rectangle, ellipse and text annotation tools also work on
standalone framed pictures and actual pictures inside ownership groups. A group
container is not an annotation source. Each annotation continues to use normalized
coordinates on the original image asset, rather than a screenshot of its current
appearance.

## Editing and presentation

For framed pictures, the dialog separates an original-source drawing surface from
a current-appearance preview. The source surface maps displayed coordinates to the
complete original image; the preview uses the same source painter as the worksheet
for source position, shape mask and adjustments, flips, arbitrary rotation and
picture effects. Annotations outside the current crop remain attached to the
source and can become visible after crop changes. The legacy picture editor keeps
its existing transformed-view interaction.

Applying annotations replaces only the annotation list. It retains the original
asset, current frame, crop, shape, anchor, aspect lock, alternative text, visibility,
printing/locking properties, appearance and unrelated members. This is not
rasterization and does not flatten an ownership tree.

## Ownership, protection and history

- One selected actual source owns the dialog. Workbook, sheet, generation,
  selection, full ownership path and source asset changes revoke old callbacks.
- An already-edited annotation list is not overwritten by an older draft. Other
  geometry, appearance and metadata changes on that same source are retained at
  application time, as are the latest values of unrelated siblings.
- The actual outer group's protection controls its leaf. A leaf's old local lock
  cannot bypass a locked root, or block an otherwise editable unlocked root.
- Cancel and unfinished pointer cancellation do not mutate the workbook. Failed
  commands leave the drawing draft visible. An unchanged list is a safe no-op.
- A successful root or leaf application is one reversible command. Whole-forest
  history retains nested ownership and exact geometry; Undo/Redo does not bake or
  re-decode the asset.

The existing limits remain 100 annotations, 1,024 pen points per item and 1,000
text characters. Source images use the existing byte/pixel safety limits; preview
canvases are bounded and released by the dialog. Visual details remain for user
acceptance.
