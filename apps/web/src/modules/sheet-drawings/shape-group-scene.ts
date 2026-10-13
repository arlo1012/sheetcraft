import type { PictureRotation3d } from "@sheetcraft/core/picture-detailed-style";
import type { ShapeGroupPath } from "@sheetcraft/core/shape-group";
import type { ResolvedShapeFrame } from "@sheetcraft/core/shape-frame";
import type { PictureProjectiveScene } from "../../shared/images/picture-projective-geometry";

/** Paint-only common camera. Genuine editable leaf styles and frames remain their own sources. */
export type ShapeGroupSceneProjection = Readonly<{
  ownerPath: ShapeGroupPath;
  rotation3d: PictureRotation3d;
  /** Unflipped complete leaf-local to camera-owner-local placement, in logical pixels. */
  scene: PictureProjectiveScene;
}>;

/** Both frames already contain the complete canonical 2D owner chain. Their quotient
 * does not apply nonuniform group scaling twice, or turn the leaf's own angle into a camera. */
export function createShapeGroupSceneProjection(
  ownerPath: ShapeGroupPath,
  owner: ResolvedShapeFrame,
  leaf: ResolvedShapeFrame,
  rotation3d: PictureRotation3d,
): ShapeGroupSceneProjection {
  if (owner.collapsed || leaf.collapsed)
    throw new RangeError("A collapsed shape camera has no paint placement.");
  const angle = ((leaf.angleDeg - owner.angleDeg) * Math.PI) / 180;
  const a = Math.cos(angle),
    b = Math.sin(angle),
    c = -b,
    d = a;
  const inverse = (-owner.angleDeg * Math.PI) / 180;
  const dx = leaf.rect.x + leaf.rect.width / 2 - owner.rect.x - owner.rect.width / 2;
  const dy = leaf.rect.y + leaf.rect.height / 2 - owner.rect.y - owner.rect.height / 2;
  const x = Math.cos(inverse) * dx - Math.sin(inverse) * dy + owner.rect.width / 2;
  const y = Math.sin(inverse) * dx + Math.cos(inverse) * dy + owner.rect.height / 2;
  const sourceToScene = Object.freeze({
    a,
    b,
    c,
    d,
    e: x - (a * leaf.rect.width + c * leaf.rect.height) / 2,
    f: y - (b * leaf.rect.width + d * leaf.rect.height) / 2,
  });
  if (
    ![owner.rect.width, owner.rect.height, ...Object.values(sourceToScene)].every(Number.isFinite)
  )
    throw new RangeError("A shape camera requires finite canonical placement.");
  return Object.freeze({
    ownerPath: Object.freeze([...ownerPath]),
    rotation3d: Object.freeze({ ...rotation3d }),
    scene: Object.freeze({
      widthPx: owner.rect.width,
      heightPx: owner.rect.height,
      sourceToScene,
    }),
  });
}
