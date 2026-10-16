import { describe, expect, test, vi } from "vitest";
import { unzipSync, strFromU8 } from "fflate/browser";
import { createHash } from "node:crypto";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { encodeXlsx, decodeXlsx } from "../../index.js";
import { isNativePictureThemeSuppression } from "../../picture-capabilities.js";
import { assertSupportedXlsxPicture } from "../../image-export.js";

const flags = () => ({ shadow: true, outline: true, reflection: true, bevel: true }) as const;
const suppression = () => ({ appearance: { suppressThemeEffects: flags() } });
const bytes = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
    "base64",
  ),
);
const asset = { assetId: "source", bytes, extension: "png" as const, width: 32, height: 32 };
function fixture() {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Pictures" });
  const sheet = getActiveSheet(workbook);
  const image: FramedFloatingImage = {
    id: "plain",
    assetId: "source",
    altText: "Plain",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 20, y: 30, size: { width: 120, height: 80 } },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
  };
  sheet.floatingImages.push(image);
  return { workbook, sheet, image };
}
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

describe("native picture theme fidelity", () => {
  test("reports default inherited styling per visible picture without mutating the source", async () => {
    const { workbook, sheet, image } = fixture();
    sheet.floatingImages.push({ ...image, id: "second" });
    sheet.floatingImages.push({
      id: "hidden",
      assetId: "missing",
      altText: "Hidden",
      anchor: { row: 0, column: 0 },
      offsetX: 0,
      offsetY: 0,
      width: 20,
      height: 20,
      hidden: true,
    });
    const before = serializeWorkbook(workbook);
    const encoded = await encodeXlsx(workbook, { images: [asset] });
    expect(encoded.report.issues).toContainEqual({
      code: "style-omitted",
      severity: "warning",
      count: 2,
      locations: [
        'Pictures.floatingImages["plain"].inheritedThemeEffects',
        'Pictures.floatingImages["second"].inheritedThemeEffects',
      ],
    });
    expect(
      encoded.report.issues
        .find((issue) => issue.code === "style-omitted")
        ?.locations.some((location) => location.includes("hidden")),
    ).toBe(false);
    expect(serializeWorkbook(workbook)).toEqual(before);
    const archive = unzipSync(encoded.bytes);
    expect(sha(archive["xl/media/image1.png"]!)).toBe(sha(bytes));
    expect(strFromU8(archive["xl/drawings/drawing1.xml"]!)).not.toMatch(
      /<a:(effectLst|ln)|<xdr:style/,
    );
  });
  test("legacy floating pictures warn for inherited styling, but own-shadow-only and legacy cells do not", async () => {
    const { workbook, sheet } = fixture();
    sheet.floatingImages = [
      {
        id: "legacy",
        assetId: "source",
        altText: "Legacy",
        anchor: { row: 0, column: 0 },
        offsetX: 0,
        offsetY: 0,
        width: 120,
        height: 80,
      },
    ];
    const first = await encodeXlsx(workbook, { images: [asset] });
    expect(first.report.issues).toContainEqual({
      code: "style-omitted",
      severity: "warning",
      count: 1,
      locations: ['Pictures.floatingImages["legacy"].inheritedThemeEffects'],
    });
    const transform = { appearance: { shadow: "hard" as const } };
    workbook.theme.effects = {
      ...workbook.theme.effects!,
      outlineWidth: 0,
      reflection: false,
      bevel: false,
    };
    sheet.floatingImages[0] = {
      ...sheet.floatingImages[0]!,
      transform,
    } as (typeof sheet.floatingImages)[number];
    expect(
      (await encodeXlsx(workbook, { images: [{ ...asset, transform }] })).report.issues,
    ).toEqual([]);
    sheet.floatingImages = [];
    sheet.cells.set("0:0", {
      content: { kind: "image", image: { assetId: "source", altText: "Cell" } },
    });
    expect((await encodeXlsx(workbook, { images: [asset] })).report.issues).toEqual([]);
  });
  test.each(["none", "suppressed"])("exports %s without a theme-style warning", async (kind) => {
    const { workbook, image } = fixture();
    if (kind === "none")
      workbook.theme.effects = {
        ...workbook.theme.effects!,
        shadow: "none",
        outlineWidth: 0,
        reflection: false,
        bevel: false,
        gradient: true,
      };
    else image.transform = suppression();
    expect((await encodeXlsx(workbook, { images: [asset] })).report.issues).toEqual([]);
  });
  test("plain native import suppresses all inherited effects and reexports original bytes", async () => {
    const { workbook } = fixture();
    const decoded = await decodeXlsx((await encodeXlsx(workbook, { images: [asset] })).bytes);
    const image = getActiveSheet(decoded.workbook).floatingImages[0] as FramedFloatingImage;
    expect(image.transform).toEqual(suppression());
    decoded.workbook.theme.effects = {
      ...decoded.workbook.theme.effects!,
      shadow: "hard",
      outlineWidth: 8,
      reflection: true,
      bevel: true,
    };
    const before = serializeWorkbook(decoded.workbook);
    const encoded = await encodeXlsx(decoded.workbook, {
      images: decoded.images!.map((resource) => ({ ...resource, width: 32, height: 32 })),
    });
    expect(encoded.report.issues).toEqual([]);
    expect(sha(unzipSync(encoded.bytes)["xl/media/image1.png"]!)).toBe(sha(bytes));
    expect(serializeWorkbook(decoded.workbook)).toEqual(before);
    const again = await decodeXlsx(encoded.bytes);
    expect(getActiveSheet(again.workbook).floatingImages).toEqual(
      getActiveSheet(decoded.workbook).floatingImages,
    );
  });
  test.each([
    undefined,
    {},
    { appearance: {} },
    { appearance: { suppressThemeEffects: true } },
    { appearance: { suppressThemeEffects: { shadow: true } } },
    { appearance: { suppressThemeEffects: { ...flags(), shadow: false } } },
    { appearance: { suppressThemeEffects: { ...flags(), extra: true } } },
    { appearance: { suppressThemeEffects: flags(), opacity: 1 } },
    { appearance: { suppressThemeEffects: flags(), detailedStyle: {} } },
    { appearance: { suppressThemeEffects: flags() }, rotation: 0 },
    { appearance: { suppressThemeEffects: flags() }, annotations: [] },
    Object.create({ appearance: { suppressThemeEffects: flags() } }),
  ])("admits no extra or partial transform shape: %j", (transform) => {
    expect(isNativePictureThemeSuppression(transform)).toBe(false);
    if (transform === undefined) return;
    const { image } = fixture();
    image.transform = transform as FramedFloatingImage["transform"];
    expect(() => assertSupportedXlsxPicture(image, "picture")).toThrow();
  });
  test("does not execute accessors while checking exact suppression records", () => {
    const getter = vi.fn(() => true);
    const transform = suppression();
    Object.defineProperty(transform.appearance.suppressThemeEffects, "shadow", { get: getter });
    expect(isNativePictureThemeSuppression(transform)).toBe(false);
    const { image } = fixture();
    image.transform = transform;
    expect(() => assertSupportedXlsxPicture(image, "picture")).toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(isNativePictureThemeSuppression(suppression())).toBe(true);
  });
});
