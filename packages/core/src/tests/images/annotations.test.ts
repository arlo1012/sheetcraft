import { describe, expect, test } from "vitest";
import type { StandalonePictureObject } from "../../picture-object.js";
import { isPictureGroup } from "../../picture-group.js";
import {
  normalizeImageAnnotations,
  normalizeImageTransform,
  cloneImageTransform,
  areImageTransformsEqual,
  getActiveSheet,
  getCellContent,
  setCellContent,
  type ImageAnnotation,
  type FloatingImage,
} from "../../workbook.js";
import {
  createSetCellContentCommand,
  createSetFloatingImageCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { translateCellContentForCopy } from "../../clipboard.js";
import { createTestWorkbookSession } from "../helpers.js";

function requireStandalone(image: FloatingImage): StandalonePictureObject {
  if (isPictureGroup(image)) throw new Error("Expected a standalone picture.");
  return image;
}

function annotation(): ImageAnnotation {
  return {
    kind: "pen",
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.8, y: 0.9 },
    ],
    color: "#aabbcc",
    width: 0.01,
  };
}
function floating(): FloatingImage {
  return {
    id: "picture",
    assetId: "asset",
    altText: "Report",
    anchor: { row: 2, column: 2 },
    offsetX: 0,
    offsetY: 0,
    width: 200,
    height: 100,
    transform: { annotations: [annotation()] },
  };
}
describe("picture annotations", () => {
  test.each([
    { kind: "unknown" },
    { points: [] },
    { points: Array(1025).fill({ x: 0, y: 0 }) },
    { points: [{ x: -0.1, y: 0 }] },
    { points: [{ x: 0, y: 1.1 }] },
    { points: [{ x: NaN, y: 0 }] },
    { color: "red" },
    { width: 0 },
    { width: 0.21 },
    { width: Infinity },
    { kind: "arrow", points: [{ x: 0, y: 0 }] },
    { kind: "rectangle", points: [{ x: 0, y: 0 }] },
    { kind: "ellipse", points: [{ x: 0, y: 0 }] },
    { kind: "text", text: "Label" },
    { kind: "text", text: "a".repeat(1001), fontSize: 0.05 },
    { kind: "text", text: "Label", fontSize: 1.1 },
  ])("rejects invalid annotation fields", (patch) => {
    expect(() =>
      normalizeImageAnnotations([{ ...annotation(), ...patch } as ImageAnnotation]),
    ).toThrow();
  });
  test("enforces annotation collection limits and canonicalizes empty collections", () => {
    expect(normalizeImageAnnotations(undefined)).toBeUndefined();
    expect(normalizeImageAnnotations([])).toBeUndefined();
    expect(() => normalizeImageAnnotations(Array.from({ length: 101 }, annotation))).toThrow();
  });
  test.each(["pen", "arrow", "rectangle", "ellipse", "text"] as const)(
    "normalizes and deep clones %s annotation data",
    (kind) => {
      const original = {
        ...annotation(),
        kind,
        ...(kind === "text" ? { text: "Review", fontSize: 0.05 } : {}),
      };
      const normalized = normalizeImageAnnotations([original])!;
      expect(normalized[0]!.color).toBe("#AABBCC");
      normalized[0]!.points[0]!.x = 0.7;
      expect(original.points[0]!.x).toBe(0.1);
      const cloned = cloneImageTransform({ annotations: [original] })!;
      cloned.annotations![0]!.points[0]!.y = 0.7;
      expect(original.points[0]!.y).toBe(0.2);
    },
  );
  test("includes annotation changes in transform equality and canonicalizes color casing", () => {
    const transform = { annotations: [annotation()] };
    expect(normalizeImageTransform(transform)).toBeDefined();
    expect(
      areImageTransformsEqual(transform, { annotations: [{ ...annotation(), color: "#AABBCC" }] }),
    ).toBe(true);
    expect(areImageTransformsEqual(transform, undefined)).toBe(false);
    expect(
      areImageTransformsEqual(transform, { annotations: [{ ...annotation(), width: 0.02 }] }),
    ).toBe(false);
    expect(
      areImageTransformsEqual(transform, {
        annotations: [{ ...annotation(), points: [{ x: 0, y: 0 }] }],
      }),
    ).toBe(false);
    expect(areImageTransformsEqual({ annotations: [] }, undefined)).toBe(true);
  });
  test.each(["cell", "floating"] as const)(
    "round trips V32 %s annotations and rejects them in V31",
    (mode) => {
      const session = createTestWorkbookSession();
      const sheet = getActiveSheet(session.workbook);
      if (mode === "cell")
        setCellContent(
          sheet,
          { row: 0, column: 0 },
          {
            kind: "image",
            image: {
              assetId: "asset",
              altText: "Review",
              transform: { annotations: [annotation()], rotation: 90 },
            },
          },
        );
      else executeWorkbookCommand(session, createSetFloatingImageCommand(sheet.id, floating()));
      const snapshot = serializeWorkbook(session.workbook);
      expect(snapshot.version).toBe(43);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(() => deserializeWorkbook({ ...snapshot, version: 31 })).toThrow();
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
    },
  );
  test("preserves annotated cell images through copy and reversible updates", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    const address = { row: 0, column: 0 };
    setCellContent(sheet, address, {
      kind: "image",
      image: { assetId: "asset", altText: "Review" },
    });
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, address, {
        kind: "image",
        image: { assetId: "asset", altText: "Review", transform: { annotations: [annotation()] } },
      }),
    );
    const content = getCellContent(sheet, address)!;
    const copied = translateCellContentForCopy(content, address, { row: 2, column: 3 })!;
    expect(copied).toEqual(content);
    if (copied.kind !== "image" || content.kind !== "image")
      throw new Error("Expected image content");
    copied.image.transform!.annotations![0]!.points[0]!.x = 0.5;
    expect(content.image.transform!.annotations![0]!.points[0]!.x).toBe(0.1);
    undoWorkbookCommand(session);
    expect(getCellContent(sheet, address)).toMatchObject({ image: { assetId: "asset" } });
    expect((getCellContent(sheet, address) as typeof content).image.transform).toBeUndefined();
    redoWorkbookCommand(session);
    expect(getCellContent(sheet, address)).toEqual(content);
  });
  test("reverses floating-image annotation edits without losing the original drawing", () => {
    const session = createTestWorkbookSession();
    const sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(
      session,
      createSetFloatingImageCommand(sheet.id, { ...floating(), transform: undefined }),
    );
    executeWorkbookCommand(session, createSetFloatingImageCommand(sheet.id, floating()));
    expect(requireStandalone(sheet.floatingImages[0]!).transform!.annotations).toHaveLength(1);
    undoWorkbookCommand(session);
    expect(requireStandalone(sheet.floatingImages[0]!).transform).toBeUndefined();
    redoWorkbookCommand(session);
    expect(requireStandalone(sheet.floatingImages[0]!).transform!.annotations).toHaveLength(1);
  });
});
