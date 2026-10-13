import { expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import {
  serializeWorkbook,
  deserializeWorkbook,
  serializeSheet,
  deserializeSheet,
} from "../../serialization.js";
import { normalizeSheetDrawing, type SheetGraphicDrawing } from "../../sheet-drawings.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";
const camera = {
  kind: "value" as const,
  value: { projection: "parallel" as const, xDeg: 30, yDeg: 0, zDeg: 0, distanceFromGroundPt: 0 },
};
function box(): SheetGraphicDrawing & { kind: "textBox" } {
  return { ...legacyShapeDrawing(), kind: "textBox" };
}
test("text box body 3D is sparse, genuine, detached, and other unconsumed body categories remain refused", () => {
  const original = { ...box(), shapeStyle: { rotation3d: camera } },
    cloned = normalizeSheetDrawing(original);
  expect(cloned).toEqual(original);
  expect((cloned as SheetGraphicDrawing).shapeStyle).not.toBe(original.shapeStyle);
  expect(() => normalizeSheetDrawing({ ...box(), shapeStyle: { fill: { kind: "none" } } })).toThrow(
    /non-3D/,
  );
  expect(normalizeSheetDrawing(box())).toEqual(box());
});
test("only actual text box body 3D advances internal snapshots to68, including owned leaves and None", () => {
  for (const nested of [false, true])
    for (const rotation3d of [camera, { kind: "none" as const }]) {
      const workbook = createWorkbook({ id: "text-box-3d", sheetId: "s" }),
        sheet = getActiveSheet(workbook),
        source = { ...box(), shapeStyle: { rotation3d } };
      if (nested) {
        const {
          anchor: _a,
          offsetX: _x,
          offsetY: _y,
          width: _w,
          height: _h,
          ...appearance
        } = source;
        sheet.drawings = [
          {
            kind: "shapeGroup",
            id: "group",
            name: "Group",
            rotation: 0,
            shapeFrame: {
              kind: "shape-frame-v1",
              anchor: { mode: "fixed", x: 80, y: 20, size: { width: 100, height: 60 } },
            },
            members: [
              {
                ...appearance,
                groupFrame: {
                  kind: "shape-group-local-v1",
                  rect: { xRatio: 0, yRatio: 0, widthRatio: 1, heightRatio: 1 },
                },
              },
            ],
          },
        ];
      } else sheet.drawings = [source];
      const snapshot = serializeWorkbook(workbook);
      expect(snapshot.version).toBe(68);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      const internal = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(internal))).toEqual(internal);
      for (let version = 1; version <= 67; version++)
        expect(() => deserializeWorkbook({ ...snapshot, version })).toThrow();
      expect(() => deserializeWorkbook({ ...snapshot, version: 67 })).toThrow(/version 68/);
    }
  const old = createWorkbook({ id: "plain", sheetId: "s" });
  getActiveSheet(old).drawings = [box()];
  expect(serializeWorkbook(old).version).toBe(43);
});
test("old protocols and new malformed payloads reject text-box style accessors without evaluating them", () => {
  let reads = 0;
  const raw = box();
  Object.defineProperty(raw, "shapeStyle", {
    enumerable: true,
    get() {
      reads++;
      return { rotation3d: camera };
    },
  });
  const workbook = createWorkbook({ id: "plain", sheetId: "s" }),
    snapshot = serializeWorkbook(workbook);
  snapshot.sheets[0]!.drawings = [raw];
  for (const version of [43, 67, 68])
    expect(() => deserializeWorkbook({ ...snapshot, version })).toThrow();
  expect(reads).toBe(0);
});

test("inherited discriminator or getter cannot bypass body-3D protocol admission", () => {
  let reads = 0;
  const { kind: _kind, ...fields } = box(),
    workbook = createWorkbook({ id: "raw", sheetId: "s" }),
    snapshot = serializeWorkbook(workbook);
  for (const getter of [false, true]) {
    const proto = getter
      ? Object.defineProperty({}, "kind", {
          get() {
            reads++;
            return "textBox";
          },
        })
      : { kind: "textBox" };
    const raw = Object.assign(Object.create(proto), fields, { shapeStyle: { rotation3d: camera } });
    expect(() => normalizeSheetDrawing(raw)).toThrow(/own data/);
    snapshot.sheets[0]!.drawings = [raw];
    for (const version of [58, 67, 68])
      expect(() => deserializeWorkbook({ ...snapshot, version })).toThrow(/own data/);
  }
  expect(reads).toBe(0);
});
