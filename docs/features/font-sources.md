# Shared font sources

The general font controls and Symbol dialog share one font catalog and one local
font metadata scan. The existing UI-style-v3 font settings, labels, search,
previews and other interface changes are retained.

## Names, resources and coverage

- The 72 general font presets identify families; they do not promise that every
  device has those font files. Four bundled OFL Noto families are also listed.
- Explicit local-font access reads names and retains face handles, without reading
  every font file. Concurrent requests share one scan; successful empty results
  are cached. Font Settings provides an explicit refresh. Failed refreshes retain
  the last successful choices and handles.
- Symbol reads only a selected local face or an explicitly chosen font file. Its
  name/cmap validation, content hash and actual FontFace loading remain required
  before verified coverage is offered.
- A verified local face appears in ordinary font menus with a readable family name
  and short identity suffix. Its saved value remains the complete
  `SheetcraftLocal_<sha256>` alias. Two different files with the same family name
  remain independently selectable.
- Chinese and English family aliases participate in search without rewriting
  existing saved family values. A name match does not establish glyph coverage.

Only resources actually used by a cell, editor, theme preview or watermark are
prepared. Listing presets does not load all bundled fonts, enumerate system fonts,
or restore every saved font. Resource readiness continues to invalidate text
metrics; the watermark preview redraws after a selected resource loads.

## Device boundaries

Local Font Access requires a supporting secure-context browser and an explicit
user action. Unsupported or denied access leaves bundled fonts and font-file
selection available. Font bytes are not uploaded. Optional device persistence
remains opt-in; saved aliases need the corresponding resource on another device.
Unavailable resources keep their identity and existing error/retry behavior rather
than being silently replaced with a different verified font.
