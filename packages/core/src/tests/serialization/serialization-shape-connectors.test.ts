import { describe, expect, test } from "vitest";
import { createWorkbook, getActiveSheet } from "../../workbook.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
} from "../../serialization.js";
import { normalizeSheetDrawings, type SheetFramedGraphicDrawing } from "../../sheet-drawings.js";
import { groupShapeRoots } from "../../shape-group-planning.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";

function fixture() {
  const workbook = createWorkbook({ id: "workbook", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const target: SheetFramedGraphicDrawing = {
    ...framedShapeDrawing(),
    id: "target",
    shapeGeometry: { preset: "rect" },
  };
  const connection: SheetFramedGraphicDrawing = {
    ...framedShapeDrawing(),
    id: "connection",
    shapeGeometry: { preset: "bentConnector3" },
    text: "",
    shapeConnector: {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: "target", preset: "rect", siteIndex: 3 },
      end: { kind: "free", xRatio: 1, yRatio: 1 },
    },
  };
  sheet.drawings = normalizeSheetDrawings([target, connection]);
  return { workbook, sheet };
}

describe("exact shape connector internal snapshot63", () => {
  test("round trips ordered endpoints in63 without derived route or duplicated world point", () => {
    const { workbook } = fixture();
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(63);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const connection = snapshot.sheets[0]!.drawings![1]!;
    expect(connection).toHaveProperty("shapeConnector.begin", {
      kind: "site",
      targetId: "target",
      preset: "rect",
      siteIndex: 3,
    });
    expect(connection).not.toHaveProperty("resolvedRoute");
    expect(connection).not.toHaveProperty("shapeConnector.begin.position");
  });
  test("recursively preserves owned endpoints and infers63 after other independent older features", () => {
    const { workbook, sheet } = fixture();
    sheet.drawings = groupShapeRoots(
      sheet.drawings!,
      ["target", "connection"],
      { id: "owner", name: "Group" },
      createPictureSheetMetrics(sheet),
    );
    const owner = sheet.drawings[0]!;
    if (owner.kind !== "shapeGroup") throw Error("Expected group");
    owner.groupEffects = { shadow: { kind: "none" } };
    const snapshot = serializeWorkbook(workbook);
    expect(snapshot.version).toBe(63);
    expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
    const restored = deserializeSheet(serializeSheet(sheet));
    getActiveSheet(workbook).drawings = restored.drawings;
    expect(serializeWorkbook(workbook).version).toBe(63);
  });
  test("no-connector documents retain their applicable older protocol", () => {
    const { workbook, sheet } = fixture();
    const connection = sheet.drawings![1]!;
    if (connection.kind !== "shape") throw Error("Expected shape");
    delete connection.shapeConnector;
    expect(serializeWorkbook(workbook).version).toBe(60);
    sheet.drawings = groupShapeRoots(
      sheet.drawings!,
      ["target", "connection"],
      { id: "owner", name: "Group" },
      createPictureSheetMetrics(sheet),
    );
    expect(serializeWorkbook(workbook).version).toBe(61);
    const owner = sheet.drawings[0]!;
    if (owner.kind !== "shapeGroup") throw Error("Expected group");
    owner.groupEffects = { shadow: { kind: "none" } };
    expect(serializeWorkbook(workbook).version).toBe(62);
    sheet.drawings = [];
    expect(serializeWorkbook(workbook).version).toBe(43);
  });
  test("root and nested connector presence rejects older protocols even for undefined or empty data", () => {
    for (const owned of [false, true])
      for (const payload of [undefined, {}, { kind: "shape-connector-v1" }]) {
        const { workbook, sheet } = fixture();
        if (owned)
          sheet.drawings = groupShapeRoots(
            sheet.drawings!,
            ["target", "connection"],
            { id: "owner", name: "Group" },
            createPictureSheetMetrics(sheet),
          );
        const snapshot = serializeWorkbook(workbook);
        const owner = snapshot.sheets[0]!.drawings![owned ? 0 : 1]!;
        const connection = owner.kind === "shapeGroup" ? owner.members[1]! : owner;
        Object.defineProperty(connection, "shapeConnector", { value: payload, enumerable: true });
        snapshot.version = 62;
        expect(() => deserializeWorkbook(snapshot)).toThrow(/version 63/);
      }
  });
  test("malformed or accessor endpoint payloads reject63 without running getters", () => {
    let reads = 0;
    for (const field of ["shapeConnector", "begin", "targetId"]) {
      const { workbook } = fixture();
      const snapshot = serializeWorkbook(workbook);
      const connection = snapshot.sheets[0]!.drawings![1]!;
      if (connection.kind !== "shape") throw Error("Expected shape");
      const relation = connection.shapeConnector!;
      const target =
        field === "shapeConnector" ? connection : field === "begin" ? relation : relation.begin;
      Object.defineProperty(target, field, {
        get() {
          reads++;
          throw Error("Accessor executed");
        },
        enumerable: true,
      });
      expect(() => deserializeWorkbook(snapshot)).toThrow(/data|accessor/);
    }
    expect(reads).toBe(0);
  });
  test("whole-sheet restore rejects deleted targets, changed preset and invalid sites before replacement", () => {
    for (const mutation of ["missing", "preset", "site"] as const) {
      const { workbook } = fixture();
      const snapshot = serializeWorkbook(workbook);
      const drawings = snapshot.sheets[0]!.drawings!;
      const target = drawings[0]!,
        connection = drawings[1]!;
      if (target.kind !== "shape" || connection.kind !== "shape") throw Error("Expected shapes");
      if (mutation === "missing") drawings.shift();
      if (mutation === "preset") target.shapeGeometry = { preset: "ellipse" };
      if (mutation === "site" && connection.shapeConnector!.begin.kind === "site")
        connection.shapeConnector!.begin.siteIndex = 4;
      expect(() => deserializeWorkbook(snapshot)).toThrow(/target|preset|site/);
    }
  });
});
