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

The normalized generated output is deterministic. It preserves formulas, ordered paths and adjustment handles;
connection points and text rectangles are omitted because they are not picture masks.
The evaluator is separately implemented by Sheetcraft, without dynamic code evaluation.

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

Runtime geometry is bounded to 512 guides, 16 paths/handles and 1024 commands per preset.
The guide evaluator accepts only the standard operators and declared values. A zero
denominator in an inactive guide evaluates to zero; no dynamic JavaScript is executed.
At extreme aspect ratios a preset can have an empty adjustment interval. Its geometry
still renders, but that handle is explicitly disabled instead of guessing a reversed range.
Hit testing preserves nonzero-winding holes and unions each filled path. Filled bounds
include true curve extrema and callout tails beyond the original layout rectangle.
