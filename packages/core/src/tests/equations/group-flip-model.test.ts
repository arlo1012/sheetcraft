import { describe, expect, expectTypeOf, test } from "vitest";
import {
  getEquationMathRotationDeg,
  normalizeEquationFlipState,
  toggleEquationFlipState,
} from "../../equation-flip.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import { normalizePictureAngle } from "../../picture-frame.js";
import { serializeEquationDocument } from "../../equation-document.js";
import { resolveShapeFrame } from "../../shape-frame.js";
import {
  collectShapeGroupAssetIds,
  isShapeGroupDrawing,
  isSheetGroupedEquationDrawing,
  isSheetGroupedGraphicDrawing,
  normalizeShapeGroup,
  normalizeShapeGroupChild,
  type ShapeGroupDrawing,
  type SheetGroupedEquationDrawing,
  type SheetGroupedGraphicDrawing,
} from "../../shape-group.js";
import {
  applyShapeGroupChildWorldEdit,
  applyShapeGroupEquationSourceEdit,
  leaseShapeGroupNode,
} from "../../shape-group-edit.js";
import { resolveShapeGroup } from "../../shape-group-layout.js";
import {
  groupShapeRoots,
  planFlipShapeDrawingNodes,
  ungroupShapeRoot,
} from "../../shape-group-planning.js";
import {
  cloneShapeRootsForClipboard,
  planCloneShapeRootsForClipboard,
} from "../../shape-group-copy.js";
import { planDeleteShapeGroupNodes } from "../../shape-group-delete.js";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV77,
} from "../../serialization.js";
import {
  isFramedEquationDrawing,
  normalizeSheetDrawing,
  type SheetDrawing,
} from "../../sheet-drawings.js";
import { createSheet, createWorkbook, getActiveSheet } from "../../workbook.js";
import { createTestWorkbookSession } from "../helpers.js";
import { framedShapeDrawing } from "../drawings/shape-frame-fixture.js";
import { equationDocument, equationDrawing } from "./fixtures.js";
import { framedEquationDrawing, opaqueEquationSource } from "./root-frame-fixtures.js";

const metrics = () => createPictureSheetMetrics(createSheet("Sheet", "sheet"));
function roots(mixed = false): SheetDrawing[] {
  const a = framedEquationDrawing({
    mode: "fixed",
    x: 20,
    y: 30,
    size: { width: 120, height: 60 },
  });
  a.rotation = 27;
  const b = framedEquationDrawing(
    { mode: "fixed", x: 240, y: 80, size: { width: 100, height: 40 } },
    true,
  );
  b.id = "equation-2";
  b.rotation = -11;
  return mixed
    ? [
        a,
        b,
        {
          ...framedShapeDrawing({ mode: "fixed", x: 110, y: 200, size: { width: 50, height: 80 } }),
          id: "shape",
        },
      ]
    : [a, b];
}
function group(mixed = false): ShapeGroupDrawing {
  const values = roots(mixed);
  const result = groupShapeRoots(
    values,
    values.map(({ id }) => id),
    { id: "group", name: "Group" },
    metrics(),
  );
  const root = result[0]!;
  if (!isShapeGroupDrawing(root)) throw Error("Expected group");
  return root;
}
function child(root = group()): SheetGroupedEquationDrawing {
  const member = root.members[0]!;
  if (!isSheetGroupedEquationDrawing(member)) throw Error("Expected Equation child");
  return member;
}
function raw(drawing: unknown, version = 77) {
  const snapshot = serializeWorkbook(createWorkbook({ id: "workbook", sheetId: "sheet" }));
  const result = {
    ...snapshot,
    version,
    sheets: [{ ...snapshot.sheets[0]!, drawings: [drawing] }],
  };
  if (version < 3) delete (result as { dateSystem?: unknown }).dateSystem;
  return result;
}

