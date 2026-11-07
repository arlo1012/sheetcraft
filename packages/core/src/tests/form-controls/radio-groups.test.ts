// 未执行：待功能完成后由主代理统一验证。
import { describe, expect, test } from "vitest";
import { getFormRadioGroups, prepareFormRadioDrawings } from "../../form-radio-groups.js";
import type { SheetControlDrawing } from "../../sheet-drawings.js";
import {
  createWorkbook,
  getActiveSheet,
  createSheetEvaluator,
  setCellContent,
} from "../../workbook.js";
import { serializeWorkbook, deserializeWorkbook } from "../../serialization.js";
import {
  createSetCellContentCommand,
  createSetSheetDrawingsCommand,
} from "../../commands/index.js";
import { executeWorkbookCommand, undoWorkbookCommand, redoWorkbookCommand } from "../../history.js";
import { createTestWorkbookSession } from "../helpers.js";

function drawing(
  id: string,
  type: "radio" | "group" = "radio",
  x = 0,
  y = 0,
  width = 30,
  height = 20,
): SheetControlDrawing {
  return {
    id,
    kind: "control",
    name: id,
    anchor: { row: 0, column: 0 },
    offsetX: x,
    offsetY: y,
    width,
    height,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    control: {
      type,
      label: id,
      linkedCell: null,
      source: null,
      items: [],
      min: 0,
      max: 100,
      step: 1,
      optionValue: 1,
      resetValue: null,
    },
  };
}
const sheet = () => getActiveSheet(createWorkbook({ id: "radio", sheetId: "sheet" }));
const controls = (items: ReturnType<typeof prepareFormRadioDrawings>) =>
  items as SheetControlDrawing[];

