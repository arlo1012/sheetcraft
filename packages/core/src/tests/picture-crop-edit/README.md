# Canonical crop/source field contract

The pure `picture-crop-edit` API takes an actual source-bearing resolved layout and
source frame. It returns geometry only; it has no asset, worksheet command,
metadata, appearance, aspect-lock, or flip ownership.

All eight field values use pixels. Crop left/top are the absolute worksheet
coordinates of the unrotated layout rectangle. Source offsets describe its
center relative to the crop's local center, in visual axes. Source dimension
edits stretch one axis around that center independently; signed padding is valid.
Source dimensions must be positive, and source dimensions/offsets must produce
finite, representable geometry. They do not inherit the crop-frame size budget.
Crop dimension edits and Crop Reset create frames between 1 and 10000 pixels per
axis; inputs and invalid edits are never implicitly clamped.

Observed Linux WPS Sheets 12.1.2.29182 independently changes all eight fields at
zero rotation. Its Crop Reset expands to current source dimensions, zeros offsets
and uses the unrotated source rectangle for its new layout position, retaining
scale, rotation and appearance. It does not promise
unchanged physical source placement after the reset.

At nonzero rotation, the deliberate Core contract preserves the physical source
center, orientation, dimensions, and world corners during crop-frame edits.
Width/height edits retain the rotated local NW corner, matching the existing
`resizePictureCropFrame` helper. Left/top edits translate the unrotated rectangle
in worksheet axes and inverse-rotate the center compensation. General nonzero-
rotation eight-field behavior is not fully WPS-proven; the reference only records
a bounded 15-degree size-coupling observation. Crop Reset uses the source rectangle in unrotated layout axes; it does not rotate
the offset vector, as observed at 37 degrees. This differs intentionally from
the source-preserving ordinary field edits and retains 2D rotation.

Scenario coverage includes all eight zero-angle fields, arbitrary 37-degree and
quarter rotations, visual offsets with both asset flip mappings, all source world
corners, uncovered padding, repeated/unchanged edits, pure results, reset scope,
large valid source sizes/offsets, collapsed/underflow/overflow/invalid records, and
world-space representability. Asset flips remain caller-owned and are not inputs
to this API.