describe("dedicated Equation group and math flip model", () => {
  test.each([false, true])("two formulas and mixed=%s retain strict source/ownership", (mixed) => {
    expectTypeOf<SheetGroupedEquationDrawing>().not.toExtend<SheetGroupedGraphicDrawing>();
    const root = group(mixed),
      member = child(root),
      original = roots(mixed);
    expect(isSheetGroupedGraphicDrawing(member)).toBe(false);
    expect(isSheetGroupedEquationDrawing(member)).toBe(true);
    expect(member.text).toBe(original[0]!.kind === "shapeGroup" ? "" : original[0]!.text);
    expect(root.members[1]).toHaveProperty("text", opaqueEquationSource);
    expect(normalizeShapeGroup(root)).toEqual(root);
    expect(collectShapeGroupAssetIds(root)).toEqual(new Set());
    for (const key of [
      "shapeFrame",
      "anchor",
      "shapeGeometry",
      "shapeStyle",
      "shapeText",
      "shapeFlipX",
      "shapeFlipY",
    ])
      expect(member).not.toHaveProperty(key);
    expect(member.equationDocument).not.toBe(
      isFramedEquationDrawing(original[0]!) ? original[0]!.equationDocument : undefined,
    );
    const cloned = normalizeShapeGroupChild(member);
    if (!isSheetGroupedEquationDrawing(cloned)) throw Error("Expected math clone");
    cloned.equationDocument!.body.children = [];
    expect(member.equationDocument).toEqual(equationDocument());
  });

  test.each([
    "equationDocument",
    "equationFlipX",
    "equationFlipY",
    "shapeProperties",
    "hidden",
    "text",
  ] as const)("grouped Equation retains non-enumerable own %s data through admission", (key) => {
    const root = group(),
      member = child(root);
    member.equationFlipX = true;
    member.equationFlipY = true;
    member.hidden = true;
    member.shapeProperties = { locked: false, printObject: false, altTitle: "Math" };
    const expected = structuredClone(member);
    Object.defineProperty(member, key, {
      value: member[key],
      enumerable: false,
      configurable: true,
      writable: true,
    });
    const before = Object.getOwnPropertyDescriptor(member, key);
    const normalized = normalizeShapeGroup(root),
      result = child(normalized);
    expect(result).toEqual(expected);
    expect(Object.hasOwn(result, key)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(member, key)).toEqual(before);
    expect(root.members[0]).toBe(member);
  });

  test.each(["equationDocument", "equationFlipX", "equationFlipY", "shapeProperties"] as const)(
    "grouped Equation rejects Object.prototype inherited optional %s without evaluating it",
    (key) => {
      const root = group(),
        member = child(root);
      delete member[key];
      const before = structuredClone(root),
        previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
      let reads = 0,
        failed = false;
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        get() {
          reads++;
          throw Error("read inherited math");
        },
      });
      try {
        try {
          normalizeShapeGroup(root);
        } catch {
          failed = true;
        }
      } finally {
        if (previous) Object.defineProperty(Object.prototype, key, previous);
        else Reflect.deleteProperty(Object.prototype, key);
      }
      expect(failed).toBe(true);
      expect(reads).toBe(0);
      expect(root).toEqual(before);
    },
  );

  test("own Equation data shadows Object.prototype getters without reads or loss", () => {
    const member = child();
    member.equationFlipX = true;
    const expected = structuredClone(member),
      previous = Object.getOwnPropertyDescriptor(Object.prototype, "equationFlipX");
    let reads = 0,
      normalized: ReturnType<typeof normalizeShapeGroupChild> | undefined;
    Object.defineProperty(Object.prototype, "equationFlipX", {
      configurable: true,
      get() {
        reads++;
        throw Error("read inherited flip");
      },
    });
    try {
      normalized = normalizeShapeGroupChild(member);
    } finally {
      if (previous) Object.defineProperty(Object.prototype, "equationFlipX", previous);
      else Reflect.deleteProperty(Object.prototype, "equationFlipX");
    }
    expect(reads).toBe(0);
    expect(normalized).toEqual(expected);
    expect(member).toEqual(expected);
  });

  test.each(["equationDocument", "equationFlipX", "equationFlipY", "hidden"] as const)(
    "canonical root intermediates do not read absent %s from Object.prototype",
    (key) => {
      const source = Object.assign(Object.create(null), framedEquationDrawing(undefined, true));
      const before = structuredClone(source),
        previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
      let reads = 0,
        normalized: SheetDrawing | undefined;
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        get() {
          reads++;
          throw Error("read intermediate prototype");
        },
      });
      try {
        normalized = normalizeSheetDrawing(source);
      } finally {
        if (previous) Object.defineProperty(Object.prototype, key, previous);
        else Reflect.deleteProperty(Object.prototype, key);
      }
      expect(reads).toBe(0);
      expect(normalized).toEqual(before);
      expect(source).toEqual(before);
    },
  );

  test.each(["horizontal", "vertical"] as const)(
    "%s twice is source-preserving and local glyph flags stay sparse",
    (axis) => {
      const root = group(true),
        before = structuredClone(root);
      const first = planFlipShapeDrawingNodes([root], [[root.id]], axis, metrics())[0]!;
      if (!isShapeGroupDrawing(first)) throw Error("Expected group");
      const flipped = child(first);
      expect(flipped.text).toBe(child(root).text);
      expect(flipped.equationDocument).toEqual(child(root).equationDocument);
      expect(flipped.rotation).toBe(normalizePictureAngle(-child(root).rotation));
      expect(getEquationMathRotationDeg(flipped)).toBe(axis === "vertical" ? 180 : 0);
      expect(flipped).toHaveProperty(
        axis === "horizontal" ? "equationFlipX" : "equationFlipY",
        true,
      );
      const second = planFlipShapeDrawingNodes([first], [[root.id]], axis, metrics())[0]!;
      if (!isShapeGroupDrawing(second)) throw Error("Expected group");
      expect(child(second)).not.toHaveProperty(
        axis === "horizontal" ? "equationFlipX" : "equationFlipY",
      );
      const beforeLayout = resolveShapeGroup(root, metrics()),
        afterLayout = resolveShapeGroup(second, metrics());
      beforeLayout.members.forEach((entry, index) => {
        expect(afterLayout.members[index]!.layout!.angleDeg).toBe(entry.layout!.angleDeg);
        for (const key of ["x", "y", "width", "height"] as const)
          expect(afterLayout.members[index]!.layout!.rect[key]).toBeCloseTo(
            entry.layout!.rect[key],
            10,
          );
      });
      expect(root).toEqual(before);
    },
  );

  test("root H/V flags do not change rotation; rotated group release retains angles, flags, lock and hidden", () => {
    const source = framedEquationDrawing();
    source.rotation = 90;
    const flags = toggleEquationFlipState(source, "vertical");
    const flipped = normalizeSheetDrawing({ ...source, ...flags });
    expect(flipped.rotation).toBe(90);
    expect(getEquationMathRotationDeg(flipped)).toBe(180);
    expect(toggleEquationFlipState(flipped, "vertical")).toEqual({});
    const root = group();
    root.rotation = 90;
    root.hidden = true;
    root.shapeProperties = { locked: false, printObject: false };
    const result = planFlipShapeDrawingNodes([root], [[root.id]], "vertical", metrics())[0]!;
    if (!isShapeGroupDrawing(result)) throw Error("Expected group");
    const world = resolveShapeGroup(result, metrics());
    const released = ungroupShapeRoot([result], root.id, metrics());
    released.forEach((entry, index) => {
      if (!isFramedEquationDrawing(entry)) throw Error("Expected Equation root");
      expect(entry.rotation).toBe(world.members[index]!.layout!.angleDeg);
      expect(entry.equationFlipY).toBe(true);
      expect(entry.hidden).toBe(true);
      expect(entry.shapeProperties).toMatchObject({ locked: false, printObject: false });
      const layout = resolveShapeFrame(entry.shapeFrame, metrics(), entry.rotation);
      expect(layout.angleDeg).toBe(normalizePictureAngle(90 - root.members[index]!.rotation));
      for (const key of ["x", "y", "width", "height"] as const)
        expect(layout.rect[key]).toBeCloseTo(world.members[index]!.layout!.rect[key], 10);
    });
  });

  test("conditional77 roundtrips math children and root flags without lowering legacy43/75/root76", () => {
    expectTypeOf<WorkbookSnapshotV77>().toExtend<WorkbookSnapshot>();
    for (const input of [
      group(),
      { ...framedEquationDrawing(), equationFlipX: true as const },
      { ...equationDrawing(), equationFlipY: true as const },
    ]) {
      const saved = serializeWorkbook(deserializeWorkbook(raw(input)));
      expect(saved.version).toBe(77);
      expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
      const sheet = serializeSheet(getActiveSheet(deserializeWorkbook(saved)));
      expect(serializeSheet(deserializeSheet(sheet))).toEqual(sheet);
    }
    const { equationDocument: _math, ...legacy } = equationDrawing();
    for (const [drawing, version] of [
      [legacy, 43],
      [equationDrawing(), 75],
      [framedEquationDrawing(), 76],
    ] as const)
      expect(serializeWorkbook(deserializeWorkbook(raw(drawing, version))).version).toBe(version);
  });

  test("every earlier snapshot rejects Equation-child/flag presence before getters", () => {
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    const root = group(),
      owned = child(root);
    const getterChild = Object.defineProperty({ ...owned }, "text", getter);
    const withGetter = { ...root, members: [getterChild, root.members[1]!] };
    const inherited = Object.assign(
      Object.create(Object.defineProperty({}, "equationFlipY", getter)),
      equationDrawing(),
    );
    const inputs = [
      root,
      withGetter,
      { ...equationDrawing(), equationFlipX: false },
      Object.defineProperty(equationDrawing(), "equationFlipY", getter),
      inherited,
    ];
    for (let version = 1; version < 77; version++)
      for (const input of inputs)
        expect(() => deserializeWorkbook(raw(input, version))).toThrow(/version 77/);
    expect(reads).toBe(0);
    expect(() =>
      deserializeWorkbook(raw({ ...equationDrawing(), equationFlipX: false })),
    ).toThrow();
  });

  test("strict Equation child rejects body fields, accessors, malformed math, active group effects/3D with zero source mutation", () => {
    const root = group(),
      before = structuredClone(root);
    let reads = 0;
    const getter = {
      enumerable: true,
      get() {
        reads++;
        throw Error("read");
      },
    };
    for (const key of [
      "shapeStyle",
      "shapeText",
      "shapeGeometry",
      "shapeFlipX",
      "textReference",
      "anchor",
      "group3d",
      "groupEffects",
    ])
      expect(() =>
        normalizeShapeGroup({
          ...root,
          members: [{ ...child(root), [key]: {} }, root.members[1]!],
        }),
      ).toThrow();
    expect(() =>
      normalizeShapeGroupChild(Object.defineProperty({ ...child(root) }, "equationFlipX", getter)),
    ).toThrow();
    expect(() => normalizeEquationFlipState({ kind: "equation", equationFlipX: false })).toThrow();
    expect(() => normalizeEquationFlipState({ kind: "shape", equationFlipY: true })).toThrow();
    expect(() => normalizeEquationFlipState(new Date())).toThrow();
    expect(() => getEquationMathRotationDeg({ kind: "shape" })).toThrow();
    expect(() => toggleEquationFlipState({ kind: "shape" }, "horizontal")).toThrow();
    expect(() => normalizeShapeGroupChild({ ...child(root), text: "stale" })).toThrow();
    expect(() =>
      normalizeShapeGroup({
        ...root,
        group3d: {
          rotation3d: {
            kind: "value",
            value: {
              projection: "perspective",
              xDeg: 20,
              yDeg: 10,
              zDeg: 0,
              distanceFromGroundPt: 0,
              perspectiveDeg: 30,
            },
          },
        },
      }),
    ).toThrow(/Equations/);
    expect(() =>
      normalizeShapeGroup({
        ...root,
        groupEffects: {
          glow: {
            kind: "value",
            value: {
              color: { kind: "rgb", rgb: "#ff0000" },
              opacity: 1,
              sizePt: 5,
            },
          },
        },
      }),
    ).toThrow();
    const dormant = {
      ...root,
      group3d: { rotation3d: { kind: "none" as const } },
      groupEffects: { shadow: { kind: "none" as const } },
    };
    expect(normalizeShapeGroup(dormant)).toEqual(dormant);
    const nested = {
      kind: "shapeGroup" as const,
      id: "nested",
      name: "Nested",
      rotation: 37,
      groupFrame: child(root).groupFrame,
      members: root.members,
    };
    const activeGlow = {
      glow: {
        kind: "value" as const,
        value: {
          color: { kind: "rgb" as const, rgb: "#ff0000" },
          opacity: 1,
          sizePt: 5,
        },
      },
    };
    expect(() =>
      normalizeShapeGroup({ ...root, members: [nested], groupEffects: activeGlow }),
    ).toThrow(/Equations/);
    expect(() =>
      normalizeShapeGroup({ ...root, members: [{ ...nested, groupEffects: activeGlow }] }),
    ).toThrow(/Equations/);
    const mixed = group(true),
      shapeOnly = mixed.members[2]!;
    const paintedSibling = {
      ...nested,
      id: "painted",
      members: [shapeOnly],
      groupEffects: activeGlow,
    };
    expect(() =>
      normalizeShapeGroup({
        ...mixed,
        members: [mixed.members[0]!, mixed.members[1]!, paintedSibling],
      }),
    ).toThrow(/Equations/);
    expect(reads).toBe(0);
    expect(root).toEqual(before);
  });

  test.each(["remove-y", "add-x"] as const)(
    "generic Equation geometry replacement rejects %s flip identity changes with zero mutation",
    (change) => {
      const root = group();
      child(root).equationFlipY = true;
      const before = structuredClone(root),
        lease = leaseShapeGroupNode(root, [root.id, child(root).id]);
      const world = resolveShapeGroup(root, metrics()).members[0]!.layout!,
        replacement = { ...child(root) };
      if (change === "remove-y") delete replacement.equationFlipY;
      else replacement.equationFlipX = true;
      expect(() =>
        applyShapeGroupChildWorldEdit(root, lease, world, metrics(), { replacement }),
      ).toThrow(/dedicated|identity|flip/);
      expect(root).toEqual(before);
    },
  );

  test.each(["equationDocument", "fontSize", "color", "bold", "italic"] as const)(
    "owned Equation source edit rejects inherited content %s before reads or mutation",
    (key) => {
      const root = group(),
        second = root.members[1]!;
      if (!isSheetGroupedEquationDrawing(second)) throw Error("Expected second math");
      second.equationDocument = equationDocument();
      second.text = serializeEquationDocument(second.equationDocument);
      const before = structuredClone(root),
        lease = leaseShapeGroupNode(root, [root.id, child(root).id]);
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
      let reads = 0,
        errorMessage = "";
      Object.defineProperty(Object.prototype, key, {
        configurable: true,
        get() {
          reads++;
          throw Error("read inherited edit");
        },
      });
      try {
        try {
          applyShapeGroupEquationSourceEdit(root, lease, { text: opaqueEquationSource });
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      } finally {
        if (previous) Object.defineProperty(Object.prototype, key, previous);
        else Reflect.deleteProperty(Object.prototype, key);
      }
      expect(errorMessage).toMatch(/Equation source edit.*own/);
      expect(reads).toBe(0);
      expect(root).toEqual(before);
    },
  );

  test("owned Equation source edit preserves non-enumerable own content fields", () => {
    const root = group(),
      lease = leaseShapeGroupNode(root, [root.id, child(root).id]),
      mathDocument = equationDocument();
    const content = {
      text: serializeEquationDocument(mathDocument),
      equationDocument: mathDocument,
      fontSize: 31,
      color: "#345678",
      bold: true,
      italic: false,
    };
    for (const key of Object.keys(content)) {
      const field = Object.getOwnPropertyDescriptor(content, key)!;
      Object.defineProperty(content, key, { ...field, enumerable: false });
    }
    const before = Object.getOwnPropertyDescriptors(content),
      next = applyShapeGroupEquationSourceEdit(root, lease, content);
    expect(child(next)).toMatchObject({
      text: serializeEquationDocument(mathDocument),
      equationDocument: mathDocument,
      fontSize: 31,
      color: "#345678",
      bold: true,
      italic: false,
    });
    expect(Object.getOwnPropertyDescriptors(content)).toEqual(before);
  });

  test("owned source edit is exact-lease and preserves placement/flip; world replacement cannot alter math", () => {
    const root = group();
    child(root).equationFlipX = true;
    child(root).equationFlipY = true;
    const lease = leaseShapeGroupNode(root, [root.id, child(root).id]);
    const changed = applyShapeGroupEquationSourceEdit(root, lease, {
      text: opaqueEquationSource,
      fontSize: 24,
      color: "#123456",
      bold: true,
      italic: false,
    });
    expect(child(changed)).not.toHaveProperty("equationDocument");
    expect(child(changed)).toMatchObject({
      groupFrame: child(root).groupFrame,
      rotation: child(root).rotation,
      equationFlipX: true,
      equationFlipY: true,
      text: opaqueEquationSource,
      fontSize: 24,
      color: "#123456",
    });
    expect(() => applyShapeGroupEquationSourceEdit(changed, lease, { text: "x" })).toThrow(/stale/);
    const fresh = leaseShapeGroupNode(changed, lease.path),
      mathDocument = equationDocument();
    const structured = applyShapeGroupEquationSourceEdit(changed, fresh, {
      text: serializeEquationDocument(mathDocument),
      equationDocument: mathDocument,
    });
    expect(child(structured).equationDocument).toEqual(mathDocument);
    const world = resolveShapeGroup(root, metrics()).members[0]!.layout!;
    expect(() =>
      applyShapeGroupChildWorldEdit(root, lease, world, metrics(), {
        replacement: { ...child(root), fontSize: 42 },
      }),
    ).toThrow(/dedicated/);
    const before = structuredClone(root);
    expect(() =>
      applyShapeGroupEquationSourceEdit(root, lease, {
        text: "stale",
        equationDocument: mathDocument,
      }),
    ).toThrow();
    expect(root).toEqual(before);
  });

  test("copy and singleton delete keep raw/tree flags and detached math identities", () => {
    const root = group();
    child(root).equationFlipX = true;
    child(root).equationFlipY = true;
    let counter = 0;
    const options = { createId: () => `copy-${++counter}` };
    const copied = cloneShapeRootsForClipboard([root], options)[0]!;
    if (!isShapeGroupDrawing(copied)) throw Error("Expected copy group");
    expect(child(copied)).toMatchObject({
      equationFlipX: true,
      equationFlipY: true,
      text: child(root).text,
    });
    expect(child(copied).equationDocument).not.toBe(child(root).equationDocument);
    expect(child(copied).id).not.toBe(child(root).id);
    expect(planCloneShapeRootsForClipboard([root], [root.id], metrics(), options)).toHaveLength(1);
    const surviving = planDeleteShapeGroupNodes(
      [root],
      [[root.id, root.members[1]!.id]],
      metrics(),
    )[0]!;
    if (!isFramedEquationDrawing(surviving)) throw Error("Expected released singleton math");
    expect(surviving).toMatchObject({
      id: child(root).id,
      equationFlipX: true,
      equationFlipY: true,
      text: child(root).text,
      equationDocument: child(root).equationDocument,
    });
  });

  test("history restores group/flip/quarter-turn/ungroup; malformed command has zero mutation", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, roots()));
    const initial = serializeWorkbook(session.workbook);
    const grouped = groupShapeRoots(
      sheet.drawings!,
      sheet.drawings!.map(({ id }) => id),
      { id: "group", name: "Group" },
      metrics(),
    );
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, grouped));
    const flipped = planFlipShapeDrawingNodes(sheet.drawings!, [["group"]], "vertical", metrics());
    const rotated = flipped[0]!;
    if (!isShapeGroupDrawing(rotated)) throw Error("Expected group");
    rotated.rotation = normalizePictureAngle(rotated.rotation + 90);
    executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, flipped));
    executeWorkbookCommand(
      session,
      createSetSheetDrawingsCommand(
        sheet.id,
        ungroupShapeRoot(sheet.drawings!, "group", metrics()),
      ),
    );
    const finished = serializeWorkbook(session.workbook);
    for (let count = 0; count < 3; count++) expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(initial);
    for (let count = 0; count < 3; count++) expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(finished);
    const bad = createSetSheetDrawingsCommand(sheet.id, [group()]);
    const badRoot = bad.drawings[0]!;
    if (!isShapeGroupDrawing(badRoot)) throw Error("Expected group");
    child(badRoot).text = "stale";
    const history = structuredClone(session.history);
    expect(() => executeWorkbookCommand(session, bad)).toThrow();
    expect(serializeWorkbook(session.workbook)).toEqual(finished);
    expect(session.history).toEqual(history);
  });
});
