# Cell styles

Home → Cell styles provides the reference gallery in four columns: Good, bad and
neutral; Data and model; Titles and headings; six theme colors in four strengths;
Number formats; and workbook-owned custom styles.

Selecting a style applies its formatting to the selected cells through Core,
without changing values. Normal clears all direct cell formatting. Applying a
style, saving a custom definition, and merging a library support undo/redo.

New cell style captures the active cell formatting. Its numbered name avoids
existing names. Format opens the existing Number, Alignment, Font, Border and
Fill tabs; confirming updates the draft, while cancellation leaves the draft
unchanged. Custom tiles open for editing with right-click or Shift+F10. Editing
a definition affects future applications; existing cells retain their applied
formatting. Per-cell protection is outside the current model and is not shown.

Merge styles reads a local JSON snapshot or XLSX workbook. Same-name entries
retain the destination definition unless Replace styles with the same name is
selected. The merge changes only the style library, and stale imports are
ignored after switching workbooks.

Custom definitions are stored in version 14 snapshots; earlier snapshots remain
readable. XLSX writes named cellStyleXfs/cellStyles and reads custom named styles.
The builtin gallery is supplied by Core. The adapter currently materializes RGB
style colors; resolving imported theme/indexed named-style colors is not covered.
