import { describe, expect, expectTypeOf, test } from "vitest";
import {
  deserializeSheet,
  deserializeWorkbook,
  serializeSheet,
  serializeWorkbook,
  type WorkbookSnapshot,
  type WorkbookSnapshotV72,
} from "../../serialization.js";
import { createSetSheetDrawingsCommand } from "../../commands/drawings.js";
import { createRestoreSheetStateCommand } from "../../commands/structure.js";
import { executeWorkbookCommand, redoWorkbookCommand, undoWorkbookCommand } from "../../history.js";
import { createSheetSparseState, getActiveSheet } from "../../workbook.js";
import { cloneShapeRootsForClipboard } from "../../shape-group-copy.js";
import { traverseShapeGroup, type ShapeGroupDrawing } from "../../shape-group.js";
import type { ShapeTextCharacterFormat } from "../../shape-text-character-runs.js";
import type { SheetGraphicDrawing } from "../../sheet-drawings.js";
import { createTestWorkbookSession } from "../helpers.js";
import { group, leaf, nested } from "../shape-groups/fixtures.js";
import { shapeText } from "./shape-text-fixture.js";
import { legacyShapeDrawing } from "./shape-style-fixture.js";
import { characterEffects } from "./shape-character-effects-fixture.js";

const keys = ["shadow", "reflection", "glow"] as const;

function attributed(format: ShapeTextCharacterFormat = characterEffects()): SheetGraphicDrawing {
  return {
    ...legacyShapeDrawing(),
    text: "alpha beta",
    shapeText: { ...shapeText(), characterRuns: [{ start: 0, end: 6, bold: false, ...format }] },
  };
}
function tree(format: ShapeTextCharacterFormat = characterEffects()): ShapeGroupDrawing {
  const inner = nested();
  inner.members = [
    { ...leaf("rich"), text: attributed().text, shapeText: attributed(format).shapeText },
  ];
  return { ...group(), members: [inner, leaf("plain")] };
}
function richLeaf(root: ShapeGroupDrawing) {
  const target = traverseShapeGroup(root).find(({ node }) => node.id === "rich")!.node;
  if (target.kind !== "shape" && target.kind !== "textBox") throw Error("Expected leaf");
  return target;
}

