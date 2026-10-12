import { expect, test, vi } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  type ImageTransform,
  type LegacyFloatingImage,
} from "@sheetcraft/core/workbook";
import { encodeXlsx, XlsxCompatibilityError } from "../../index.js";
import { assertSupportedXlsxImageAppearance, createXlsxImageExporter } from "../../image-export.js";

function image(): LegacyFloatingImage {
  return {
    id: "p",
    assetId: "primary",
    altText: "",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 100,
    height: 100,
    transform: { appearance: { detailedStyle: { fill: { kind: "none" } } } },
  };
}

test.each(["cell", "floating"] as const)(
  "%s detailed styles block before any resources are read",
  async (kind) => {
    const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" });
    const sheet = getActiveSheet(workbook);
    if (kind === "cell") sheet.cells.set("0:0", { content: { kind: "image", image: image() } });
    else sheet.floatingImages = [image()];
    const before = structuredClone(workbook);
    const resources = vi.fn(() => []);
    await expect(
      encodeXlsx(workbook, {
        get images() {
          return resources();
        },
      }),
    ).rejects.toMatchObject({
      name: "XlsxCompatibilityError",
      report: {
        issues: [
          {
            severity: "block",
            locations: [
              `${kind === "cell" ? "Synthetic!A1" : 'Synthetic.floatingImages["p"]'}.transform.appearance.detailedStyle`,
            ],
          },
        ],
      },
    });
    expect(resources).not.toHaveBeenCalled();
    expect(workbook).toEqual(before);
  },
);

test("a direct cell exporter cannot register a detailed-style image", () => {
  const target = { addImage: vi.fn(() => 1) };
  expect(() =>
    createXlsxImageExporter(target, undefined).registerCellImage(image(), "Synthetic!A1"),
  ).toThrow(XlsxCompatibilityError);
  expect(target.addImage).not.toHaveBeenCalled();
});

test.each([undefined, {}, null, false])(
  "the guard blocks unsupported own field presence: %s",
  (value) => {
    expect(() =>
      assertSupportedXlsxImageAppearance(
        { transform: { appearance: { detailedStyle: value } } as unknown as ImageTransform },
        "Synthetic!A1",
      ),
    ).toThrow(XlsxCompatibilityError);
  },
);

test("blocking an own detailed-style accessor never invokes it", () => {
  const getter = vi.fn(() => {
    throw Error("must not read");
  });
  const appearance = Object.defineProperty({}, "detailedStyle", { get: getter });
  expect(() =>
    assertSupportedXlsxImageAppearance({ transform: { appearance } }, "Synthetic!A1"),
  ).toThrow(XlsxCompatibilityError);
  expect(getter).not.toHaveBeenCalled();
});

// This safety gate does not add XLSX property encoding capabilities.
test.each(["altTitle", "locked", "printObject"] as const)(
  "%s properties block before resources and leave the workbook unchanged",
  async (field) => {
    for (const kind of ["cell", "floating"] as const) {
      const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Synthetic" }),
        sheet = getActiveSheet(workbook);
      const value = {
        ...image(),
        transform: undefined,
        [field]: field === "altTitle" ? "Title" : false,
      };
      if (kind === "cell") sheet.cells.set("0:0", { content: { kind: "image", image: value } });
      else sheet.floatingImages = [value];
      const before = structuredClone(workbook),
        resources = vi.fn(() => []);
      await expect(
        encodeXlsx(workbook, {
          get images() {
            return resources();
          },
        }),
      ).rejects.toMatchObject({
        name: "XlsxCompatibilityError",
        report: {
          issues: [
            {
              severity: "block",
              locations: [
                `${kind === "cell" ? "Synthetic!A1" : 'Synthetic.floatingImages["p"]'}.${field}`,
              ],
            },
          ],
        },
      });
      expect(resources).not.toHaveBeenCalled();
      expect(workbook).toEqual(before);
    }
  },
);
test("object property accessors block without invocation in a direct image exporter", () => {
  const getter = vi.fn(() => false),
    source = Object.defineProperty({ assetId: "a", altText: "" }, "locked", { get: getter });
  const target = { addImage: vi.fn(() => 1) };
  expect(() =>
    createXlsxImageExporter(target, undefined).registerCellImage(source, "Synthetic!A1"),
  ).toThrow(XlsxCompatibilityError);
  expect(getter).not.toHaveBeenCalled();
  expect(target.addImage).not.toHaveBeenCalled();
});
