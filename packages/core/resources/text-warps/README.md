# Standard DrawingML text-warp resource

The unchanged XML comes directly from the official ECMA-376 Part 1 fifth-edition
archive (December 2016), nested member
`OfficeOpenXML-DrawingMLGeometries.zip/presetTextWarpDefinitions.xml`.
`provenance.json` records the official source URL, archive/member hashes and byte count.
The full applicable Ecma software-policy Exhibit A notice, patent/third-party-rights
caveat, XML scope statement and default text copyright notice/license are retained in
`ECMA-NOTICES.txt`. Preserve those full notices in documentation/materials accompanying
binary distribution of the generated data. No software copyright author/year has been
invented to fill the official template's blank placeholders. Edition 2016 is source
metadata. This provenance record is not patent, third-party-font or other rights clearance.
The earlier 187 body-shape Apache POI resources and their LICENSE/NOTICE are unaffected.
The deterministic generator embeds the full notice in `/*!` legal comments in both
generated TypeScript modules. The package also includes this raw resource folder.
Check notice retention in emitted JavaScript and bundled distribution during release
verification; do not assume a downstream packager preserves comments automatically.

The resource contains 40 active text-warps and 88 directed open boundaries. These IDs
are separate from ordinary shape presets. Standard `textNoShape` is canonical field
absence; `textPlain` remains an active two-boundary transform at its default value.
The explicit Follow Path identities are `textArchDown`, `textArchUp`, `textCircle` and
`textButton`. Their source-order tracks are retained. All other identities use
source-order top/bottom boundary pairs. `textDeflateInflate` has two bands;
`textButtonPour` and `textDeflateInflateDeflate` have three. No source boundary becomes
a filled body mask, connection site or ordinary shape hit region.

Run the deterministic compiler and then the existing formatter:

```sh
python3 scripts/resources/generate_text_warps.py
oxfmt packages/core/src/text-warps/catalog.ts packages/core/src/text-warps/definitions.ts
```

The compiler hash-checks the unchanged source, validates sequential declared guide
references, fixed formula arities, open path commands, handle fields and catalog caps.
Four adjustment defaults use `val cd2`; `compiled-default-resolutions.json` explicitly
records their fixed standard-angle resolution to 10,800,000. `textButtonPour` reassigns
derived guide `v1` later in source order; this is retained unchanged, with sequential
evaluation rather than a guessed guide rename or formula correction. No XML or generic
formula definition is admitted at runtime. Core reuses the existing fixed DrawingML
formula evaluator without changing the 187-body evaluator or its limits.

The new `@sheetcraft/core/text-warps` facade exposes the sparse own-data contract,
catalog, evaluated curves, actual derived guides and handles, and explicit tracks/bands.
Coordinates are local to the actual unreflected text rectangle supplied by the caller.
Runtime geometry is bounded to positive 16,384-pixel extents, 128 adjustment/derived
guides, six paths, sixteen total source commands, two adjustments and two handles.
Arithmetic uses the existing finite 1e18 budget, coordinates use an absolute 10,000,000
budget, and elliptical sweeps use the existing two-turn limit. Negative arc direction,
almost-full-turn open seams and degenerate line conversion are preserved.

This pure catalog/math slice does not persist a new ShapeText field, render a gallery,
assign source text lines to tracks/bands, or claim rigid-glyph/native WPS parity.