describe("conditional V72 local glyph effect internal persistence", () => {
  test("V72 persists authored and None choices on shape, text-box and nested leaves without aliases", () => {
    expectTypeOf<WorkbookSnapshotV72>().toExtend<WorkbookSnapshot>();
    for (const format of [
      characterEffects(),
      ...keys.map((key) => ({ [key]: { kind: "none" as const } })),
    ])
      for (const drawing of [
        attributed(format),
        { ...attributed(format), kind: "textBox" as const },
        tree(format),
      ]) {
        const session = createTestWorkbookSession(),
          sheet = getActiveSheet(session.workbook);
        sheet.drawings = [drawing];
        const saved = serializeWorkbook(session.workbook);
        expect(saved.version).toBe(72);
        expect(serializeWorkbook(deserializeWorkbook(saved))).toEqual(saved);
        const standalone = serializeSheet(sheet);
        expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
        const stored = saved.sheets[0]!.drawings![0]!,
          target =
            stored.kind === "shapeGroup" ? richLeaf(stored) : (stored as SheetGraphicDrawing),
          original = drawing.kind === "shapeGroup" ? richLeaf(drawing) : drawing;
        const run = target.shapeText!.characterRuns![0]!,
          source = original.shapeText!.characterRuns![0]!;
        expect(run).not.toBe(source);
        for (const key of keys) {
          if (!Object.hasOwn(source, key)) continue;
          expect(run[key]).toEqual(source[key]?.kind === "none" ? source[key] : expect.any(Object));
          expect(run[key]).not.toBe(source[key]);
          const choice = run[key],
            initial = source[key];
          if (choice?.kind === "value" && initial?.kind === "value") {
            expect(choice.value).not.toBe(initial.value);
            choice.value.opacity = 0;
            expect(initial.value.opacity).not.toBe(0);
          }
        }
      }
  });

  test("V43..71 reject field presence, including undefined, inherited and accessor fields before reading payload getters", () => {
    const base = serializeWorkbook(createTestWorkbookSession().workbook);
    let reads = 0;
    const getter = {
      get() {
        reads++;
        return characterEffects();
      },
    };
    for (const key of keys) {
      const choice = characterEffects()[key];
      for (const rawRun of [
        { start: 0, end: 6, [key]: { kind: "none" } },
        { start: 0, end: 6, [key]: undefined },
        { start: 0, end: 6, [key]: null },
        Object.defineProperty({ start: 0, end: 6 }, key, getter),
        Object.assign(Object.create({ [key]: choice }), { start: 0, end: 6 }),
        Object.assign(Object.create(Object.defineProperty({}, key, getter)), { start: 0, end: 6 }),
        { start: 0, end: 6, [key]: Object.defineProperty({}, "kind", getter) },
        {
          start: 0,
          end: 6,
          [key]: {
            kind: "value",
            value: Object.defineProperty({ ...choice.value }, "opacity", getter),
          },
        },
      ])
        for (const owned of [false, true]) {
          const drawing = owned ? tree() : attributed(),
            target = drawing.kind === "shapeGroup" ? richLeaf(drawing) : drawing;
          target.shapeText!.characterRuns = [rawRun] as never;
          for (let version = 43; version <= 71; version++)
            expect(() =>
              deserializeWorkbook({
                ...base,
                version,
                sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
              }),
            ).toThrow(/version 72/);
          const current = {
            ...base,
            version: 72,
            sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
          };
          const field = Object.getOwnPropertyDescriptor(rawRun, key);
          if (
            field &&
            "value" in field &&
            field.value &&
            typeof field.value === "object" &&
            Object.getOwnPropertyDescriptor(field.value, "kind")?.value === "none"
          )
            expect(serializeWorkbook(deserializeWorkbook(current)).version).toBe(72);
          else expect(() => deserializeWorkbook(current)).toThrow();
        }
    }
    expect(reads).toBe(0);
  });

  test("effect absence preserves earlier minima and mixed raw sheet inference cannot downgrade V72", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    for (const [drawing, version] of [
      [legacyShapeDrawing(), 43],
      [{ ...attributed({}), shapeText: { ...shapeText(), style: characterEffects() } }, 59],
      [attributed({ italic: true }), 66],
      [attributed({ fill: { kind: "none" } }), 70],
      [
        {
          ...attributed({ italic: true }),
          shapeText: { ...attributed({ italic: true }).shapeText!, warp: { preset: "textWave1" } },
        },
        71,
      ],
    ] as const) {
      sheet.drawings = [drawing];
      expect(serializeWorkbook(session.workbook).version).toBe(version);
      expect(serializeSheet(deserializeSheet(serializeSheet(sheet)))).toEqual(
        serializeSheet(sheet),
      );
    }
    const warped = {
      ...attributed({ italic: true }),
      id: "warped",
      shapeText: {
        ...attributed({ italic: true }).shapeText!,
        warp: { preset: "textWave1" as const },
      },
    };
    const grouped = {
      ...group("older"),
      hidden: true as const,
      groupEffects: { glow: { kind: "none" as const } },
    };
    for (const drawings of [
      [tree(), warped, grouped, legacyShapeDrawing()],
      [legacyShapeDrawing(), grouped, warped, tree()],
    ]) {
      sheet.drawings = drawings;
      expect(serializeWorkbook(session.workbook).version).toBe(72);
      const standalone = serializeSheet(sheet);
      expect(serializeSheet(deserializeSheet(standalone))).toEqual(standalone);
      expect(
        serializeWorkbook({
          ...session.workbook,
          sheets: new Map([[sheet.id, deserializeSheet(standalone)]]),
        }).version,
      ).toBe(72);
    }
    const empty = attributed({});
    empty.shapeText!.characterRuns = [];
    sheet.drawings = [empty];
    expect(serializeWorkbook(session.workbook).version).toBe(59);
  });

  test("V72 malformed nested metadata and graph descriptors fail without evaluating accessors", () => {
    const session = createTestWorkbookSession(),
      base = serializeWorkbook(session.workbook);
    let reads = 0;
    const getter = {
      get() {
        reads++;
        return [];
      },
    };
    for (const drawing of [
      tree({
        reflection: { kind: "value", value: { size: 2, opacity: 1, blurPt: 0, distancePt: 0 } },
      }),
      tree({
        glow: { kind: "value", value: { color: { kind: "automatic" }, opacity: NaN, sizePt: 0 } },
      }),
    ])
      expect(() =>
        deserializeWorkbook({
          ...base,
          version: 72,
          sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
        }),
      ).toThrow();
    for (const key of ["shapeText", "members", "kind"] as const) {
      const drawing = tree();
      Object.defineProperty(key === "shapeText" ? richLeaf(drawing) : drawing, key, getter);
      expect(() =>
        deserializeWorkbook({
          ...base,
          version: 72,
          sheets: [{ ...base.sheets[0]!, drawings: [drawing] }],
        }),
      ).toThrow();
    }
    const cyclic = tree();
    cyclic.members.push(cyclic as never);
    expect(() =>
      deserializeWorkbook({
        ...base,
        version: 72,
        sheets: [{ ...base.sheets[0]!, drawings: [cyclic] }],
      }),
    ).toThrow();
    expect(reads).toBe(0);
  });

  test("commands, inverse/redo, clipboard and sparse restoration detach local effect payloads", () => {
    const session = createTestWorkbookSession(),
      sheet = getActiveSheet(session.workbook);
    sheet.drawings = [tree()];
    const before = serializeWorkbook(session.workbook),
      input = tree({
        shadow: { kind: "none" },
        reflection: characterEffects().reflection,
        glow: characterEffects().glow,
      }),
      command = createSetSheetDrawingsCommand(sheet.id, [input]);
    richLeaf(input).shapeText!.characterRuns![0]!.glow = { kind: "none" };
    expect(executeWorkbookCommand(session, command)).toBe(true);
    expect(session.history.undoStack).toHaveLength(1);
    const after = serializeWorkbook(session.workbook),
      stored = richLeaf(command.drawings[0] as ShapeGroupDrawing).shapeText!.characterRuns![0]!;
    if (stored.reflection?.kind !== "value") throw Error("Expected local reflection");
    stored.reflection.value.size = 0;
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(before);
    expect(redoWorkbookCommand(session)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    let id = 0;
    const copied = cloneShapeRootsForClipboard(sheet.drawings!, {
      createId: () => `copy-${++id}`,
    })[0] as ShapeGroupDrawing;
    const copiedLeaf = traverseShapeGroup(copied).find(
      ({ node }) =>
        (node.kind === "shape" || node.kind === "textBox") && node.shapeText?.characterRuns,
    )?.node;
    if (!copiedLeaf || (copiedLeaf.kind !== "shape" && copiedLeaf.kind !== "textBox"))
      throw Error("Expected copied rich leaf");
    copiedLeaf.shapeText!.characterRuns![0]!.reflection = { kind: "none" };
    expect(serializeWorkbook(session.workbook)).toEqual(after);
    const sparse = createSheetSparseState(sheet),
      restore = createRestoreSheetStateCommand(sheet.id, sparse);
    richLeaf(sparse.drawings![0] as ShapeGroupDrawing).shapeText!.characterRuns![0]!.glow = {
      kind: "none",
    };
    expect(executeWorkbookCommand(session, createSetSheetDrawingsCommand(sheet.id, []))).toBe(true);
    expect(executeWorkbookCommand(session, restore)).toBe(true);
    expect(serializeWorkbook(session.workbook)).toEqual(after);
  });
});
