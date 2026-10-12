# DrawingML preset geometry source

The unmodified preset definitions are from Apache POI's official source:

https://github.com/apache/poi/blob/338882ac8898df5c13a7d15f533204c5dd8607d6/poi/src/main/resources/org/apache/poi/sl/draw/geom/presetShapeDefinitions.xml

SHA-256: `4a762444d8d85876881c02a5b1dedf6f73006fcd8acb7b4e393435615b37c780`.
The upstream Apache License and notices accompany this file. The source is based on
ECMA-376 DrawingML preset definitions. No WPS or Excel icons or screenshots are included.

`python3 scripts/resources/generate_shape_presets.py` produces the runtime catalog and
compact typed geometry data. Then format the two generated TypeScript files with the
workspace’s existing `oxfmt` (no additional dependencies):

```sh
python3 scripts/resources/generate_shape_presets.py
oxfmt packages/core/src/shape-presets/catalog.ts packages/core/src/shape-presets/definitions.ts
```

The normalized generated output is deterministic. It preserves formulas, ordered paths,
adjustment handles, all six typed DrawingML path fill modes, source text-rectangle guide
tokens and ordered `cxnLst` connection sites. The pinned data contains 182 text rectangles
and 860 connection sites across all 187 presets. Source presets without a rectangle keep
`null`; neither the compiler nor evaluator invents text bounds.
The evaluator is separately implemented by Sheetcraft, without dynamic code evaluation.

The public `ShapePresetParameters` type is the neutral `{ preset, adjustments? }` contract;
`PictureCropShape` remains its compatible alias. `evaluateShapePreset` returns complete
`EvaluatedShapePresetGeometry`: each ordered path has `fillMode` (`norm`, `none`,
`lighten`, `lightenLess`, `darken`, or `darkenLess`) alongside the unchanged picture-mask
`filled` flag. The flag remains `fillMode !== "none"`; shading semantics do not change
picture masks. Legacy hand-built `ShapePresetGeometry` and `ShapePresetPath` remain usable
without the added metadata, while evaluated geometry makes the new fields required.

Evaluated `textRect` has `left`, `top`, `right`, `bottom`; `connectionSites` have `position`
(`x`, `y`) and `angle`. Both use the same untransformed local logical coordinates as the
paths and handles. Path-specific `w`/`h` coordinate spaces do not rescale these metadata
guides. Text rectangles retain their actual guide values, including empty or inverted
regions at degenerate extents, without adding margins or substituting the layout box.
Connection angles retain DrawingML units (60,000 units per degree), clockwise from the
local positive x-axis, including signed and full-turn values. They are not the radian
ellipse parameters used by path arc commands. The standard `cd3` built-in is 7,200,000
(120 degrees), required by a `curvedLeftArrow` connection site.

Specification and geometry/formula descriptions:

- https://ecma-international.org/publications-and-standards/standards/ecma-376/
- https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.presetgeometry

The original Ecma Part 1 archive was compared during source selection. Its XML has two
identical `upDownArrow` entries and no `upArrow`. The pinned Apache source has 187 distinct
preset identities and includes `upArrow`; no silent identity repair is done by this generator.

The pinned upstream has eight add/subtract guides in three circular-arrow presets with an
extra fourth operand `0`. The compiler removes only those exact known trailing zeros,
listed in `compiled-corrections.json`, to conform to the standard's three-operand `+-`
formula. The source XML remains unchanged; arbitrary malformed formulas are rejected.

Runtime geometry is bounded to 512 guides, 16 paths/handles, 16 connection sites and
1024 commands per preset. Extents remain positive and at most 10,000 logical pixels;
path, handle, text-rectangle and connection coordinates remain finite within an absolute
10,000,000-coordinate budget. Connection angles use their separate finite signed
2,147,483,647-unit budget, so standard 270-degree and 360-degree directions stay valid.
Unknown fill modes, malformed metadata tuples and undeclared metadata tokens are rejected.
The guide evaluator accepts only the standard operators and declared values. A zero
denominator in an inactive guide evaluates to zero; no dynamic JavaScript is executed.
At extreme aspect ratios a preset can have an empty adjustment interval. Its geometry
still renders, but that handle is explicitly disabled instead of guessing a reversed range.
Hit testing preserves nonzero-winding holes and unions each filled path. Filled bounds
include true curve extrema and callout tails beyond the original layout rectangle.

Focused regressions compare every compiled metadata token with the unchanged source,
evaluate all default and adjusted presets, and retain pre-metadata picture-mask geometry
fingerprints for all 187 identities. The catalog, defaults, correction list and mask
acceptance rules remain unchanged.