describe("radio groups", () => {
  test.each(["outer", "inner"] as const)(
    "uses the first-created containing box when %s was created first, independent of stacking",
    (firstCreated) => {
      const s = sheet();
      const outer = drawing("outer", "group", 0, 0, 300, 200);
      const inner = drawing("inner", "group", 10, 10, 100, 100);
      outer.control.creationOrder = firstCreated === "outer" ? 1 : 2;
      inner.control.creationOrder = firstCreated === "inner" ? 1 : 2;
      const inside = drawing("inside", "radio", 20, 20);
      const outerOnly = drawing("outer-only", "radio", 150, 20);
      const partial = drawing("partial", "radio", 290, 20);
      const outside = drawing("outside", "radio", 400, 20);
      for (const boxes of [
        [outer, inner],
        [inner, outer],
      ]) {
        s.drawings = [...boxes, inside, outerOnly, partial, outside];
        const groups = getFormRadioGroups(s);
        expect(groups.get(firstCreated)!.members.map((item) => item.id)).toContain("inside");
        expect(groups.get("outer")!.members.map((item) => item.id)).toContain("outer-only");
        expect(groups.get(undefined)!.members.map((item) => item.id)).toEqual([
          "partial",
          "outside",
        ]);
        if (firstCreated === "outer") expect(groups.has("inner")).toBe(false);
        else expect(groups.get("inner")!.members.map((item) => item.id)).toEqual(["inside"]);
      }
    },
  );

  test("retains creation order despite stack changes and numbers each group continuously", () => {
    const s = sheet();
    const first = drawing("first"),
      second = drawing("second"),
      boxed = drawing("boxed", "radio", 210, 20);
    first.control.creationOrder = 1;
    second.control.creationOrder = 2;
    boxed.control.creationOrder = 3;
    const box = drawing("box", "group", 200, 0, 100, 100);
    box.control.creationOrder = 4;
    s.drawings = [first, second, boxed, box];
    const next = controls(prepareFormRadioDrawings(s, [boxed, second, first, s.drawings[3]!]));
    expect(
      next
        .slice(0, 3)
        .map((item) => [item.id, item.control.creationOrder, item.control.optionValue]),
    ).toEqual([
      ["boxed", 3, 1],
      ["second", 2, 2],
      ["first", 1, 1],
    ]);
    expect(next[0]!.control.radioGroupId).toBe("box");
  });

  test("new copies are unselected and follow existing radios in creation order", () => {
    const s = sheet();
    const first = drawing("first");
    first.control = { ...first.control, creationOrder: 1, localValue: 1 };
    s.drawings = [first];
    const copy = { ...first, id: "copy", control: { ...first.control } };
    const next = controls(prepareFormRadioDrawings(s, [copy, first]));
    expect(next[0]!.control).toMatchObject({ creationOrder: 2, optionValue: 2 });
    expect(next[0]!.control.localValue).toBeUndefined();
    expect(next[1]!.control.localValue).toBe(1);
    expect(copy.control.localValue).toBe(1);
  });

  test("copying a box and its member assigns fresh global creation order and an unselected new group", () => {
    const s = sheet();
    const box = drawing("box", "group", 0, 0, 100, 100);
    box.control.creationOrder = 1;
    const radio = drawing("radio", "radio", 10, 20);
    radio.control = { ...radio.control, creationOrder: 2, radioGroupId: "box", localValue: 1 };
    s.drawings = [box, radio];
    const boxCopy = { ...box, id: "box-copy", offsetX: 200, control: { ...box.control } };
    const radioCopy = { ...radio, id: "radio-copy", offsetX: 210, control: { ...radio.control } };
    const next = controls(prepareFormRadioDrawings(s, [box, radio, boxCopy, radioCopy]));
    expect(next.map((item) => item.control.creationOrder)).toEqual([1, 2, 3, 4]);
    expect(next[3]!.control).toMatchObject({ radioGroupId: "box-copy", optionValue: 1 });
    expect(next[3]!.control.localValue).toBeUndefined();
    expect(next[1]!.control.localValue).toBe(1);
    expect(
      getFormRadioGroups(s, next)
        .get("box-copy")!
        .members.map((item) => item.id),
    ).toEqual(["radio-copy"]);
  });

  test("an inserted member inherits only its destination group's link", () => {
    const s = sheet();
    const box = drawing("box", "group", 200, 0, 100, 100);
    const linked = drawing("linked", "radio", 210, 20);
    linked.control = {
      ...linked.control,
      creationOrder: 1,
      radioGroupId: "box",
      linkedCell: { row: 0, column: 1 },
    };
    const outside = drawing("outside");
    outside.control.creationOrder = 2;
    box.control.creationOrder = 3;
    s.drawings = [box, linked, outside];
    const inserted = drawing("inserted", "radio", 210, 50);
    const next = controls(
      prepareFormRadioDrawings(s, [...s.drawings, inserted], {
        id: inserted.id,
        linkedCell: null,
        evaluator: createSheetEvaluator(s),
      }),
    );
    expect(next[3]!.control).toMatchObject({
      creationOrder: 4,
      radioGroupId: "box",
      optionValue: 2,
      linkedCell: { row: 0, column: 1 },
    });
    expect(next[2]!.control.linkedCell).toBeNull();
    expect(next[2]!.control.optionValue).toBe(1);
  });

  test("moving into another group adopts its link and undo restores the whole collection", () => {
    const session = createTestWorkbookSession();
    const s = getActiveSheet(session.workbook);
    const box = drawing("box", "group", 200, 0, 100, 100);
    const inside = drawing("inside", "radio", 210, 20);
    inside.control = {
      ...inside.control,
      creationOrder: 2,
      radioGroupId: "box",
      linkedCell: { row: 0, column: 1 },
    };
    const outside = drawing("outside");
    outside.control = { ...outside.control, creationOrder: 1, localValue: 1 };
    box.control.creationOrder = 3;
    const previous = [outside, inside, box];
    s.drawings = previous;
    const moved = { ...outside, offsetX: 210, offsetY: 50 };
    const next = controls(prepareFormRadioDrawings(s, [moved, inside, box]));
    expect(next[0]!.control).toMatchObject({
      radioGroupId: "box",
      optionValue: 1,
      linkedCell: { row: 0, column: 1 },
    });
    expect(next[1]!.control.optionValue).toBe(2);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(s.id, next));
    undoWorkbookCommand(session);
    expect(s.drawings).toEqual(previous);
    redoWorkbookCommand(session);
    expect(s.drawings).toEqual(next);
  });

  test("clearing a group link preserves the evaluated selected member locally", () => {
    const s = sheet();
    const a = drawing("a"),
      b = drawing("b");
    a.control = { ...a.control, creationOrder: 1, linkedCell: { row: 0, column: 0 } };
    b.control = {
      ...b.control,
      creationOrder: 2,
      optionValue: 2,
      linkedCell: { row: 0, column: 0 },
    };
    s.drawings = [a, b];
    setCellContent(s, { row: 0, column: 0 }, { kind: "literal", value: 2 });
    const next = controls(
      prepareFormRadioDrawings(s, s.drawings, {
        id: "a",
        linkedCell: null,
        evaluator: createSheetEvaluator(s),
      }),
    );
    expect(next.map((item) => item.control.linkedCell)).toEqual([null, null]);
    expect(next.map((item) => item.control.localValue)).toEqual([undefined, 2]);
  });

  test.each(["cell", "objects"] as const)(
    "radio link transaction leaves no partial writes when %s is protected",
    (blocked) => {
      const session = createTestWorkbookSession();
      const s = getActiveSheet(session.workbook);
      const radio = drawing("a");
      radio.control = { ...radio.control, creationOrder: 1, localValue: 1 };
      s.drawings = [radio];
      const target = { row: 0, column: 1 };
      setCellContent(s, target, { kind: "formula", formula: { source: "=40+2" } });
      s.properties.protected = true;
      s.protection =
        blocked === "cell"
          ? { editableRanges: [], editObjects: true }
          : { editableRanges: [{ name: "Target", range: { start: target, end: target } }] };
      const before = serializeWorkbook(session.workbook);
      const linked = { ...radio, control: { ...radio.control, linkedCell: target } };
      delete linked.control.localValue;
      const command = createSetSheetDrawingsCommand(s.id, [linked]);
      command.radioLinkWrite = createSetCellContentCommand(s.id, target, {
        kind: "literal",
        value: 1,
      });
      expect(() => executeWorkbookCommand(session, command)).toThrow();
      expect(serializeWorkbook(session.workbook)).toEqual(before);
      expect(session.history.undoStack).toHaveLength(0);
    },
  );

  test.each(["radio", "group"] as const)(
    "%s creation order round trips in V109 and is rejected in V108",
    (type) => {
      const workbook = createWorkbook({ id: "radio", sheetId: "sheet" });
      const s = getActiveSheet(workbook);
      const radio = drawing("a", type);
      radio.control.creationOrder = 1;
      s.drawings = [radio];
      const snapshot = serializeWorkbook(workbook);
      expect(snapshot.version).toBe(109);
      expect(serializeWorkbook(deserializeWorkbook(snapshot))).toEqual(snapshot);
      expect(() => deserializeWorkbook({ ...snapshot, version: 108 })).toThrow();
    },
  );
});
