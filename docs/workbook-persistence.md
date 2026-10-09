# Saving And Recovery

The File menu saves the current workbook locally, imports a Sheetcraft JSON file,
exports a JSON backup, and reloads the browser's saved copy. All feedback and
confirmation text is available in Chinese and English.

## Scope

Storage is local to this browser profile and origin (scheme, host, and port).
There is one current-workbook record, not a cloud account or document library.
Other devices, browsers, private sessions, and different development ports do
not share it. Clearing browser site data removes it. Export JSON for a separate
backup; local browser storage is not a durable backup service.

The Web adapter uses IndexedDB database `sheetcraft-workbook`, object store
`workbooks`, and key `current`. The envelope contains a storage revision, save
timestamp, and Core snapshot. Core remains independent of browser APIs.

| Stored document state                                         | Session-only state                                 |
| ------------------------------------------------------------- | -------------------------------------------------- |
| Cell values, formulas and images, styles, borders, dimensions | Selection, scrolling, editor drafts                |
| Sheet identities, names, order, active Sheet, tab properties  | Undo/redo history, clipboard, format painter       |
| Freeze settings, filters, merged ranges, floating images      | Search, floating panels, focus, transient feedback |
| Workbook date system, explicit errors and empty text          | Formula runtime/dependency caches                  |
| Structured tables, table filters, custom/default table styles | Table/style editor drafts                          |
| Custom/default PivotTable styles                              | PivotTable style editor drafts                     |

Formula results and derived visibility are rebuilt on load. Both the Grid and
formula bar are remounted on document replacement, even when Sheet IDs match.

V7 snapshots persist each sheet's tab color, pinned, hidden, and protected state.
Older snapshots default to visible, unpinned, unprotected sheets without a tab
color. The footer groups pinned sheets first; hidden sheets can be restored from
All sheets. At least one sheet must remain visible. These property changes use
Core commands and participate in undo/redo and autosave. Creating a copy retains
cell/image contents and tab color, with protection, pinning, and hiding reset.

Protection prevents content, formatting, structure, filter, freeze, and image
edits through Core commands. Selection, navigation, copying, image preview,
sheet management, and undo/redo remain available. It is a local editing guard;
it does not implement accounts, passwords, or access control.

V13 snapshots also persist each sheet's paper, margins, print scale, print range,
manual page breaks, and header/footer text. Earlier snapshots receive the default
page setup. V14 adds first/odd/even header/footer variants and behavior options;
V13 snapshots migrate with default options. V14 also stores custom paper size,
fit page counts, first-page number, quality, centering and printing options, and
repeated-title ranges. Existing V14 snapshots receive defaults for missing fields.
View mode, rulers, white-space
visibility, and margin-handle visibility remain session state. See
[Worksheet page views](features/page-views.md).

## Save And Restore

Startup validates the saved snapshot before replacing the initial workbook.
Editing controls are temporarily inert while loading or replacing a document.
Late reads cannot overwrite a newer local edit, and queued writes are serialized
so an older snapshot cannot finish after a newer one.

Document changes, including undo/redo and active-Sheet navigation, schedule a
save after 300 ms of inactivity. Selection and scroll changes do not save.
The File menu's Save action and Ctrl/Cmd+S first commit a pending Grid or formula
bar draft without moving the selection. IME composition must finish first.

The application also attempts to flush and save on page hiding and leaving,
and requests the browser's standard unload warning when unsaved content or a
draft remains. Browsers can skip unload events or terminate an IndexedDB write;
only the displayed "Saved locally" state confirms that a transaction finished.

## Files And Failures

Export downloads `sheetcraft-workbook.json`: an image-free V16 snapshot, or a versioned
portable envelope containing that snapshot and every referenced image as base64.
Image blobs are stored separately in the `sheetcraft-image-assets` IndexedDB database.
Blobs are saved before document references and retained through undoable deletion.
Import accepts image-free V1–V16 snapshots and portable image envelopes. It
validates and decodes all images, derives asset metadata from the bytes, and
remaps their IDs before storing them. It then asks for
confirmation. Invalid or unsupported files never replace the open workbook.
Canceling a valid import leaves both the document and saved copy unchanged.

V16 writes tables, workbook style libraries, hyperlinks, and per-sheet page
setup together. Earlier V13–V15 snapshots can come from either feature branch;
missing fields restore to their canonical defaults.

V1/V2 documents default to the 1900 date system on read. V3–V16 require an explicit
`dateSystem` (`1900` or `1904`) and preserve error content separately from
error-looking text and explicit empty strings. Formula source remains raw text;
computed values are not saved. Older builds cannot open newer snapshot versions, so keep original backups when upgrading. See
[Formula Foundation](formula-foundation.md) for the model and migration contract.

Confirmed import explicitly replaces both the current document and the local
record, including another tab's saved changes, and starts empty undo/redo history.
The confirmation says so and recommends exporting a backup first. This is the
only path that can overwrite a corrupt storage envelope. If writing fails, the
imported document stays open, unsaved and exportable, with an error notice.

Ordinary saves use a revision comparison inside one IndexedDB read/write
transaction. If another tab has saved first, automatic saving pauses rather
than overwriting that newer record. Export current edits before confirming
Reload local copy, or explicitly import a chosen backup to replace it. Reload
never silently discards edits and reports missing or invalid saved data.

Unavailable storage, corrupt records, unsupported snapshots, and quota failures
produce actionable notices. The application does not delete corrupt records,
loop on failed writes, or claim unsaved changes are safe. Manual Save can retry
transient storage/quota errors; corrupt records need a valid confirmed import.

## Verification

Focused unit tests cover save ordering, revision conflicts, late reads, lifecycle
disposal, confirmed replacement, invalid imports, pending edits, and IME. App
integration tests cover editor flush and same-ID document replacement. Real
browser verification is required for IndexedDB transactions, reload, download,
and multi-tab behavior; DOM test environments do not emulate that storage.
