# Excel-native reupload control, 2026-10-10

## Result
The byte-identical 8,688-byte Excel-native saved package initially displayed the floating checkerboard after upload. A1 was changed from `FLOATING_PROBE_20261010` to `FLOATING_PROBE_20261010_REUPLOAD` and explicit save completion was observed. The full workbook tab was closed and the same opaque workbook identity was freshly opened in a new tab. Its exact saved marker loaded and status said `已保存`, but the floating image was invisible. A second screenshot roughly 19 seconds after the first, with no observable loading indicator, was byte-identical and still lacked the picture.

The actual saved workbook was obtained through normal top-level OneDrive Download: 8,670 bytes, SHA-256 `da00389043e6d843ee8c181c8e722c3662fbd807887ab72701edf9ff5db432b8`, clean ZIP CRC, all 14 original parts retained.

## Package comparison
- Drawing XML is byte-identical, including twoCellAnchor editAs=oneCell, creationId, and xfrm.
- PNG remains byte-identical: 418 bytes, 160×96 pixels.
- Worksheet-to-drawing and drawing-to-image relationship files are byte-identical. Worksheet drawing rId1 remains unchanged.
- Workbook changes only revisionPtr revIDLastSave 2→3 and uidLastSave. Workbook properties, compatibility-version extension, and other extensions remain unchanged.
- Worksheet changes only removal of its previously saved D9 selection.
- Shared strings contain the requested marker suffix; core properties change only modified timestamp.
- Content types, root/workbook relationships, application properties, styles and theme remain byte-identical.

## Meaning and limits
The original native-cloud workbook previously survived close/reopen with its picture visible. Reuploading that exact exported package reproduces the imported-workbook nonvisibility in this session. This sharply limits a producer-only explanation and records a native-creation versus upload-path distinction. The retained drawing and media disprove deletion for this saved package. It does not establish the hidden conversion/load mechanism, a general vendor defect, or a production fix. One imported control was run; no further XML, settings, WPS or producer experiments were performed.

## Evidence
- observations.json: UI flow, save states, safe identity, timing and cleanup
- ooxml-analysis.json: per-part checksums and critical structural comparisons
- screenshot-manifest.json: actual JPEG dimensions, hashes and nonblank statistics
- initial.jpg, edited-saved-before-close.jpg, fresh-reopen.jpg, fresh-reopen-settled.jpg
- ExcelWeb-native-reupload-control-20261010.xlsx: byte-identical writable upload copy
- ExcelWeb-native-reupload-control.saved.xlsx: actual unchanged downloaded saved bytes
- critical-parts/: exact input/saved drawing XML, PNG and relationships

All task tabs are closed. Protected tabs 2/5/8/9 remain. GUI released. No source edits, commits, pushes, Library uploads, account changes or private URL retention.
