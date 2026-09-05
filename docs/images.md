# Images

The Home ribbon's Image menu offers **Image in cell** and **Floating image**.
PNG, JPEG, WebP, and GIF files up to 10 MiB are accepted after browser decoding.
The Web image-assets module owns binary data and temporary object URLs. Core
stores only asset references and document placement.

## Cell images

A cell image occupies the cell content slot. It fits inside the cell or merged
cell with its aspect ratio preserved. It follows cells through insertion,
deletion, sorting, local copy/paste, and undo/redo. Double-click and F2 do not
open a text editor for it. Typing replaces it; Delete clears it; undo restores it.
Text clipboard and values-only paste project image content as a blank value.
Formula evaluation of an image cell reports `#VALUE!`.

## Floating images

Floating images have an anchor cell, pixel offsets, and independent dimensions.
Click to select; drag to move; use the lower-right corner to resize proportionally.
Arrow keys move one pixel, Shift+Arrow moves ten; Delete removes the selected
image. Escape cancels an active gesture or clears the image selection. One
completed drag or resize creates one history entry.

Ctrl/Cmd+C and Ctrl/Cmd+V copy a floating image within the same browser origin.
Pasting a bitmap from the system clipboard into the grid inserts a floating image.
Changing rows or columns moves anchors, and deleting an anchor removes its image
with undo support. Row and column resizing preserves floating image dimensions.
Images project through frozen panes and are hidden while their anchor row is
filtered out.

## Saving

Local autosave stores image references in a V3 workbook snapshot and retains
image blobs in IndexedDB. JSON export includes every referenced blob so the file
can be imported in another browser. Import validates image bytes and creates
safe local asset references before replacing the document. Missing local assets
have a placeholder and prevent exporting an incomplete image bundle.

This version does not provide image/text mixtures, crop/rotate controls, external
image URL loading, or Excel file import/export.
