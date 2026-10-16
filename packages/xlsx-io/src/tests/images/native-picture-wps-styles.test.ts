import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { unzipSync, zipSync } from "fflate/browser";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import { decodeXlsx, encodeXlsx } from "../../index.js";

// Actual WPS drawing XML, inserted into a controlled package with a synthetic
// PNG. These are not full original WPS workbooks. Original-package acceptance
// is recorded separately; see fixtures/picture-native-style-provenance.json.
const provenance = JSON.parse(
  readFileSync(new URL("./fixtures/picture-native-style-provenance.json", import.meta.url), "utf8"),
) as {
  fixtures: { file: string; sha256: string }[];
};
const bytes = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAATUlEQVR4nO3OsQ0AIAwDwWzBMAzB/hISC7BD2CApkOXmC5cvX+x7stpYs9xvHwAAALAD1AddDwAAAD9AfdD1AAAA8APUB10PAAAAO+ABy7aMl7hArRwAAAAASUVORK5CYII=",
    "base64",
  ),
);
const asset = { assetId: "source", bytes, width: 32, height: 32, extension: "png" as const };
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const cases = [
  { file: "wps-picture-solid-border.xml", line: true, shadow: false },
  { file: "wps-picture-outer-shadow.xml", line: false, shadow: true },
  { file: "wps-picture-line-shadow.xml", line: true, shadow: true },
];
test.each(cases)("observed WPS style $file survives snapshot/native exchange", async (sample) => {
  const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Pictures" });
  const picture: FramedFloatingImage = {
    id: "picture",
    assetId: "source",
    altText: "Synthetic",
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x: 1, y: 1, size: { width: 200, height: 160 } },
      source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      angleDeg: 0,
    },
  };
  getActiveSheet(workbook).floatingImages.push(picture);
  const entries = unzipSync((await encodeXlsx(workbook, { images: [asset] })).bytes);
  const drawing = readFileSync(new URL(`./fixtures/${sample.file}`, import.meta.url));
  expect(hash(drawing)).toBe(provenance.fixtures.find((item) => item.file === sample.file)!.sha256);
  entries["xl/drawings/drawing1.xml"] = drawing;
  const decoded = await decodeXlsx(zipSync(entries));
  const imported = getActiveSheet(decoded.workbook).floatingImages[0] as FramedFloatingImage;
  expect(imported.frame.anchor).toMatchObject({
    mode: "move-only",
    size: { width: 200, height: 160 },
  });
  const style = imported.transform!.appearance!.detailedStyle!;
  expect(style.line).toMatchObject(
    sample.line
      ? {
          kind: "value",
          value: {
            widthPt: 1.5,
            paint: { kind: "solid", color: { kind: "rgb", rgb: "#FF0000" }, opacity: 0.75 },
          },
        }
      : { kind: "none" },
  );
  if (sample.shadow)
    expect(style.shadow).toEqual({
      kind: "value",
      value: {
        kind: "outer",
        color: { kind: "rgb", rgb: "#000000" },
        opacity: 0.4,
        scale: 1,
        blurPt: 4,
        distancePt: 3,
        angleDeg: 45,
        anchor: "top-left",
      },
    });
  else expect(style.shadow).toBeUndefined();
  const warningLocations = decoded.report.issues
    .filter((issue) => issue.code === "style-omitted")
    .flatMap((issue) => issue.locations ?? []);
  expect(warningLocations.some((path) => path.endsWith("rotWithShapeMaterialization"))).toBe(
    sample.shadow,
  );
  expect(warningLocations.some((path) => path.endsWith("noFillMetadataMaterialization"))).toBe(
    !sample.line,
  );
  const restored = deserializeWorkbook(
    JSON.parse(JSON.stringify(serializeWorkbook(decoded.workbook))),
  );
  const exported = await encodeXlsx(restored, {
    images: decoded.images!.map((image) => ({ ...image, width: 32, height: 32 })),
  });
  const reread = await decodeXlsx(exported.bytes);
  expect(
    (getActiveSheet(reread.workbook).floatingImages[0] as FramedFloatingImage).transform?.appearance
      ?.detailedStyle,
  ).toEqual(style);
  expect(hash(reread.images![0]!.bytes)).toBe(hash(bytes));
  expect(exported.report.issues).toEqual([]);
});
