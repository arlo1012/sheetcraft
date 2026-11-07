import { readonly, shallowRef, watch } from "vue";
import { isFramedPictureObject } from "@sheetcraft/core/picture-object";
import { isGroupedPicture } from "@sheetcraft/core/picture-group";
import { resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import type { ImageAppearance, Sheet } from "@sheetcraft/core/workbook";
import type { Point } from "@sheetcraft/sheet-engine/geometry";
import type { PictureFrameLayoutContext } from "@sheetcraft/sheet-engine/picture-frame-layout";
import type { SheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import type { DrawingThemeEffects } from "./drawing-theme-effects";
import type { PicturePaintResources } from "../../shared/images/picture-detailed-render";
import { getPictureDetailedWorldBounds } from "../../shared/images/picture-detailed-bounds";
import { getPictureViewportFragments } from "./picture-viewport-fragments";
import { getPictureSourceColorPoint, readPictureSourceColor } from "./picture-color-sampling";

export function usePictureTransparentColor(options: {
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getPath: () => readonly string[] | undefined;
  isReadOnly: () => boolean;
  getLayout: () => SheetViewportLayout;
  getFrameContext: () => PictureFrameLayoutContext | undefined;
  getEffects: () => DrawingThemeEffects | undefined;
  getResources: () => PicturePaintResources;
  getImage: (assetId: string) => HTMLImageElement | undefined;
  onError: () => void;
}) {
  const session = shallowRef<{
    path: readonly string[];
    commit: (patch: Partial<ImageAppearance>) => boolean;
  }>();
  function cancel() {
    session.value = undefined;
  }
  watch(
    [
      options.getSheet,
      options.getGeneration,
      options.getRevision,
      () => JSON.stringify(options.getPath()),
      options.isReadOnly,
    ],
    cancel,
    { flush: "sync" },
  );
  function start(commit: (patch: Partial<ImageAppearance>) => boolean): boolean {
    const path = options.getPath();
    if (!path?.length || options.isReadOnly()) return false;
    session.value = { path: [...path], commit };
    return true;
  }
  function canStart(): boolean {
    return !!options.getPath()?.length && !options.isReadOnly();
  }
  function pick(point: Point): boolean {
    const pending = session.value;
    if (!pending || options.isReadOnly()) {
      cancel();
      return false;
    }
    try {
      const layout = options.getLayout();
      const fragments = getPictureViewportFragments(
        options.getSheet().floatingImages,
        layout,
        options.getFrameContext(),
        (picture, initialGeometry) => {
          const appearance = picture.transform?.appearance;
          const framed = isGroupedPicture(picture) || isFramedPictureObject(picture);
          const geometry =
            !framed && appearance?.reflection && appearance.detailedStyle?.reflection === undefined
              ? resolvePictureSourceLayout(
                  { ...initialGeometry.rect, height: initialGeometry.rect.height / 1.25 },
                  0,
                  { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
                )
              : initialGeometry;
          return getPictureDetailedWorldBounds(
            geometry,
            appearance,
            options.getEffects(),
            options.getResources(),
            1,
            framed ? picture.frame.cropShape : undefined,
          );
        },
      );
      for (let index = fragments.length - 1; index >= 0; index--) {
        const fragment = fragments[index]!;
        const clip = layout.panes[fragment.paneId].clip;
        if (
          point.x < clip.x ||
          point.y < clip.y ||
          point.x >= clip.x + clip.width ||
          point.y >= clip.y + clip.height
        )
          continue;
        const source = getPictureSourceColorPoint(fragment, point);
        if (!source) continue;
        const path = fragment.kind === "group-leaf" ? fragment.path : [fragment.image.id];
        if (JSON.stringify(path) !== JSON.stringify(pending.path)) {
          cancel();
          return false;
        }
        const image = options.getImage(fragment.image.assetId);
        if (!image) {
          options.onError();
          return false;
        }
        const color = readPictureSourceColor(image, source);
        if (!color) return false;
        cancel();
        if (!pending.commit({ transparentColor: color })) {
          options.onError();
          return false;
        }
        return true;
      }
      cancel();
      return false;
    } catch {
      cancel();
      options.onError();
      return false;
    }
  }
  return { session: readonly(session), canStart, start, pick, cancel };
}
