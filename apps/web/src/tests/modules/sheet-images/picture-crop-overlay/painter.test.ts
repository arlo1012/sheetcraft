import { afterEach, describe, expect, test, vi } from "vitest";
import type { GroupedPicture } from "@sheetcraft/core/picture-group";
import {
  paintPictureCropSourceGhost,
  preparePictureCropPreview,
} from "../../../../modules/sheet-images/picture-crop-preview";
import * as imageAppearance from "../../../../shared/images/imageAppearance";
import { canvasContext, fixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

describe("excluded full-source ghost painter", () => {
  test.each(["arc", "donut", "wedgeRectCallout"] as const)(
    "%s erases the real nonzero mask from its mapped full-source ghost without a rectangular crop",
    (preset) => {
      const f = fixture();
      f.picture.frame.cropShape = { preset };
      const before = structuredClone(f.picture);
      const preview = preparePictureCropPreview(f.picture, f.resolved());
      const context = canvasContext();
      const fills: unknown[] = [];
      context.fill.mockImplementation((...args: unknown[]) => {
        fills.push({
          args,
          alpha: context.globalAlpha,
          operation: context.globalCompositeOperation,
        });
      });
      paintPictureCropSourceGhost(
        context as unknown as CanvasRenderingContext2D,
        { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement,
        preview,
        f.layout,
      );
      expect(preview.ghostPicture.frame.cropShape).toBeUndefined();
      expect(context.drawImage).toHaveBeenCalledOnce();
      expect(context.drawImage.mock.calls[0]?.slice(-2)).toEqual([
        preview.ghostGeometry.rect.width,
        preview.ghostGeometry.rect.height,
      ]);
      expect(context.clip).not.toHaveBeenCalledWith("evenodd");
      expect(fills.length).toBeGreaterThan(0);
      for (const fill of fills)
        expect(fill).toEqual({ args: ["nonzero"], alpha: 1, operation: "destination-out" });
      expect(context.globalCompositeOperation).toBe("source-over");
      expect(context.globalAlpha).toBe(1);
      expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length);
      expect(f.picture).toEqual(before);
    },
  );
  test.each([false, true].flatMap((flipX) => [false, true].map((flipY) => ({ flipX, flipY }))))(
    "uses full actual pixels with both flips $flipX/$flipY and preserves appearance and annotations",
    ({ flipX, flipY }) => {
      const f = fixture();
      f.picture.frame.flipHorizontal = flipX;
      f.picture.frame.flipVertical = flipY;
      f.picture.transform = {
        appearance: {
          brightness: 0.8,
          opacity: 0.5,
          transparentColor: "#FFFFFF",
          shadow: "soft",
          border: { color: "#123456", width: 4 },
        },
        annotations: [
          {
            kind: "text",
            points: [{ x: 0.5, y: 0.5 }],
            color: "#FF0000",
            width: 0.01,
            text: "Mark",
            fontSize: 0.05,
          },
        ],
      };
      const preview = preparePictureCropPreview(f.picture, f.resolved());
      const context = canvasContext();
      const decoded = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
      const transparent = document.createElement("canvas");
      transparent.width = 400;
      transparent.height = 200;
      const preparation = vi
        .spyOn(imageAppearance, "imageAppearanceSource")
        .mockReturnValue(transparent);
      const draws: unknown[] = [];
      context.drawImage.mockImplementation(() => {
        draws.push({ alpha: context.globalAlpha, filter: context.filter });
      });
      const before = structuredClone(f.picture);
      paintPictureCropSourceGhost(
        context as unknown as CanvasRenderingContext2D,
        decoded,
        preview,
        f.layout,
      );
      expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
        transparent,
        0,
        0,
        400,
        200,
        0,
        0,
        320,
        250,
      );
      expect(preparation).toHaveBeenCalledWith(
        decoded,
        expect.objectContaining({ transparentColor: "#FFFFFF" }),
      );
      expect(draws).toEqual([{ alpha: 0.175, filter: "brightness(0.8)" }]);
      expect(context.scale).toHaveBeenCalledWith(flipX ? -1 : 1, flipY ? -1 : 1);
      expect(context.fillText).toHaveBeenCalledWith("Mark", 200, 100);
      expect(context.clip).toHaveBeenCalledWith("evenodd");
      expect(context.moveTo).toHaveBeenCalledWith(
        preview.geometry.corners[0].x,
        preview.geometry.corners[0].y,
      );
      expect(context.closePath).toHaveBeenCalledOnce();
      expect(context.strokeRect).not.toHaveBeenCalled();
      expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length);
      expect(f.picture).toEqual(before);
    },
  );

  test("genuine owned leaf uses the identical full-source kernel without a fabricated anchor", () => {
    const f = fixture();
    const member: GroupedPicture = {
      kind: "grouped-picture-v1",
      id: "owned-source",
      assetId: "genuine-asset",
      altText: "Owned",
      frame: {
        kind: "group-member-frame-v1",
        angleDeg: 12,
        rect: { xRatio: 0.2, yRatio: 0.1, widthRatio: 0.7, heightRatio: 0.9 },
        source: { ...f.picture.frame.source },
      },
    };
    const context = canvasContext();
    const decoded = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
    paintPictureCropSourceGhost(
      context as unknown as CanvasRenderingContext2D,
      decoded,
      preparePictureCropPreview(member, f.resolved()),
      f.layout,
    );
    expect(context.drawImage).toHaveBeenCalledExactlyOnceWith(
      decoded,
      0,
      0,
      400,
      200,
      0,
      0,
      320,
      250,
    );
    expect(context.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length);
    expect(member.frame).not.toHaveProperty("anchor");
  });

  test("clips full source to all four frozen panes independently", () => {
    const f = fixture(true, { x: 13, y: 7 });
    f.picture.frame.anchor = { mode: "fixed", x: 40, y: 32, size: { width: 100, height: 50 } };
    const preview = preparePictureCropPreview(f.picture, f.resolved());
    const context = canvasContext();
    paintPictureCropSourceGhost(
      context as unknown as CanvasRenderingContext2D,
      { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement,
      preview,
      f.layout,
    );
    expect(context.drawImage).toHaveBeenCalledTimes(4);
    expect(context.clip.mock.calls.filter((call) => call[0] === "evenodd")).toHaveLength(4);
    for (const pane of Object.values(f.layout.panes))
      expect(context.rect).toHaveBeenCalledWith(
        pane.clip.x,
        pane.clip.y,
        pane.clip.width,
        pane.clip.height,
      );
    expect(context.globalAlpha).toBe(1);
  });

  test("source larger than the viewport is drawn without any source-sized canvas allocation", () => {
    const f = fixture();
    f.picture.frame.source.widthRatio = 100_000;
    f.picture.frame.source.heightRatio = 100_000;
    const preview = preparePictureCropPreview(f.picture, f.resolved());
    const context = canvasContext();
    const create = vi.spyOn(document, "createElement");
    paintPictureCropSourceGhost(
      context as unknown as CanvasRenderingContext2D,
      { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement,
      preview,
      f.layout,
    );
    expect(context.drawImage).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  test("hidden leaves do no drawing or image-source preparation", () => {
    const f = fixture();
    f.picture.hidden = true;
    const preparation = vi.spyOn(imageAppearance, "imageAppearanceSource");
    const context = canvasContext();
    paintPictureCropSourceGhost(
      context as unknown as CanvasRenderingContext2D,
      { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement,
      preparePictureCropPreview(f.picture, f.resolved()),
      f.layout,
    );
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.save).not.toHaveBeenCalled();
    expect(preparation).not.toHaveBeenCalled();
  });
});
