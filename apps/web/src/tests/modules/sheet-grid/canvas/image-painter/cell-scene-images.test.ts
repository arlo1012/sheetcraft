import { describe, expect, test, vi } from "vitest";
import type { CellImage } from "@sheetcraft/core/cell-picture-frame";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { paintSheetScene } from "../../../../../modules/sheet-grid/canvas/scene-painter";
import type {
  CanvasCell,
  SheetCanvasScene,
} from "../../../../../modules/sheet-grid/canvas/cell-scene";
import { framedCellPicture } from "../../../sheet-images/cell-picture-fixture";

function fixture() {
  const framed = framedCellPicture();
  const legacy: CellImage = { assetId: "legacy", altText: "Legacy", transform: { rotation: 90 } };
  const geometry = createSheetGeometry({ rowCount: 2, columnCount: 2 });
  const rows = createRowVisibilityIndex({ rowCount: 2, defaultRowHeight: 100 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 300, height: 100 },
    bodyScrollPosition: { x: 0, y: 0 },
  });
  const cell = (image: CellImage, column: number): CanvasCell => ({
    address: { row: 0, column },
    hasNote: false,
    style: undefined,
    rect: { x: column * 145, y: 0, width: 145, height: 100 },
    contentRect: { x: column * 145, y: 0, width: 145, height: 100 },
    content: { image, text: "", style: undefined },
  });
  const scene: SheetCanvasScene = {
    panes: [{ id: "body", cells: [cell(legacy, 0), cell(framed, 1)] }],
  };
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    fillText: vi.fn(),
    getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
    globalAlpha: 1,
  };
  const decoded = { naturalWidth: 400, naturalHeight: 200 } as HTMLImageElement;
  const images = {
    get: vi.fn(() => decoded),
    peek: vi.fn(() => undefined),
    retain: vi.fn(),
    load: vi.fn(),
    dispose: vi.fn(),
  };
  const options = {
    palette: { background: "#fff", text: "#111", gridLine: "#ddd", mutedText: "#888" },
    showGridLines: false,
    skipBackground: true,
    images,
    imageUrls: new Map([
      [legacy.assetId, "blob:legacy"],
      [framed.assetId, "blob:framed"],
    ]),
    imagePlaceholder: (id: string) => `Unavailable: ${id}`,
  };
  return { framed, legacy, scene, context, layout, options, images, decoded };
}

describe("mixed cell picture scenes", () => {
  test.each(["worksheet", "print", "camera"] as const)(
    "%s scene shares real framed source and retains the legacy path",
    (surface) => {
      const f = fixture();
      const visible = vi.fn(() => true);
      paintSheetScene(f.context as unknown as CanvasRenderingContext2D, f.scene, f.layout, {
        ...f.options,
        ...(surface === "print" ? { isImageVisible: visible } : {}),
      });
      expect(f.context.drawImage).toHaveBeenCalledTimes(2);
      expect(f.context.rotate).toHaveBeenCalledWith(Math.PI / 2);
      expect(f.context.rotate).toHaveBeenCalledWith((37 * Math.PI) / 180);
      expect(f.context.drawImage).toHaveBeenCalledWith(f.decoded, 0, 0, 400, 200, 0, 0, 100, 50);
      expect(f.context.fillText).toHaveBeenCalledWith("Mark", 200, 100);
      expect(f.images.retain).toHaveBeenCalledWith(new Set(["blob:legacy", "blob:framed"]));
      if (surface === "print")
        expect(visible).toHaveBeenCalledWith(f.framed, { row: 0, column: 1 });
    },
  );

  test("missing framed paint leaves a placeholder while the neighboring legacy image still paints", () => {
    const f = fixture();
    f.framed.frame.cropShape = { preset: "ellipse" };
    f.framed.transform!.appearance!.detailedStyle = {
      fill: {
        kind: "value",
        value: {
          kind: "picture",
          assetId: "missing",
          opacity: 1,
          rotateWithShape: true,
          layout: {
            kind: "stretch",
            widthRatio: 1,
            heightRatio: 1,
            offsetXRatio: 0,
            offsetYRatio: 0,
          },
        },
      },
    };
    paintSheetScene(f.context as unknown as CanvasRenderingContext2D, f.scene, f.layout, f.options);
    expect(f.context.drawImage).toHaveBeenCalledOnce();
    expect(f.context.fillText).toHaveBeenCalledExactlyOnceWith("Unavailable: cell-source", 149, 50);
    expect(f.context.rotate).not.toHaveBeenCalledWith((37 * Math.PI) / 180);
    expect(f.context.save.mock.calls.length).toBe(f.context.restore.mock.calls.length);
  });
});
