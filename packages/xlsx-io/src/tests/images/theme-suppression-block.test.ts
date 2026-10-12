import { normalizePictureProperties } from "@sheetcraft/core/picture-properties";
import type { LegacyCellImage } from "@sheetcraft/core/cell-picture-frame";
import { describe, expect, test, vi } from "vitest";
import { createRenameSheetCommand } from "@sheetcraft/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@sheetcraft/core/history";
import {
  createWorkbook,
  getActiveSheet,
  type ImageTransform,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import type { PictureGroup } from "@sheetcraft/core/picture-group";
import { encodeXlsx, XlsxCompatibilityError, type XlsxImageAsset } from "../../index.js";
import {
  assertSupportedXlsxImageAppearance,
  assertSupportedXlsxPicture,
  createXlsxImageExporter,
} from "../../image-export.js";

function cellPicture(image: LegacyFloatingImage): LegacyCellImage {
  return {
    assetId: image.assetId,
    altText: image.altText,
    ...normalizePictureProperties(image),
    ...(image.transform ? { transform: image.transform } : {}),
  };
}

function picture(transform?: ImageTransform): LegacyFloatingImage {
  return {
    id: "picture",
    assetId: "source",
    altText: "Synthetic",
    anchor: { row: 3, column: 2 },
    offsetX: 3,
    offsetY: 4,
    width: 120,
    height: 80,
    ...(transform ? { transform } : {}),
  };
}

function blockAt(location: string) {
  return {
    name: "XlsxCompatibilityError",
    report: {
      issues: [{ code: "feature-omitted", severity: "block", count: 1, locations: [location] }],
    },
  };
}

describe("picture theme-suppression native admission", () => {
  test.each(["floating", "hidden-floating", "cell"] as const)(
    "%s blocks before resource preparation and preserves workbook, history, and resources",
    async (kind) => {
      const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Initial" });
      const session = createWorkbookSession({ workbook, idFactory: () => "id" });
      executeWorkbookCommand(session, createRenameSheetCommand("s", "Synthetic"));
      const sheet = getActiveSheet(workbook);
      const image = picture({ appearance: { suppressThemeEffects: { shadow: true } } });
      if (kind === "cell")
        sheet.cells.set("3:2", { content: { kind: "image", image: cellPicture(image) } });
      else sheet.floatingImages.push({ ...image, hidden: kind === "hidden-floating" });
      const before = structuredClone({ workbook, history: session.history });
      const resources: XlsxImageAsset[] = [
        {
          assetId: "source",
          bytes: new Uint8Array([137, 80, 78, 71]),
          extension: "png",
          width: 120,
          height: 80,
        },
      ];
      const resourcesBefore = structuredClone(resources);
      const resourceProvider = vi.fn(() => resources);
      const location = kind === "cell" ? "Synthetic!C4" : 'Synthetic.floatingImages["picture"]';

      await expect(
        encodeXlsx(workbook, {
          get images() {
            return resourceProvider();
          },
        }),
      ).rejects.toMatchObject(blockAt(`${location}.transform.appearance.suppressThemeEffects`));

      expect(resourceProvider).not.toHaveBeenCalled();
      expect({ workbook, history: session.history }).toEqual(before);
      expect(resources).toEqual(resourcesBefore);
    },
  );

  test.each([undefined, null, false, {}, { futureEffect: true }, { shadow: false }, "shadow"])(
    "an own suppression field blocks even when its value is malformed: %j",
    async (value) => {
      const transform = {
        appearance: { suppressThemeEffects: value },
      } as unknown as ImageTransform;
      const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" });
      const sheet = getActiveSheet(workbook);
      const resourceProvider = vi.fn(() => []);
      const options = {
        get images() {
          return resourceProvider();
        },
      };
      sheet.floatingImages.push(picture(transform));
      await expect(encodeXlsx(workbook, options)).rejects.toMatchObject(
        blockAt('Synthetic.floatingImages["picture"].transform.appearance.suppressThemeEffects'),
      );
      sheet.floatingImages = [];
      sheet.cells.set("3:2", {
        content: { kind: "image", image: cellPicture(picture(transform)) },
      });
      await expect(encodeXlsx(workbook, options)).rejects.toMatchObject(
        blockAt("Synthetic!C4.transform.appearance.suppressThemeEffects"),
      );
      expect(resourceProvider).not.toHaveBeenCalled();
    },
  );

  test("the direct exporter blocks cell and floating images before registration or drawing mutation", () => {
    const target = { addImage: vi.fn(() => 1) };
    const output = { addImage: vi.fn() };
    const exporter = createXlsxImageExporter(target, undefined);
    const sheet = getActiveSheet(createWorkbook({ id: "w", sheetId: "s" }));
    const image = picture({ appearance: { suppressThemeEffects: { outline: true } } });
    expect(() => exporter.registerCellImage(cellPicture(image), "Synthetic!C4")).toThrow(
      XlsxCompatibilityError,
    );
    expect(() => exporter.addFloatingImage(output, sheet, image, "Synthetic!C4")).toThrow(
      XlsxCompatibilityError,
    );
    expect(target.addImage).not.toHaveBeenCalled();
    expect(output.addImage).not.toHaveBeenCalled();
  });

  test("the guard checks field presence without evaluating its value", () => {
    const readValue = vi.fn(() => {
      throw new Error("Must not read suppression value.");
    });
    const appearance = Object.defineProperty({}, "suppressThemeEffects", { get: readValue });
    expect(() =>
      assertSupportedXlsxImageAppearance({ transform: { appearance } }, "Synthetic!C4"),
    ).toThrow(XlsxCompatibilityError);
    expect(readValue).not.toHaveBeenCalled();
  });

  test("a group with suppression on its leaf keeps the existing frame/group block", () => {
    const group: PictureGroup = {
      kind: "picture-group-v1",
      id: "group",
      altText: "Synthetic group",
      frame: {
        kind: "group-frame-v1",
        anchor: { mode: "fixed", x: 0, y: 0, size: { width: 120, height: 80 } },
        angleDeg: 0,
      },
      members: [
        {
          kind: "grouped-picture-v1",
          id: "leaf",
          assetId: "source",
          altText: "Synthetic leaf",
          transform: { appearance: { suppressThemeEffects: { reflection: true } } },
          frame: {
            kind: "group-member-frame-v1",
            rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
            angleDeg: 0,
            source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
          },
        },
      ],
    };
    let error: unknown;
    try {
      assertSupportedXlsxPicture(group, 'Synthetic.floatingImages["group"]');
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject(blockAt('Synthetic.floatingImages["group"].frame'));
  });

  test.each([
    undefined,
    { appearance: { brightness: 1.2, shadow: "soft", reflection: true } } as ImageTransform,
  ])(
    "old pictures without suppression keep their cell media and floating anchor path: %j",
    (transform) => {
      const image = picture(transform);
      const bytes = new Uint8Array([137, 80, 78, 71]);
      const target = { addImage: vi.fn(() => 0) };
      const output = { addImage: vi.fn() };
      const sheet = getActiveSheet(createWorkbook({ id: "w", sheetId: "s" }));
      const exporter = createXlsxImageExporter(target, {
        images: [{ assetId: "source", transform, bytes, extension: "png", width: 120, height: 80 }],
      });
      expect(exporter.registerCellImage(cellPicture(image), "Synthetic!C4")).toEqual({
        mediaFilename: "xl/media/image1.png",
        altText: "Synthetic",
      });
      exporter.addFloatingImage(output, sheet, image, "Synthetic!C4");
      expect(target.addImage).toHaveBeenCalledExactlyOnceWith({ buffer: bytes, extension: "png" });
      expect(output.addImage).toHaveBeenCalledExactlyOnceWith(0, {
        tl: { nativeCol: 2, nativeColOff: 28575, nativeRow: 3, nativeRowOff: 38100 },
        ext: { width: 120, height: 80 },
        altText: "Synthetic",
        issueLocation: 'Synthetic!C4.floatingImages["picture"].altText',
      });
    },
  );
});
